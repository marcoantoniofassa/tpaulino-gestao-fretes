// services/zombie-alerta.check.js — mencao do zombie monitor so em incidente NOVO (14/10/2026).
//
// EXECUTA runZombieMonitor / executeRestart de verdade, rodada a rodada, com relogio falso
// (Date) e transporte falso (fetch): Supabase, Evolution, Easypanel, Discord e push sao
// stubs em memoria. Nada sai da maquina. Cada cenario importa uma instancia NOVA do modulo
// (query string no import), entao o estado em memoria comeca zerado.
//
// O pior resultado aqui e incidente NOVO saindo sem mencao. Os cenarios cobrem o ciclo
// deteccao -> persistencia -> recuperacao -> nova deteccao e os buracos achados no review:
// pendencia permanente no send-only, volta antes das 8h, entrega recusada, replay de foto
// antiga e instabilidade (3 restarts) repingando a cada 5min.
//
// Rodar: npm run check:alerta-zombie
import assert from 'node:assert'

const MARCO = '834406885309546568'
const WEBHOOK = 'https://discord.invalid/api/webhooks/check'
process.env.DISCORD_WEBHOOK_URL = WEBHOOK
process.env.SUPABASE_URL = 'https://supabase.invalid'
process.env.EVOLUTION_API_ENDPOINT = 'https://evolution.invalid'
process.env.EASYPANEL_HOST = 'https://easypanel.invalid'
process.env.TP_PUSH_URL = 'https://push.invalid/api/push/send'
process.env.APP_BASE_URL = 'https://app.invalid'

// --- relogio falso ---------------------------------------------------------------------
const RealDate = Date
let agora = 0
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(agora); else super(...a) }
  static now() { return agora }
}
const brt = s => RealDate.parse(`${s}:00-03:00`)
const iso = ms => new RealDate(ms).toISOString()
// executeRestart espera 90s + 30s entre sondas: com relogio falso isso so atrasaria o check.
const realSetTimeout = setTimeout
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms >= 30000 ? 0 : ms, ...a)

// --- transporte falso ------------------------------------------------------------------
let mundo
function novoMundo() {
  return { raw: [], fretes: [], discordStatus: 204, posts: [], pushes: [], whats: 0 }
}
const resp = (body, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => JSON.stringify(body),
})
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url)
  if (u === WEBHOOK) {
    const body = JSON.parse(opts.body)
    mundo.posts.push({
      entregue: mundo.discordStatus < 300,
      mencao: body.content === `<@${MARCO}>`,
      titulo: body.embeds[0].title,
      link: body.embeds[0].fields?.[0]?.value || '',
    })
    return resp({}, mundo.discordStatus)
  }
  if (u.startsWith('https://push.invalid')) { mundo.pushes.push(JSON.parse(opts.body)); return resp({}) }
  if (u.includes('/rest/v1/tp_fretes')) return resp(mundo.fretes)
  if (u.includes('/rest/v1/tp_mensagens_raw')) {
    const lim = Number(new URL(u).searchParams.get('limit')) || 1000
    return resp([...mundo.raw].sort((a, b) => RealDate.parse(b.created_at) - RealDate.parse(a.created_at)).slice(0, lim))
  }
  if (u.includes('/instance/fetchInstances')) return resp([{ name: 'marcofassa', connectionStatus: 'open' }])
  if (u.includes('/instance/connectionState/')) return resp({ instance: { state: 'open' } })
  if (u.includes('/message/sendText/')) { mundo.whats++; return resp({}) }
  if (u.includes('/api/trpc/auth.login')) return resp({ result: { data: { json: { token: 'jwt' } } } })
  if (u.includes('/api/trpc/services.app.deployService')) return resp({})
  throw new Error(`fetch inesperado no check: ${u}`)
}

// Mensagem que chegou AO VIVO (inserida segundos depois do timestamp do WhatsApp) e replay
// (inserida agora, com timestamp de horas atras: daemon local ou recuperacao).
const vivo = quando => ({ created_at: iso(brt(quando)), timestamp_msg: iso(brt(quando) - 5000) })
const replay = (inserida, tirada) => ({ created_at: iso(brt(inserida)), timestamp_msg: iso(brt(tirada)) })
const frete = (id, criado) => ({ id, created_at: iso(brt(criado)), confirmacao_erro: 'Evolution sendText: 500 Connection Closed' })

let n = 0
async function novoMonitor(inicio) {
  mundo = novoMundo()
  agora = brt(inicio)
  return import(new URL(`./tp-zombie-monitor.js?cenario=${++n}`, import.meta.url))
}
// Roda uma rodada do cron e devolve so os posts dela.
async function rodada(m, quando) {
  agora = brt(quando)
  const antes = mundo.posts.length
  await m.runZombieMonitor()
  return mundo.posts.slice(antes)
}
const so = (posts, titulo) => posts.filter(p => p.titulo.includes(titulo))

const silenciar = { log: console.log, warn: console.warn, error: console.error }
console.log = console.warn = console.error = () => {}
let total = 0
const ok = (cond, msg) => { total++; assert.ok(cond, msg) }

try {
  // --- A: deteccao -> persistencia -> recuperacao -> nova deteccao (receive-only) ---------
  {
    const m = await novoMonitor('2026-10-13T12:55')
    mundo.raw = [vivo('2026-10-13T07:00')]
    let p = await rodada(m, '2026-10-13T13:05') // gap 6h05
    ok(p.length === 1 && p[0].mencao && p[0].titulo.includes('Zombie Detectado'), 'A1: zumbi novo pinga')
    ok(p[0].link.includes('zombie-restart'), 'A1: o primeiro alerta leva o link de restart')
    ok(mundo.pushes.length === 1, 'A1: push no primeiro alerta')
    p = await rodada(m, '2026-10-13T13:10')
    ok(p.length === 0, 'A2: mesmo incidente 5min depois nao posta')
    p = await rodada(m, '2026-10-13T15:10')
    ok(p.length === 1 && !p[0].mencao && p[0].titulo.includes('Zombie Persiste'), 'A3: mesmo incidente 2h depois reposta MUDO')
    ok(p[0].link.includes('zombie-restart'), 'A3: o repost renova o link (token expira em 1h)')
    ok(mundo.pushes.length === 1, 'A3: repost mudo nao manda push')
    mundo.raw.push(vivo('2026-10-13T15:30'))
    p = await rodada(m, '2026-10-13T15:35')
    ok(so(p, 'Recebimento voltou').length === 1 && !so(p, 'Recebimento voltou')[0].mencao, 'A4: volta sai sem mencao')
    p = await rodada(m, '2026-10-13T21:35') // novo silencio de 6h05
    ok(p.length === 1 && p[0].mencao && p[0].titulo.includes('Zombie Detectado'), 'A5: zumbi NOVO depois da volta pinga')
  }

  // --- B: volta antes das 8h e zumbi de novo (bloqueante 2 do review) ---------------------
  {
    const m = await novoMonitor('2026-10-13T20:50')
    mundo.raw = [vivo('2026-10-13T14:50')]
    let p = await rodada(m, '2026-10-13T21:00')
    ok(p.length === 1 && p[0].mencao, 'B1: zumbi pinga')
    mundo.raw.push(vivo('2026-10-14T06:30'))
    p = await rodada(m, '2026-10-14T06:35') // ramo pre-8h: nao olha gap
    ok(so(p, 'Recebimento voltou').length === 1, 'B2: recebimento antes das 8h encerra o incidente')
    p = await rodada(m, '2026-10-14T12:35')
    ok(p.length === 1 && p[0].mencao && p[0].titulo.includes('Zombie Detectado'), 'B3: zumbi das 12h35 e NOVO e pinga')
  }
  // B': o monitor nem rodou entre a volta e o novo zumbi. A identidade (marco) sozinha
  // ainda tem que pingar: nao depende de alguem ter visto a volta.
  {
    const m = await novoMonitor('2026-10-13T20:50')
    mundo.raw = [vivo('2026-10-13T14:50')]
    await rodada(m, '2026-10-13T21:00')
    mundo.raw.push(replay('2026-10-14T06:30', '2026-10-14T06:00')) // linha nova sem prova de vivo
    const p = await rodada(m, '2026-10-14T12:35')
    ok(p.some(x => x.mencao && x.titulo.includes('Zombie Detectado')), "B'1: linha nova na raw = nao da pra provar mesmo incidente = pinga")
  }

  // --- C: entrega recusada nao consome o ping (bloqueante 4) -----------------------------
  {
    const m = await novoMonitor('2026-10-13T12:55')
    mundo.raw = [vivo('2026-10-13T07:00')]
    mundo.discordStatus = 429
    let p = await rodada(m, '2026-10-13T13:05')
    ok(p.length === 1 && !p[0].entregue, 'C1: Discord recusou (429)')
    ok(m.getZombieState().receiveOnly.avisadoEm === null, 'C1: post recusado nao marca o incidente como avisado')
    mundo.discordStatus = 204
    p = await rodada(m, '2026-10-13T13:10')
    ok(p.length === 1 && p[0].entregue && p[0].mencao && p[0].titulo.includes('Zombie Detectado'), 'C2: proxima rodada retenta COM mencao')
    ok(mundo.pushes.length === 1, 'C2: push nao duplica na retentativa (espacado 30min)')
  }
  {
    const m = await novoMonitor('2026-10-13T09:55')
    mundo.raw = [vivo('2026-10-13T09:50')]
    mundo.fretes = [frete('A', '2026-10-13T09:20')]
    mundo.discordStatus = 500
    let p = await rodada(m, '2026-10-13T10:00')
    ok(p.length === 1 && !p[0].entregue, 'C3: send-only recusado (500)')
    mundo.discordStatus = 204
    mundo.raw.push(vivo('2026-10-13T10:00'))
    p = await rodada(m, '2026-10-13T10:05')
    ok(p.length === 1 && p[0].mencao, 'C4: send-only recusado retenta com mencao (conjunto nao foi marcado)')
  }

  // --- D: pendencia permanente nao cala send-only novo (bloqueante 1) ---------------------
  {
    const m = await novoMonitor('2026-10-13T09:55')
    const fresco = q => { mundo.raw.push(vivo(q)) } // recebimento ok: isola o send-only
    mundo.fretes = [frete('P', '2026-10-01T10:00')] // grupo removido: nunca vai sair
    fresco('2026-10-13T09:58')
    let p = await rodada(m, '2026-10-13T10:00')
    ok(p.length === 1 && p[0].mencao, 'D1: primeira pendencia pinga')
    fresco('2026-10-13T10:38')
    p = await rodada(m, '2026-10-13T10:40')
    ok(p.length === 0, 'D2: mesmo conjunto nao repinga')
    mundo.fretes.push(frete('N', '2026-10-13T10:50'))
    fresco('2026-10-13T11:28')
    p = await rodada(m, '2026-10-13T11:30')
    ok(p.length === 1 && p[0].mencao && p[0].titulo.includes('Zombie Detectado'), 'D3: frete NOVO travado ao lado da pendencia permanente pinga')
    mundo.fretes = mundo.fretes.filter(f => f.id !== 'N')
    fresco('2026-10-13T12:08')
    p = await rodada(m, '2026-10-13T12:10')
    ok(p.length === 0, 'D4: conjunto que so encolheu nao pinga')
    mundo.fretes.push(frete('M', '2026-10-13T12:20'))
    fresco('2026-10-13T12:58')
    p = await rodada(m, '2026-10-13T13:00')
    ok(p.length === 1 && p[0].mencao, 'D5: outro frete novo depois pinga de novo')
    mundo.fretes = []
    fresco('2026-10-13T13:08')
    p = await rodada(m, '2026-10-13T13:10')
    ok(so(p, 'Envio voltou').length === 1 && !p[0].mencao, 'D6: fila zerada avisa a volta sem mencao')
  }

  // --- E: replay de foto antiga nao anuncia volta falsa (achado 7) ------------------------
  {
    const m = await novoMonitor('2026-10-13T12:55')
    mundo.raw = [vivo('2026-10-13T07:00')]
    await rodada(m, '2026-10-13T13:05')
    mundo.raw.push(replay('2026-10-13T13:20', '2026-10-13T09:00')) // daemon reprocessou foto das 9h
    const p = await rodada(m, '2026-10-13T13:25')
    ok(so(p, 'voltou').length === 0, 'E1: replay nao e prova de recebimento ao vivo: nada de "Recebimento voltou"')
    ok(m.getZombieState().receiveOnly.avisadoEm !== null, 'E1: replay nao encerra o incidente')
  }

  // --- F: 3 restarts na janela pingam UMA vez, nao a cada 5min (achado 5) ----------------
  {
    const m = await novoMonitor('2026-10-13T12:55')
    mundo.raw = [vivo('2026-10-13T07:00')]
    const token = p => new URL(p.link.match(/\((https:[^)]+)\)/)[1]).searchParams.get('token')
    let p = await rodada(m, '2026-10-13T13:05')
    for (const quando of ['2026-10-13T13:06', '2026-10-13T13:28', '2026-10-13T13:50']) {
      agora = brt(quando)
      const r = await m.executeRestart(token(p.find(x => x.titulo.includes('Zombie Detectado'))))
      ok(r.ok && r.estadoVoltouOpen, `F: restart aprovado as ${quando.slice(11)}`)
      const hh = new RealDate(brt(quando) + 21 * 60 * 1000)
      p = await rodada(m, hh.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16).replace(' ', 'T'))
      if (quando !== '2026-10-13T13:50') ok(p.some(x => x.mencao && x.titulo.includes('Zombie Detectado')), 'F: zumbi depois do restart e incidente novo e pinga')
    }
    ok(so(p, 'Instabilidade Recorrente').length === 1 && so(p, 'Instabilidade Recorrente')[0].mencao, 'F1: 3 restarts em 2h pinga na entrada')
    let depois = [...await rodada(m, '2026-10-13T14:16'), ...await rodada(m, '2026-10-13T14:21'), ...await rodada(m, '2026-10-13T14:26')]
    ok(depois.length === 0, 'F2: instabilidade nao repinga a cada 5min')
  }

  // --- decisao pura: marco ilegivel (banco falhou) ----------------------------------------
  {
    const { decidirAvisoReceiveOnly } = await import(new URL(`./tp-zombie-monitor.js?cenario=${++n}`, import.meta.url))
    const t0 = 1_700_000_000_000
    ok(decidirAvisoReceiveOnly({ avisado: null, marcoMs: null, agoraTs: t0 }) === 'alerta', 'G1: sem aviso anterior, marco ilegivel pinga')
    ok(decidirAvisoReceiveOnly({ avisado: { marcoMs: 1, ts: t0 }, marcoMs: null, agoraTs: t0 + 60e3 }) === 'pular', 'G2: marco ilegivel respeita cooldown (sem rajada de 5min)')
    ok(decidirAvisoReceiveOnly({ avisado: { marcoMs: 1, ts: t0 }, marcoMs: null, agoraTs: t0 + 3 * 3600e3 }) === 'alerta', 'G3: marco ilegivel depois do cooldown pinga (nao prova mesmo incidente)')
  }
} finally {
  Object.assign(console, silenciar)
}

console.log(`check:alerta-zombie OK — ${total} asserts: transicao pinga, persistencia muda, volta muda (tambem antes das 8h), entrega recusada retenta, pendencia permanente nao cala frete novo, replay nao anuncia volta, instabilidade pinga uma vez`)
