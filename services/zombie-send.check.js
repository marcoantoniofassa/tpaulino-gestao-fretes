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

// Cooldown proprio: compartilhar o campo do receive-only faz um alerta calar o outro,
// e os dois modos de falha podem coexistir.
assert.ok(/lastSendOnlyAlertAt/.test(src),
  'send-only precisa de cooldown proprio, senao um alerta de receive-only silencia o outro')

console.log('OK: guarda do zumbi SEND-ONLY (01/09/2026) — 9 asserts')
