/**
 * Migração de dados históricos: Google Sheets → Supabase
 *
 * Lê fretes da planilha T Paulino via Google Sheets API
 * Normaliza dados (placa, motorista, terminal)
 * Resolve FKs e insere no Supabase
 *
 * Uso: npx tsx scripts/migrate-sheets-to-supabase.ts
 * Requer: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY no .env
 */

import { createClient } from '@supabase/supabase-js'

// Config
const SPREADSHEET_ID = '19EL67Smh_BEJv0_hDkUBokbN1WID7dIRUvoWQmhuhpA'
const SHEET_NAME = 'FRETES'
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY // or use service account

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

// Aliases de placa OCR → placa real
const PLACA_ALIASES: Record<string, string> = {
  'ECSOE09': 'ECS0E09',
  'ECS0EO9': 'ECS0E09',
  'FE13D86': 'FEI3D86',
  'FEI3086': 'FEI3D86',
  'GFR6486': 'GFR6A86',
  'FJR7887': 'FJR7B87',
  'DVS8128': 'DVS8J28',
}

// Terminal aliases → codigo canonico
const TERMINAL_MAP: Record<string, string> = {
  'BTP': 'BTP',
  'BRASIL TERMINAL': 'BTP',
  'BRASIL TERMINAL PORTUARIO': 'BTP',
  'ECOPORTO': 'ECOPORTO',
  'ECO PORTO': 'ECOPORTO',
  'DPW': 'DPW',
  'DP WORLD': 'DPW',
  'DPWORLD': 'DPW',
  'SANTOS BRASIL': 'SANTOS_BRASIL',
  'SB': 'SANTOS_BRASIL',
}

interface SheetRow {
  DATA: string
  VEICULO: string
  MOTORISTA: string
  CLIENTE: string
  TIPO_FRETE: string
  LOCAL: string
  CONTAINER: string
  VALOR_BRUTO: string
  COMISSAO: string
  PEDAGIO: string
  VALOR_LIQUIDO: string
  OBSERVACAO: string
  SEQUENCIA: string
}

async function fetchSheetData(): Promise<SheetRow[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}?key=${GOOGLE_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()

  if (!data.values || data.values.length < 2) {
    throw new Error('No data found in sheet')
  }

  const headers = data.values[0] as string[]
  const rows = data.values.slice(1) as string[][]

  return rows.map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = row[i] || ''
    })
    return obj as unknown as SheetRow
  })
}

function normalizePlaca(placa: string): string {
  const clean = placa.toUpperCase().replace(/[-\s]/g, '')
  return PLACA_ALIASES[clean] || clean
}

function resolveTerminal(local: string): string | null {
  const upper = local.toUpperCase().trim()
  for (const [alias, code] of Object.entries(TERMINAL_MAP)) {
    if (upper.includes(alias)) return code
  }
  return null
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null
  // Try DD/MM/YYYY or DD/MM/YYYY HH:MM
  const match = dateStr.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/)
  if (!match) return null
  const [, d, m, y] = match
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

async function loadLookups() {
  const { data: motoristas } = await supabase.from('tp_motoristas').select('id, nome_normalizado')
  const { data: veiculos } = await supabase.from('tp_veiculos').select('id, placa')
  const { data: terminais } = await supabase.from('tp_terminais').select('id, codigo')

  const motoristaMap = new Map((motoristas || []).map(m => [m.nome_normalizado, m.id]))
  const veiculoMap = new Map((veiculos || []).map(v => [v.placa, v.id]))
  const terminalMap = new Map((terminais || []).map(t => [t.codigo, t.id]))

  return { motoristaMap, veiculoMap, terminalMap }
}

async function main() {
  console.log('Fetching sheet data...')
  const rows = await fetchSheetData()
  console.log(`Found ${rows.length} rows`)

  console.log('Loading lookups from Supabase...')
  const { motoristaMap, veiculoMap, terminalMap } = await loadLookups()
  console.log(`Motoristas: ${motoristaMap.size}, Veiculos: ${veiculoMap.size}, Terminais: ${terminalMap.size}`)

  let inserted = 0
  let errors = 0

  for (const row of rows) {
    try {
      const placa = normalizePlaca(row.VEICULO)
      const motoristaNome = (row.MOTORISTA || '').toUpperCase().split(' ')[0]
      const terminalCodigo = resolveTerminal(row.LOCAL)
      const dataFrete = parseDate(row.DATA)

      if (!dataFrete) {
        console.warn(`Skipping row - invalid date: ${row.DATA}`)
        errors++
        continue
      }

      const freteData = {
        data_frete: dataFrete,
        container: row.CONTAINER || null,
        motorista_id: motoristaMap.get(motoristaNome) || null,
        veiculo_id: veiculoMap.get(placa) || null,
        terminal_id: terminalCodigo ? terminalMap.get(terminalCodigo) || null : null,
        sequencia: row.SEQUENCIA ? parseInt(row.SEQUENCIA) || null : null,
        tipo_frete: row.TIPO_FRETE || 'VIRA',
        valor_bruto: parseFloat(row.VALOR_BRUTO) || 0,
        pedagio: parseFloat(row.PEDAGIO) || 0,
        comissao: parseFloat(row.COMISSAO) || 0,
        valor_liquido: parseFloat(row.VALOR_LIQUIDO) || 0,
        ocr_raw: { source: 'sheets_migration', original: row },
        status: 'VALIDADO',
      }

      const { error } = await supabase.from('tp_fretes').insert(freteData)
      if (error) {
        console.error(`Error inserting row: ${error.message}`, row.CONTAINER)
        errors++
      } else {
        inserted++
      }
    } catch (e) {
      console.error(`Exception: ${e}`)
      errors++
    }
  }

  console.log(`\nMigration complete: ${inserted} inserted, ${errors} errors out of ${rows.length} total`)
}

main().catch(console.error)
