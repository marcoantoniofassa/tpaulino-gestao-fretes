// services/tp-zombie-monitor.js — Zombie Socket Monitor (Human-in-the-Loop)
// Cron: */5 * * * * (every 5 minutes, business hours)
// Detects zombie Evolution connections, proposes restart + recovery via Discord action links
import crypto from 'crypto'
import { fetchInstances, probeConnectionState, findMessages, getBase64FromMedia } from './evolution.js'
import { processWebhookMessage } from './tp-ocr-pipeline.js'
import { alertWithAction, alertSuccess, alertError } from './alerting.js'
import * as db from './supabase.js'
import {
  GROUP_MOTORISTA, EVOLUTION_INSTANCE, PUSH_URL, PUSH_API_KEY,
  EASYPANEL_HOST, EASYPANEL_EMAIL, EASYPANEL_PASSWORD,
  EASYPANEL_PROJECT, EASYPANEL_SERVICE, APP_BASE_URL, isBusinessHours,
} from './config.js'

// Thresholds for receive-only zombie detection (probe OK but message gap)
// Based on incident 09/04/2026: 57h receive-only gap com a sonda passando o tempo todo
// (a sonda le connectionState; 'open' fica verde durante o zumbi inteiro).
// Tuned 10/04: 4h had false positives. Tuned 11/04: 10h too slow (missed 5h zombie).
// Compromise: 4h suspect, 6h critical. Drivers send ~every 2-3h during active day.
const GAP_SUSPECT_HOURS = 4   // Log only, no alert
const GAP_CRITICAL_HOURS = 6  // Confirms zombie receive-only, dispatches alert + restart link

// In-memory state (resets on deploy, acceptable)
const state = {
  lastHealthyAt: Date.now(),
  lastRestartAt: 0,
  consecutiveFailures: 0,
  pendingActions: {},    // token -> { type, zombieStartTime, expiresAt, used }
  restartCount2h: 0,     // restarts in last 2h window
  restartWindow: Date.now(),
  lastReceiveOnlyAlertAt: 0, // cooldown for receive-only alerts (reuses 20min window)
  // Cooldown SEPARADO por tipo de zumbi. Compartilhar o do receive-only faria um alerta
  // calar o outro: sao dois modos de falha independentes (chegar x sair) e podem coexistir.
  lastSendOnlyAlertAt: 0,
  lastSendOnlyChave: '',   // conjunto de fretes ja alertado (dedup, ver avaliarEnvioTravado)
}

// Token management
function createActionToken(type, extra = {}) {
  const token = crypto.randomUUID()
  state.pendingActions[token] = {
    type,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60 * 60 * 1000, // 1h
    used: false,
    ...extra,
  }
  // Cleanup expired tokens
  for (const [t, v] of Object.entries(state.pendingActions)) {
    if (v.expiresAt < Date.now()) delete state.pendingActions[t]
  }
  return token
}

export function validateToken(token) {
  const action = state.pendingActions[token]
  if (!action) return { valid: false, reason: 'Token nao encontrado' }
  if (action.used) return { valid: false, reason: 'Token ja utilizado' }
  if (action.expiresAt < Date.now()) return { valid: false, reason: 'Token expirado' }
  return { valid: true, action }
}

export function markTokenUsed(token) {
  if (state.pendingActions[token]) state.pendingActions[token].used = true
}

export function getZombieState() {
  return {
    lastHealthyAt: new Date(state.lastHealthyAt).toISOString(),
    lastRestartAt: state.lastRestartAt ? new Date(state.lastRestartAt).toISOString() : null,
    consecutiveFailures: state.consecutiveFailures,
    pendingActionsCount: Object.keys(state.pendingActions).length,
    restartCount2h: state.restartCount2h,
    // Estado do check de envio. Fica exposto porque, no incidente de 02/09, nao havia como
    // provar de fora se a versao em producao tinha a guarda: o endpoint devolvia so o lado
    // do recebimento e a resposta era identica com e sem o codigo novo.
    sendOnly: {
      lastAlertAt: state.lastSendOnlyAlertAt ? new Date(state.lastSendOnlyAlertAt).toISOString() : null,
      travadosAlertados: state.lastSendOnlyChave ? state.lastSendOnlyChave.split(',').length : 0,
    },
  }
}

function formatTimeDiff(ms) {
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  const remaining = mins % 60
  return `${hours}h${remaining > 0 ? remaining + 'min' : ''}`
}

// Veredito sobre a FONTE da recuperacao (store da Evolution), nao sobre o resultado.
// Pura de proposito: e a regra que decide se o relatorio pode dizer "concluida", e regra
// que mente sobre cobertura foi o defeito que deixou 3 zumbis passarem em branco.
// `parcial` usa 1h de tolerancia porque o inicio da janela raramente coincide com uma
// mensagem: o buraco so importa quando o store comeca BEM depois do inicio do zumbi.
export function avaliarCoberturaStore({
  storeImagens,
  storeMaisAntigaTs,
  startTs,
  agoraTs,
  semTimestamp = 0,
  gruposVazios = 0,
  truncados = 0,
  naoConsultados = 0,
}) {
  const janelaHoras = Math.max(0, (agoraTs - startTs) / 3600)
  if (storeImagens === 0) {
    return { cego: true, parcial: false, incerta: naoConsultados > 0, naoConsultados, janelaHoras, buracoHoras: janelaHoras }
  }
  // Sem timestamp legivel nao da pra dizer ONDE a cobertura comeca, e a versao anterior
  // concluia buraco=0, ou seja, virava "cobertura perfeita" exatamente quando nao sabia.
  // Pagina cheia (truncado) tem o mesmo efeito: a lista pode ter sido cortada.
  // Grupo vazio pode ser motorista de folga OU store cego naquele grupo — daqui nao da
  // pra distinguir, entao vira incerteza pra humano olhar, nunca silencio.
  const incerta = semTimestamp > 0 || truncados > 0 || gruposVazios > 0 || naoConsultados > 0 || storeMaisAntigaTs === null
  const buracoHoras = storeMaisAntigaTs === null ? janelaHoras : Math.max(0, (storeMaisAntigaTs - startTs) / 3600)
  return { cego: false, parcial: buracoHoras > 1, incerta, naoConsultados, janelaHoras, buracoHoras }
}

// Decide COMO reportar. Separada e pura porque o defeito original era exatamente esta
// escolha (store vazio saindo por alertSuccess), e testar `avaliarCoberturaStore` sozinha
// nao protegia nada: dava pra ignorar o veredito dela na hora de alertar e o check
// continuava verde.
export function decidirAlertaRecuperacao({ failed = 0, cobertura }) {
  // Grupo nao consultado vem ANTES de qualquer "Concluida": nao da pra dizer que
  // terminou uma varredura que pulou um grupo inteiro.
  if (cobertura?.naoConsultados > 0) {
    return { tipo: 'erro', titulo: 'Recuperacao INCOMPLETA (grupo nao consultado)' }
  }
  if (failed > 0) return { tipo: 'erro', titulo: 'Recuperacao Concluida (com falhas)' }
  if (cobertura?.cego) return { tipo: 'erro', titulo: 'Recuperacao NAO confiavel (fonte cega)' }
  if (cobertura?.parcial) return { tipo: 'erro', titulo: 'Recuperacao NAO confiavel (fonte parcial)' }
  if (cobertura?.incerta) return { tipo: 'erro', titulo: 'Recuperacao NAO confiavel (cobertura incerta)' }
  // Nem aqui isto significa "recuperei tudo": o store nao tem como provar completude, ele
  // so mostra o que TEM. Significa "nao achei buraco a partir do que a fonte revela".
  return { tipo: 'sucesso', titulo: 'Recuperacao Concluida (sem buraco detectavel)' }
}

async function getLastMessageTime() {
  try {
    const rows = await db.query(
      'tp_mensagens_raw',
      'select=created_at&order=created_at.desc&limit=1'
    )
    if (rows.length === 0) return null
    return new Date(rows[0].created_at)
  } catch {
    return null
  }
}

// Zumbi SEND-ONLY: a Evolution aceita `connectionState` com 'open' e mesmo assim recusa
// `sendText` com "Connection Closed". E o espelho do receive-only, e ate 01/09/2026 nenhuma
// guarda olhava pra ele: a sonda do monitor le estado da conexao (nao envia), o gap mede
// mensagem CHEGANDO, e o unico registro da falha de envio era a coluna `confirmacao_erro`,
// que ninguem le. Medido em 01/09/2026: 5 fretes das 00h14 as 04h55 BRT ficaram sem a
// confirmacao no grupo do motorista, o retry de 10min falhou por 3h30 seguidas e o monitor
// reportou saudavel o tempo todo.
//
// Nao envia mensagem de sonda de proposito: o sinal ja existe de graca. O pipeline grava
// `confirmacao_enviada=false` toda vez que o envio falha, depois de 3 tentativas inline.
// Se ainda ha frete nesse estado passados STUCK_MINUTES (o cron de retry roda a cada 10min),
// nao foi transitorio: o caminho de envio esta morto.
//
// Roda ANTES do portao de horario comercial, e isso e o ponto: as falhas de 01/09 comecaram
// 00h14 BRT e `isBusinessHours()` so abre as 6h. Aqui nao ha risco de falso positivo por
// "dia fraco" como no gap de recebimento — existe um frete real esperando confirmacao.
const SEND_STUCK_MINUTES = 30

// Pura de proposito (o I/O fica no chamador): e ela que decide se o envio esta morto, e
// decisao sem teste foi o que deixou 5 guardas mentirem nos ultimos 6 meses.
export function avaliarEnvioTravado({ fretes = [], agoraTs = Date.now() } = {}) {
  const limite = agoraTs - SEND_STUCK_MINUTES * 60 * 1000
  // So conta quem tem erro de envio REGISTRADO. Frete sem `confirmacao_erro` nunca chegou
  // a tentar enviar (registro antigo, importacao, status intermediario): tratar isso como
  // envio morto acusaria zumbi com base em linha que o caminho de envio nem tocou. Havia
  // 15 registros assim de marco/2026 no banco em 01/09.
  const travados = fretes
    .filter(f => f.confirmacao_erro && new Date(f.created_at).getTime() < limite)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  if (!travados.length) return { count: 0, chave: '' }
  return {
    count: travados.length,
    maisAntigo: new Date(travados[0].created_at),
    erro: String(travados[0].confirmacao_erro).substring(0, 160),
    // Assinatura do conjunto travado. Zumbi VIVO trava frete novo a cada foto que chega,
    // entao a chave muda de rodada em rodada. Falha PERMANENTE de uma linha so (grupo
    // removido, jid invalido) fica com a chave parada: alertar de novo seria loop eterno
    // com a Evolution enviando normal. Mesmo dedup que `_lastAlertedIds` do tp-confirma.
    chave: travados.map(f => f.id).sort().join(','),
  }
}

async function getConfirmacoesTravadas() {
  try {
    // `order` no proprio PostgREST: sem ele o limite de 50 corta uma fatia arbitraria, e o
    // frete mais antigo (o que define ha quanto tempo o envio morreu) pode ficar de fora.
    const rows = await db.query(
      'tp_fretes',
      'select=id,created_at,confirmacao_erro&confirmacao_enviada=eq.false&status=eq.OK&order=created_at.asc&limit=50'
    )
    return avaliarEnvioTravado({ fretes: rows })
  } catch (err) {
    // Falha de leitura NAO e "envio saudavel": e nao ter olhado. Devolve 0 pra nao alarmar
    // falso, mas grita no log — silencio aqui seria a quinta guarda muda desta serie.
    console.warn('[ZombieMonitor] getConfirmacoesTravadas falhou (envio NAO foi verificado):', err.message)
    // `leituraFalhou` impede que "nao consegui olhar" zere o dedup e vire um alerta repetido
    // do mesmo conjunto na proxima rodada que ler.
    return { count: 0, leituraFalhou: true }
  }
}

// Main monitor function
export async function runZombieMonitor() {
  // Envio morto e fato em qualquer hora: checar antes do portao de horario comercial.
  try {
    const travadas = await getConfirmacoesTravadas()
    if (travadas.count > 0 && travadas.chave !== state.lastSendOnlyChave) {
      const idade = formatTimeDiff(Date.now() - travadas.maisAntigo.getTime())
      // Sem `return`: alertar envio morto NAO pode cegar o check de recebimento. Uma
      // confirmacao que nunca sai (grupo removido, jid invalido) fica travada pra sempre
      // e, com return aqui, o receive-only nunca mais seria avaliado.
      const avisou = await dispatchZombieAlert(
        `Zombie SEND-ONLY: ${travadas.count} confirmacao(oes) sem sair ha ${idade} ` +
        `(>=${SEND_STUCK_MINUTES}min, apos 3 tentativas inline + retry de 10min). ` +
        `connectionState pode estar 'open': ele nao testa envio. Ultimo erro: ${travadas.erro}`,
        'send-only'
      )
      // So marca como avisado se o aviso saiu. Cooldown que engole a rodada nao pode
      // consumir o unico alerta do incidente.
      if (avisou) state.lastSendOnlyChave = travadas.chave
    }
    if (travadas.count === 0 && !travadas.leituraFalhou) state.lastSendOnlyChave = ''
  } catch (err) {
    console.error('[ZombieMonitor] check de envio falhou:', err.message)
  }

  if (!isBusinessHours()) return

  try {
    // Step 1: Check connectionState (catches clean disconnects)
    let zombieConfirmed = false
    let zombieReason = ''
    let connStatus = 'unknown'

    try {
      const instances = await fetchInstances()
      const ours = instances.find(i =>
        i.name === EVOLUTION_INSTANCE || i.instance?.instanceName === EVOLUTION_INSTANCE
      )

      if (ours) {
        connStatus = ours.connectionStatus || ours.instance?.state || 'unknown'
        // NOTE: disconnectionReasonCode persists in Evolution DB even after reconnection.
        // It CANNOT be used for zombie detection (false positives). Only use probe + gap.
      }
    } catch (err) {
      console.warn('[ZombieMonitor] fetchInstances failed:', err.message)
    }

    // If explicitly disconnected (state != open), the existing healthcheck handles it
    if (connStatus !== 'open' && connStatus !== 'unknown') {
      console.log(`[ZombieMonitor] State=${connStatus}, healthcheck handles this. Skipping.`)
      return
    }

    // Step 2: gap de mensagem + estado da conexao. Quem detecta zumbi e o GAP; o estado
    // so separa 'caiu' de 'esta open e mesmo assim nao chega nada'.
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const hour = now.getHours()

    if (hour >= 8) {
      const lastMsg = await getLastMessageTime()
      if (lastMsg) {
        const gapMs = Date.now() - lastMsg.getTime()
        const gapHours = gapMs / (1000 * 60 * 60)

        if (gapHours > 1) {
          // Suspicious gap: confirm with probe to distinguish zombie FULL vs RECEIVE-ONLY
          console.log(`[ZombieMonitor] Gap=${gapHours.toFixed(1)}h. Running probe...`)
          const probe = await probeConnectionState()

          if (!probe.ok) {
            // Estado da conexao NAO esta 'open'. Isto nao diz nada sobre envio: a sonda
            // le connectionState, nao manda mensagem. E uma queda declarada, nao um zumbi.
            state.consecutiveFailures++
            console.warn(`[ZombieMonitor] Probe failed (${state.consecutiveFailures}x): ${probe.error || JSON.stringify(probe.body).substring(0, 200)}`)

            if (state.consecutiveFailures >= 2) {
              zombieConfirmed = true
              zombieReason = `Conexao CAIDA: connectionState fora de 'open' ${state.consecutiveFailures}x seguidas. Gap: ${gapHours.toFixed(1)}h sem mensagens. (a sonda le estado da conexao, NAO testa envio)`
            }
          } else {
            // connectionState == 'open'. Pode ser dia fraco OU zumbi receive-only: 'open'
            // fica verde nos dois casos (09/04/2026: 57h de gap com a sonda passando o
            // tempo todo). Quem discrimina e o TAMANHO DO GAP, nunca a sonda.
            if (gapHours >= GAP_CRITICAL_HOURS) {
              // CRITICAL: receive-only zombie confirmed
              zombieConfirmed = true
              zombieReason = `Zombie RECEIVE-ONLY: gap ${gapHours.toFixed(1)}h sem mensagens (>=${GAP_CRITICAL_HOURS}h) com connectionState 'open'. MESSAGES_UPSERT travado upstream. (envio NAO foi testado: a sonda so le o estado da conexao)`
              // Zera o contador: ele conta falha DA SONDA, e a sonda passou. Nao e
              // afirmacao de que o caminho de envio esta bom.
              state.consecutiveFailures = 0
            } else if (gapHours >= GAP_SUSPECT_HOURS) {
              // SUSPECT: log only, do not alert yet (give it some buffer)
              console.log(`[ZombieMonitor] Gap suspeito ${gapHours.toFixed(1)}h com probe OK. Monitorando (threshold critico: ${GAP_CRITICAL_HOURS}h).`)
              state.consecutiveFailures = 0
              // Intentionally do NOT reset lastHealthyAt here — keep the stale value
              // so we can track how long it's been suspect if it escalates.
            } else {
              // Gap < 6h + probe OK: healthy (plausible slow day)
              state.consecutiveFailures = 0
              state.lastHealthyAt = Date.now()
              state.lastReceiveOnlyAlertAt = 0 // Reset cooldown on healthy state
            }
          }
        } else {
          // Recent messages, all good
          state.consecutiveFailures = 0
          state.lastHealthyAt = Date.now()
          state.lastReceiveOnlyAlertAt = 0 // Reset cooldown on healthy state
        }
      } else {
        // No messages in DB at all, can't determine gap
        state.lastHealthyAt = Date.now()
      }
    } else {
      // Before 8am: so da pra checar o estado da conexao, sem gap pra comparar.
      // A sonda NAO envia nada: e um GET connectionState que aprova em 'open' — e 'open'
      // e justamente o valor que fica verde durante TODO o zumbi receive-only (no
      // incidente de 25-26/08 ficou 'open' as 21h de silencio). Por isso ela NAO marca
      // lastHealthyAt: carimbar saude com esse sinal apagava, toda madrugada, o marco de
      // inicio do zumbi que a recuperacao usa como janela. As 07:55 daquele dia este ramo
      // ainda dizia "saudavel agora" com o zumbi correndo desde as 10:28 do dia anterior.
      // Zerar consecutiveFailures continua certo: o contador e sobre a sonda falhar.
      const probe = await probeConnectionState()
      if (probe.ok) {
        state.consecutiveFailures = 0
      } else {
        state.consecutiveFailures++
        if (state.consecutiveFailures >= 3) {
          zombieConfirmed = true
          zombieReason = `Probe falhou ${state.consecutiveFailures}x consecutivas (pre-8h).`
        }
      }
    }

    if (!zombieConfirmed) {
      // NAO marcar lastHealthyAt aqui. Este bloco roda tambem no caso "gap suspeito 4-6h
      // com probe OK", que logo acima diz explicitamente "Intentionally do NOT reset
      // lastHealthyAt here" — e este reset anulava aquele comentario, empurrando o
      // marco de saude pra frente a cada 5min enquanto o zumbi ja estava em curso.
      // Consequencia real: `zombieStartTime` (= lastHealthyAt) entra na janela de
      // executeRecovery, entao a janela encolhia calada e a recuperacao procurava
      // mensagem so a partir de agora.
      //
      // Quem marca saude sao os pontos acima que olham MENSAGEM CHEGANDO: gap <= 1h, e
      // gap < GAP_SUSPECT_HOURS. Nao chame isso de "recebimento recente" sem ressalva: o
      // segundo aceita ate 4h de silencio, e ha ainda o ramo "nenhuma mensagem no banco",
      // que marca saude sem mensagem alguma. Sao aproximacoes conscientes; o que nao pode
      // e marcar saude a partir de sinal que NAO olha recebimento (estado da conexao).
      // A confirmacao do zumbi nao depende disto: ela sai de gapHours >= GAP_CRITICAL.
      return
    }

    return await dispatchZombieAlert(zombieReason, 'receive-only')

  } catch (err) {
    console.error('[ZombieMonitor] Error:', err.message)
  }
}

// Dispara o alerta + link de restart. Extraido de runZombieMonitor pra que o zumbi
// SEND-ONLY use exatamente o mesmo caminho de aviso e aprovacao do receive-only, em vez
// de nascer um segundo canal de alerta com cooldown e rate limit proprios.
//
// Devolve `true` so quando um aviso REALMENTE saiu. O send-only usa isso pra decidir se
// pode marcar o conjunto como ja avisado: marcar numa rodada que morreu no cooldown de
// restart engoliria o incidente inteiro caso nenhum frete novo entrasse depois.
async function dispatchZombieAlert(zombieReason, tipo) {
  try {
    // ZOMBIE CONFIRMED
    console.error(`[ZombieMonitor] ZOMBIE CONFIRMED (${tipo}): ${zombieReason}`)

    // Cooldown: don't alert more than once per 20min (restart) or 2h (receive-only)
    const restartCooldownMs = 20 * 60 * 1000
    if (state.lastRestartAt && (Date.now() - state.lastRestartAt) < restartCooldownMs) {
      console.log('[ZombieMonitor] Restart cooldown active, skipping alert')
      return false
    }
    // Receive-only alerts: 2h cooldown to avoid spamming when gap is just a slow day
    // Cooldown por TIPO: receive-only 2h (gap pode ser dia fraco, alarme falso custa caro),
    // send-only 30min (nao ha dia fraco aqui — ha frete real sem confirmacao no grupo, e
    // cada rodada muda que o motorista continua sem resposta).
    const campoCooldown = tipo === 'send-only' ? 'lastSendOnlyAlertAt' : 'lastReceiveOnlyAlertAt'
    const cooldownMs = tipo === 'send-only' ? 30 * 60 * 1000 : 2 * 60 * 60 * 1000
    if (state[campoCooldown] && (Date.now() - state[campoCooldown]) < cooldownMs) {
      console.log(`[ZombieMonitor] ${tipo} alert cooldown active (${formatTimeDiff(Date.now() - state[campoCooldown])} since last), skipping`)
      return false
    }

    // Rate limit: max 3 restarts in 2h
    if (Date.now() - state.restartWindow > 2 * 60 * 60 * 1000) {
      state.restartCount2h = 0
      state.restartWindow = Date.now()
    }
    if (state.restartCount2h >= 3) {
      console.error('[ZombieMonitor] 3+ restarts in 2h, stopping')
      alertError('Instabilidade Recorrente',
        `Evolution reiniciada 3x em 2h. Investigar manualmente.\nUltimo motivo: ${zombieReason}`)
      return true // avisou (sem link de restart, mas avisou): nao repetir o mesmo conjunto
    }

    // Generate action token and send Discord alert
    const token = createActionToken('restart', {
      zombieStartTime: state.lastHealthyAt,
      zombieReason,
    })

    const lastMsg = await getLastMessageTime()
    const gapStr = lastMsg
      ? formatTimeDiff(Date.now() - lastMsg.getTime())
      : 'desconhecido'

    const actionUrl = `${APP_BASE_URL}/api/tp/zombie-restart?key=${PUSH_API_KEY}&token=${token}`

    // Track alert time for cooldown (do tipo que disparou)
    state[campoCooldown] = Date.now()

    await alertWithAction(
      'Zombie Detectado',
      [
        `**Motivo:** ${zombieReason}`,
        `**Ultima mensagem:** ${lastMsg ? lastMsg.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A'} (ha ${gapStr})`,
        `**Ultimo restart:** ${state.lastRestartAt ? new Date(state.lastRestartAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'nunca'}`,
        '',
        'Clique no link abaixo para reiniciar o container Evolution.',
        `Token expira em 1h.`,
      ].join('\n'),
      'Aprovar Restart',
      actionUrl,
      0xFF4444 // red
    )

    // Also send push notification
    fetch(PUSH_URL, {
      method: 'POST',
      headers: { 'x-api-key': PUSH_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Zombie Detectado',
        body: `Evolution zombie ha ${gapStr}. Aprovar restart no Discord.`,
        tag: 'zombie',
        url: '/',
      }),
    }).catch(() => {})

    return true

  } catch (err) {
    console.error('[ZombieMonitor] Error:', err.message)
    return false
  }
}

// Execute restart (called from server.js when Marco approves)
export async function executeRestart(token) {
  const validation = validateToken(token)
  if (!validation.valid) return { ok: false, error: validation.reason }

  const { action } = validation
  markTokenUsed(token)

  try {
    // Step 1: Easypanel login
    const loginRes = await fetch(`${EASYPANEL_HOST}/api/trpc/auth.login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { email: EASYPANEL_EMAIL, password: EASYPANEL_PASSWORD } }),
    })
    if (!loginRes.ok) throw new Error(`Easypanel login: ${loginRes.status}`)
    const loginData = await loginRes.json()
    const jwtToken = loginData?.result?.data?.json?.token
    if (!jwtToken) throw new Error('Easypanel login: no token returned')

    // Step 2: Deploy (restart container)
    const deployRes = await fetch(`${EASYPANEL_HOST}/api/trpc/services.app.deployService`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({
        json: { projectName: EASYPANEL_PROJECT, serviceName: EASYPANEL_SERVICE, forceRebuild: true },
      }),
    })
    if (!deployRes.ok) {
      const body = await deployRes.text()
      throw new Error(`Easypanel deploy: ${deployRes.status} ${body}`)
    }

    state.lastRestartAt = Date.now()
    state.restartCount2h++
    state.consecutiveFailures = 0

    // Step 3: Wait for container to come up
    console.log('[ZombieMonitor] Container restart initiated, waiting 90s...')
    await new Promise(r => setTimeout(r, 90000))

    // Step 4: o container voltou a responder? Isto NAO e verificar reconexao de verdade:
    // connectionState volta pra 'open' rapido e fica 'open' durante todo o zumbi
    // receive-only. Por isso aqui NAO se marca lastHealthyAt: carimbar saude com este
    // sinal apagaria o marco de inicio do zumbi que a janela de recuperacao usa — o mesmo
    // erro que o ramo pre-8h cometia. Prova de recebimento e mensagem nova chegando.
    let estadoVoltouOpen = false
    for (let i = 0; i < 3; i++) {
      try {
        const probe = await probeConnectionState()
        if (probe.ok) {
          estadoVoltouOpen = true
          break
        }
      } catch {}
      await new Promise(r => setTimeout(r, 30000))
    }

    // Step 5: Generate recovery token and report
    const zombieStartTime = action.zombieStartTime || state.lastHealthyAt
    const zombiePeriod = formatTimeDiff(Date.now() - zombieStartTime)

    if (estadoVoltouOpen) {
      const recoveryToken = createActionToken('recover', { zombieStartTime })
      const recoveryUrl = `${APP_BASE_URL}/api/tp/zombie-recover?key=${PUSH_API_KEY}&token=${recoveryToken}`

      await alertWithAction(
        'Evolution Reiniciado',
        [
          `Container reiniciado. O connectionState voltou pra 'open'.`,
          `**Isso NAO prova que voltou a RECEBER:** 'open' fica verde durante todo o zumbi`,
          `receive-only. A prova e mensagem nova entrando, ou o contador de mensagens da`,
          `instancia subindo em GET /instance/fetchInstances.`,
          `**Periodo zombie:** ${new Date(zombieStartTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} ate agora (${zombiePeriod})`,
          '',
          'Clique abaixo para buscar e reprocessar mensagens perdidas no periodo.',
        ].join('\n'),
        'Aprovar Recuperacao',
        recoveryUrl,
        0x44AAFF // blue
      )

      return { ok: true, estadoVoltouOpen: true, zombiePeriod }
    } else {
      await alertError('Restart: estado NAO voltou pra open',
        `Container reiniciado mas connectionState seguiu fora de 'open' em 3 tentativas apos 90s+. Verificar manualmente.`)
      return { ok: true, estadoVoltouOpen: false, warning: "connectionState nao voltou pra 'open' apos restart" }
    }

  } catch (err) {
    console.error('[ZombieMonitor] Restart error:', err.message)
    await alertError('Restart Falhou', `Erro: ${err.message}`)
    return { ok: false, error: err.message }
  }
}

// Execute recovery (called from server.js when Marco approves)
export async function executeRecovery(token) {
  const validation = validateToken(token)
  if (!validation.valid) return { ok: false, error: validation.reason }

  const { action } = validation
  markTokenUsed(token)

  const zombieStartTime = action.zombieStartTime || (Date.now() - 4 * 60 * 60 * 1000)
  const startTs = Math.floor(zombieStartTime / 1000)
  const groupJids = Object.keys(GROUP_MOTORISTA)

  const recovered = []
  const skipped = []
  const failed = []
  // Cobertura da FONTE. Esta funcao le o store da Evolution, que e exatamente o que fica
  // vazio durante o zumbi receive-only: a mensagem nunca chegou nela. Sem medir isso, um
  // store cego devolve recovered=0/skipped=0/failed=0 e o codigo anunciava
  // "Recuperacao Concluida" com sucesso, que e a pior saida possivel — o Marco fecha o
  // Discord achando que acabou. Medido em 26/08/2026: mesmo apos o restart o replay do
  // Baileys reencheu o store so em PARTE (1 ticket das 15:42 BRT nunca reapareceu).
  let storeImagens = 0
  let storeMaisAntigaTs = null
  let semTimestamp = 0        // foto no store sem messageTimestamp legivel
  const PAGINA = 100
  const truncados = []        // grupo que encheu a pagina: pode haver mais que nao vimos
  const porGrupo = {}         // cobertura POR GRUPO: agregado esconde grupo cego
  const maisAntigaPorGrupo = {} // quao TARDE cada grupo comeca: o agregado tambem esconde isso
  // "nao consultei o grupo" e diferente de "o grupo nao tem foto": o primeiro e ignorancia,
  // o segundo e medicao. Sem separar, findMessages falhando virava um zero indistinguivel
  // de motorista de folga.
  const naoConsultados = []

  for (const jid of groupJids) {
    porGrupo[jid] = 0
    maisAntigaPorGrupo[jid] = null
    try {
      const result = await findMessages({
        key: { remoteJid: jid },
        messageTimestamp: { $gte: startTs },
      }, 1, PAGINA)

      const records = result?.messages?.records || result?.messages || []
      // `!fromMe` como o tp-backfill.js ja fazia. Sem isso, foto que o proprio numero
      // mandou no grupo entra na contagem de cobertura e ainda vira `fakeWebhook` com
      // fromMe:false — ou seja, imagem nossa podendo virar frete de motorista.
      const imageMessages = records.filter(m =>
        m.message?.imageMessage && m.key?.id && !m.key?.fromMe
      )
      // Pagina cheia = a Evolution pode ter cortado. Nao da pra afirmar cobertura sobre
      // uma lista que talvez esteja truncada, entao isso vira aviso em vez de silencio.
      if (records.length >= PAGINA) truncados.push(jid)

      storeImagens += imageMessages.length
      porGrupo[jid] = imageMessages.length
      for (const m of imageMessages) {
        const ts = Number(m.messageTimestamp) || 0
        if (ts > 0) {
          if (storeMaisAntigaTs === null || ts < storeMaisAntigaTs) storeMaisAntigaTs = ts
          if (maisAntigaPorGrupo[jid] === null || ts < maisAntigaPorGrupo[jid]) maisAntigaPorGrupo[jid] = ts
        } else {
          semTimestamp++
        }
      }

      for (const m of imageMessages) {
        const msgId = m.key.id

        // Dedup: a UNIQUE e (msg_id, chat_jid), entao filtrar so por msg_id pula uma
        // mensagem legitima de OUTRO grupo que por acaso tenha o mesmo id.
        let jaExiste
        try {
          const existing = await db.query(
            'tp_mensagens_raw',
            `select=msg_id&msg_id=eq.${msgId}&chat_jid=eq.${encodeURIComponent(jid)}&limit=1`
          )
          jaExiste = existing.length > 0
        } catch (dedupErr) {
          // `catch {}` vazio aqui virava "a raw nao existe" quando na verdade o banco caiu.
          // O resultado operacional saia falso: a UNIQUE ainda barrava a duplicata, mas o
          // motivo real (Supabase fora) desaparecia do relatorio.
          failed.push({ msg_id: msgId, jid, reason: `dedup falhou: ${dedupErr.message}` })
          continue
        }
        if (jaExiste) {
          skipped.push({ msg_id: msgId, jid })
          continue
        }

        // Get base64
        let base64 = m.message?.base64 || ''
        if (!base64 && m.message) {
          base64 = await getBase64FromMedia(m.message) || ''
        }

        if (!base64) {
          // No base64 available: insert as PENDENTE for safety-net
          try {
            await db.insert('tp_mensagens_raw', {
              msg_id: msgId,
              chat_jid: jid,
              sender_jid: m.key.participant || '',
              timestamp_msg: new Date((m.messageTimestamp || 0) * 1000).toISOString(),
              status: 'PENDENTE',
              caption: m.message?.imageMessage?.caption || null,
            })
            failed.push({ msg_id: msgId, jid, reason: 'no base64, marked PENDENTE' })
          } catch (insertErr) {
            failed.push({ msg_id: msgId, jid, reason: insertErr.message })
          }
          continue
        }

        // Process via pipeline
        const fakeWebhook = {
          data: {
            key: {
              remoteJid: jid,
              fromMe: false,
              id: msgId,
              participant: m.key.participant || '',
            },
            messageTimestamp: m.messageTimestamp || Math.floor(Date.now() / 1000),
            message: {
              imageMessage: m.message.imageMessage,
              base64,
            },
          },
        }

        try {
          await processWebhookMessage(fakeWebhook)
          // processWebhookMessage NUNCA lanca: o catch dela engole o erro e marca a raw
          // como ERRO. Entao "nao estourou excecao" nao e prova de nada — OCR que falhou
          // ou INSERT que deu 500 entravam em `recovered` e o relatorio dizia
          // "Recuperadas: N / Falharam: 0" sem nenhum frete ter nascido.
          // O veredito esta na LINHA, entao le a linha.
          const [linha] = await db.query(
            'tp_mensagens_raw',
            `select=status&msg_id=eq.${msgId}&chat_jid=eq.${encodeURIComponent(jid)}&limit=1`
          ).catch(() => [])
          const st = linha?.status
          // IGNORADO conta como recuperado: e desfecho legitimo (comprovante de
          // abastecimento, que o cron de 15min pega depois), nao falha.
          if (st === 'OK' || st === 'IGNORADO') {
            recovered.push({ msg_id: msgId, jid, status: st })
          } else {
            failed.push({ msg_id: msgId, jid, reason: `pipeline terminou em ${st || 'linha ausente'}` })
          }
        } catch (err) {
          failed.push({ msg_id: msgId, jid, reason: err.message })
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 2000))
      }
    } catch (err) {
      console.error(`[ZombieMonitor] findMessages failed for ${jid}:`, err.message)
      failed.push({ jid, reason: err.message })
      naoConsultados.push(jid)
    }
  }

  // Report results
  const motoristas = {}
  for (const r of recovered) {
    const m = GROUP_MOTORISTA[r.jid]?.motorista || r.jid
    motoristas[m] = (motoristas[m] || 0) + 1
  }

  // Vazio MEDIDO: consultei e nao havia foto. Grupo nao consultado sai desta lista e vai
  // pra `naoConsultados`, que e mais grave — ali nem olhei.
  const gruposVaziosLista = Object.entries(porGrupo)
    .filter(([jid, n]) => n === 0 && !naoConsultados.includes(jid))
    .map(([jid]) => GROUP_MOTORISTA[jid]?.motorista || jid)
  const naoConsultadosNomes = naoConsultados.map(j => GROUP_MOTORISTA[j]?.motorista || j)

  const cobertura = avaliarCoberturaStore({
    storeImagens,
    storeMaisAntigaTs,
    startTs,
    agoraTs: Math.floor(Date.now() / 1000),
    semTimestamp,
    gruposVazios: gruposVaziosLista.length,
    truncados: truncados.length,
    naoConsultados: naoConsultados.length,
  })

  const AVISO_LOCAL = [
    '',
    '**NAO DA PRA GARANTIR QUE O BURACO FOI COBERTO.** Esta recuperacao le o store da Evolution, que e',
    'justamente o que fica vazio no zumbi receive-only. O que enxerga o buraco e o daemon',
    'WhatsApp (porta 3847), na maquina do Marco. Rodar la:',
    '`node scripts/tp-recovery.js --from <ISO>`  (ou esperar o cron tpaulino-recovery-daemon, 20min)',
  ].join('\n')

  const summary = [
    `**Recuperadas:** ${recovered.length} mensagens`,
    `**Ja existiam (dedup):** ${skipped.length}`,
    `**Falharam:** ${failed.length}`,
    `**Fotos no store da Evolution na janela (${cobertura.janelaHoras.toFixed(1)}h):** ${storeImagens}`,
    // Contagem E quao tarde cada grupo comeca. So a foto mais antiga AGREGADA nao serve:
    // uma foto de um motorista no comeco da janela fazia a cobertura inteira parecer boa
    // enquanto outro grupo podia ter 19h descobertas. Isto e informacao pro humano, nao
    // veredito: num zumbi de 21h e normal um motorista comecar tarde (folga, turno), entao
    // transformar atraso em alarme deixaria o alerta vermelho SEMPRE, que e o mesmo que mudo.
    `**Por grupo (fotos | comeca depois de):** ${Object.entries(porGrupo).map(([jid, n]) => {
      const nome = GROUP_MOTORISTA[jid]?.motorista || jid
      const ts = maisAntigaPorGrupo[jid]
      const atraso = ts ? `+${((ts - startTs) / 3600).toFixed(1)}h` : '-'
      return `${nome}: ${n} | ${atraso}`
    }).join(', ')}`,
    naoConsultadosNomes.length > 0 ? `**Grupo NAO CONSULTADO (findMessages falhou):** ${naoConsultadosNomes.join(', ')} — nao olhei este grupo, entao nada aqui fala por ele` : '',
    gruposVaziosLista.length > 0 ? `**Grupo sem NENHUMA foto na janela:** ${gruposVaziosLista.join(', ')} (pode ser folga do motorista ou store cego naquele grupo: daqui nao da pra distinguir)` : '',
    semTimestamp > 0 ? `**Fotos sem timestamp legivel:** ${semTimestamp} (nao da pra dizer onde a cobertura comeca)` : '',
    truncados.length > 0 ? `**Pagina cheia (pode ter sido cortada, teto ${PAGINA}):** ${truncados.map(j => GROUP_MOTORISTA[j]?.motorista || j).join(', ')}` : '',
    recovered.length > 0 ? `**Motoristas:** ${Object.entries(motoristas).map(([k, v]) => `${k} (${v})`).join(', ')}` : '',
    failed.length > 0 ? `**Erros:** ${failed.map(f => f.reason || 'unknown').join('; ').substring(0, 300)}` : '',
    cobertura.parcial ? `(cobertura PARCIAL: a foto mais antiga do store esta ${cobertura.buracoHoras.toFixed(1)}h depois do inicio da janela)` : '',
    (cobertura.cego || cobertura.parcial || cobertura.incerta) ? AVISO_LOCAL : '',
  ].filter(Boolean).join('\n')

  // O modo sai do RESULTADO, nao da funcao. A decisao vive em decidirAlertaRecuperacao,
  // que e pura e tem check: era exatamente aqui que store vazio saia por alertSuccess.
  const alerta = decidirAlertaRecuperacao({ failed: failed.length, cobertura })
  if (alerta.tipo === 'erro') await alertError(alerta.titulo, summary)
  else await alertSuccess(alerta.titulo, summary)

  return {
    ok: true,
    recovered: recovered.length,
    skipped: skipped.length,
    failed: failed.length,
    storeImagens,
    cobertura,
    details: { recovered, skipped, failed },
  }
}
