// services/tp-crons.js — Initialize all scheduled jobs
import cron from 'node-cron'
import { runHealthcheck } from './tp-healthcheck.js'
import { runSafetyNet } from './tp-safety-net.js'
import { runAbastecimentoScan } from './tp-abastecimento.js'
import { retryFailedConfirmacoes } from './tp-confirma.js'

export function startCrons() {
  // v2-07: Healthcheck every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runHealthcheck().catch(err => console.error('[Cron] Healthcheck error:', err.message))
  }, { timezone: 'America/Sao_Paulo' })
  console.log('[Cron] Healthcheck scheduled: every 30min')

  // v2-08: Abastecimento scan every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    runAbastecimentoScan().catch(err => console.error('[Cron] Abastecimento error:', err.message))
  }, { timezone: 'America/Sao_Paulo' })
  console.log('[Cron] Abastecimento scheduled: every 15min')

  // v2-03: Safety Net daily at 06:00 BRT
  cron.schedule('0 6 * * *', () => {
    runSafetyNet().catch(err => console.error('[Cron] SafetyNet error:', err.message))
  }, { timezone: 'America/Sao_Paulo' })
  console.log('[Cron] SafetyNet scheduled: daily 06:00 BRT')

  // Retry failed WhatsApp confirmations every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    retryFailedConfirmacoes().catch(err => console.error('[Cron] RetryConfirma error:', err.message))
  }, { timezone: 'America/Sao_Paulo' })
  console.log('[Cron] RetryConfirmacoes scheduled: every 10min')

  // Run initial healthcheck on startup (delayed 10s)
  setTimeout(() => {
    runHealthcheck().catch(err => console.error('[Cron] Initial healthcheck error:', err.message))
  }, 10000)
}
