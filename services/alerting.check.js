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
// Resposta que o stub devolve. Mutavel de proposito: o caminho de excecao (Discord
// recusando o post) precisa ser PERCORRIDO, nao so escrito.
let respostaStub = { ok: true, status: 204, text: async () => '', json: async () => ({}) }
globalThis.fetch = async (url, opts = {}) => {
  capturado.push({ url: String(url), body: JSON.parse(opts.body || '{}') })
  return respostaStub
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

// --- transporte: post recusado nao pode passar por entregue -----------------------
// 4xx/5xx resolvem o fetch sem lancar. Sem checagem de status, o alerta some calado e o
// sistema segue reportando sucesso: a mesma falha de 10/08, uma camada abaixo.
const errosLogados = []
const consoleErrorReal = console.error
console.error = (...args) => { errosLogados.push(args.map(String).join(' ')) }

for (const status of [400, 401, 404, 429, 500]) {
  respostaStub = { ok: false, status, text: async () => `{"message":"recusado ${status}"}` }
  errosLogados.length = 0
  let lancou = false
  try { await postDiscord('alerta', { title: 'x', description: 'y' }) } catch { lancou = true }
  t(`http ${status}: postDiscord falha em vez de reportar sucesso`, lancou)
  t(`http ${status}: a recusa vai pro log com o status`, errosLogados.some(l => l.includes(String(status))))
}

// Discord recusado nao pode levar junto o unico fallback que resta.
respostaStub = { ok: false, status: 404, text: async () => 'unknown webhook' }
const antesFallback = capturado.length
await alertError('Pipeline ERRO', 'discord fora do ar')
t('Discord 404 nao impede o fallback WhatsApp do alertError',
  capturado.slice(antesFallback).some(c => c.url.includes('/message/sendText/')))

console.error = consoleErrorReal
respostaStub = { ok: true, status: 204, text: async () => '', json: async () => ({}) }

// --- tamanho: payload acima do limite volta 400 e o alerta some -------------------
await postDiscord('alerta', {
  title: 'T'.repeat(400),
  description: 'D'.repeat(9000),
  fields: [{ name: 'N'.repeat(400), value: 'V'.repeat(3000) }],
  footer: { text: 'F'.repeat(3000) },
})
p = ultimo()
t('embed cortado no limite do Discord (title 256)', p.body.embeds[0].title.length <= 256)
t('embed cortado no limite do Discord (description 4096)', p.body.embeds[0].description.length <= 4096)
t('embed cortado no limite do Discord (field name 256 / value 1024)',
  p.body.embeds[0].fields[0].name.length <= 256 && p.body.embeds[0].fields[0].value.length <= 1024)
t('embed cortado no limite do Discord (footer 2048)', p.body.embeds[0].footer.text.length <= 2048)
t('post no limite continua sendo post valido: mencao e allowed_mentions intactos',
  p.body.content === `<@${MARCO}>` && JSON.stringify(p.body.allowed_mentions?.parse) === '[]')

// --- gate de drift: nenhum poster de Discord fora do helper -----------------------
// Varre o REPO INTEIRO (nao um diretorio, nao uma lista de arquivos escrita a mao, nao
// uma janela de N linhas): quem falar Discord fora de alerting.js escapa da regra de
// mencao, e escapar da regra e como o ping volta a chegar (ou a sumir) por fora.
const { readdirSync, readFileSync, statSync } = await import('node:fs')
const { join, resolve, relative, dirname } = await import('node:path')
const { fileURLToPath } = await import('node:url')

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IGNORA_DIR = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next'])
const EXT = /\.(js|mjs|cjs|ts|tsx|jsx)$/
const DONOS = new Set(['services/alerting.js', 'services/alerting.check.js'])
const PADROES = [
  [/discord(app)?\.com\/api\/webhooks/i, 'URL de webhook do Discord'],
  [/process\.env\.[A-Z0-9_]*DISCORD[A-Z0-9_]*/, 'env var de Discord lida direto'],
  [/allowed_mentions/, 'payload de mencao montado a mao'],
]

function varre(dir, achados) {
  for (const nome of readdirSync(dir)) {
    if (IGNORA_DIR.has(nome)) continue
    const caminho = join(dir, nome)
    const st = statSync(caminho)
    if (st.isDirectory()) { varre(caminho, achados); continue }
    if (!EXT.test(nome)) continue
    const rel = relative(RAIZ, caminho)
    if (DONOS.has(rel)) continue
    const conteudo = readFileSync(caminho, 'utf8')
    for (const [re, motivo] of PADROES) {
      const linha = conteudo.split('\n').findIndex(l => re.test(l))
      if (linha >= 0) achados.push(`${rel}:${linha + 1} (${motivo})`)
    }
  }
  return achados
}

const posteiros = varre(RAIZ, [])
t(`nenhum poster de Discord fora de services/alerting.js${posteiros.length ? ': ' + posteiros.join(', ') : ''}`,
  posteiros.length === 0)

console.log('')
if (falhas === 0) { console.log('CHECK OK: todos os testes passaram.'); process.exit(0) }
console.log(`CHECK FALHOU: ${falhas} problema(s).`)
process.exit(1)
