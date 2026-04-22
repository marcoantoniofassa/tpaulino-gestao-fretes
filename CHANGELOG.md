# Changelog

## 2026-04-22

- Reajuste de precos vigente a partir de 22/04/2026 (cutoff por data, historico preservado)
- Frete BTP / ECOPORTO / NAO_DEFINIDO: R$ 580 -> R$ 630
- Frete DPW / SANTOS BRASIL: R$ 680 -> R$ 740
- Comissao motorista: de 25% percentual para FIXA (R$ 145 no frete 630, R$ 170 no frete 740)
- Diesel (preco estimado/L): R$ 6,25 -> R$ 6,12
- `services/config.js`: helpers `isNewPricing`, `getTerminalValor`, `getComissao`, `getPrecoLitroDiesel` + `PRICING_CUTOFF_DATE`
- `services/business-rules.js`: `applyBusinessRules` e `processAbastecimento` usam helpers por data
- `src/components/fretes/FreteDetail.tsx`: label "Comissao (25%)" vira "Comissao"
- PR #13, commit `f8418d2`

## 2026-04-16 a 2026-04-20

- `fix(ocr)`: migrar gemini-2.0-flash deprecated pra 2.5-flash-lite (commit `8180fbf`)

## 2026-04-10

- `fix(zombie-monitor)`: tuning thresholds GAP_SUSPECT 2h->6h, GAP_CRITICAL 4h->10h (commit `c5ff520`)
- `fix(zombie-monitor)`: cooldown receive-only 2h (corrige alerta a cada 5min)
- `fix(ocr)`: prompt ensina Gemini a reconhecer 3 formatos de ticket (classico, posicionamento, gate) (commit `46101ef`)

## 2026-04-09

- `fix(zombie-monitor)`: deteccao por gap real, 3 zonas (commit `153fb6f`)
- Incidente zombie receive-only 57h (07-09/04), recovery manual de 11 fretes + 4 abastecimentos (R$ 9.831,37)

## 2026-03-18

- v2.0.0: migracao n8n -> codigo + Gastos UX completo
- Issues #5 #6 #7 #8 #9 #10 #11 implementadas
- Migration `tp_gasto_parcelas` aplicada
- Codigo boleto no form de despesas, upload PDF mobile, filtros status, toggle Diesel semanal, parcelamento, acesso supervisor PIN 2468
