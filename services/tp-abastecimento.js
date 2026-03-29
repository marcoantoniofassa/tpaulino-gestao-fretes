// services/tp-abastecimento.js — v2-09 Auto Abastecimento OCR (S-10 ticket only)
// Every 15min: reprocess IGNORADOS from last 24h looking for S-10 fuel tickets
import * as db from './supabase.js'
import { ocrAbastecimento } from './gemini-ocr.js'
import { processAbastecimento } from './business-rules.js'
import { confirmaAbastecimento } from './tp-confirma.js'
import { PUSH_URL, PUSH_API_KEY } from './config.js'

// Group messages from the same chat within 5min window.
// Returns ALL photos in each window (not just the first) so the OCR can try
// each one and find the S-10 ticket regardless of send order.
function groupByChat(records) {
  const groups = {}
  for (const r of records) {
    const key = r.chat_jid
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }
  const result = []
  for (const [chatJid, msgs] of Object.entries(groups)) {
    msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    let windowStart = null
    let windowId = 0
    for (const msg of msgs) {
      const msgTime = new Date(msg.created_at).getTime()
      if (!windowStart || (msgTime - windowStart) > 5 * 60 * 1000) {
        windowStart = msgTime
        windowId++
      }
      result.push({ ...msg, _windowId: `${chatJid}_${windowId}` })
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

    // Group photos from same chat. Try ALL photos in each window until S-10 found.
    const grouped = groupByChat(ignored)
    let found = 0

    // Group by windowId so we process all photos in a window together
    const windows = {}
    for (const record of grouped) {
      const wid = record._windowId
      if (!windows[wid]) windows[wid] = []
      windows[wid].push(record)
    }

    for (const [windowId, photos] of Object.entries(windows)) {
      let s10Found = false

      for (const record of photos) {
        if (s10Found) {
          // Already found S-10 in this window, mark remaining as DUPLICADO
          const rawFilter = `msg_id=eq.${record.msg_id}&chat_jid=eq.${encodeURIComponent(record.chat_jid)}`
          await db.patch('tp_mensagens_raw', rawFilter, {
            status: 'DUPLICADO',
            ocr_resultado: { nota: 'Outra foto do mesmo abastecimento (S-10 ja processada)' },
          })
          continue
        }

        try {
          // Download image from storage
          const storagePath = record.media_supabase_path || `tickets/${record.chat_jid}/${record.msg_id}.jpg`
          const imgUrl = db.publicUrl('fotos/' + storagePath)
          const imgRes = await fetch(imgUrl)
          if (!imgRes.ok) continue

          const imgBuffer = await imgRes.arrayBuffer()
          const base64 = Buffer.from(imgBuffer).toString('base64')

          // OCR: try each photo looking for S-10 ticket
          const ocr = await ocrAbastecimento(base64)
          if (ocr.TIPO_DOCUMENTO !== 'ABASTECIMENTO') {
            // Not S-10, mark as IGNORADO still (will try next photo in window)
            console.log(`[Abastecimento] ${record.msg_id}: ${ocr.TIPO_DOCUMENTO || 'OUTRO'}, trying next photo`)
            continue
          }

          // Found S-10 ticket!
          const litros = parseFloat(ocr.LITROS) || 0
          if (litros < 5 || litros > 999) {
            console.warn(`[Abastecimento] Litros out of range: ${litros}L from ${record.msg_id}, skipping`)
            continue
          }

          // Dedup: check controle_posto
          if (ocr.CONTROLE_POSTO) {
            const isDup = await isDuplicateControle(ocr.CONTROLE_POSTO)
            if (isDup) {
              console.log(`[Abastecimento] Dedup: Ctrl ${ocr.CONTROLE_POSTO} already exists`)
              const rawFilter = `msg_id=eq.${record.msg_id}&chat_jid=eq.${encodeURIComponent(record.chat_jid)}`
              await db.patch('tp_mensagens_raw', rawFilter, { status: 'DUPLICADO', ocr_resultado: ocr })
              s10Found = true
              continue
            }
          }

          // Process and insert
          const gasto = processAbastecimento(ocr, record.chat_jid)
          if (!gasto) continue

          const gastoRecord = await db.insert('tp_gastos', gasto)
          found++
          s10Found = true
          console.log(`[Abastecimento] Created gasto ${gastoRecord.id}: ${gasto.litros}L R$${gasto.valor} Ctrl:${ocr.CONTROLE_POSTO || 'N/A'}`)

          // Update raw record
          const rawFilter = `msg_id=eq.${record.msg_id}&chat_jid=eq.${encodeURIComponent(record.chat_jid)}`
          await db.patch('tp_mensagens_raw', rawFilter, { status: 'OK', ocr_resultado: ocr })

          // WhatsApp confirmation
          try {
            await confirmaAbastecimento(gasto.litros, record.chat_jid)
          } catch (confirmErr) {
            console.warn(`[Abastecimento] Confirma failed: ${confirmErr.message}`)
          }

          // Push notification
          fetch(PUSH_URL, {
            method: 'POST',
            headers: { 'x-api-key': PUSH_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'Abastecimento Detectado',
              body: `${gasto.litros}L - Ctrl ${ocr.CONTROLE_POSTO || 'N/A'} - R$ ${gasto.valor.toFixed(2)}`,
              tag: 'abastecimento', url: '/gastos',
            }),
          }).catch(() => {})

        } catch (err) {
          console.warn(`[Abastecimento] Error processing ${record.msg_id}: ${err.message}`)
        }

        // Rate limit between OCR calls
        await new Promise(r => setTimeout(r, 3000))
      }

      // If no S-10 found in entire window, mark all as checked
      if (!s10Found) {
        for (const record of photos) {
          const rawFilter = `msg_id=eq.${record.msg_id}&chat_jid=eq.${encodeURIComponent(record.chat_jid)}`
          await db.patch('tp_mensagens_raw', rawFilter, {
            status: 'IGNORADO_VERIFICADO',
            ocr_resultado: { nota: 'Todas fotos da janela verificadas, nenhuma S-10 encontrada' },
          })
        }
      }
    }

    if (found > 0) console.log(`[Abastecimento] Found ${found} fuel receipts`)
  } catch (err) {
    console.error('[Abastecimento] Scan error:', err.message)
  }
}
