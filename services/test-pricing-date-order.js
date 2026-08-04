// Test: pricing precisa usar a data_frete FINAL (depois da Regra 8 corrigir a data).
// Repro do bug Santos Brasil 680 vs 740: OCR le data pre-cutoff fora de range,
// a Regra 8 corrige pro timestamp da msg (pos-cutoff), e o valor deve virar 740.
// Rodar: node services/test-pricing-date-order.js
import assert from 'node:assert'
import { applyBusinessRules } from './business-rules.js'

const chatJid = '120363039509825419@g.us' // ALESSANDRO (grupo valido)
const msgTsPosCutoff = '2026-07-10T15:00:00Z' // 12h BRT, pos-cutoff, dentro do range

// Caso 1 (o bug): OCR leu data pre-cutoff E fora de range -> Regra 8 corrige -> deve ser 740
const bug = applyBusinessRules({
  TIPO_DOCUMENTO: 'TICKET_FRETE',
  DATA: '15/01/2026',       // pre-cutoff + fora do range de 7 dias (hoje ~jul)
  CONTAINER: 'ABCD1234567', // com container => VIRA
  LOCAL: 'SANTOS BRASIL',
  SEQUENCIA: 5,
}, chatJid, msgTsPosCutoff)
assert.strictEqual(bug.data_frete, '2026-07-10',
  `Regra 8 deveria corrigir a data pro timestamp da msg, veio ${bug.data_frete}`)
assert.strictEqual(bug.valor_bruto, 740,
  `BUG: frete pos-cutoff deveria valer 740, veio ${bug.valor_bruto}`)
assert.strictEqual(bug.comissao, 170,
  `comissao fixa v2 deveria ser 170, veio ${bug.comissao}`)
assert.strictEqual(bug.valor_liquido, 740 - 170 - 54.9,
  `liquido inconsistente: ${bug.valor_liquido}`)

// Caso 2 (sanidade): OCR le data pos-cutoff correta -> 740 (sem depender da Regra 8)
const limpo = applyBusinessRules({
  TIPO_DOCUMENTO: 'TICKET_FRETE',
  DATA: '10/07/2026',
  CONTAINER: 'ABCD1234567',
  LOCAL: 'SANTOS BRASIL',
  SEQUENCIA: 5,
}, chatJid, msgTsPosCutoff)
assert.strictEqual(limpo.valor_bruto, 740,
  `pos-cutoff limpo deveria ser 740, veio ${limpo.valor_bruto}`)

console.log('OK: pricing usa a data_frete final — Santos Brasil pos-cutoff = 740 mesmo com correcao da Regra 8')
