// services/tp-healthcheck.js — v2-07 Evolution Healthcheck (migrated from n8n)
// Runs every 30min: checks Evolution connection state, detects zombie connections
import { connectionState, reconnect, sendText } from './evolution.js'
import * as db from './supabase.js'
import { PUSH_URL, PUSH_API_KEY, MARCO_WHATSAPP } from './config.js'

function isBusinessHours() {
  const now = new Date()
  const hour = now.getHours()
  const day = now.getDay()
  if (day === 0) return false // Sunday
  return hour >= 6 && hour < 22
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

function sendPushAlert(title, body) {
  fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      'x-api-key': PUSH_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, tag: 'healthcheck', url: '/' }),
  }).catch(err => console.warn('[Healthcheck] Push failed:', err.message))
}

export async function runHealthcheck() {
  if (!isBusinessHours()) {
    console.log('[Healthcheck] Outside business hours, skipping')
    return
  }

  try {
    const state = await connectionState()
    const status = state?.instance?.state || state?.state || 'unknown'
    console.log(`[Healthcheck] Evolution state: ${status}`)

    if (status !== 'open') {
      // Disconnected: try reconnect + alert
      console.warn(`[Healthcheck] Disconnected (${status}), attempting reconnect...`)
      try {
        await reconnect()
        console.log('[Healthcheck] Reconnect initiated')
      } catch (err) {
        console.error('[Healthcheck] Reconnect failed:', err.message)
      }

      sendPushAlert(
        'Evolution Desconectado',
        `Estado: ${status}. Tentando reconectar...`
      )
      return
    }

    // Connected: check for zombie (open but no messages in 4+ hours)
    const now = new Date()
    const hour = now.getHours()
    if (hour < 10) return // Only check zombie after 10am

    const lastMsg = await getLastMessageTime()
    if (!lastMsg) return

    const gapHours = (now.getTime() - lastMsg.getTime()) / (1000 * 60 * 60)
    if (gapHours > 4) {
      console.warn(`[Healthcheck] Zombie detected: ${gapHours.toFixed(1)}h sem mensagens`)
      sendPushAlert(
        'Evolution Possivelmente Zumbi',
        `Conectado mas ${gapHours.toFixed(1)}h sem mensagens. Verificar.`
      )
    }

  } catch (err) {
    console.error('[Healthcheck] Error:', err.message)
  }
}
