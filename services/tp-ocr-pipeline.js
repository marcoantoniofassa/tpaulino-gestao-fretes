// services/tp-ocr-pipeline.js — v2-02 OCR Pipeline (migrated from n8n)
// Processes WhatsApp images from Evolution webhook into freight records
import { GROUP_MOTORISTA, PUSH_URL, PUSH_API_KEY } from './config.js'
import * as db from './supabase.js'
import { ocrTicket } from './gemini-ocr.js'
import { applyBusinessRules } from './business-rules.js'
import { confirmaFrete } from './tp-confirma.js'

// Express route handler: POST /api/tp/webhook
export function mountOcrWebhook(app) {
  app.post('/api/tp/webhook', async (req, res) => {
    // Acknowledge immediately (Evolution expects fast response)
    res.status(200).json({ ok: true })

    // Process asynchronously
    try {
      await processWebhookMessage(req.body)
    } catch (err) {
      console.error('[OCR] Unhandled error:', err.message)
    }
  })

  // Legacy path for backwards compat with n8n webhook URL
  app.post('/webhook/t-paulino-ocr-v2', async (req, res) => {
    res.status(200).json({ ok: true })
    try {
      await processWebhookMessage(req.body)
    } catch (err) {
      console.error('[OCR] Unhandled error:', err.message)
    }
  })
}

// Main processing pipeline
export async function processWebhookMessage(body) {
  // Step 1: Filter groups + image
  const msg = filterMessage(body)
  if (!msg) return

  console.log(`[OCR] Processing ${msg.msg_id} from ${msg.chat_jid}`)

  try {
    // Step 2: Insert raw record (PENDENTE)
    const raw = await db.insert('tp_mensagens_raw', {
      msg_id: msg.msg_id,
      chat_jid: msg.chat_jid,
      sender_jid: msg.sender_jid,
      timestamp_msg: new Date(msg.timestamp * 1000).toISOString(),
      media_base64: msg.base64,
      caption: msg.caption,
      status: 'PENDENTE',
    })

    // Step 3: Upload image to storage
    const storagePath = `fotos/tickets/${msg.chat_jid}/${msg.msg_id}.jpg`
    const imageBuffer = Buffer.from(msg.base64, 'base64')
    await db.uploadStorage(storagePath, imageBuffer)

    // Step 4: Update raw -> PROCESSANDO (clear base64, save storage path)
    const rawFilter = `msg_id=eq.${msg.msg_id}&chat_jid=eq.${encodeURIComponent(msg.chat_jid)}`
    await db.patch('tp_mensagens_raw', rawFilter, {
      status: 'PROCESSANDO',
      media_base64: null,
      media_supabase_path: `tickets/${msg.chat_jid}/${msg.msg_id}.jpg`,
    })

    // Step 5: OCR via Gemini
    const ocr = await ocrTicket(msg.base64)
    console.log(`[OCR] Result: ${ocr.TIPO_DOCUMENTO} container=${ocr.CONTAINER}`)

    // Step 6: Business rules
    const frete = applyBusinessRules(ocr, msg.chat_jid)

    if (frete.ignorado) {
      console.log(`[OCR] Ignored: ${frete.erro_validacao}`)
      await db.patch('tp_mensagens_raw', rawFilter, {
        status: 'IGNORADO',
        ocr_resultado: ocr,
      })
      return
    }

    // Step 7: INSERT tp_fretes
    const fretePayload = {
      container: frete.container,
      motorista_id: frete.motorista_id,
      veiculo_id: frete.veiculo_id,
      terminal_id: frete.terminal_id,
      data_frete: frete.data_frete,
      sequencia: frete.sequencia,
      valor_bruto: frete.valor_bruto,
      pedagio: frete.pedagio,
      comissao: frete.comissao,
      valor_liquido: frete.valor_liquido,
      status: 'OK',
    }
    const freteRecord = await db.insert('tp_fretes', fretePayload)
    console.log(`[OCR] Frete created: ${freteRecord.id}`)

    // Step 8: Update frete foto_url
    const photoUrl = db.publicUrl(storagePath)
    await db.patch('tp_fretes', `id=eq.${freteRecord.id}`, { foto_ticket_url: photoUrl })

    // Step 9: Update raw -> OK
    await db.patch('tp_mensagens_raw', rawFilter, {
      status: 'OK',
      frete_id: freteRecord.id,
      ocr_resultado: ocr,
    })

    // Step 10: Push notification (best-effort)
    sendPush(frete.motorista_nome, frete.terminal_nome, frete.container, frete.valor_liquido)

    // Step 11: WhatsApp confirmation (best-effort)
    confirmaFrete(frete.container, msg.chat_jid).catch(err =>
      console.warn('[OCR] Confirma WhatsApp failed:', err.message)
    )

    console.log(`[OCR] Done: ${frete.container} ${frete.motorista_nome} R$${frete.valor_liquido}`)

  } catch (err) {
    console.error(`[OCR] Pipeline error for ${msg.msg_id}:`, err.message)
    // Update raw -> ERRO
    try {
      const rawFilter = `msg_id=eq.${msg.msg_id}&chat_jid=eq.${encodeURIComponent(msg.chat_jid)}`
      await db.patch('tp_mensagens_raw', rawFilter, {
        status: 'ERRO',
        erro_detalhe: err.message?.substring(0, 1000),
      })
    } catch (e2) {
      console.error('[OCR] Failed to update raw ERRO:', e2.message)
    }
  }
}

// Also used by safety-net for reprocessing
export async function reprocessRawRecord(record) {
  const msg = {
    msg_id: record.msg_id,
    chat_jid: record.chat_jid,
    sender_jid: record.sender_jid || '',
    timestamp: record.timestamp_msg ? new Date(record.timestamp_msg).getTime() / 1000 : Date.now() / 1000,
    caption: record.caption,
  }

  const rawFilter = `msg_id=eq.${msg.msg_id}&chat_jid=eq.${encodeURIComponent(msg.chat_jid)}`

  // Download image from storage (not base64)
  const storagePath = record.media_supabase_path || `tickets/${msg.chat_jid}/${msg.msg_id}.jpg`
  const imgUrl = `${db.publicUrl('fotos/' + storagePath)}`
  const imgRes = await fetch(imgUrl)
  if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`)
  const imgBuffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(imgBuffer).toString('base64')

  // Update -> PROCESSANDO
  await db.patch('tp_mensagens_raw', rawFilter, { status: 'PROCESSANDO' })

  // Increment tentativas
  await db.patch('tp_mensagens_raw', rawFilter, {
    tentativas: (record.tentativas || 0) + 1,
  })

  // OCR
  const ocr = await ocrTicket(base64)
  const frete = applyBusinessRules(ocr, msg.chat_jid)

  if (frete.ignorado) {
    await db.patch('tp_mensagens_raw', rawFilter, { status: 'IGNORADO', ocr_resultado: ocr })
    return { status: 'IGNORADO', reason: frete.erro_validacao }
  }

  // INSERT frete
  const freteRecord = await db.insert('tp_fretes', {
    container: frete.container,
    motorista_id: frete.motorista_id,
    veiculo_id: frete.veiculo_id,
    terminal_id: frete.terminal_id,
    data_frete: frete.data_frete,
    sequencia: frete.sequencia,
    valor_bruto: frete.valor_bruto,
    pedagio: frete.pedagio,
    comissao: frete.comissao,
    valor_liquido: frete.valor_liquido,
    status: 'OK',
    foto_ticket_url: db.publicUrl('fotos/' + storagePath),
  })

  await db.patch('tp_mensagens_raw', rawFilter, {
    status: 'OK',
    frete_id: freteRecord.id,
    ocr_resultado: ocr,
  })

  sendPush(frete.motorista_nome, frete.terminal_nome, frete.container, frete.valor_liquido)
  confirmaFrete(frete.container, msg.chat_jid).catch(() => {})

  return { status: 'OK', frete_id: freteRecord.id }
}

// Filter incoming Evolution webhook message
function filterMessage(body) {
  const data = body?.data
  if (!data?.key?.remoteJid) return null

  const chatJid = data.key.remoteJid
  if (!GROUP_MOTORISTA[chatJid]) return null // Not an allowed group
  if (!data.message?.imageMessage) return null // No image

  return {
    msg_id: data.key.id,
    chat_jid: chatJid,
    sender_jid: data.key.participant || '',
    timestamp: data.messageTimestamp || Math.floor(Date.now() / 1000),
    base64: data.message.base64 || '',
    caption: data.message.imageMessage?.caption || null,
  }
}

// Send push notification (best-effort, no throw)
function sendPush(motorista, terminal, container, valorLiquido) {
  fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      'x-api-key': PUSH_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `${motorista} — ${terminal}`,
      body: `${container || 'S/N'} — R$ ${valorLiquido?.toFixed(2) || '0.00'}`,
      tag: 'novo_frete',
      url: '/fretes',
    }),
  }).catch(err => console.warn('[Push] Failed:', err.message))
}
