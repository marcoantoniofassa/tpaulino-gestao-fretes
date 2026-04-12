// services/tp-zombie-monitor.js — Zombie Socket Monitor (Human-in-the-Loop)
// Cron: */5 * * * * (every 5 minutes, business hours)
// Detects zombie Evolution connections, proposes restart + recovery via Discord action links
import crypto from 'crypto'
import { fetchInstances, sendTextProbe, findMessages, getBase64FromMedia } from './evolution.js'
import { processWebhookMessage } from './tp-ocr-pipeline.js'
import { alertWithAction, alertSuccess, alertError } from './alerting.js'
import * as db from './supabase.js'
import {
  GROUP_MOTORISTA, EVOLUTION_INSTANCE, PUSH_URL, PUSH_API_KEY,
  EASYPANEL_HOST, EASYPANEL_EMAIL, EASYPANEL_PASSWORD,
  EASYPANEL_PROJECT, EASYPANEL_SERVICE, APP_BASE_URL,
} from './config.js'

// Thresholds for receive-only zombie detection (probe OK but message gap)
// Based on incident 09/04/2026: 57h receive-only gap with sendText probe passing.
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
  }
}

function isBusinessHours() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hour = now.getHours()
  const day = now.getDay()
  if (day === 0) return false // Sunday
  return hour >= 6 && hour < 22
}

function formatTimeDiff(ms) {
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  const remaining = mins % 60
  return `${hours}h${remaining > 0 ? remaining + 'min' : ''}`
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

// Main monitor function
export async function runZombieMonitor() {
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

    // Step 2: Check message gap + sendText probe (the reliable zombie detection)
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
          const probe = await sendTextProbe()

          if (!probe.ok) {
            // Zombie FULL: send path also broken
            state.consecutiveFailures++
            console.warn(`[ZombieMonitor] Probe failed (${state.consecutiveFailures}x): ${probe.error || JSON.stringify(probe.body).substring(0, 200)}`)

            if (state.consecutiveFailures >= 2) {
              zombieConfirmed = true
              zombieReason = `Zombie FULL: probe sendText falhou ${state.consecutiveFailures}x. Gap: ${gapHours.toFixed(1)}h sem mensagens.`
            }
          } else {
            // Probe OK: could be healthy (slow day) OR zombie RECEIVE-ONLY (upstream stuck)
            // Incident 09/04/2026: 57h receive-only gap with probe passing the whole time.
            // We discriminate by gap size.
            if (gapHours >= GAP_CRITICAL_HOURS) {
              // CRITICAL: receive-only zombie confirmed
              zombieConfirmed = true
              zombieReason = `Zombie RECEIVE-ONLY: gap ${gapHours.toFixed(1)}h sem mensagens (>=${GAP_CRITICAL_HOURS}h). sendText funciona mas MESSAGES_UPSERT upstream travado.`
              // Reset fail counter since send path is OK (different failure mode)
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
      // Before 8am: just run a quick probe to verify connection
      const probe = await sendTextProbe()
      if (probe.ok) {
        state.consecutiveFailures = 0
        state.lastHealthyAt = Date.now()
      } else {
        state.consecutiveFailures++
        if (state.consecutiveFailures >= 3) {
          zombieConfirmed = true
          zombieReason = `Probe falhou ${state.consecutiveFailures}x consecutivas (pre-8h).`
        }
      }
    }

    if (!zombieConfirmed) {
      // No zombie detected
      if (state.consecutiveFailures === 0) {
        state.lastHealthyAt = Date.now()
      }
      return
    }

    // ZOMBIE CONFIRMED
    console.error(`[ZombieMonitor] ZOMBIE CONFIRMED: ${zombieReason}`)

    // Cooldown: don't alert more than once per 20min (restart) or 2h (receive-only)
    const restartCooldownMs = 20 * 60 * 1000
    if (state.lastRestartAt && (Date.now() - state.lastRestartAt) < restartCooldownMs) {
      console.log('[ZombieMonitor] Restart cooldown active, skipping alert')
      return
    }
    // Receive-only alerts: 2h cooldown to avoid spamming when gap is just a slow day
    const receiveOnlyCooldownMs = 2 * 60 * 60 * 1000
    if (state.lastReceiveOnlyAlertAt && (Date.now() - state.lastReceiveOnlyAlertAt) < receiveOnlyCooldownMs) {
      console.log(`[ZombieMonitor] Receive-only alert cooldown active (${formatTimeDiff(Date.now() - state.lastReceiveOnlyAlertAt)} since last), skipping`)
      return
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
      return
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

    // Track receive-only alert time for cooldown
    state.lastReceiveOnlyAlertAt = Date.now()

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

  } catch (err) {
    console.error('[ZombieMonitor] Error:', err.message)
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

    // Step 4: Verify reconnection
    let reconnected = false
    for (let i = 0; i < 3; i++) {
      try {
        const probe = await sendTextProbe()
        if (probe.ok) {
          reconnected = true
          state.lastHealthyAt = Date.now()
          break
        }
      } catch {}
      await new Promise(r => setTimeout(r, 30000))
    }

    // Step 5: Generate recovery token and report
    const zombieStartTime = action.zombieStartTime || state.lastHealthyAt
    const zombiePeriod = formatTimeDiff(Date.now() - zombieStartTime)

    if (reconnected) {
      const recoveryToken = createActionToken('recover', { zombieStartTime })
      const recoveryUrl = `${APP_BASE_URL}/api/tp/zombie-recover?key=${PUSH_API_KEY}&token=${recoveryToken}`

      await alertWithAction(
        'Evolution Reiniciado',
        [
          `Container reiniciado com sucesso.`,
          `**Periodo zombie:** ${new Date(zombieStartTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} ate agora (${zombiePeriod})`,
          '',
          'Clique abaixo para buscar e reprocessar mensagens perdidas no periodo.',
        ].join('\n'),
        'Aprovar Recuperacao',
        recoveryUrl,
        0x44AAFF // blue
      )

      return { ok: true, reconnected: true, zombiePeriod }
    } else {
      await alertError('Restart: Reconexao Falhou',
        `Container reiniciado mas probe falhou 3x apos 90s+. Verificar manualmente.`)
      return { ok: true, reconnected: false, warning: 'Probe failed after restart' }
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

  for (const jid of groupJids) {
    try {
      const result = await findMessages({
        key: { remoteJid: jid },
        messageTimestamp: { $gte: startTs },
      }, 1, 100)

      const records = result?.messages?.records || result?.messages || []
      const imageMessages = records.filter(m =>
        m.message?.imageMessage && m.key?.id
      )

      for (const m of imageMessages) {
        const msgId = m.key.id

        // Dedup: check if already in tp_mensagens_raw
        try {
          const existing = await db.query(
            'tp_mensagens_raw',
            `select=msg_id&msg_id=eq.${msgId}&limit=1`
          )
          if (existing.length > 0) {
            skipped.push({ msg_id: msgId, jid })
            continue
          }
        } catch {}

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
          recovered.push({ msg_id: msgId, jid })
        } catch (err) {
          failed.push({ msg_id: msgId, jid, reason: err.message })
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 2000))
      }
    } catch (err) {
      console.error(`[ZombieMonitor] findMessages failed for ${jid}:`, err.message)
      failed.push({ jid, reason: err.message })
    }
  }

  // Report results
  const motoristas = {}
  for (const r of recovered) {
    const m = GROUP_MOTORISTA[r.jid]?.motorista || r.jid
    motoristas[m] = (motoristas[m] || 0) + 1
  }

  const summary = [
    `**Recuperadas:** ${recovered.length} mensagens`,
    `**Ja existiam (dedup):** ${skipped.length}`,
    `**Falharam:** ${failed.length}`,
    recovered.length > 0 ? `**Motoristas:** ${Object.entries(motoristas).map(([k, v]) => `${k} (${v})`).join(', ')}` : '',
    failed.length > 0 ? `**Erros:** ${failed.map(f => f.reason || 'unknown').join('; ').substring(0, 300)}` : '',
  ].filter(Boolean).join('\n')

  await alertSuccess('Recuperacao Concluida', summary)

  return { ok: true, recovered: recovered.length, skipped: skipped.length, failed: failed.length, details: { recovered, skipped, failed } }
}
