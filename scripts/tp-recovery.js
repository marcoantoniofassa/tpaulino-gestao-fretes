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
import { pathToFileURL } from 'node:url'

const DAEMON_URL = process.env.TP_DAEMON_URL || 'http://127.0.0.1:3847'
const DAEMON_KEY = process.env.TP_DAEMON_KEY || 'sexta-feira-2026'
const SB_URL = process.env.TP_SUPABASE_URL
const SB_KEY = process.env.TP_SUPABASE_KEY
const WEBHOOK_URL = process.env.TP_WEBHOOK_URL || 'https://tpaulino-gestao-fretes-production.up.railway.app/api/tp/webhook'

// Deriva do config.js em vez de manter lista propria. A lista paralela que existia aqui
// tinha 5 grupos e o config tem 6: faltava o alias de grupo do Christian
// ('120363423313474684@g.us'), entao a recuperacao nunca olhava aquele grupo e um zumbi
// ali passaria em branco. Duas listas do mesmo fato divergem calado; uma so nao tem como.
import { GROUP_MOTORISTA } from '../services/config.js'

const GROUPS = {}
for (const [jid, info] of Object.entries(GROUP_MOTORISTA)) {
  // Motorista com 2 grupos (fixo + alias) vira MOTORISTA e MOTORISTA#2: a chave aqui e
  // so rotulo de log, o que vale pra busca sao os JIDs, e todos precisam entrar.
  let chave = info.motorista
  let n = 2
  while (GROUPS[chave]) chave = `${info.motorista}#${n++}`
  GROUPS[chave] = jid
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

// Chave do dedup e o PAR (msg_id, chat_jid), que e a UNIQUE real da tabela. Filtrar so
// por msg_id pulava mensagem legitima de outro grupo que tivesse o mesmo id.
export const chaveRaw = (msgId, chatJid) => `${msgId}|${chatJid}`

async function existingRawIds(msgIds) {
  if (msgIds.length === 0) return new Set()
  const inList = msgIds.map(id => `"${id}"`).join(',')
  const url = `${SB_URL}/rest/v1/tp_mensagens_raw?msg_id=in.(${encodeURIComponent(inList)})&select=msg_id,chat_jid`
  const r = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text().then(t => t.slice(0,200))}`)
  const rows = await r.json()
  return new Set(rows.map(r => chaveRaw(r.msg_id, r.chat_jid)))
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
  // Grupo que falha no daemon NAO pode virar so uma linha de log. Antes, se o unico grupo
  // com ticket perdido desse erro e os outros viessem vazios, a saida era
  // "Candidatos: 0 / Nada a fazer" com exit 0 — perda silenciosa exatamente no caminho
  // usado como rede de seguranca. O cron do hub le o exit code e o Resumo, entao silencio
  // aqui vira silencio no Discord.
  const gruposComFalha = []
  for (const [name, jid] of Object.entries(GROUPS)) {
    try {
      const imgs = await fetchDaemonMessages(jid, args)
      candidates.push(...imgs)
    } catch (err) {
      console.error(`Daemon falhou ${name}:`, err.message)
      gruposComFalha.push(`${name}: ${err.message}`)
    }
  }
  console.log(`Candidatos no daemon: ${candidates.length}`)
  if (gruposComFalha.length > 0) {
    console.error(`Grupos NAO consultados: ${gruposComFalha.length} (${gruposComFalha.join('; ')})`)
  }

  candidates = candidates.filter(c => !args.skip.has(c.msg_id))

  // Dedup contra Supabase
  const ids = candidates.map(c => c.msg_id)
  let alreadyRaw
  try { alreadyRaw = await existingRawIds(ids) } catch (err) {
    console.error('Dedup query falhou:', err.message); process.exit(1)
  }
  const toReplay = candidates.filter(c => !alreadyRaw.has(chaveRaw(c.msg_id, c.chat_jid)))
  const dedupSkipped = candidates.length - toReplay.length

  console.log(`Skip por dedup raw existente: ${dedupSkipped}`)
  console.log(`Para replay: ${toReplay.length}`)
  for (const i of toReplay) {
    console.log(`  [${groupName(i.chat_jid)}] ${i.ts_iso} | id=${i.msg_id.slice(0,20)}`)
  }

  if (args.dryRun || toReplay.length === 0) {
    console.log(args.dryRun ? 'DRY-RUN: nada enviado.' : 'Nada a fazer.')
    // Mesmo sem nada a replicar, grupo nao consultado e falha: sair 0 aqui diria
    // "olhei tudo e estava tudo certo", que e mentira.
    if (gruposComFalha.length > 0) {
      console.log(`\nResumo: ok=0 fail=${gruposComFalha.length} skip_dedup=${dedupSkipped} skip_explicito=${args.skip.size} grupos_falhos=${gruposComFalha.length}`)
      process.exit(1)
    }
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

  // O webhook responde 200 ANTES de processar (ack rapido pra Evolution), entao o 200 so
  // prova que a requisicao chegou. Confirmar de verdade e ir ao banco ver em que estado a
  // linha parou. Sem isto, OCR que falhou saia como "ok=1 fail=0" e o cron do hub
  // anunciava recuperacao que nao aconteceu.
  let confirmados = 0
  if (ok > 0) {
    await new Promise(r => setTimeout(r, 15000)) // folga pro pipeline async terminar
    try {
      const enviados = toReplay.map(i => i.msg_id)
      const inList = enviados.map(id => `"${id}"`).join(',')
      const url = `${SB_URL}/rest/v1/tp_mensagens_raw?msg_id=in.(${encodeURIComponent(inList)})&select=msg_id,chat_jid,status`
      const r = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
      if (r.ok) {
        const rows = await r.json()
        const bons = new Set(rows.filter(x => x.status === 'OK' || x.status === 'IGNORADO')
          .map(x => chaveRaw(x.msg_id, x.chat_jid)))
        confirmados = toReplay.filter(i => bons.has(chaveRaw(i.msg_id, i.chat_jid))).length
        const pendentes = rows.filter(x => x.status !== 'OK' && x.status !== 'IGNORADO')
        if (pendentes.length > 0) {
          console.error(`NAO confirmados no banco: ${pendentes.map(x => `${x.msg_id.slice(0,12)}=${x.status}`).join(', ')}`)
        }
      } else {
        console.error(`Confirmacao no banco falhou: ${r.status}`)
      }
    } catch (err) {
      console.error('Confirmacao no banco falhou:', err.message)
    }
  }

  const naoConfirmados = ok - confirmados
  console.log(`\nResumo: ok=${ok} fail=${fail} confirmados=${confirmados} nao_confirmados=${naoConfirmados} skip_dedup=${dedupSkipped} skip_explicito=${args.skip.size} grupos_falhos=${gruposComFalha.length}`)
  process.exit((fail > 0 || naoConfirmados > 0 || gruposComFalha.length > 0) ? 1 : 0)
}

export { GROUPS }

// So roda quando chamado direto na CLI. Sem esta guarda, `import` deste arquivo (o
// check faz isso pra comparar os grupos com o config) DISPARARIA uma recuperacao de
// verdade, postando ticket no webhook de producao a partir de um teste.
const chamadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (chamadoDireto) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1) })
}
