// services/tp-safety-net.js — v2-03 Safety Net + Cleanup (migrated from n8n)
// Daily 06:00 BRT: reprocess PENDENTE/ERRO, alert dead letters, cleanup old OK records
import * as db from './supabase.js'
import { reprocessRawRecord } from './tp-ocr-pipeline.js'
import { sendText } from './evolution.js'
import { PUSH_URL, PUSH_API_KEY, MARCO_WHATSAPP } from './config.js'

export async function runSafetyNet() {
  console.log('[SafetyNet] Starting daily run...')
  const stats = { reprocessed: 0, ok: 0, failed: 0, deadLetters: 0, stale: 0, cleaned: 0 }

  try {
    // Phase 1: Reprocess PENDENTE/ERRO with tentativas < 3
    const pending = await db.query(
      'tp_mensagens_raw',
      'select=*&or=(status.eq.PENDENTE,status.eq.ERRO)&tentativas=lt.3&order=created_at.asc&limit=20',
      'return=representation'
    )
    console.log(`[SafetyNet] Found ${pending.length} records to reprocess`)

    for (const record of pending) {
      try {
        const result = await reprocessRawRecord(record)
        stats.reprocessed++
        if (result.status === 'OK') stats.ok++
        console.log(`[SafetyNet] ${record.msg_id}: ${result.status}`)
      } catch (err) {
        stats.failed++
        console.error(`[SafetyNet] Failed ${record.msg_id}: ${err.message}`)
      }
      // Small delay between records to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000))
    }

    // Phase 2: Count dead letters (ERRO with tentativas >= 3)
    const deadLetters = await db.query(
      'tp_mensagens_raw',
      'select=msg_id,chat_jid,erro_detalhe&status=eq.ERRO&tentativas=gte.3',
      'return=representation'
    )
    stats.deadLetters = deadLetters.length
    if (deadLetters.length > 0) {
      console.warn(`[SafetyNet] ${deadLetters.length} dead letters found`)
      const alertText = `[T-Paulino Safety Net] ${deadLetters.length} mensagens com erro permanente (3+ tentativas). Verificar manualmente.`
      sendText(MARCO_WHATSAPP, alertText).catch(() => {})
      sendPushAlert('Dead Letters', alertText)
    }

    // Phase 3: Check stale PENDENTE (> 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const stale = await db.query(
      'tp_mensagens_raw',
      `select=msg_id&status=eq.PENDENTE&created_at=lt.${sevenDaysAgo}`,
      'return=representation'
    )
    stats.stale = stale.length
    if (stale.length > 0) {
      console.warn(`[SafetyNet] ${stale.length} stale PENDENTE records (>7 days)`)
      sendPushAlert('PENDENTE Antigos', `${stale.length} registros PENDENTE com mais de 7 dias`)
    }

    // Phase 4: Cleanup OK records older than 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const oldOk = await db.query(
      'tp_mensagens_raw',
      `select=msg_id,chat_jid,media_supabase_path&status=eq.OK&created_at=lt.${ninetyDaysAgo}&limit=50`,
      'return=representation'
    )

    for (const record of oldOk) {
      try {
        // Delete storage file
        if (record.media_supabase_path) {
          await db.deleteStorage('fotos', record.media_supabase_path)
        }
        // Delete raw record
        await db.del(
          'tp_mensagens_raw',
          `msg_id=eq.${record.msg_id}&chat_jid=eq.${encodeURIComponent(record.chat_jid)}`
        )
        stats.cleaned++
      } catch (err) {
        console.warn(`[SafetyNet] Cleanup failed for ${record.msg_id}: ${err.message}`)
      }
    }

    console.log(`[SafetyNet] Done: ${JSON.stringify(stats)}`)
  } catch (err) {
    console.error('[SafetyNet] Fatal error:', err.message)
  }

  return stats
}

function sendPushAlert(title, body) {
  fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      'x-api-key': PUSH_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, tag: 'safety_net', url: '/' }),
  }).catch(() => {})
}
