// Quick test for parseDate auto-correction and convertDateToISO
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

// --- Test cases ---
const tests = [
  // Real bugs from production
  { input: '26/03/2021', expect: '2026-03-21', desc: 'VALTER HLBU2748932 — DD↔YY swap' },
  { input: '26/03/2020', expect: '2026-03-20', desc: 'VALTER CAIU6690435 — DD↔YY swap' },

  // Normal dates (must NOT change)
  { input: '21/03/2026', expect: '2026-03-21', desc: 'Normal date — no correction needed' },
  { input: '14/03/2026', expect: '2026-03-14', desc: 'Normal date — no correction needed' },
  { input: '01/01/2026', expect: '2026-01-01', desc: 'Start of year' },
  { input: '31/12/2025', expect: '2025-12-31', desc: 'End of 2025' },

  // Edge: day > 27 can't be a valid year swap (2028+), should hit safety net
  { input: '28/03/2019', expect: '2026-03-28', desc: 'Day 28 — candidateYear 2028 > 2027, safety net forces year 2026, keeps day 28' },

  // Edge: very old year, day = 25
  { input: '25/06/2018', expect: '2025-06-18', desc: 'Day 25 — swap gives 2025, valid' },

  // Edge: null/empty
  { input: null, expect: null, desc: 'Null input' },
  { input: '', expect: null, desc: 'Empty string' },
  { input: '21-03-2026', expect: null, desc: 'Wrong separator' },
]

let passed = 0
let failed = 0

console.log('=== Testing parseDate + convertDateToISO ===\n')

for (const t of tests) {
  const result = convertDateToISO(t.input)
  const ok = result === t.expect
  const icon = ok ? 'PASS' : 'FAIL'
  console.log(`${icon}: "${t.input}" → ${result} (expected ${t.expect}) — ${t.desc}`)
  if (ok) passed++
  else failed++
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
