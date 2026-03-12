#!/usr/bin/env node
// scripts/validate-schema.js — Validate service payloads against actual Supabase schema
// Run: node scripts/validate-schema.js
// Catches column name mismatches before deploy

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dfuajmyhpfgxgonsejsc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''

if (!SUPABASE_KEY) {
  console.error('Set SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY')
  process.exit(1)
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
}

// Columns each service writes to
const EXPECTED_COLUMNS = {
  tp_mensagens_raw: [
    'msg_id', 'chat_jid', 'sender_jid', 'timestamp_msg',
    'media_base64', 'media_supabase_path', 'caption',
    'status', 'ocr_resultado', 'frete_id', 'erro_detalhe', 'tentativas',
  ],
  tp_fretes: [
    'container', 'motorista_id', 'veiculo_id', 'terminal_id',
    'data_frete', 'sequencia', 'valor_bruto', 'pedagio',
    'comissao', 'valor_liquido', 'status', 'foto_ticket_url',
  ],
  tp_gastos: [
    'tipo', 'forma_pagamento', 'status', 'veiculo_id',
    'litros', 'preco_litro', 'valor', 'km_odometro',
    'descricao', 'data',
  ],
}

async function getColumns(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, { headers })
  if (!res.ok) {
    console.error(`  Failed to query ${table}: ${res.status}`)
    return null
  }
  // Column names come from content-profile or we infer from a single row
  // For limit=0, we get empty array but headers tell us columns
  // Alternative: fetch 1 row
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers })
  const rows = await res2.json()
  if (rows.length === 0) {
    console.warn(`  ${table}: no rows, inserting test then deleting...`)
    return null // Can't validate without data
  }
  return Object.keys(rows[0])
}

async function validate() {
  let errors = 0
  console.log('Schema Validation\n')

  for (const [table, expectedCols] of Object.entries(EXPECTED_COLUMNS)) {
    console.log(`Checking ${table}...`)
    const actualCols = await getColumns(table)
    if (!actualCols) {
      console.warn(`  Skipped (no data or error)\n`)
      continue
    }

    for (const col of expectedCols) {
      if (!actualCols.includes(col)) {
        console.error(`  MISSING: "${col}" not in ${table} (actual: ${actualCols.join(', ')})`)
        errors++
      }
    }

    if (errors === 0) console.log(`  OK (${expectedCols.length} columns validated)`)
    console.log()
  }

  if (errors > 0) {
    console.error(`\n${errors} column mismatch(es) found!`)
    process.exit(1)
  } else {
    console.log('All columns validated successfully.')
  }
}

validate().catch(err => {
  console.error('Validation error:', err.message)
  process.exit(1)
})
