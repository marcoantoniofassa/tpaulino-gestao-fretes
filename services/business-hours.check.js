// services/business-hours.check.js — trava as duas cegueiras da janela de guarda.
// Rodar: node services/business-hours.check.js
//
// 1) Domingo desligava healthcheck E zombie monitor o dia inteiro. Em 30/08/2026
//    (domingo) a Evolution ficou ~18h em zumbi receive-only sem nenhuma das duas falar.
// 2) O tp-healthcheck lia `new Date().getHours()` sem timezone: no Railway (UTC) a
//    janela "6h-22h" virava 03h-19h BRT, entao ele parava de olhar as 19h.
import assert from 'node:assert/strict'
import { isBusinessHours } from './config.js'

// Domingo 30/08/2026, 15:00 BRT (18:00Z) — o dia e a hora do incidente.
assert.equal(isBusinessHours(new Date('2026-08-30T18:00:00Z')), true, 'domingo em horario util tem que olhar')

// Sabado, mesma logica.
assert.equal(isBusinessHours(new Date('2026-08-29T18:00:00Z')), true, 'sabado tem que olhar')

// 20:30 BRT (23:30Z) numa quarta: dentro da janela. Antes o healthcheck ja tinha parado
// as 19h BRT por ler hora UTC.
assert.equal(isBusinessHours(new Date('2026-08-26T23:30:00Z')), true, '20h30 BRT ainda e janela')

// Bordas: 06:00 BRT (09:00Z) entra, 22:00 BRT (01:00Z do dia seguinte) sai.
assert.equal(isBusinessHours(new Date('2026-08-26T09:00:00Z')), true, '06h BRT entra')
assert.equal(isBusinessHours(new Date('2026-08-27T01:00:00Z')), false, '22h BRT sai')

// Madrugada: 03:00 BRT (06:00Z) fica de fora. Se a hora fosse lida em UTC isso passaria
// como 06h e viraria true — e o teste acima das 20h30 nao pegaria sozinho os dois lados.
assert.equal(isBusinessHours(new Date('2026-08-26T06:00:00Z')), false, '03h BRT fica fora')

console.log('PASS business-hours.check.js')
