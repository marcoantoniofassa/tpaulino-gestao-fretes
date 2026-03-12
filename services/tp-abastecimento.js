// services/tp-abastecimento.js — v2-08 Auto Abastecimento OCR (migrated from n8n)
// Every 15min: reprocess IGNORADOS from last 24h looking for fuel receipts
import * as db from './supabase.js'
import { ocrAbastecimento } from './gemini-ocr.js'
import { processAbastecimento } from './business-rules.js'
import { PUSH_URL, PUSH_API_KEY } from './config.js'

export async function runAbastecimentoScan() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const ignored = await db.query(
      'tp_mensagens_raw',
      `select=*&status=eq.IGNORADO&created_at=gte.${oneDayAgo}&order=created_at.asc&limit=10`,
      'return=representation'
    )

    if (ignored.length === 0) return

    console.log(`[Abastecimento] Scanning ${ignored.length} IGNORADOS`)
    let found = 0

    for (const record of ignored) {
      try {
        // Download image from storage
        const storagePath = record.media_supabase_path || `tickets/${record.chat_jid}/${record.msg_id}.jpg`
        const imgUrl = db.publicUrl('fotos/' + storagePath)
        const imgRes = await fetch(imgUrl)
        if (!imgRes.ok) continue

        const imgBuffer = await imgRes.arrayBuffer()
        const base64 = Buffer.from(imgBuffer).toString('base64')

        // OCR for fuel receipt
        const ocr = await ocrAbastecimento(base64)
        if (ocr.TIPO_DOCUMENTO !== 'ABASTECIMENTO') continue

        // Process
        const gasto = processAbastecimento(ocr, record.chat_jid)
        if (!gasto) continue

        // Dedup check: same veiculo in last 30min
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        const recent = await db.query(
          'tp_gastos',
          `select=id&tipo=eq.ABASTECIMENTO&veiculo_id=eq.${gasto.veiculo_id}&created_at=gte.${thirtyMinAgo}`,
          'return=representation'
        )
        if (recent.length > 0) {
          console.log(`[Abastecimento] Dedup: ${record.msg_id} veiculo already fueled recently`)
          continue
        }

        // Insert gasto
        const gastoRecord = await db.insert('tp_gastos', gasto)
        found++
        console.log(`[Abastecimento] Created gasto ${gastoRecord.id}: ${gasto.litros}L R$${gasto.valor}`)

        // Update raw record
        const rawFilter = `msg_id=eq.${record.msg_id}&chat_jid=eq.${encodeURIComponent(record.chat_jid)}`
        await db.patch('tp_mensagens_raw', rawFilter, {
          status: 'OK',
          ocr_resultado: ocr,
        })

        // Push notification
        fetch(PUSH_URL, {
          method: 'POST',
          headers: {
            'x-api-key': PUSH_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: 'Abastecimento Detectado',
            body: `${gasto.litros}L - R$ ${gasto.valor.toFixed(2)}`,
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
