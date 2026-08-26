// services/zombie-recovery.check.js — guarda dos defeitos do zumbi de 26/08/2026.
//
// Cada assert REPROVA se o defeito original voltar. Nao testa caminho feliz por esporte:
// testa a confusao que deixou 3 zumbis passarem (09/04, 01/07, 25/08).
//
// Rodar: npm run check:zombie
import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { avaliarCoberturaStore, decidirAlertaRecuperacao } from './tp-zombie-monitor.js'
import { isUniqueViolation } from './tp-ocr-pipeline.js'
import { GROUP_MOTORISTA } from './config.js'
// Import DIRETO, sem .catch(): a versao anterior engolia falha de import e o check
// ficava verde justamente quando o modulo testado estava quebrado.
import { GROUPS, chaveRaw } from '../scripts/tp-recovery.js'

const H = 3600
const inicio = 1_700_000_000        // inicio do zumbi
const agora = inicio + 21 * H       // 21h depois, que foi a duracao real de 25/08
const base = { startTs: inicio, agoraTs: agora }

// --- Cobertura da fonte ---------------------------------------------------------------
// Store cego: a Evolution nunca recebeu a mensagem, findMessages devolve zero, e o
// relatorio dizia "Recuperacao Concluida". recovered=0 com fonte vazia NAO e "nada a
// recuperar", e "nao consegui olhar".
const cego = avaliarCoberturaStore({ ...base, storeImagens: 0, storeMaisAntigaTs: null })
assert.strictEqual(cego.cego, true, 'store sem NENHUMA foto na janela tem que ser marcado cego')
assert.ok(cego.janelaHoras > 20 && cego.janelaHoras < 22, `janela deveria ser ~21h, veio ${cego.janelaHoras}`)

// Parcial: apos o restart o Baileys reenche o store so em parte (em 26/08 um ticket das
// 15:42 BRT nunca reapareceu).
const parcial = avaliarCoberturaStore({ ...base, storeImagens: 9, storeMaisAntigaTs: inicio + 5 * H })
assert.strictEqual(parcial.parcial, true, 'foto mais antiga 5h depois do inicio = cobertura parcial')
assert.ok(Math.abs(parcial.buracoHoras - 5) < 0.01, `buraco deveria ser 5h, veio ${parcial.buracoHoras}`)

// Sem buraco DETECTAVEL. Note o nome: o store nunca prova completude, so mostra o que tem.
const limpa = avaliarCoberturaStore({ ...base, storeImagens: 14, storeMaisAntigaTs: inicio + 120 })
assert.strictEqual(limpa.cego, false, 'store com fotos desde o inicio nao e cego')
assert.strictEqual(limpa.parcial, false, '2min de folga no inicio nao e buraco, e granularidade')
assert.strictEqual(limpa.incerta, false, 'sem sinal de incerteza, nao pode marcar incerta')

// Timestamp ilegivel: a versao anterior concluia buraco=0, virando "cobertura perfeita"
// EXATAMENTE quando nao sabia onde a cobertura comeca.
const semTs = avaliarCoberturaStore({ ...base, storeImagens: 5, storeMaisAntigaTs: null, semTimestamp: 5 })
assert.strictEqual(semTs.incerta, true, 'foto sem timestamp legivel = cobertura incerta, nunca boa')
assert.strictEqual(semTs.cego, false, 'tem foto, entao nao e cego: e incerto, que e outra coisa')

// Pagina cheia: a lista pode ter sido cortada no teto de 100.
const truncada = avaliarCoberturaStore({ ...base, storeImagens: 100, storeMaisAntigaTs: inicio + 60, truncados: 1 })
assert.strictEqual(truncada.incerta, true, 'pagina cheia pode estar truncada = incerta')

// Grupo inteiro sem foto: pode ser folga do motorista OU store cego naquele grupo. Daqui
// nao da pra distinguir, entao vira incerteza pra humano olhar. O agregado escondia isso:
// uma foto de um motorista fazia a cobertura inteira parecer boa.
const umGrupoVazio = avaliarCoberturaStore({ ...base, storeImagens: 1, storeMaisAntigaTs: inicio + 60, gruposVazios: 4 })
assert.strictEqual(umGrupoVazio.incerta, true, '4 grupos sem nenhuma foto nao pode sair como cobertura boa')

// --- A DECISAO do alerta --------------------------------------------------------------
// Testar so avaliarCoberturaStore nao protegia nada: dava pra ignorar o veredito dela na
// hora de alertar e o check continuava verde. O defeito era a ESCOLHA, entao ela e testada.
assert.strictEqual(decidirAlertaRecuperacao({ failed: 0, cobertura: cego }).tipo, 'erro',
  'store cego NAO pode sair por alertSuccess: foi esse o defeito')
assert.strictEqual(decidirAlertaRecuperacao({ failed: 0, cobertura: parcial }).tipo, 'erro',
  'cobertura parcial nao pode sair como sucesso')
assert.strictEqual(decidirAlertaRecuperacao({ failed: 0, cobertura: semTs }).tipo, 'erro',
  'cobertura incerta nao pode sair como sucesso')
assert.strictEqual(decidirAlertaRecuperacao({ failed: 3, cobertura: limpa }).tipo, 'erro',
  'falha no replay pinga mesmo com fonte boa')
assert.strictEqual(decidirAlertaRecuperacao({ failed: 0, cobertura: limpa }).tipo, 'sucesso',
  'sem falha e sem buraco detectavel pode sair como sucesso')
// O titulo do caso parcial dizia "fonte cega", que e afirmacao factual errada.
assert.ok(!decidirAlertaRecuperacao({ failed: 0, cobertura: parcial }).titulo.includes('cega'),
  'titulo do caso PARCIAL nao pode dizer "cega"')
// E o caso bom nao pode prometer completude que a fonte nao tem como provar.
assert.ok(decidirAlertaRecuperacao({ failed: 0, cobertura: limpa }).titulo.includes('detectavel'),
  'o titulo de sucesso tem que deixar claro que e "sem buraco DETECTAVEL", nao "recuperei tudo"')

// --- Reentrega da Evolution ------------------------------------------------------------
assert.strictEqual(
  isUniqueViolation(new Error('Supabase INSERT tp_mensagens_raw: 409 {"code":"23505","details":"Key (msg_id, chat_jid)=(AC270AD3, 1203630@g.us) already exists"}')),
  true, 'o 409/23505 real da reentrega tem que ser reconhecido como duplicata')
assert.strictEqual(isUniqueViolation(new Error('duplicate key value violates unique constraint')), true,
  'a forma textual do Postgres tambem conta')
// A outra ponta importa igual: erro de verdade NAO pode virar "e so duplicata", senao
// falha real passa calada e a mensagem some sem ninguem ver.
assert.strictEqual(isUniqueViolation(new Error('Supabase INSERT tp_mensagens_raw: 500 internal error')), false,
  'erro 500 nao e duplicata')
assert.strictEqual(isUniqueViolation(new Error('fetch failed')), false, 'rede caida nao e duplicata')
assert.strictEqual(isUniqueViolation(undefined), false, 'erro ausente nao e duplicata')

// --- Dedup pela chave real -------------------------------------------------------------
// A UNIQUE e (msg_id, chat_jid). Dedup so por msg_id pulava mensagem legitima de OUTRO
// grupo com o mesmo id.
assert.notStrictEqual(chaveRaw('AC1', 'grupo-A@g.us'), chaveRaw('AC1', 'grupo-B@g.us'),
  'mesmo msg_id em grupos diferentes sao registros DISTINTOS')
assert.strictEqual(chaveRaw('AC1', 'grupo-A@g.us'), chaveRaw('AC1', 'grupo-A@g.us'), 'mesma chave e igual a si mesma')

// --- Grupos: uma fonte so --------------------------------------------------------------
const doConfig = new Set(Object.keys(GROUP_MOTORISTA))
const doScript = new Set(Object.values(GROUPS))
for (const jid of doConfig) {
  assert.ok(doScript.has(jid), `grupo ${jid} esta no config e a recuperacao nao olha pra ele`)
}
assert.strictEqual(doScript.size, doConfig.size, 'recuperacao e config tem que cobrir os MESMOS grupos')

// --- Guardas estruturais ---------------------------------------------------------------
// O que segue nao cabe em teste por chamada (estado mutavel + I/O de rede), entao a guarda
// le a fonte. Comentario e removido antes: a versao anterior acusava o proprio comentario
// que explicava a regra, ou seja, reprovava o codigo certo — e guarda que da falso
// positivo acaba desligada por chata.
const semComentario = (t) => t.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
// Proibe ATRIBUIR, nao mencionar: LER lastHealthyAt e legitimo (executeRestart usa como
// fallback do zombieStartTime) e a versao anterior desta guarda reprovava essa leitura.
// Cobre `state.lastHealthyAt =`, `state['lastHealthyAt'] =` e Object.assign.
const atribuiSaude = (t) => {
  const c = semComentario(t)
  return /lastHealthyAt['"\]\s]*=[^=]/.test(c) || (/Object\.assign/.test(c) && /lastHealthyAt/.test(c))
}

const monitor = await readFile(new URL('./tp-zombie-monitor.js', import.meta.url), 'utf8')

// lastHealthyAt so pode ser carimbado onde houve RECEBIMENTO. Estes dois pontos empurravam
// o marco de saude pra frente durante o zumbi, encolhendo calada a janela de recuperacao:
//   (a) ramo pre-8h, que so olha connectionState ('open' mente durante o zumbi)
//   (b) bloco !zombieConfirmed, que roda tambem no caso "gap suspeito 4-6h"
// Busca a MENCAO (nao so `state.x =`), pra `Object.assign` e `state['x']` nao escaparem.
const ramoPre8h = (monitor.slice(monitor.indexOf('// Before 8am'), monitor.indexOf('if (!zombieConfirmed)')))
assert.ok(ramoPre8h.length > 50, 'nao achei o ramo pre-8h: este check precisa acompanhar o refactor')
assert.ok(!atribuiSaude(ramoPre8h),
  "ramo pre-8h nao pode marcar lastHealthyAt: a sonda le connectionState, e 'open' fica verde durante todo o zumbi receive-only")

const iBloco = monitor.indexOf('if (!zombieConfirmed)')
const blocoSemZumbi = (monitor.slice(iBloco, monitor.indexOf('// ZOMBIE CONFIRMED', iBloco)))
assert.ok(blocoSemZumbi.length > 20, 'nao achei o bloco !zombieConfirmed: check precisa acompanhar o refactor')
assert.ok(!atribuiSaude(blocoSemZumbi),
  'bloco !zombieConfirmed nao pode mexer em lastHealthyAt: ele roda tambem com gap suspeito de 4-6h')

// A sonda le connectionState e NAO envia nada. Texto de alerta que fale em "sendText" ou
// afirme que o envio funciona induz o humano a diagnosticar errado no meio do incidente:
// foi por acreditar em "probe OK = envio vivo" que o modo receive-only passou 3 vezes.
assert.ok(!/sendText/.test(monitor),
  'o monitor nao pode falar em sendText: a sonda le connectionState e nao envia nada')

// Depois do restart, connectionState volta pra 'open' rapido e fica 'open' durante todo o
// zumbi receive-only. Carimbar saude ali apaga o marco de inicio do zumbi que a janela de
// recuperacao usa — mesmo erro que o ramo pre-8h cometia.
const iRestart = monitor.indexOf('export async function executeRestart')
assert.ok(iRestart > 0, 'nao achei executeRestart')
const blocoRestart = (monitor.slice(iRestart, monitor.indexOf('export async function executeRecovery')))
assert.ok(!atribuiSaude(blocoRestart),
  "executeRestart nao pode marcar lastHealthyAt: 'open' nao prova recebimento")

// A recuperacao tem que filtrar fromMe, como o tp-backfill.js ja fazia. Sem isso, foto que
// o proprio numero mandou conta como cobertura e pode virar frete de motorista.
const iRec = monitor.indexOf('export async function executeRecovery')
assert.ok(iRec > 0, 'nao achei executeRecovery')
assert.ok(/!m\.key\?\.fromMe/.test(monitor.slice(iRec)),
  'executeRecovery tem que descartar fromMe (o tp-backfill.js ja faz)')

// O pipeline nunca lanca: ele engole o proprio erro e marca ERRO. Entao a recuperacao NAO
// pode contar "sem excecao" como sucesso — tem que reler a linha pra saber o desfecho.
const trechoReplay = monitor.slice(monitor.indexOf('await processWebhookMessage(fakeWebhook)'), iRec + monitor.slice(iRec).indexOf('// Report results'))
assert.ok(/select=status/.test(trechoReplay),
  'depois de processWebhookMessage a recuperacao tem que RELER o status da linha: a funcao nunca lanca')

// O webhook tambem tem que descartar fromMe (foto nossa no grupo virando frete).
const pipelineFonte = await readFile(new URL('./tp-ocr-pipeline.js', import.meta.url), 'utf8')
const iFiltro = pipelineFonte.indexOf('function filterMessage')
assert.ok(iFiltro > 0, 'nao achei filterMessage')
assert.ok(/data\.key\.fromMe/.test(pipelineFonte.slice(iFiltro, iFiltro + 1200)),
  'filterMessage tem que descartar fromMe: foto do proprio numero nao e ticket de motorista')

// Duplicata no webhook sai SEMPRE. Deixar seguir com a linha em PENDENTE abria corrida:
// duas entregas concorrentes chegavam juntas ao INSERT tp_fretes e geravam frete duplicado.
const pipeline = pipelineFonte
const iCatch = pipeline.indexOf('if (!isUniqueViolation(insertErr)) throw insertErr')
assert.ok(iCatch > 0, 'nao achei o tratamento de duplicata no pipeline')
const blocoDup = semComentario(pipeline.slice(iCatch, pipeline.indexOf('// Step 3', iCatch)))
assert.ok(/\breturn\b/.test(blocoDup),
  'duplicata tem que sair com return: seguir o fluxo abre corrida e duplica frete')
assert.ok(!/ocrTicket|tp_fretes/.test(blocoDup),
  'o caminho de duplicata nao pode chamar OCR nem inserir frete')

// A confirmacao no banco so pode olhar o que o webhook ACEITOU. Conferir a lista inteira
// de candidatos mistura POST que falhou com linha que ja existia OK, inflando
// `confirmados` acima de `ok` e gerando nao_confirmados NEGATIVO no resumo que o cron le.
const scriptRec = await readFile(new URL('../scripts/tp-recovery.js', import.meta.url), 'utf8')
const iConf = scriptRec.indexOf('let confirmados = 0')
assert.ok(iConf > 0, 'nao achei o bloco de confirmacao no tp-recovery.js')
const blocoConf = semComentario(scriptRec.slice(iConf, scriptRec.indexOf('const naoConfirmados', iConf)))
assert.ok(!/toReplay/.test(blocoConf),
  'a confirmacao no banco tem que usar SO os aceitos (2xx), nunca toReplay inteiro')
assert.ok(/aceitos/.test(blocoConf), 'a confirmacao no banco tem que partir da lista de aceitos')

console.log('check:zombie OK — cobertura, decisao do alerta, reentrega sai sempre, fromMe, status relido, grupos == config, sonda nao mente, restart nao carimba saude')
