#!/usr/bin/env node
// services/alerting.check.js: autoteste da regra de mencao do Discord.
//
// NAO posta em Discord nenhum: troca `globalThis.fetch` por um stub que captura o payload
// antes de qualquer request sair da maquina. Nenhuma rede e tocada.
//
//   node services/alerting.check.js
//
// Falha com exit != 0 se a regra quebrar: alerta sem ping, log com ping, allowed_mentions
// ausente, `parse` diferente de [] (que deixaria @everyone de texto de terceiro pingar o
// server inteiro), mencao dentro do embed em vez do content, ou modo invalido aceito.

const MARCO = '834406885309546568'
const FAKE_WEBHOOK = 'https://discord.invalid/api/webhooks/checagem-local'

process.env.DISCORD_WEBHOOK_URL = FAKE_WEBHOOK
// Evolution nao pode ser chamada: o stub cobre, mas o host fica invalido por seguranca.
process.env.EVOLUTION_API_ENDPOINT = 'https://evolution.invalid'

const capturado = []
globalThis.fetch = async (url, opts = {}) => {
  capturado.push({ url: String(url), body: JSON.parse(opts.body || '{}') })
  return { ok: true, status: 204, text: async () => '', json: async () => ({}) }
}

const { alertError, alertWithAction, alertSuccess, alertWarning, postDiscord } =
  await import('./alerting.js')

let falhas = 0
function t(desc, cond) {
  if (cond) { console.log(`  ok   : ${desc}`) }
  else { console.log(`  FALHA: ${desc}`); falhas++ }
}

const posts = () => capturado.filter(c => c.url === FAKE_WEBHOOK)
const ultimo = () => posts()[posts().length - 1]

console.log('alerting.check (fetch stubado, nada sai pra rede)\n')

// --- modo alerta: precisa pingar -------------------------------------------------
await alertError('Pipeline ERRO', 'Motorista: @everyone corre\nErro: timeout')
let p = ultimo()
t('alerta: content do topo tem a mencao do Marco', p.body.content === `<@${MARCO}>`)
t('alerta: allowed_mentions.parse e []', JSON.stringify(p.body.allowed_mentions?.parse) === '[]')
t('alerta: allowed_mentions.users e [Marco]', JSON.stringify(p.body.allowed_mentions?.users) === JSON.stringify([MARCO]))
t('alerta: @everyone no texto nao vira ping (parse continua [])',
  p.body.embeds[0].description.includes('@everyone') && p.body.allowed_mentions.parse.length === 0)
t('alerta: texto original preservado no embed', p.body.embeds[0].title === 'TP Frete: Pipeline ERRO')
t('alertError tambem manda o fallback WhatsApp',
  capturado.some(c => c.url.includes('/message/sendText/')))

await alertWithAction('Zombie Detectado', 'gap de 6h', 'Reiniciar', 'https://exemplo.invalid/x')
p = ultimo()
t('alertWithAction e alerta (pede acao humana): pinga', p.body.content === `<@${MARCO}>`)
t('alertWithAction: parse [] + users [Marco]',
  JSON.stringify(p.body.allowed_mentions) === JSON.stringify({ parse: [], users: [MARCO] }))
t('alertWithAction: link de acao intacto', p.body.embeds[0].fields[0].value.includes('https://exemplo.invalid/x'))

// --- modo log: precisa ser mudo --------------------------------------------------
await alertSuccess('Recuperacao Concluida', '12 mensagens reprocessadas')
p = ultimo()
t('log (success): sem content, sem mencao', !p.body.content)
t('log (success): allowed_mentions.parse e []', JSON.stringify(p.body.allowed_mentions?.parse) === '[]')
t('log (success): allowed_mentions.users vazio/ausente', !p.body.allowed_mentions?.users?.length)

await alertWarning('Gemini retry', 'cliente escreveu: @everyone @here <@' + MARCO + '> resolvido')
p = ultimo()
t('log (warning): sem content, sem mencao', !p.body.content)
t('log (warning): parse [] mata @everyone/@here de texto de terceiro',
  JSON.stringify(p.body.allowed_mentions) === JSON.stringify({ parse: [] }))
t('log (warning): mencao dentro do embed nao pinga e nao vaza pro content',
  p.body.embeds[0].description.includes(`<@${MARCO}>`) && !p.body.content)

// --- todo post tem allowed_mentions ----------------------------------------------
t('TODO post no Discord carrega allowed_mentions',
  posts().every(c => c.body.allowed_mentions && Array.isArray(c.body.allowed_mentions.parse)))
t('nenhum post traz parse com everyone/here',
  posts().every(c => c.body.allowed_mentions.parse.length === 0))

// --- modo obrigatorio: sem default silencioso ------------------------------------
const antes = posts().length
for (const modo of [undefined, null, '', 'log ', 'ALERTA', 'aviso', true]) {
  let lancou = false
  try { await postDiscord(modo, { title: 'x' }) } catch { lancou = true }
  t(`modo invalido ${JSON.stringify(modo)} lanca em vez de assumir default`, lancou)
}
t('nenhuma chamada invalida postou no webhook', posts().length === antes)

console.log('')
if (falhas === 0) { console.log('CHECK OK: todos os testes passaram.'); process.exit(0) }
console.log(`CHECK FALHOU: ${falhas} problema(s).`)
process.exit(1)
