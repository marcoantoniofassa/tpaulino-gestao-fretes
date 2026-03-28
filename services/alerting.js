// services/alerting.js — Pipeline alerts (Discord + WhatsApp fallback)
import { EVOLUTION_URL, EVOLUTION_KEY, EVOLUTION_INSTANCE, MARCO_WHATSAPP } from './config.js'

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || ''

export async function alertError(title, details) {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  console.error(`[ALERT] ${title}: ${details}`)

  // Discord (primary if configured)
  if (DISCORD_WEBHOOK) {
    try {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `TP Frete: ${title}`,
            description: details.substring(0, 2000),
            color: 0xFF4444,
            timestamp: new Date().toISOString(),
            footer: { text: 'tpaulino-gestao-fretes' },
          }],
        }),
      })
    } catch (err) {
      console.warn('[ALERT] Discord failed:', err.message)
    }
  }

  // WhatsApp Marco (fallback)
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_KEY,
      },
      body: JSON.stringify({
        number: MARCO_WHATSAPP,
        text: `*TP Frete ALERTA*\n${title}\n${details.substring(0, 500)}\n${timestamp}`,
      }),
    })
  } catch (err) {
    console.warn('[ALERT] WhatsApp failed:', err.message)
  }
}

// Send Discord embed with clickable action link (human-in-the-loop)
export async function alertWithAction(title, details, actionLabel, actionUrl, color = 0xFFAA00) {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  console.log(`[ALERT] ${title}: ${details} | Action: ${actionLabel}`)

  if (!DISCORD_WEBHOOK) {
    console.warn('[ALERT] Discord webhook not configured, action link not sent')
    return
  }

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `TP Frete: ${title}`,
          description: details.substring(0, 2000),
          color,
          fields: [{
            name: 'Acao',
            value: `**[${actionLabel}](${actionUrl})**`,
            inline: false,
          }],
          timestamp: new Date().toISOString(),
          footer: { text: 'tpaulino-gestao-fretes | zombie-monitor' },
        }],
      }),
    })
  } catch (err) {
    console.warn('[ALERT] Discord action alert failed:', err.message)
  }
}

// Send Discord success notification (no action needed)
export async function alertSuccess(title, details) {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  console.log(`[ALERT] ${title}: ${details}`)

  if (!DISCORD_WEBHOOK) return

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `TP Frete: ${title}`,
          description: details.substring(0, 2000),
          color: 0x44FF44,
          timestamp: new Date().toISOString(),
          footer: { text: 'tpaulino-gestao-fretes | zombie-monitor' },
        }],
      }),
    })
  } catch (err) {
    console.warn('[ALERT] Discord success alert failed:', err.message)
  }
}

export async function alertWarning(title, details) {
  console.warn(`[ALERT] ${title}: ${details}`)

  if (!DISCORD_WEBHOOK) return

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `TP Frete: ${title}`,
          description: details.substring(0, 2000),
          color: 0xFFAA00,
          timestamp: new Date().toISOString(),
          footer: { text: 'tpaulino-gestao-fretes' },
        }],
      }),
    })
  } catch (err) {
    console.warn('[ALERT] Discord warning failed:', err.message)
  }
}
