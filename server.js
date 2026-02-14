import express from 'express'
import webpush from 'web-push'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// VAPID config
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BMVxWyNulqubkaagw0ljTmfyIN4q4uDrw50THa2jhUAEmhWPIaYf-7c7aM2hjx_yAYLi-KUx6SPJ7Acvuj3PZW0'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'pAnY4RUeXYWbJGbJ0pT3W9BYDPh_ywuAlbPLaNTvO5w'
const PUSH_API_KEY = process.env.PUSH_API_KEY || 'tp-push-2026'

webpush.setVapidDetails('mailto:marcoantonio@contele.com.br', VAPID_PUBLIC, VAPID_PRIVATE)

app.use(express.json())

// In-memory push subscriptions (survives within a single deploy)
const subscriptions = new Map()

// Serve static files
app.use(express.static(join(__dirname, 'dist')))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', push: true, subscribers: subscriptions.size })
})

// VAPID public key
app.get('/api/push/vapid-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC })
})

// Save push subscription (in-memory)
app.post('/api/push/subscribe', (req, res) => {
  const { subscription, device_name } = req.body
  if (!subscription?.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription' })
  }
  subscriptions.set(subscription.endpoint, {
    ...subscription,
    device_name: device_name || 'Desconhecido',
    created_at: new Date().toISOString(),
  })
  console.log(`Push subscription added: ${device_name} (total: ${subscriptions.size})`)
  res.json({ ok: true })
})

// Unsubscribe
app.post('/api/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body
  subscriptions.delete(endpoint)
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

  // Clean up expired subscriptions
  toRemove.forEach(ep => subscriptions.delete(ep))

  console.log(`Push sent: ${sent} ok, ${failed} failed, ${toRemove.length} removed`)
  res.json({ ok: true, sent, failed, total: subscriptions.size })
})

// SPA fallback (Express 5 syntax)
app.get('/{*path}', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`T Paulino server on port ${PORT} | Push ready`)
})
