// Quick test for parseDate auto-correction, convertDateToISO, and date window validation
// Run: node services/test-date-fix.js

// Inline parseDate + convertDateToISO (same logic as business-rules.js, isolated for testing)
function parseDate(dateStr) {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  let [d, m, y] = parts.map(Number)

  if (y < 2025) {
    const shortYear = y % 100
    const candidateDay = shortYear
    const candidateYear = 2000 + d
    if (candidateYear >= 2025 && candidateYear <= 2027 && candidateDay >= 1 && candidateDay <= 31) {
      console.log(`  [auto-correct] ${dateStr} → ${candidateDay}/${m}/${candidateYear} (DD↔YY swap)`)
      d = candidateDay
      y = candidateYear
    }
  }

  if (y < 2025 || y > 2027) {
    console.log(`  [safety-net] year ${y} in "${dateStr}" → forcing 2026`)
    y = 2026
  }

  return new Date(y, m - 1, d)
}

function convertDateToISO(dateStr) {
  if (!dateStr) return null
  const parsed = parseDate(dateStr)
  if (!parsed || isNaN(parsed.getTime())) return null
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Inline date window check (same logic as Rule 8 in business-rules.js)
function isDateInRange(dateStr) {
  const ticketDate = parseDate(dateStr)
  if (!ticketDate) return null // no date = no rejection
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const ticketDay = new Date(ticketDate)
  ticketDay.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const sevenDaysAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  return ticketDay >= sevenDaysAgo && ticketDay <= sevenDaysAhead
}

// --- Test cases: parseDate + convertDateToISO ---
const conversionTests = [
  // Real bugs from production
  { input: '26/03/2021', expect: '2026-03-21', desc: 'VALTER HLBU2748932: DD↔YY swap' },
  { input: '26/03/2020', expect: '2026-03-20', desc: 'VALTER CAIU6690435: DD↔YY swap' },

  // Normal dates (must NOT change)
  { input: '21/03/2026', expect: '2026-03-21', desc: 'Normal date: no correction needed' },
  { input: '14/03/2026', expect: '2026-03-14', desc: 'Normal date: no correction needed' },
  { input: '01/01/2026', expect: '2026-01-01', desc: 'Start of year' },
  { input: '31/12/2025', expect: '2025-12-31', desc: 'End of 2025' },

  // Edge: day > 27 can't be a valid year swap (2028+), should hit safety net
  { input: '28/03/2019', expect: '2026-03-28', desc: 'Day 28: candidateYear 2028 > 2027, safety net forces year 2026' },

  // Edge: very old year, day = 25
  { input: '25/06/2018', expect: '2025-06-18', desc: 'Day 25: swap gives 2025, valid' },

  // Edge: null/empty
  { input: null, expect: null, desc: 'Null input' },
  { input: '', expect: null, desc: 'Empty string' },
  { input: '21-03-2026', expect: null, desc: 'Wrong separator' },
]

// --- Test cases: date window validation ---
// Today is dynamic, so we build dates relative to today
const now = new Date()
const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

const windowTests = [
  { input: fmt(now), expect: true, desc: 'Today: in range' },
  { input: fmt(addDays(now, -7)), expect: true, desc: '7 days ago: boundary, in range' },
  { input: fmt(addDays(now, -8)), expect: false, desc: '8 days ago: out of range' },
  { input: fmt(addDays(now, 5)), expect: true, desc: '5 days ahead: in range (OCR drift)' },
  { input: fmt(addDays(now, 7)), expect: true, desc: '7 days ahead: boundary, in range' },
  { input: fmt(addDays(now, 8)), expect: false, desc: '8 days ahead: out of range' },
  // Simulates Gemini reading day=26 when real day is 21 (today)
  { input: '26/03/2026', expect: true, desc: 'March 26: within 7-day future window from today' },
  // January is way out
  { input: '20/01/2026', expect: false, desc: 'January 20: 2 months ago, out of range' },
]

let passed = 0
let failed = 0

console.log('=== Part 1: parseDate + convertDateToISO ===\n')

for (const t of conversionTests) {
  const result = convertDateToISO(t.input)
  const ok = result === t.expect
  console.log(`${ok ? 'PASS' : 'FAIL'}: "${t.input}" → ${result} (expected ${t.expect}) — ${t.desc}`)
  if (ok) passed++; else failed++
}

console.log('\n=== Part 2: Date window validation (7 days past/future) ===\n')
console.log(`  Today: ${fmt(now)}\n`)

for (const t of windowTests) {
  const result = isDateInRange(t.input)
  const ok = result === t.expect
  console.log(`${ok ? 'PASS' : 'FAIL'}: "${t.input}" → ${result} (expected ${t.expect}) — ${t.desc}`)
  if (ok) passed++; else failed++
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
