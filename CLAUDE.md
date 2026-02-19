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
| OCR | N8N + Gemini 2.5 Flash Vision |
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
| `tp_abastecimentos` | Stub fase 2 (coberto por tp_gastos) |
| `tp_manutencoes` | Stub fase 2 (coberto por tp_gastos) |

### Storage
- Bucket `fotos` (publico) — fotos de veiculos e tickets

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

## N8N Workflow

**ID**: `Z7s30S9vl1Wi62aQ` | **Server**: `n8n-n8n-start.u0otng.easypanel.host`

```
Webhook (Evolution) → Grupos → Filter → Convert → Gemini OCR → Business Rules → IF Ignorado
  ├── TRUE → Notificar Ignorado → Salvar Execucao
  └── FALSE ─┬── Google Sheets → WhatsApp Confirm → Salvar Execucao
              └── Resolver FKs → POST Supabase → Push Notification
```

16 nodes | FK resolution hardcoded | Google Sheets como backup

### Resolver FKs — Features
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

## URLs

- **Producao**: `https://tpaulino-gestao-fretes-production.up.railway.app/`
- **Railway**: `https://railway.com/project/4c501140-119d-46a7-b642-0b3ec1ac6cb8`
- **GitHub**: `https://github.com/marcoantoniofassa/tpaulino-gestao-fretes`
