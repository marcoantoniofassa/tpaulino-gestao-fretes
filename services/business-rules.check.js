// Guarda: diesel nasce PAGO. A ISIS desconta no acerto do frete, nao existe baixa manual.
// Roda com `npm run check:gastos`. Sem env, sem rede.
import { readFileSync } from 'node:fs'
import { processAbastecimento } from './business-rules.js'
import { GROUP_MOTORISTA } from './config.js'

let failures = 0
function assert(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${label}`)
  if (!ok) failures++
}

// 1. Caminho automatico (cron de 15min -> tp-abastecimento.js -> processAbastecimento)
const jid = Object.keys(GROUP_MOTORISTA)[0]
const gasto = processAbastecimento(
  { TIPO_DOCUMENTO: 'ABASTECIMENTO', LITROS: '350', DATA: '20/08/2026', KM_ODOMETRO: '412000' },
  jid
)
assert(gasto !== null, 'processAbastecimento monta o gasto')
assert(gasto?.status === 'PAGO', `status=PAGO no cadastro automatico (veio ${gasto?.status})`)

// 2. Caminho manual (app -> createGasto). E TypeScript: se afirma pela fonte.
const useGastos = readFileSync(new URL('../src/hooks/useGastos.ts', import.meta.url), 'utf8')
const insertBlock = useGastos.slice(useGastos.indexOf('.insert({'), useGastos.indexOf('.select(\'id\')'))
assert(
  /status:\s*gasto\.tipo === 'ABASTECIMENTO' \? 'PAGO'/.test(insertBlock),
  'createGasto grava PAGO quando tipo=ABASTECIMENTO'
)

// 3. Nada pode devolver diesel pra fila: o toggle "Desfazer" nao existe pra abastecimento
const card = readFileSync(new URL('../src/components/gastos/GastoCard.tsx', import.meta.url), 'utf8')
assert(
  /!temParcelas && gasto\.tipo !== 'ABASTECIMENTO' &&/.test(card),
  'GastoCard esconde o toggle de status em abastecimento'
)

// 4. A tela de Despesas abre na fila de pendentes
const page = readFileSync(new URL('../src/pages/GastosPage.tsx', import.meta.url), 'utf8')
assert(/useState\('PENDENTE'\)/.test(page), 'GastosPage abre filtrada em Pendentes')

console.log(failures === 0 ? '\nPASSOU' : `\n${failures} falha(s)`)
process.exit(failures === 0 ? 0 : 1)
