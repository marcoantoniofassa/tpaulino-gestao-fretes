import express from 'express'
import webpush from 'web-push'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// TP Services (migrated from n8n)
import { mountOcrWebhook } from './services/tp-ocr-pipeline.js'
import { mountConfirmaRoute } from './services/tp-confirma.js'
import { startCrons } from './services/tp-crons.js'
import { runSafetyNet } from './services/tp-safety-net.js'
import { reprocessRawRecord } from './services/tp-ocr-pipeline.js'
import * as db from './services/supabase.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// VAPID config
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BMVxWyNulqubkaagw0ljTmfyIN4q4uDrw50THa2jhUAEmhWPIaYf-7c7aM2hjx_yAYLi-KUx6SPJ7Acvuj3PZW0'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'pAnY4RUeXYWbJGbJ0pT3W9BYDPh_ywuAlbPLaNTvO5w'
const PUSH_API_KEY = process.env.PUSH_API_KEY || 'tp-push-2026'

// Supabase config (for persisting push subscriptions)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dfuajmyhpfgxgonsejsc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

webpush.setVapidDetails('mailto:marcoantonio@contele.com.br', VAPID_PUBLIC, VAPID_PRIVATE)

app.use(express.json({ limit: '10mb' })) // Increased for base64 images from Evolution

// Mount TP service routes (OCR webhook, WhatsApp confirmation)
mountOcrWebhook(app)
mountConfirmaRoute(app)

// In-memory push subscriptions (+ Supabase persistence)
const subscriptions = new Map()

// --- Supabase helpers ---
const supabaseHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
}

async function loadSubscriptionsFromDB() {
  if (!SUPABASE_KEY) return
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tp_push_subscriptions?select=*`, {
      headers: supabaseHeaders,
    })
    if (!res.ok) {
      console.warn('Push DB load skipped (table may not exist):', res.status)
      return
    }
    const rows = await res.json()
    for (const row of rows) {
      subscriptions.set(row.endpoint, {
        endpoint: row.endpoint,
        keys: row.keys,
        device_name: row.device_name || 'Desconhecido',
        created_at: row.created_at,
      })
    }
    console.log(`Push: loaded ${rows.length} subscriptions from Supabase`)
  } catch (err) {
    console.warn('Push DB load failed (fallback to in-memory):', err.message)
  }
}

async function saveSubscriptionToDB(endpoint, keys, device_name) {
  if (!SUPABASE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/tp_push_subscriptions`, {
      method: 'POST',
      headers: { ...supabaseHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ endpoint, keys, device_name: device_name || 'Desconhecido' }),
    })
  } catch (err) {
    console.warn('Push DB save failed:', err.message)
  }
}

async function deleteSubscriptionFromDB(endpoint) {
  if (!SUPABASE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/tp_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
      headers: supabaseHeaders,
    })
  } catch (err) {
    console.warn('Push DB delete failed:', err.message)
  }
}

// Load on startup
loadSubscriptionsFromDB()

// Serve static files
app.use(express.static(join(__dirname, 'dist')))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', push: true, subscribers: subscriptions.size, persisted: !!SUPABASE_KEY })
})

// VAPID public key
app.get('/api/push/vapid-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC })
})

// Save push subscription
app.post('/api/push/subscribe', async (req, res) => {
  const { subscription, device_name } = req.body
  if (!subscription?.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription' })
  }
  subscriptions.set(subscription.endpoint, {
    ...subscription,
    device_name: device_name || 'Desconhecido',
    created_at: new Date().toISOString(),
  })
  // Persist to Supabase (best-effort)
  await saveSubscriptionToDB(subscription.endpoint, subscription.keys, device_name)
  console.log(`Push subscription added: ${device_name} (total: ${subscriptions.size})`)
  res.json({ ok: true })
})

// Unsubscribe
app.post('/api/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body
  subscriptions.delete(endpoint)
  await deleteSubscriptionFromDB(endpoint)
  res.json({ ok: true })
})

// Send push notification to all subscribers (called by N8N)
app.post('/api/push/send', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key
  if (apiKey !== PUSH_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { title, body, tag, url } = req.body
  if (!title || !body) {
    return res.status(400).json({ error: 'title and body required' })
  }

  const payload = JSON.stringify({ title, body, tag: tag || 'novo_frete', url: url || '/fretes' })
  let sent = 0
  let failed = 0
  const toRemove = []

  for (const [endpoint, sub] of subscriptions) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: sub.keys,
    }
    try {
      await webpush.sendNotification(pushSub, payload)
      sent++
    } catch (err) {
      console.error(`Push failed (${sub.device_name}):`, err.statusCode || err.message)
      failed++
      if (err.statusCode === 404 || err.statusCode === 410) {
        toRemove.push(endpoint)
      }
    }
  }

  // Clean up expired subscriptions (memory + DB)
  for (const ep of toRemove) {
    subscriptions.delete(ep)
    await deleteSubscriptionFromDB(ep)
  }

  console.log(`Push sent: ${sent} ok, ${failed} failed, ${toRemove.length} removed`)
  res.json({ ok: true, sent, failed, total: subscriptions.size })
})

// Manual safety net trigger (reprocess ERRO/PENDENTE records)
app.post('/api/tp/reprocess', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key
  if (apiKey !== PUSH_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const stats = await runSafetyNet()
  res.json({ ok: true, stats })
})

// Retry failed confirmations
app.post('/api/tp/retry-confirmacoes', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key
  if (apiKey !== PUSH_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const { confirmaFrete } = await import('./services/tp-confirma.js')
    // Find fretes with failed confirmation
    const fretes = await db.query('tp_fretes',
      'select=id,container,motorista_id&confirmacao_enviada=eq.false&status=eq.OK&order=created_at.desc&limit=50',
      'return=representation'
    )
    if (!fretes.length) return res.json({ ok: true, retried: 0, message: 'No pending confirmations' })

    // Need to resolve motorista_id -> chat_jid
    const { GROUP_MOTORISTA, MOTORISTAS } = await import('./services/config.js')
    const motoristIdToJid = {}
    for (const [jid, cfg] of Object.entries(GROUP_MOTORISTA)) {
      const uuid = MOTORISTAS[cfg.motorista]
      if (uuid) motoristIdToJid[uuid] = jid
    }

    let ok = 0, fail = 0
    for (const f of fretes) {
      const chatJid = motoristIdToJid[f.motorista_id]
      if (!chatJid) { fail++; continue }
      try {
        const result = await confirmaFrete(f.container, chatJid)
        if (result.success) {
          await db.patch('tp_fretes', `id=eq.${f.id}`, { confirmacao_enviada: true, confirmacao_erro: null })
          ok++
        } else { fail++ }
      } catch { fail++ }
    }
    console.log(`[Retry] Confirmacoes: ${ok} ok, ${fail} fail`)
    res.json({ ok: true, retried: ok, failed: fail, total: fretes.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Reprocess a specific raw record by ID (any status, including IGNORADO)
app.post('/api/tp/reprocess/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key
  if (apiKey !== PUSH_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const records = await db.query('tp_mensagens_raw', `select=*&id=eq.${req.params.id}`, 'return=representation')
    if (!records.length) return res.status(404).json({ error: 'Record not found' })
    // Reset status to PENDENTE so reprocess picks it up
    await db.patch('tp_mensagens_raw', `id=eq.${req.params.id}`, { status: 'PENDENTE', tentativas: 0, frete_id: null, erro_detalhe: null })
    const updated = await db.query('tp_mensagens_raw', `select=*&id=eq.${req.params.id}`, 'return=representation')
    const result = await reprocessRawRecord(updated[0])
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// SPA fallback (Express 5 syntax)
app.get('/{*path}', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`T Paulino server on port ${PORT} | Push ready | DB: ${SUPABASE_KEY ? 'yes' : 'no'}`)

  // Start cron jobs (healthcheck, safety net, abastecimento)
  startCrons()
})
