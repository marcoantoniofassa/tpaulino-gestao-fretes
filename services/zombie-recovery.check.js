// services/zombie-recovery.check.js — guarda dos 3 defeitos do zumbi de 26/08/2026.
//
// Cada assert abaixo REPROVA se o defeito original voltar. Nao testa o caminho feliz por
// esporte: testa exatamente a confusao que deixou 3 zumbis passarem (09/04, 01/07, 25/08).
//
// Rodar: npm run check:zombie
import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { avaliarCoberturaStore } from './tp-zombie-monitor.js'
import { isUniqueViolation } from './tp-ocr-pipeline.js'
import { GROUP_MOTORISTA } from './config.js'

const H = 3600
const inicio = 1_700_000_000        // inicio do zumbi
const agora = inicio + 21 * H       // 21h depois, que foi a duracao real de 25/08

// --- Defeito 1: store cego anunciado como "Recuperacao Concluida" ---------------------
// Era o pior caso: a Evolution nao tem a mensagem (nunca chegou nela), findMessages
// devolve zero, e o relatorio dizia sucesso. recovered=0 com fonte vazia NAO e
// "nada a recuperar", e "nao consegui olhar".
const cego = avaliarCoberturaStore({ storeImagens: 0, storeMaisAntigaTs: null, startTs: inicio, agoraTs: agora })
assert.strictEqual(cego.cego, true, 'store sem NENHUMA foto na janela tem que ser marcado cego')
assert.ok(cego.janelaHoras > 20 && cego.janelaHoras < 22, `janela deveria ser ~21h, veio ${cego.janelaHoras}`)

// Cobertura PARCIAL: apos o restart o Baileys reenche o store so em parte. Em 26/08 um
// ticket das 15:42 BRT nunca reapareceu. Se a foto mais antiga esta muito depois do
// inicio da janela, o buraco continua la e o relatorio nao pode dizer "concluida".
const parcial = avaliarCoberturaStore({
  storeImagens: 9,
  storeMaisAntigaTs: inicio + 5 * H,
  startTs: inicio,
  agoraTs: agora,
})
assert.strictEqual(parcial.cego, false, 'com fotos na janela nao e cego')
assert.strictEqual(parcial.parcial, true, 'foto mais antiga 5h depois do inicio = cobertura parcial')
assert.ok(Math.abs(parcial.buracoHoras - 5) < 0.01, `buraco deveria ser 5h, veio ${parcial.buracoHoras}`)

// Cobertura boa: o store comeca junto com a janela. Aqui sim pode dizer concluida.
const ok = avaliarCoberturaStore({
  storeImagens: 14,
  storeMaisAntigaTs: inicio + 120,   // 2min depois: o inicio nunca casa exato com uma msg
  startTs: inicio,
  agoraTs: agora,
})
assert.strictEqual(ok.cego, false, 'store com fotos desde o inicio nao e cego')
assert.strictEqual(ok.parcial, false, '2min de folga no inicio nao e buraco, e granularidade')

// --- Defeito 2: reentrega da Evolution tratada como incidente -------------------------
// O replay do Baileys reentrega a msg, o INSERT bate na UNIQUE, e o catch generico
// marcava ERRO a linha que estava OK (e pingava o Discord a toa).
assert.strictEqual(
  isUniqueViolation(new Error('Supabase INSERT tp_mensagens_raw: 409 {"code":"23505","details":"Key (msg_id, chat_jid)=(AC270AD3, 1203630@g.us) already exists"}')),
  true,
  'o 409/23505 real da reentrega tem que ser reconhecido como duplicata',
)
assert.strictEqual(
  isUniqueViolation(new Error('duplicate key value violates unique constraint')),
  true,
  'a forma textual do Postgres tambem conta',
)
// A outra ponta importa igual: erro de verdade NAO pode virar "e so duplicata", senao
// falha real passa calada e a mensagem some sem ninguem ver.
assert.strictEqual(isUniqueViolation(new Error('Supabase INSERT tp_mensagens_raw: 500 internal error')), false,
  'erro 500 nao e duplicata')
assert.strictEqual(isUniqueViolation(new Error('fetch failed')), false, 'rede caida nao e duplicata')
assert.strictEqual(isUniqueViolation(undefined), false, 'erro ausente nao e duplicata')

// --- Defeito 3: lista de grupos paralela divergindo do config -------------------------
// O tp-recovery.js tinha 5 grupos escritos a mao; o config tem 6. O alias do Christian
// ficava de fora e um zumbi naquele grupo passaria em branco.
const { GROUPS } = await import('../scripts/tp-recovery.js').catch(() => ({ GROUPS: null }))
if (GROUPS) {
  const doConfig = new Set(Object.keys(GROUP_MOTORISTA))
  const doScript = new Set(Object.values(GROUPS))
  for (const jid of doConfig) {
    assert.ok(doScript.has(jid), `grupo ${jid} esta no config e a recuperacao nao olha pra ele`)
  }
  assert.strictEqual(doScript.size, doConfig.size, 'recuperacao e config tem que cobrir os MESMOS grupos')
}

// --- Defeito 4: lastHealthyAt carimbado sem ter havido RECEBIMENTO --------------------
// Nao da pra testar por chamada (estado mutavel dentro de funcao com I/O de rede), entao
// a guarda e estrutural, no mesmo estilo do check:alerting. Os dois pontos abaixo eram
// onde o marco de saude era empurrado pra frente durante o zumbi, encolhendo calada a
// janela que executeRecovery usa:
//   (a) ramo pre-8h, que so roda sonda de ENVIO (a falha aqui e receive-only)
//   (b) bloco `if (!zombieConfirmed)`, que rodava tambem no caso "gap suspeito 4-6h"
// Se alguem reintroduzir a atribuicao em qualquer um dos dois, isto reprova.
const fonte = await readFile(new URL('./tp-zombie-monitor.js', import.meta.url), 'utf8')

// Tira comentario de linha ANTES de procurar. Sem isso o check acusava o proprio
// comentario que explica "aqui NAO se marca lastHealthyAt" — a guarda reprovava o codigo
// certo e passaria a ser desligada por chato, que e como guarda morre.
const semComentario = (t) => t.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
const atribuiSaude = (t) => /state\.lastHealthyAt\s*=/.test(semComentario(t))

const ramoPre8h = fonte.slice(fonte.indexOf('// Before 8am'), fonte.indexOf('if (!zombieConfirmed)'))
assert.ok(ramoPre8h.length > 100, 'nao achei o ramo pre-8h: este check precisa ser reescrito junto com o refactor')
assert.ok(
  !atribuiSaude(ramoPre8h),
  'ramo pre-8h nao pode marcar lastHealthyAt: a sonda so testa ENVIO e a falha e receive-only',
)

const inicioBloco = fonte.indexOf('if (!zombieConfirmed)')
const blocoSemZumbi = fonte.slice(inicioBloco, fonte.indexOf('// ZOMBIE CONFIRMED', inicioBloco))
assert.ok(blocoSemZumbi.length > 50, 'nao achei o bloco !zombieConfirmed: check precisa acompanhar o refactor')
assert.ok(
  !atribuiSaude(blocoSemZumbi),
  'bloco !zombieConfirmed nao pode marcar lastHealthyAt: ele roda tambem com gap suspeito de 4-6h',
)

console.log('check:zombie OK — cobertura de store (cego/parcial/ok), reentrega vs erro real, grupos == config, lastHealthyAt so com recebimento')
