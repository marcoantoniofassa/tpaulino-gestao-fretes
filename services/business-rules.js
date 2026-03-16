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

// Parse DD/MM/YYYY to Date
function parseDate(dateStr) {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts.map(Number)
  return new Date(y, m - 1, d)
}

// Apply business rules to OCR result
export function applyBusinessRules(ocr, chatJid) {
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
    data_frete: convertDateToISO(ocr.DATA) || new Date().toISOString().split('T')[0],
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

  // Rule 8: Date validation (within 7 days)
  const ticketDate = parseDate(ocr.DATA)
  if (ticketDate) {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const oneDayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    if (ticketDate < sevenDaysAgo || ticketDate > oneDayAhead) {
      result.ignorado = true
      result.erro_validacao = `Date out of range: ${ocr.DATA}`
      return result
    }
  }

  // Rule 9: Sequence 1-50
  if (result.sequencia < 1 || result.sequencia > 50) {
    console.warn(`Sequence out of range: ${result.sequencia}, allowing anyway`)
  }

  return result
}

// Convert DD/MM/YYYY to YYYY-MM-DD (Postgres date format)
function convertDateToISO(dateStr) {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return dateStr
  const [d, m, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Process abastecimento OCR result
export function processAbastecimento(ocr, chatJid) {
  if (ocr.TIPO_DOCUMENTO !== 'ABASTECIMENTO') return null

  const groupCfg = GROUP_MOTORISTA[chatJid]
  if (!groupCfg) return null

  const placa = groupCfg.placa || ocr.PLACA
  const veiculo_id = placa ? VEICULOS[placa] : null
  const motorista_id = MOTORISTAS[groupCfg.motorista]
  const litros = parseFloat(ocr.LITROS) || 0
  if (litros <= 0) return null

  const valor = Math.round(litros * PRECO_LITRO_DIESEL * 100) / 100
  const descParts = []
  if (!ocr.KM_ODOMETRO) descParts.push('SEM KM')
  descParts.push('PRECO ESTIMADO')
  if (ocr.CONTROLE_POSTO) descParts.push(`Ctrl: ${ocr.CONTROLE_POSTO}`)
  if (ocr.BOMBA) descParts.push(`Bomba: ${ocr.BOMBA}`)

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
