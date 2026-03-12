// services/evolution.js — Evolution API helpers
import { EVOLUTION_URL, EVOLUTION_KEY, EVOLUTION_INSTANCE } from './config.js'

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
