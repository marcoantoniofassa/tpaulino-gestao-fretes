// services/evolution.js — Evolution API helpers
import { EVOLUTION_URL, EVOLUTION_KEY, EVOLUTION_INSTANCE, MARCO_WHATSAPP } from './config.js'

// Send text message
export async function sendText(number, text) {
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_KEY,
    },
    body: JSON.stringify({ number, text }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution sendText: ${res.status} ${body}`)
  }
  return res.json()
}

// Check connection state
export async function connectionState() {
  const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, {
    headers: { 'apikey': EVOLUTION_KEY },
  })
  if (!res.ok) throw new Error(`Evolution connectionState: ${res.status}`)
  return res.json()
}

// Reconnect
export async function reconnect() {
  const res = await fetch(`${EVOLUTION_URL}/instance/connect/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: { 'apikey': EVOLUTION_KEY },
  })
  if (!res.ok) throw new Error(`Evolution reconnect: ${res.status}`)
  return res.json()
}

// Fetch all instances (exposes disconnectionReasonCode for zombie detection)
export async function fetchInstances() {
  const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
    headers: { 'apikey': EVOLUTION_KEY },
  })
  if (!res.ok) throw new Error(`Evolution fetchInstances: ${res.status}`)
  return res.json()
}

// Find messages in Evolution's internal PostgreSQL (for recovery)
export async function findMessages(where = {}, page = 1, limit = 50) {
  const res = await fetch(`${EVOLUTION_URL}/chat/findMessages/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ where, page, limit }),
  })
  if (!res.ok) throw new Error(`Evolution findMessages: ${res.status}`)
  return res.json()
}

// Download media base64 from a stored message
export async function getBase64FromMedia(messageData) {
  const res = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: messageData }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data?.base64 || null
}

// Check connection state via API (no message sent)
export async function sendTextProbe() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_KEY,
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, status: res.status, body }
    }
    const data = await res.json()
    const state = data?.instance?.state || data?.state || ''
    if (state === 'open') {
      return { ok: true }
    }
    return { ok: false, error: `connectionState: ${state}` }
  } catch (err) {
    clearTimeout(timeout)
    return { ok: false, error: err.message }
  }
}
