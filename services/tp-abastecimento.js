// services/tp-abastecimento.js — v2-09 Auto Abastecimento OCR (S-10 ticket only)
// Every 15min: reprocess IGNORADOS from last 24h looking for S-10 fuel tickets
import * as db from './supabase.js'
import { ocrAbastecimento } from './gemini-ocr.js'
import { processAbastecimento } from './business-rules.js'
import { confirmaAbastecimento } from './tp-confirma.js'
import { PUSH_URL, PUSH_API_KEY } from './config.js'

// Group messages from the same chat within 5min window
function groupByChat(records) {
  const groups = {}
  for (const r of records) {
    const key = r.chat_jid
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }
  // Within each chat group, sort by created_at and keep only one per 5min window
  const result = []
  for (const [chatJid, msgs] of Object.entries(groups)) {
    msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    let lastPicked = null
    for (const msg of msgs) {
      const msgTime = new Date(msg.created_at).getTime()
      if (!lastPicked || (msgTime - lastPicked) > 5 * 60 * 1000) {
        result.push(msg)
        lastPicked = msgTime
      } else {
        // Extra photo in same window: mark as processed to avoid reprocessing
        result.push({ ...msg, _grouped: true })
      }
    }
  }
  return result
}

// Check if controle_posto already exists in tp_gastos
async function isDuplicateControle(controle) {
  if (!controle) return false
  const existing = await db.query(
    'tp_gastos',
    `select=id&tipo=eq.ABASTECIMENTO&descricao=ilike.*Ctrl: ${controle}*&limit=1`,
    'return=representation'
  )
  return existing.length > 0
}

export async function runAbastecimentoScan() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const ignored = await db.query(
      'tp_mensagens_raw',
      `select=*&status=eq.IGNORADO&created_at=gte.${oneDayAgo}&order=created_at.asc&limit=20`,
      'return=representation'
    )

    if (ignored.length === 0) return

    console.log(`[Abastecimento] Scanning ${ignored.length} IGNORADOS`)

    // Group photos from same chat to avoid processing multiple photos of same fueling
    const grouped = groupByChat(ignored)
    let found = 0

    for (const record of grouped) {
      try {
        // If this photo was grouped (extra in same 5min window), skip OCR but mark processed
        if (record._grouped) {
          const rawFilter = `msg_id=eq.${record.msg_id}&chat_jid=eq.${encodeURIComponent(record.chat_jid)}`
          await db.patch('tp_mensagens_raw', rawFilter, {
            status: 'IGNORADO_AGRUPADO',
            ocr_resultado: { nota: 'Agrupado com outra foto do mesmo abastecimento' },
          })
          console.log(`[Abastecimento] Grouped: ${record.msg_id} (same chat, <5min window)`)
          continue
        }

        // Download image from storage
        const storagePath = record.media_supabase_path || `tickets/${record.chat_jid}/${record.msg_id}.jpg`
        const imgUrl = db.publicUrl('fotos/' + storagePath)
        const imgRes = await fetch(imgUrl)
        if (!imgRes.ok) continue

        const imgBuffer = await imgRes.arrayBuffer()
        const base64 = Buffer.from(imgBuffer).toString('base64')

        // OCR: only S-10 tickets pass (pump displays, receipts etc return OUTRO)
        const ocr = await ocrAbastecimento(base64)
        if (ocr.TIPO_DOCUMENTO !== 'ABASTECIMENTO') continue

        // Validate litros range (trucks: 30-999L)
        const litros = parseFloat(ocr.LITROS) || 0
        if (litros < 30 || litros > 999) {
          console.warn(`[Abastecimento] Litros out of range: ${litros}L from ${record.msg_id}, skipping`)
          continue
        }

        // Dedup: check controle_posto (unique per fueling)
        if (ocr.CONTROLE_POSTO) {
          const isDup = await isDuplicateControle(ocr.CONTROLE_POSTO)
          if (isDup) {
            console.log(`[Abastecimento] Dedup: Ctrl ${ocr.CONTROLE_POSTO} already exists, skipping`)
            const rawFilter = `msg_id=eq.${record.msg_id}&chat_jid=eq.${encodeURIComponent(record.chat_jid)}`
            await db.patch('tp_mensagens_raw', rawFilter, {
              status: 'DUPLICADO',
              ocr_resultado: ocr,
            })
            continue
          }
        }

        // Process
        const gasto = processAbastecimento(ocr, record.chat_jid)
        if (!gasto) continue

        // Insert gasto
        const gastoRecord = await db.insert('tp_gastos', gasto)
        found++
        console.log(`[Abastecimento] Created gasto ${gastoRecord.id}: ${gasto.litros}L R$${gasto.valor} Ctrl:${ocr.CONTROLE_POSTO || 'N/A'}`)

        // Update raw record
        const rawFilter = `msg_id=eq.${record.msg_id}&chat_jid=eq.${encodeURIComponent(record.chat_jid)}`
        await db.patch('tp_mensagens_raw', rawFilter, {
          status: 'OK',
          ocr_resultado: ocr,
        })

        // WhatsApp confirmation to group
        try {
          await confirmaAbastecimento(gasto.litros, record.chat_jid)
        } catch (confirmErr) {
          console.warn(`[Abastecimento] Confirma failed: ${confirmErr.message}`)
        }

        // Push notification
        fetch(PUSH_URL, {
          method: 'POST',
          headers: {
            'x-api-key': PUSH_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: 'Abastecimento Detectado',
            body: `${gasto.litros}L - Ctrl ${ocr.CONTROLE_POSTO || 'N/A'} - R$ ${gasto.valor.toFixed(2)}`,
            tag: 'abastecimento',
            url: '/gastos',
          }),
        }).catch(() => {})

      } catch (err) {
        console.warn(`[Abastecimento] Error processing ${record.msg_id}: ${err.message}`)
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 3000))
    }

    if (found > 0) console.log(`[Abastecimento] Found ${found} fuel receipts`)
  } catch (err) {
    console.error('[Abastecimento] Scan error:', err.message)
  }
}
