// services/business-rules.js — FK resolution, pricing, validation
import {
  GROUP_MOTORISTA, MOTORISTAS, VEICULOS, TERMINAIS,
  PEDAGIO, COMISSAO_PERCENTUAL, PRECO_LITRO_DIESEL,
} from './config.js'

// Detect terminal from OCR text (tolerant matching — losing a freight is worse than a wrong terminal)
export function detectTerminal(local) {
  if (!local) return null
  const n = local.toUpperCase().trim()
  if (n.includes('BTP') || n.includes('BRASIL TERMINAL')) return 'BTP'
  if (n.includes('ECOPORTO') || n.includes('ECO PORTO')) return 'ECOPORTO'
  if (n.includes('DPW')) return 'DPW'
  if (n.includes('SANTOS BRASIL') || n.includes('SANTOS BR')) return 'SANTOS BRASIL'
  // Partial matches — OCR sometimes truncates
  if (n.includes('BRASIL') || n.includes('SANTO')) return 'SANTOS BRASIL'
  // Fallback: log warning but don't lose the freight
  console.warn(`[detectTerminal] Unknown terminal "${local}" — defaulting to BTP`)
  return 'BTP'
}

// Parse DD/MM/YYYY to Date (with OCR date auto-correction)
function parseDate(dateStr) {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  let [d, m, y] = parts.map(Number)

  // Fix: Gemini sometimes swaps DD and YY when year is faded/truncated
  // e.g. 21/03/2026 → OCR reads 26/03/2021 (day=26, year=2021)
  // Heuristic: if year < 2025 and swapping DD↔(year%100) gives a valid recent date, swap them
  if (y < 2025) {
    const shortYear = y % 100   // e.g. 2021 → 21
    const candidateDay = shortYear
    const candidateYear = 2000 + d  // e.g. d=26 → 2026
    if (candidateYear === 2026 && candidateDay >= 1 && candidateDay <= 31) {
      console.warn(`[parseDate] Auto-corrected date: ${dateStr} → ${candidateDay}/${m}/${candidateYear} (DD↔YY swap)`)
      d = candidateDay
      y = candidateYear
    }
  }

  // Safety net: any year that isn't 2026, force 2026
  if (y !== 2026) {
    console.warn(`[parseDate] Unreasonable year ${y} in "${dateStr}", forcing 2026`)
    y = 2026
  }

  return new Date(y, m - 1, d)
}

// Business day cutoff: freights before 6am BRT count as previous day
// Drivers work late shifts and enter ports at 1am, 3am — those are "yesterday's" freights
const CUTOFF_HOUR_BRT = 6

function applyBusinessDayCutoff(dateStr, msgTimestamp) {
  if (!dateStr) return dateStr
  // Use message timestamp to determine if this was a madrugada freight
  const msgDate = msgTimestamp ? new Date(msgTimestamp) : new Date()
  // Convert to BRT (UTC-3)
  const brtHour = (msgDate.getUTCHours() - 3 + 24) % 24
  if (brtHour < CUTOFF_HOUR_BRT) {
    // Before 6am BRT: subtract one day from data_frete
    const d = new Date(dateStr + 'T12:00:00Z') // noon to avoid timezone edge
    d.setDate(d.getDate() - 1)
    const adjusted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    console.log(`[BusinessDay] Cutoff: ${dateStr} → ${adjusted} (msg sent at ${brtHour}h BRT, before ${CUTOFF_HOUR_BRT}h)`)
    return adjusted
  }
  return dateStr
}

// Apply business rules to OCR result
// msgTimestamp: ISO string or Date of when the WhatsApp photo was sent (fallback for bad OCR dates)
export function applyBusinessRules(ocr, chatJid, msgTimestamp) {
  const rawDate = convertDateToISO(ocr.DATA) || new Date().toISOString().split('T')[0]
  const result = {
    ignorado: false,
    erro_validacao: null,
    container: ocr.CONTAINER || '',
    motorista_nome: null,
    motorista_id: null,
    placa: null,
    veiculo_id: null,
    terminal_key: null,
    terminal_id: null,
    terminal_nome: null,
    data_frete: applyBusinessDayCutoff(rawDate, msgTimestamp),
    sequencia: ocr.SEQUENCIA || 0,
    valor_bruto: 0,
    pedagio: 0,
    comissao: 0,
    valor_liquido: 0,
  }

  // Rule 1: Must be TICKET_FRETE
  if (ocr.TIPO_DOCUMENTO !== 'TICKET_FRETE') {
    result.ignorado = true
    result.erro_validacao = `Not TICKET_FRETE: ${ocr.TIPO_DOCUMENTO}`
    return result
  }

  // Rule 2: Group defines motorista (NOT OCR)
  const groupCfg = GROUP_MOTORISTA[chatJid]
  if (!groupCfg) {
    result.ignorado = true
    result.erro_validacao = `Unknown group: ${chatJid}`
    return result
  }
  result.motorista_nome = groupCfg.motorista
  result.motorista_id = MOTORISTAS[groupCfg.motorista]

  // Rule 3: Placa from group config (fallback OCR)
  const placa = groupCfg.placa || ocr.PLACA
  result.placa = placa
  result.veiculo_id = placa ? (VEICULOS[placa] || VEICULOS[placa?.replace(/\s/g, '')] || null) : null

  // Rule 4: Terminal detection + pricing
  const termKey = detectTerminal(ocr.LOCAL)
  if (!termKey) {
    result.ignorado = true
    result.erro_validacao = `Terminal not recognized: ${ocr.LOCAL}`
    return result
  }
  const terminal = TERMINAIS[termKey]
  result.terminal_key = termKey
  result.terminal_id = terminal.id
  result.terminal_nome = terminal.nome
  result.valor_bruto = terminal.valor

  // Rule 5: Pedagio (DPW/Santos Brasil only)
  if (termKey === 'DPW' || termKey === 'SANTOS BRASIL') {
    result.pedagio = PEDAGIO
  }

  // Rule 6: Commission 25%
  result.comissao = Math.round(result.valor_bruto * COMISSAO_PERCENTUAL * 100) / 100

  // Rule 7: Net value
  result.valor_liquido = result.valor_bruto - result.comissao - result.pedagio

  // Rule 8: Date validation (within 7 days past / 7 days future)
  // If OCR date is out of range, fallback to message timestamp (when photo was sent).
  // The driver sends the photo on the day of the freight, so it's a reliable approximation.
  const ticketDate = parseDate(ocr.DATA)
  if (ticketDate) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const ticketDay = new Date(ticketDate)
    ticketDay.setHours(0, 0, 0, 0)
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const sevenDaysAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    if (ticketDay < sevenDaysAgo || ticketDay > sevenDaysAhead) {
      // Fallback: use message timestamp as freight date
      if (msgTimestamp) {
        const msgDate = new Date(msgTimestamp)
        const fallbackDate = `${msgDate.getFullYear()}-${String(msgDate.getMonth() + 1).padStart(2, '0')}-${String(msgDate.getDate()).padStart(2, '0')}`
        console.warn(`[Rule8] OCR date "${ocr.DATA}" out of range, using msg timestamp as fallback: ${fallbackDate}`)
        result.data_frete = fallbackDate
      } else {
        result.ignorado = true
        result.erro_validacao = `Date out of range: ${ocr.DATA}`
        return result
      }
    }
  }

  // Rule 9: Sequence 1-50
  if (result.sequencia < 1 || result.sequencia > 50) {
    console.warn(`Sequence out of range: ${result.sequencia}, allowing anyway`)
  }

  return result
}

// Convert DD/MM/YYYY to YYYY-MM-DD (Postgres date format) — uses parseDate for auto-correction
function convertDateToISO(dateStr) {
  if (!dateStr) return null
  const parsed = parseDate(dateStr)
  if (!parsed || isNaN(parsed.getTime())) return null
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Process abastecimento OCR result (S-10 ticket only)
export function processAbastecimento(ocr, chatJid) {
  if (ocr.TIPO_DOCUMENTO !== 'ABASTECIMENTO') return null

  const groupCfg = GROUP_MOTORISTA[chatJid]
  if (!groupCfg) return null

  // Resolve placa: OCR may read it, but normalize against known fleet plates
  const ocrPlaca = (ocr.PLACA || '').replace(/[\s-]/g, '').toUpperCase()
  const placa = groupCfg.placa || resolvePlaca(ocrPlaca)
  const veiculo_id = placa ? VEICULOS[placa] : null
  const motorista_id = MOTORISTAS[groupCfg.motorista]
  const litros = parseFloat(ocr.LITROS) || 0
  if (litros < 30 || litros > 999) return null

  const valor = Math.round(litros * PRECO_LITRO_DIESEL * 100) / 100
  const descParts = []
  if (!ocr.KM_ODOMETRO) descParts.push('SEM KM')
  descParts.push('PRECO ESTIMADO')
  if (ocr.CONTROLE_POSTO) descParts.push(`Ctrl: ${ocr.CONTROLE_POSTO}`)
  if (ocr.BOMBA) descParts.push(`Bomba: ${ocr.BOMBA}`)
  if (ocr.LEITURA) descParts.push(`Leitura: ${ocr.LEITURA}`)

  return {
    tipo: 'ABASTECIMENTO',
    forma_pagamento: 'CARTAO_FROTA',
    status: 'PENDENTE',
    veiculo_id,
    litros,
    preco_litro: PRECO_LITRO_DIESEL,
    valor,
    km_odometro: ocr.KM_ODOMETRO ? parseInt(ocr.KM_ODOMETRO) : null,
    descricao: descParts.join(' | '),
    data: convertDateToISO(ocr.DATA) || new Date().toISOString().split('T')[0],
  }
}

// Try to match OCR plate to a known fleet plate (handles OCR misreads)
function resolvePlaca(raw) {
  if (!raw) return null
  if (VEICULOS[raw]) return raw
  // Try without spaces/dashes (already cleaned above)
  // Fuzzy: check if OCR plate differs by 1 char from any known plate
  const known = Object.keys(VEICULOS).filter(k => k.length >= 7)
  for (const plate of known) {
    let diff = 0
    const a = raw.replace(/[^A-Z0-9]/g, '')
    const b = plate.replace(/[^A-Z0-9]/g, '')
    if (a.length !== b.length) continue
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diff++
    }
    if (diff <= 1) return plate
  }
  return raw
}
