#!/usr/bin/env node
// scripts/tp-recovery.js — Recovery formal pos zombie Evolution
//
// Le mensagens do daemon WhatsApp pessoal (porta 3847), cruza com
// tp_mensagens_raw pra dedup, e replica fotos no /api/tp/webhook
// do Railway. Suporta --skip, --dry-run, --from, --to.
//
// Pre-requisitos: daemon zap rodando local + creds Supabase service +
// webhook URL do tpaulino-gestao-fretes.
//
// Env vars:
//   TP_DAEMON_URL    (default http://127.0.0.1:3847)
//   TP_DAEMON_KEY    (default sexta-feira-2026)
//   TP_SUPABASE_URL  obrigatorio
//   TP_SUPABASE_KEY  obrigatorio (service role)
//   TP_WEBHOOK_URL   (default producao Railway)
//
// Uso:
//   node scripts/tp-recovery.js --from 2026-05-04T17:00:00Z --to 2026-05-04T21:00:00Z
//   node scripts/tp-recovery.js --from <ISO> --dry-run
//   node scripts/tp-recovery.js --from <ISO> --skip ID1,ID2
//
// Exit codes: 0 sucesso, 1 erro fatal, 2 args invalidos.

import { readFile } from 'node:fs/promises'

const DAEMON_URL = process.env.TP_DAEMON_URL || 'http://127.0.0.1:3847'
const DAEMON_KEY = process.env.TP_DAEMON_KEY || 'sexta-feira-2026'
const SB_URL = process.env.TP_SUPABASE_URL
const SB_KEY = process.env.TP_SUPABASE_KEY
const WEBHOOK_URL = process.env.TP_WEBHOOK_URL || 'https://tpaulino-gestao-fretes-production.up.railway.app/api/tp/webhook'

const GROUPS = {
  ALESSANDRO: '120363039509825419@g.us',
  RONALDO:    '120363314612881947@g.us',
  CHRISTIAN:  '120363328619713776@g.us',
  VALTER:     '120363027158529382@g.us',
  LUIZ:       '120363406009484675@g.us',
}

function parseArgs(argv) {
  const args = { skip: new Set(), dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') args.from = argv[++i]
    else if (a === '--to') args.to = argv[++i]
    else if (a === '--skip') argv[++i].split(',').filter(Boolean).forEach(s => args.skip.add(s.trim()))
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
    else { console.error(`Unknown arg: ${a}`); process.exit(2) }
  }
  if (!args.from) { console.error('Required: --from <ISO>'); process.exit(2) }
  args.fromMs = Date.parse(args.from)
  args.toMs = args.to ? Date.parse(args.to) : Date.now()
  if (isNaN(args.fromMs) || isNaN(args.toMs)) { console.error('Invalid --from/--to ISO'); process.exit(2) }
  return args
}

function printHelp() {
  console.log(`tp-recovery: replica fotos perdidas durante zombie Evolution.

  --from <ISO>       inicio da janela (obrigatorio)
  --to <ISO>         fim da janela (default: agora)
  --skip ID1,ID2     msg_ids a pular (ex: msgs apagadas pelo motorista)
  --dry-run          lista o que seria reprocessado sem chamar webhook
  -h, --help         esta ajuda
`)
}

async function fetchDaemonMessages(jid, args) {
  const url = `${DAEMON_URL}/messages/${encodeURIComponent(jid)}?limit=50`
  const r = await fetch(url, { headers: { 'x-api-key': DAEMON_KEY } })
  if (!r.ok) throw new Error(`Daemon ${r.status} ${jid}: ${await r.text().then(t => t.slice(0,100))}`)
  const body = await r.json()
  const msgs = body.messages || []
  const out = []
  for (const m of msgs) {
    const tsMs = Date.parse(m.timestamp)
    if (!Number.isFinite(tsMs)) continue
    if (tsMs < args.fromMs || tsMs > args.toMs) continue
    const c = m.content || ''
    if (!c.startsWith('[Image:')) continue
    const path = c.slice(7, -1)
    out.push({
      msg_id: m.id,
      chat_jid: jid,
      sender: m.sender || '',
      ts_iso: m.timestamp,
      ts_unix: Math.floor(tsMs / 1000),
      path,
    })
  }
  return out
}

async function existingRawIds(msgIds) {
  if (msgIds.length === 0) return new Set()
  const inList = msgIds.map(id => `"${id}"`).join(',')
  const url = `${SB_URL}/rest/v1/tp_mensagens_raw?msg_id=in.(${encodeURIComponent(inList)})&select=msg_id`
  const r = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text().then(t => t.slice(0,200))}`)
  const rows = await r.json()
  return new Set(rows.map(r => r.msg_id))
}

async function postWebhook(img) {
  const buf = await readFile(img.path)
  const b64 = buf.toString('base64')
  const payload = {
    event: 'messages.upsert',
    instance: 'marcofassa',
    data: {
      key: { remoteJid: img.chat_jid, fromMe: false, id: img.msg_id, participant: img.sender },
      messageTimestamp: img.ts_unix,
      message: { imageMessage: { mimetype: 'image/jpeg' }, base64: b64 },
    },
  }
  const r = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { status: r.status, body: await r.text().then(t => t.slice(0, 200)) }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!SB_URL || !SB_KEY) {
    console.error('Required env: TP_SUPABASE_URL, TP_SUPABASE_KEY')
    process.exit(1)
  }
  const groupName = (jid) => Object.entries(GROUPS).find(([_, j]) => j === jid)?.[0] || jid

  console.log(`tp-recovery: ${args.from} -> ${args.to || 'agora'}${args.dryRun ? ' (DRY-RUN)' : ''}`)
  if (args.skip.size > 0) console.log(`Skip explicito: ${[...args.skip].join(', ')}`)

  let candidates = []
  for (const [name, jid] of Object.entries(GROUPS)) {
    try {
      const imgs = await fetchDaemonMessages(jid, args)
      candidates.push(...imgs)
    } catch (err) {
      console.error(`Daemon falhou ${name}:`, err.message)
    }
  }
  console.log(`Candidatos no daemon: ${candidates.length}`)

  candidates = candidates.filter(c => !args.skip.has(c.msg_id))

  // Dedup contra Supabase
  const ids = candidates.map(c => c.msg_id)
  let alreadyRaw
  try { alreadyRaw = await existingRawIds(ids) } catch (err) {
    console.error('Dedup query falhou:', err.message); process.exit(1)
  }
  const toReplay = candidates.filter(c => !alreadyRaw.has(c.msg_id))
  const dedupSkipped = candidates.length - toReplay.length

  console.log(`Skip por dedup raw existente: ${dedupSkipped}`)
  console.log(`Para replay: ${toReplay.length}`)
  for (const i of toReplay) {
    console.log(`  [${groupName(i.chat_jid)}] ${i.ts_iso} | id=${i.msg_id.slice(0,20)}`)
  }

  if (args.dryRun || toReplay.length === 0) {
    console.log(args.dryRun ? 'DRY-RUN: nada enviado.' : 'Nada a fazer.')
    return
  }

  let ok = 0, fail = 0
  for (const img of toReplay) {
    try {
      const res = await postWebhook(img)
      if (res.status >= 200 && res.status < 300) {
        console.log(`OK  [${groupName(img.chat_jid)}] ${img.ts_iso} -> ${res.body}`)
        ok++
      } else {
        console.error(`FAIL [${groupName(img.chat_jid)}] ${img.ts_iso} -> ${res.status} ${res.body}`)
        fail++
      }
    } catch (err) {
      console.error(`FAIL [${groupName(img.chat_jid)}] ${img.ts_iso}: ${err.message}`)
      fail++
    }
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log(`\nResumo: ok=${ok} fail=${fail} skip_dedup=${dedupSkipped} skip_explicito=${args.skip.size}`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
