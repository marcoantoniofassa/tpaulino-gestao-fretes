// services/zombie-send.check.js — guarda do zumbi SEND-ONLY (01/09/2026).
//
// O incidente: `connectionState` devolvia 'open' e `sendText` devolvia 500 "Connection
// Closed". Nenhuma das 3 guardas existentes olhava pro lado do ENVIO (a sonda le estado,
// o gap mede mensagem CHEGANDO), e o monitor nem acordava: `isBusinessHours()` abre as 6h
// e as falhas comecaram 00h14 BRT. Resultado medido: 5 fretes das 00h14 as 04h55 sem a
// confirmacao no grupo do motorista, retry de 10min falhando por 3h30, tudo verde.
//
// Rodar: npm run check:envio
import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { avaliarEnvioTravado } from './tp-zombie-monitor.js'
import { isBusinessHours } from './config.js'

const MIN = 60_000
const agoraTs = Date.parse('2026-09-01T11:00:00Z') // 08h BRT
const emMin = m => new Date(agoraTs - m * MIN).toISOString()
const ERRO = 'Evolution sendText: 500 {"message":"Connection Closed"}'

// --- O caso real de 01/09 -------------------------------------------------------------
const real = avaliarEnvioTravado({
  agoraTs,
  fretes: [
    { id: 'a', created_at: emMin(410), confirmacao_erro: ERRO }, // 00h14 BRT
    { id: 'b', created_at: emMin(405), confirmacao_erro: ERRO },
    { id: 'c', created_at: emMin(85), confirmacao_erro: ERRO },
    { id: 'd', created_at: emMin(84), confirmacao_erro: ERRO },
    { id: 'e', created_at: emMin(64), confirmacao_erro: ERRO },
  ],
})
assert.strictEqual(real.count, 5, `os 5 fretes de 01/09 tinham que acusar, veio ${real.count}`)
assert.strictEqual(real.maisAntigo.toISOString(), emMin(410),
  'maisAntigo tem que ser o PRIMEIRO frete travado: e ele que diz ha quanto tempo o envio morreu')

// --- Nao alarmar onde nao ha defeito ---------------------------------------------------
// Falha transitoria: o retry de 10min ainda vai pegar. Alarmar aqui gera o falso positivo
// que fez o threshold do receive-only ser mexido 3x.
assert.strictEqual(
  avaliarEnvioTravado({ agoraTs, fretes: [{ id: 'x', created_at: emMin(5), confirmacao_erro: ERRO }] }).count, 0,
  'frete de 5min ainda esta na janela do retry, nao e envio morto')

// Pendente SEM erro registrado nunca tentou enviar. Havia 15 registros assim, de marco,
// parados no banco: conta-los faria a guarda gritar zumbi todo dia desde o deploy.
assert.strictEqual(
  avaliarEnvioTravado({ agoraTs, fretes: [{ id: 'y', created_at: emMin(999999), confirmacao_erro: null }] }).count, 0,
  'pendente sem confirmacao_erro nunca tocou o caminho de envio: nao prova nada sobre ele')

// Fila vazia = envio saudavel.
assert.strictEqual(avaliarEnvioTravado({ agoraTs, fretes: [] }).count, 0, 'sem pendencia, sem alerta')

// Ordem: se o banco devolver fora de ordem, o "ha quanto tempo" nao pode vir do primeiro
// da lista, tem que vir do mais antigo de verdade.
const fora = avaliarEnvioTravado({
  agoraTs,
  fretes: [
    { id: 'novo', created_at: emMin(60), confirmacao_erro: ERRO },
    { id: 'velho', created_at: emMin(600), confirmacao_erro: ERRO },
  ],
})
assert.strictEqual(fora.maisAntigo.toISOString(), emMin(600),
  'lista fora de ordem nao pode encurtar a idade do incidente')

// --- O portao de horario: onde o incidente escapou -------------------------------------
// 00h14 BRT = 03h14 UTC. Se o check de envio ficar atras de isBusinessHours(), o incidente
// de 01/09 passa de novo inteiro: 5h48 de falha antes do monitor sequer acordar.
assert.strictEqual(isBusinessHours(new Date('2026-09-01T03:14:00Z')), false,
  'premissa do teste: 00h14 BRT esta FORA do horario comercial')

const src = await readFile(new URL('./tp-zombie-monitor.js', import.meta.url), 'utf-8')
const corpo = src.slice(src.indexOf('export async function runZombieMonitor'))
const posEnvio = corpo.indexOf('getConfirmacoesTravadas()')
const posPortao = corpo.indexOf('if (!isBusinessHours()) return')
assert.ok(posEnvio > 0 && posPortao > 0, 'nao achei o check de envio ou o portao de horario em runZombieMonitor')
assert.ok(posEnvio < posPortao,
  'o check de envio TEM que rodar ANTES de isBusinessHours(): foi na madrugada que o zumbi de 01/09 passou')

// O alerta de envio nao pode INTERROMPER a rodada: com `return` aqui, uma confirmacao que
// nunca sai (grupo removido, jid invalido) fica travada pra sempre e o check de recebimento
// nunca mais roda. Os dois modos coexistem, entao o de envio avisa e segue.
const trechoEnvio = corpo.slice(0, posPortao)
assert.ok(/await dispatchZombieAlert\(/.test(trechoEnvio),
  'o check de envio precisa disparar o alerta pelo mesmo caminho do receive-only')
assert.ok(!/return await dispatchZombieAlert\(/.test(trechoEnvio),
  'o alerta de envio nao pode dar `return`: isso cega o check de recebimento enquanto houver travado')

// Dedup por CONJUNTO: zumbi vivo trava frete novo a cada foto, entao a chave muda e o
// alerta continua. Falha permanente de uma linha so (grupo removido) fica com a chave
// parada e nao pode realertar a cada 30min pra sempre com a Evolution enviando normal.
const doisTravados = [
  { id: 'b', created_at: emMin(400), confirmacao_erro: ERRO },
  { id: 'a', created_at: emMin(410), confirmacao_erro: ERRO },
]
assert.strictEqual(
  avaliarEnvioTravado({ agoraTs, fretes: doisTravados }).chave,
  avaliarEnvioTravado({ agoraTs, fretes: [...doisTravados].reverse() }).chave,
  'a chave nao pode depender da ordem que o banco devolveu, senao realerta sozinha')
assert.notStrictEqual(
  avaliarEnvioTravado({ agoraTs, fretes: doisTravados }).chave,
  avaliarEnvioTravado({ agoraTs, fretes: [...doisTravados, { id: 'c', created_at: emMin(40), confirmacao_erro: ERRO }] }).chave,
  'frete novo travado TEM que mudar a chave: e assim que o zumbi vivo continua avisando')
assert.strictEqual(avaliarEnvioTravado({ agoraTs, fretes: [] }).chave, '', 'fila vazia tem chave vazia (libera o proximo alerta)')

// Dedup so pode ser gravado se o aviso SAIU. dispatchZombieAlert morre em cooldown sem
// alertar; marcar a chave ali consumiria o unico alerta de um incidente que nao ganha
// fretes novos (madrugada), e o envio ficaria morto em silencio.
assert.ok(/const avisou = await dispatchZombieAlert\(/.test(src),
  'o call site precisa saber se o alerta saiu antes de deduplicar')
assert.ok(/if \(avisou\) state\.lastSendOnlyChave = travadas\.chave/.test(src),
  'a chave so pode ser marcada quando o aviso saiu de fato')
const corpoDispatch = src.slice(src.indexOf('async function dispatchZombieAlert'))
assert.ok(/skipping alert'\)\s*\n\s*return false/.test(corpoDispatch) && /skipping`\)\s*\n\s*return false/.test(corpoDispatch),
  'os dois cooldowns tem que devolver false: sem isso o call site acha que avisou')

const monitorSrc = src
assert.ok(/travadas\.chave !== state\.lastSendOnlyChave/.test(monitorSrc),
  'o alerta de envio precisa deduplicar por conjunto, senao vira loop de 30 em 30min')

// O estado do envio tem que sair no /api/tp/zombie-status: sem isso nao ha como provar de
// fora se a versao em producao tem a guarda (foi o que faltou pra diagnosticar 02/09).
assert.ok(/sendOnly: \{/.test(src) && /lastSendOnlyAlertAt \? new Date/.test(src),
  'getZombieState precisa expor o estado do check de envio')

// Cooldown proprio: compartilhar o campo do receive-only faz um alerta calar o outro,
// e os dois modos de falha podem coexistir.
assert.ok(/lastSendOnlyAlertAt/.test(src),
  'send-only precisa de cooldown proprio, senao um alerta de receive-only silencia o outro')

console.log('OK: guarda do zumbi SEND-ONLY (01/09/2026) — 20 asserts')
