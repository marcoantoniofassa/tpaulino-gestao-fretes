// services/tp-backfill.js — Daily backfill against Evolution gaps
//
// Detecta imagens enviadas pelos motoristas nos grupos T-Paulino nas ultimas
// 24h que NAO entraram em `tp_mensagens_raw` (gap de webhook por downtime
// Railway, problema de rede, etc) e re-injeta cada uma via pipeline.
//
// Idempotente: UNIQUE(msg_id, chat_jid) em tp_mensagens_raw blinda duplicacao,
// e ainda fazemos dedup explicito por msg_id antes de cada injecao.
// Anti-loop: roda 1x ao dia. Mesmo gap detectado em 2 noites seguidas pula
// a 2a (msg_id ja existira em raw apos 1a recovery).
//
// Reaproveita o padrao de recuperacao validado em `tp-zombie-monitor.js`
// (post-zombie recovery). Diferenca: aqui roda preventivamente todo dia
// independente de o zombie monitor ter disparado.
//
// Caso real: 19/05/2026 Railway provider-wide downtime ~6h, 5 fretes ficaram
// fora de tp_mensagens_raw. Recuperados manualmente em 20/05. Esse cron impede
// repeticao do trabalho manual.

import * as db from './supabase.js'
import { findMessages, getBase64FromMedia, sendText } from './evolution.js'
import { processWebhookMessage } from './tp-ocr-pipeline.js'
import { GROUP_MOTORISTA, MARCO_WHATSAPP } from './config.js'

const LOOKBACK_HOURS = 24
const DELAY_BETWEEN_INJECTIONS_MS = 2000
const MAX_GAPS_PER_GROUP = 20  // safety cap: acima disso ha algo muito errado

export async function runBackfill() {
  console.log('[Backfill] Starting daily backfill scan...')
  const sinceMs = Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000
  const sinceUnix = Math.floor(sinceMs / 1000)

  // Ativa RECOVERY_MODE pra esta execucao: pipeline NAO envia confirmacao no grupo
  // (motorista nao recebe ping 03h da manha). Ainda marca confirmacao_enviada=true
  // com confirmacao_erro='RECOVERY_MODE: skipped' no tp_fretes pra rastrear.
  // Restaurado no finally.
  const recoveryModePrev = process.env.RECOVERY_MODE
  process.env.RECOVERY_MODE = 'true'

  const recovered = []
  const skipped = []
  const failed = []
  const groupJids = Object.keys(GROUP_MOTORISTA)

  try {
    for (const jid of groupJids) {
      const motorista = GROUP_MOTORISTA[jid]?.motorista || jid
      try {
        // 1. Pega mensagens da Evolution PG store no periodo (MongoDB-style $gte)
        const result = await findMessages(
          {
            key: { remoteJid: jid },
            messageTimestamp: { $gte: sinceUnix },
          },
          1,
          100,
        )
        const records = result?.messages?.records || result?.messages || []
        const imageMessages = records.filter((m) => m.message?.imageMessage && m.key?.id && !m.key?.fromMe)
        if (imageMessages.length === 0) {
          console.log(`[Backfill] ${motorista}: nenhuma imagem nas ultimas ${LOOKBACK_HOURS}h`)
          continue
        }

        console.log(`[Backfill] ${motorista}: ${imageMessages.length} imagens na evolution nas ultimas ${LOOKBACK_HOURS}h`)

        // Safety cap: se Evolution retorna muita coisa nesse grupo, algo ta errado.
        if (imageMessages.length > MAX_GAPS_PER_GROUP * 5) {
          const reason = `cap excedido: ${imageMessages.length} imagens (esperado <= ${MAX_GAPS_PER_GROUP * 5})`
          console.warn(`[Backfill] ${motorista}: ${reason}, pulando`)
          failed.push({ jid, reason })
          continue
        }

        // 2. Pra cada imagem, verificar se ja existe em raw e injetar gap
        let gapsInGroup = 0
        for (const m of imageMessages) {
          const msgId = m.key.id

          // 2a. Dedup
          try {
            const existing = await db.query(
              'tp_mensagens_raw',
              `select=msg_id,status&msg_id=eq.${encodeURIComponent(msgId)}&limit=1`,
              'return=representation',
            )
            if (existing.length > 0) {
              skipped.push({ msg_id: msgId, jid, status: existing[0].status })
              continue
            }
          } catch {}

          // Atingiu cap de gaps neste grupo: para de injetar e sai do loop do grupo.
          // (Marco investiga manual. Continuar iteraria as msgs restantes empilhando
          // entradas duplicadas em `failed` sem nenhum proposito util.)
          if (gapsInGroup >= MAX_GAPS_PER_GROUP) {
            failed.push({ jid, reason: `MAX_GAPS_PER_GROUP=${MAX_GAPS_PER_GROUP} excedido neste grupo, demais msgs nao processadas` })
            break
          }

          gapsInGroup++

          // 2b. Pega base64 (pode ja vir embutido na response, senao baixa)
          let base64 = m.message?.base64 || ''
          if (!base64 && m.message) {
            base64 = (await getBase64FromMedia(m.message).catch(() => null)) || ''
          }

          // 2c. Sem base64 -> inserir PENDENTE pro safety-net das 06:00 BRT pegar
          if (!base64) {
            try {
              await db.insert('tp_mensagens_raw', {
                msg_id: msgId,
                chat_jid: jid,
                sender_jid: m.key.participant || '',
                timestamp_msg: new Date((m.messageTimestamp || sinceUnix) * 1000).toISOString(),
                status: 'PENDENTE',
                caption: m.message?.imageMessage?.caption || null,
              })
              failed.push({ msg_id: msgId, jid, reason: 'sem base64, marcado PENDENTE pro safety-net' })
            } catch (insertErr) {
              failed.push({ msg_id: msgId, jid, reason: insertErr.message })
            }
            continue
          }

          // 2d. Injetar via pipeline (mesmo caminho do webhook Evolution).
          // RECOVERY_MODE=true acima -> pipeline NAO envia confirmacao no grupo.
          const fakeWebhook = {
            data: {
              key: {
                remoteJid: jid,
                fromMe: false,
                id: msgId,
                participant: m.key.participant || '',
              },
              messageTimestamp: m.messageTimestamp || sinceUnix,
              message: {
                imageMessage: m.message.imageMessage,
                base64,
              },
            },
          }
          try {
            await processWebhookMessage(fakeWebhook)
            recovered.push({ msg_id: msgId, jid })
            console.log(`[Backfill] ${motorista}: ${msgId} injetada com sucesso`)
          } catch (err) {
            failed.push({ msg_id: msgId, jid, reason: err.message })
          }

          // Espacar Gemini OCR
          await new Promise((r) => setTimeout(r, DELAY_BETWEEN_INJECTIONS_MS))
        }
      } catch (err) {
        console.error(`[Backfill] ${motorista}: erro fatal:`, err.message)
        failed.push({ jid, reason: err.message })
      }
    }

    const stats = { recovered: recovered.length, skipped: skipped.length, failed: failed.length }
    console.log('[Backfill] Done. Stats:', stats)

    // Notificar Marco SO se backfill atuou ou teve falha real
    // (skipped sozinho = scan normal, nao notifica)
    if (recovered.length > 0 || failed.length > 0) {
      const motoristasRecovered = {}
      for (const r of recovered) {
        const mn = GROUP_MOTORISTA[r.jid]?.motorista || r.jid
        motoristasRecovered[mn] = (motoristasRecovered[mn] || 0) + 1
      }
      const lines = [`[T-Paulino Backfill diario]`]
      if (recovered.length > 0) {
        lines.push(`Recuperou ${recovered.length} frete(s) (confirmacao no grupo desabilitada - motoristas dormindo):`)
        lines.push(Object.entries(motoristasRecovered).map(([k, v]) => `- ${k}: ${v}`).join('\n'))
      }
      if (failed.length > 0) {
        lines.push(`Falhas: ${failed.length}`)
        lines.push(failed.slice(0, 5).map((f) => `- ${f.msg_id?.substring(0, 12) || f.jid}: ${f.reason}`).join('\n'))
      }
      sendText(MARCO_WHATSAPP, lines.join('\n')).catch(() => {})
    }
    return stats
  } finally {
    // Restaura RECOVERY_MODE pro estado anterior (importante: webhook em paralelo
    // nao deve herdar a flag, pois enviaria confirmacao = false fora de janela
    // de backfill).
    if (recoveryModePrev === undefined) delete process.env.RECOVERY_MODE
    else process.env.RECOVERY_MODE = recoveryModePrev
  }
}
