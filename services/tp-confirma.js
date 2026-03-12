// services/tp-confirma.js — v2-09 WhatsApp Confirmation (migrated from n8n)
// Sends "Frete XXXX cadastrado." to the motorist's WhatsApp group
import { sendText } from './evolution.js'

// Extract container suffix (last 4+ digits)
function containerSuffix(container) {
  if (!container) return '????'
  const match = container.match(/(\d{4,})$/)
  return match ? match[1] : container.slice(-4)
}

// Send confirmation message
export async function confirmaFrete(container, chatJid) {
  if (!container || !chatJid) {
    console.warn('[Confirma] Missing container or chat_jid, skipping')
    return { success: false, reason: 'missing_data' }
  }

  const suffix = containerSuffix(container)
  const text = `Frete ${suffix} cadastrado.`

  try {
    await sendText(chatJid, text)
    console.log(`[Confirma] Sent "${text}" to ${chatJid}`)
    return { success: true, container: suffix }
  } catch (err) {
    console.error(`[Confirma] Failed: ${err.message}`)
    return { success: false, error: err.message }
  }
}

// Express route handler (backwards compat for n8n calling this webhook)
export function mountConfirmaRoute(app) {
  app.post('/api/tp/confirma-frete', async (req, res) => {
    const { container, chat_jid } = req.body
    const result = await confirmaFrete(container, chat_jid)
    res.status(result.success ? 200 : 400).json(result)
  })

  // Legacy path for n8n webhook
  app.post('/webhook/tp-confirma-frete', async (req, res) => {
    const { container, chat_jid } = req.body
    const result = await confirmaFrete(container, chat_jid)
    res.status(result.success ? 200 : 400).json(result)
  })
}
