# CLAUDE.md — T Paulino Gestao de Fretes

## O que e

App mobile-first para gestao de fretes portuarios da transportadora T Paulino (Porto de Santos).
OCR via Gemini no N8N le fotos de tickets enviados por WhatsApp, grava no Supabase e notifica via push.

## Stack

| Camada | Tech |
|--------|------|
| Frontend | React 19 + Vite + TypeScript + Tailwind 3.4 |
| Charts | Recharts |
| Database | Supabase (`dfuajmyhpfgxgonsejsc`) |
| Server | Express 5 (serve SPA + Push API) |
| Auth | PIN 4 digitos + role (admin/supervisor) |
| Push | Web Push API + VAPID + Service Worker |
| OCR | N8N + Gemini 2.0 Flash (v2: ingestao desacoplada) |
| Deploy | Railway auto-deploy via git push |

## Estrutura

```
/
├── server.js              # Express: SPA + Push API endpoints
├── index.html             # Entry point + PWA meta tags
├── public/
│   ├── manifest.json      # PWA manifest
│   ├── sw.js              # Service Worker (push handler)
│   ├── icon-512.png       # App icon (TP bold + laranja LGND)
│   ├── icon-192.png       # Android PWA icon
│   ├── apple-touch-icon.png  # iOS home screen icon
│   ├── header-bg.png      # Header background (caminhao + porto)
│   └── logo.png           # Logo original (legado)
├── src/
│   ├── App.tsx
│   ├── main.tsx            # Entry + SW registration
│   ├── index.css           # Tailwind + custom utilities
│   ├── lib/
│   │   ├── supabase.ts     # Supabase client
│   │   ├── auth.ts         # PIN verify via RPC + role (admin/supervisor)
│   │   ├── push.ts         # Push subscription helpers
│   │   ├── storage.ts      # Upload fotos (Supabase Storage)
│   │   ├── constants.ts
│   │   └── utils.ts        # formatDate, formatTime, formatCurrency, getWeekRange
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useFretes.ts       # Realtime (INSERT + UPDATE)
│   │   ├── useGastos.ts       # Realtime (INSERT + UPDATE + DELETE) + create/toggle/delete
│   │   ├── useDashboard.ts    # Realtime fretes + gastos (INSERT + UPDATE + DELETE)
│   │   ├── usePagamentos.ts   # Pagamentos semanais (Supabase + localStorage fallback)
│   │   ├── useMotoristas.ts
│   │   ├── useVeiculos.ts
│   │   └── useNotificacoes.ts # Realtime (INSERT + UPDATE)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx           # Header c/ imagem de fundo
│   │   │   ├── MobileNav.tsx        # Bottom tabs (iOS safe area) — role-filtered
│   │   │   ├── NotificationCenter.tsx  # Sininho + painel dropdown
│   │   │   ├── PushPrompt.tsx       # Banner "ativar push" pos-login
│   │   │   └── PageContainer.tsx
│   │   ├── ui/          # Card, Badge, Button, PinInput, Spinner, etc
│   │   ├── fretes/       # FreteCard (data + hora), FreteList, FreteFilters, FreteDetail
│   │   ├── gastos/       # GastoCard, GastoForm (abastecimento: litros, R$/L, km)
│   │   ├── dashboard/    # KPIGrid (6 cards dinamicos mes/semana), Charts (RevenueTimeline, FretesByDriver)
│   │   ├── motoristas/
│   │   └── veiculos/
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── FretesPage.tsx
│   │   ├── FreteDetailPage.tsx
│   │   ├── PagamentosPage.tsx
│   │   ├── GastosPage.tsx        # Cadastro de gastos (despesas caminhoes)
│   │   ├── MotoristasPage.tsx
│   │   ├── VeiculosPage.tsx
│   │   └── LoginPage.tsx
│   └── types/
│       └── database.ts
└── supabase/
    └── migrations/        # Schema SQL (referencia)
```

## Tabelas Supabase (prefixo `tp_`)

| Tabela | Descricao |
|--------|-----------|
| `tp_fretes` | Fretes (data, container, motorista, veiculo, terminal, valores, OCR raw, foto_ticket_url) |
| `tp_motoristas` | 4 motoristas ativos (whatsapp_group_jid) |
| `tp_veiculos` | 6 veiculos (foto_url) |
| `tp_terminais` | BTP, ECOPORTO, DPW, SANTOS_BRASIL |
| `tp_pagamentos` | Status pagamento semanal por motorista (PAGO/PENDENTE) |
| `tp_gastos` | Despesas operacionais (tipo, valor, veiculo, forma_pagamento, foto, litros, preco_litro, km_odometro) |
| `tp_push_subscriptions` | Push subscriptions persistidas |
| `tp_placa_aliases` | Correcoes OCR de placa |
| `tp_auth` | PIN hash + role (admin/supervisor) |
| `tp_mensagens_raw` | Fila de processamento OCR (v2): imagem gravada ANTES do OCR, rastreabilidade, reprocessamento |
| `tp_abastecimentos` | Stub fase 2 (coberto por tp_gastos) |
| `tp_manutencoes` | Stub fase 2 (coberto por tp_gastos) |

### Storage
- Bucket `fotos` (publico) — fotos de veiculos, tickets e tickets raw (`tickets/{chat_jid}/{msg_id}.jpg`)

## Realtime

| Hook | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|
| useFretes | Refetch | Refetch | - |
| useGastos | Refetch | Refetch | Refetch |
| useDashboard | Refetch | Refetch | Refetch |
| useNotificacoes | Refetch | Refetch | - |

Dashboard (fretes + gastos), fretes, gastos e notificacoes atualizam ao vivo sem reload.

## Push Notifications

**Arquitetura**:
- `server.js` armazena subscriptions **persistidas no Supabase** (tabela `tp_push_subscriptions`)
- Fallback in-memory se tabela nao existir
- Service Worker (`sw.js`) recebe push e mostra notificacao nativa
- N8N dispara push apos inserir frete no Supabase
- **Titulo push**: `MOTORISTA — TERMINAL` (ex: "VALTER — DPW")
- **Body push**: `CONTAINER — R$ VALOR` (ex: "MSCU526304E — R$ 455,10")
- Notification center in-app usa Supabase Realtime (sem tabela extra)
- Estado lido/nao-lido em localStorage

**Endpoints**:
- `GET  /api/health` — healthcheck + contagem subscribers
- `GET  /api/push/vapid-key` — chave publica VAPID
- `POST /api/push/subscribe` — registra subscription
- `POST /api/push/send` — envia push (auth: `x-api-key: tp-push-2026`)

## N8N Workflows

**Server**: `n8n-n8n-start.u0otng.easypanel.host`

### v1 (legado, DESATIVAR apos dual-run)
**ID**: `Z7s30S9vl1Wi62aQ` | 16 nodes | Google Sheets como backup

### v2-02: Ingestao OCR (PRINCIPAL)
**ID**: `CcXHTN3988U5wiue` | 17 nodes
```
Webhook (t-paulino-ocr-v2)
  → INSERT tp_mensagens_raw (status=PENDENTE)
  → Upload Storage (fotos/tickets/{jid}/{msg_id}.jpg)
  → UPDATE raw (PROCESSANDO)
  → Gemini OCR 2.0 Flash
  → Business Rules + Resolver FKs
  → IF valido: INSERT tp_fretes + foto_ticket_url + Push
  → IF ignorado: UPDATE raw (IGNORADO)
  → Error: UPDATE raw (ERRO, tentativas++)
```

### v2-07: Healthcheck Evolution
**ID**: `IOno0WREByb7VraY` | 11 nodes | A cada 30min
Detecta estado zumbi da Evolution API. Alerta via push.

### v2-08: Auto Abastecimento OCR
**ID**: `9b5xtQbeynCmrZol` | 19 nodes | A cada 15min
Reprocessa IGNORADOS das ultimas 24h. Se for ficha de abastecimento, cadastra em tp_gastos.

### v2-09: Confirmacao Frete WhatsApp
**ID**: `SngWWaIm8ZtMxcNm` | Webhook: `/tp-confirma-frete`
Envia "Frete XXXX cadastrado." no grupo do motorista apos sucesso.

### v2-03: Safety Net + Limpeza
**ID**: `1JZ777Ajf45ELUIq` | 31 nodes | Diario 06:00 BRT
Reprocessa PENDENTE/ERRO (tentativas < 3). Alerta PENDENTE > 7 dias. Limpa OK > 90 dias.

### Regras de Negocio (comum a todos)
- Reverse lookup: `motorista_nome` e `terminal_nome` (nomes canonicos, sem erros OCR)
- **Fallback de precos**: se OCR nao extrair valores (valor_bruto=0), aplica pricing padrao pelo terminal:
  - BTP/ECOPORTO: R$ 580 bruto, R$ 145 comissao, R$ 435 liquido
  - DPW/SANTOS BRASIL: R$ 680 bruto, R$ 54,90 pedagio, R$ 170 comissao, R$ 455,10 liquido
- GROUP_MOTORISTA: grupo WhatsApp define motorista fixo (nao OCR)

## Env Vars (Railway)

| Var | Descricao |
|-----|-----------|
| `PORT` | Injetado pelo Railway |
| `TZ` | `America/Sao_Paulo` |
| `SUPABASE_ANON_KEY` | Para server.js (push persistence) |
| `VAPID_PUBLIC_KEY` | Chave publica push (tem default no codigo) |
| `VAPID_PRIVATE_KEY` | Chave privada push (tem default no codigo) |
| `PUSH_API_KEY` | API key pro /api/push/send (default: `tp-push-2026`) |

## Env Vars (Frontend — .env.production)

| Var | Descricao |
|-----|-----------|
| `VITE_SUPABASE_URL` | `https://dfuajmyhpfgxgonsejsc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Anon key do Supabase |

## Convencoes

- Todas as tabelas tem prefixo `tp_`
- CSS: Tailwind utilities + gradients customizados em `index.css`
- Cores: `tp-blue` (#1e40af), `tp-dark` (#0f172a), `tp-accent` (#f59e0b), gradients: blue/green/amber/purple/red/dark
- Mobile-first: bottom nav (6 tabs), cards touch-friendly
- Realtime: Supabase channels para fretes, dashboard e notificacoes
- Build: `npm run build` (tsc + vite)
- Start: `node server.js` (Express, NAO serve)
- Timezone: `localDateStr()` evita bug UTC near midnight
- Ciclo semanal: quarta a terça (getWeekRange em utils.ts) — usado em Fretes, Pagamentos e Dashboard
- Dashboard: toggle Mes/Semana, KPIs dinamicos (Fretes/Despesas Mes ou Semana)
- Roles: admin (acesso total), supervisor (so Despesas) — role vem da RPC tp_verify_pin
- Despesas: tipo ABASTECIMENTO tem campos litros, preco_litro, km_odometro com auto-calculo

## Abastecimentos — Cadastro Automatico (v2-08) + Manual

### Regra de preco

Caminhoes abastecem no **posto interno da ISIS** — ISIS cobra Thiago a parte. Preco NAO aparece na ficha. Usar preco medio estimado (diesel S10 Cubatao/SP, ~R$ 5,89/L fev/2026).

### Dado critico: km odometro

O **km no odometro** em cada abastecimento e essencial para calcular consumo (km/L) e detectar anomalias. Se a ficha nao tiver km, cobrar motorista/Thiago.

### Como cadastrar

1. Ler imagem da ficha no grupo WhatsApp do motorista
2. Extrair: litros, controle posto, bomba, leitura, placa, data
3. Buscar `veiculo_id` em `tp_veiculos` pela placa
4. Inserir em `tp_gastos` via REST API (service_role key — disponivel no node "POST Supabase" do N8N workflow Z7s30S9vl1Wi62aQ):
   - `tipo`: ABASTECIMENTO
   - `forma_pagamento`: CARTAO_FROTA
   - `status`: PENDENTE
   - `preco_litro`: media diesel S10 Cubatao (~R$ 5,89/L fev/2026) — posto ISIS, preco cobrado a parte
   - `valor`: litros × preco_litro
   - `km_odometro`: **OBRIGATORIO** — sem km nao calcula consumo
   - `descricao`: incluir "PRECO ESTIMADO" e "SEM KM" quando aplicavel
5. Se km ausente: registrar mesmo assim mas cobrar informacao

### Grupos WhatsApp dos motoristas

| Motorista | Placa | JID |
|-----------|-------|-----|
| ALESSANDRO + RONALDO | FJR7B87, ECS0E09, NJY9B12 | `120363039509825419@g.us` |
| CHRISTIAN | FEI3D86 | `120363423313474684@g.us` |
| VALTER | GFR6A86 | `120363027158529382@g.us` |

## URLs

- **Producao**: `https://tpaulino-gestao-fretes-production.up.railway.app/`
- **Railway**: `https://railway.com/project/4c501140-119d-46a7-b642-0b3ec1ac6cb8`
- **GitHub**: `https://github.com/marcoantoniofassa/tpaulino-gestao-fretes`
