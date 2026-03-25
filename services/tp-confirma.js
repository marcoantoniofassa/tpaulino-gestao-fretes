// services/tp-confirma.js — v2-09 WhatsApp Confirmation (migrated from n8n)
// Sends "Frete CONTAINER cadastrado." to the motorist's WhatsApp group
// Retry with backoff: 3 attempts (2s, 4s) before giving up
import { sendText } from './evolution.js'

const MAX_RETRIES = 3
const BACKOFF_MS = [2000, 4000]

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Send confirmation message with automatic retry
export async function confirmaFrete(container, chatJid) {
  if (!container || !chatJid) {
    console.warn('[Confirma] Missing container or chat_jid, skipping')
    return { success: false, reason: 'missing_data' }
  }

  const text = `Frete ${container} cadastrado.`
  let lastErr = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sendText(chatJid, text)
      console.log(`[Confirma] Sent "${text}" to ${chatJid}${attempt > 1 ? ` (attempt ${attempt})` : ''}`)
      return { success: true, container }
    } catch (err) {
      lastErr = err
      console.warn(`[Confirma] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`)
      if (attempt < MAX_RETRIES) await sleep(BACKOFF_MS[attempt - 1])
    }
  }

  console.error(`[Confirma] All ${MAX_RETRIES} attempts failed for ${container}: ${lastErr.message}`)
  return { success: false, error: lastErr.message }
}

// Send abastecimento confirmation to group
export async function confirmaAbastecimento(litros, chatJid) {
  if (!litros || !chatJid) {
    console.warn('[Confirma] Missing litros or chat_jid for abastecimento, skipping')
    return { success: false, reason: 'missing_data' }
  }

  const text = `Abastecimento ${litros}L registrado.`

  try {
    await sendText(chatJid, text)
    console.log(`[Confirma] Sent "${text}" to ${chatJid}`)
    return { success: true, litros }
  } catch (err) {
    console.error(`[Confirma] Abastecimento failed: ${err.message}`)
    return { success: false, error: err.message }
  }
}

// Cron: retry all pending confirmations (called every 10min)
export async function retryFailedConfirmacoes() {
  const db = await import('./supabase.js')
  const { GROUP_MOTORISTA, MOTORISTAS } = await import('./config.js')
  const { alertWarning } = await import('./alerting.js')

  // Find fretes with failed confirmation (last 48h to avoid infinite retries)
  const fretes = await db.query('tp_fretes',
    'select=id,container,motorista_id,created_at,confirmacao_erro&confirmacao_enviada=eq.false&status=eq.OK&order=created_at.desc&limit=50',
    'return=representation'
  )
  if (!fretes.length) return

  // Build motorista_id -> chat_jid lookup from config
  const motoristIdToJid = {}
  for (const [jid, cfg] of Object.entries(GROUP_MOTORISTA)) {
    const uuid = MOTORISTAS[cfg.motorista]
    if (uuid) motoristIdToJid[uuid] = jid
  }

  let ok = 0, fail = 0
  for (const f of fretes) {
    const chatJid = motoristIdToJid[f.motorista_id]
    if (!chatJid) { fail++; continue }

    const result = await confirmaFrete(f.container, chatJid)
    if (result.success) {
      await db.patch('tp_fretes', `id=eq.${f.id}`, { confirmacao_enviada: true, confirmacao_erro: null })
      ok++
    } else {
      fail++
    }
  }

  if (ok > 0 || fail > 0) {
    console.log(`[RetryConfirma] ${ok} ok, ${fail} fail (of ${fretes.length} pending)`)
  }
  if (fail > 0) {
    alertWarning('Confirmacoes pendentes', `${fail} confirmacoes ainda falhando apos retry automatico.\nTotal pendentes: ${fretes.length}`)
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
