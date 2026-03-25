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

## Services (migrated from n8n, code in `services/`)

All OCR processing, healthcheck, abastecimento and confirmation now run inside the Express server (no more n8n dependency).

### Architecture
```
services/
├── config.js              # Env vars, UUIDs, constants, group mapping
├── supabase.js            # Supabase REST API helpers
├── evolution.js           # Evolution API helpers
├── gemini-ocr.js          # Gemini 2.0 Flash OCR (ticket + abastecimento)
├── business-rules.js      # FK resolution, pricing, validation
├── tp-ocr-pipeline.js     # v2-02: main OCR webhook pipeline
├── tp-confirma.js         # v2-09: WhatsApp confirmation
├── tp-healthcheck.js      # v2-07: Evolution healthcheck (30min cron)
├── tp-safety-net.js       # v2-03: reprocess + cleanup (daily 06:00 BRT)
├── tp-abastecimento.js    # v2-08: auto abastecimento OCR (15min cron)
└── tp-crons.js            # Initialize all scheduled jobs
```

### Endpoints
- `POST /api/tp/webhook` : Evolution webhook (v2-02 OCR pipeline)
- `POST /api/tp/confirma-frete` : WhatsApp confirmation (v2-09)
- `POST /webhook/t-paulino-ocr-v2` : Legacy path (backwards compat)
- `POST /webhook/tp-confirma-frete` : Legacy path (backwards compat)

### Crons (node-cron, timezone America/Sao_Paulo)
- `*/30 * * * *` : Healthcheck Evolution (v2-07)
- `*/15 * * * *` : Abastecimento scan (v2-08)
- `0 6 * * *` : Safety Net + Cleanup (v2-03)

### Regras de Negocio
- GROUP_MOTORISTA: grupo WhatsApp define motorista fixo (nao OCR)
- Terminal pricing: BTP/ECOPORTO R$580, DPW/Santos Brasil R$680+R$54,90 pedagio
- Comissao: 25% do valor bruto
- Diesel estimado: R$ 6,25/L (posto ISIS, cobrado a parte, atualizado mar/2026)
- Dedup abastecimento: mesmo veiculo em 30min

### n8n Legacy (DESATIVAR apos validacao em codigo)
| Workflow | ID n8n | Status |
|----------|--------|--------|
| v1 | `Z7s30S9vl1Wi62aQ` | DESATIVADO (webhook nao aponta mais) |
| v2-02 | `CcXHTN3988U5wiue` | Migrado para `tp-ocr-pipeline.js` |
| v2-03 | `1JZ777Ajf45ELUIq` | Migrado para `tp-safety-net.js` |
| v2-07 | `IOno0WREByb7VraY` | Migrado para `tp-healthcheck.js` |
| v2-08 | `9b5xtQbeynCmrZol` | Migrado para `tp-abastecimento.js` |
| v2-09 | `SngWWaIm8ZtMxcNm` | Migrado para `tp-confirma.js` |

## Env Vars (Railway)

| Var | Descricao |
|-----|-----------|
| `PORT` | Injetado pelo Railway |
| `TZ` | `America/Sao_Paulo` |
| `SUPABASE_URL` | `https://dfuajmyhpfgxgonsejsc.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key (OCR pipeline, storage) |
| `SUPABASE_ANON_KEY` | Para push persistence (fallback) |
| `GEMINI_API_KEY` | Gemini 2.0 Flash OCR |
| `EVOLUTION_API_ENDPOINT` | Evolution API URL |
| `EVOLUTION_API_KEY` | Evolution API key |
| `EVOLUTION_INSTANCE` | Instance name (`marcofassa`) |
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
   - `preco_litro`: media diesel S10 Cubatao (~R$ 6,25/L mar/2026) — posto ISIS, preco cobrado a parte
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

## Troubleshooting: Evolution API (instancia marcofassa)

### Bug conhecido: socket Baileys zumbi

A instancia `marcofassa` na Evolution API (Easypanel pessoal) roda com **115K+ msgs e 701 grupos**. O socket do Baileys eventualmente congela: a instancia reporta `connectionStatus: open` mas qualquer envio retorna `Error: Connection Closed`. Webhooks param de disparar silenciosamente.

**Sintomas**:
- Fotos enviadas nos grupos dos motoristas nao chegam no Supabase (`tp_mensagens_raw`)
- `POST /message/sendText/marcofassa` retorna `Connection Closed`
- `connectionState` reporta `open` (falso positivo)
- Logout (`DELETE /instance/logout`) tambem falha com `Connection Closed`
- `POST /instance/restart` nao resolve (objeto corrompido em memoria)

**Fix**: restart do container Docker da Evolution no Easypanel.
- Painel: `https://u0otng.easypanel.host` > projeto `evolution` > servico `evolution-api` > Redeploy
- NAO precisa restartar DB (postgres) nem Redis
- As outras instancias (isis, isis-pgto-frete, dias-odonto) reconectam sozinhas em ~20s
- `groupsIgnore: true` NAO e opcao: bloqueia MESSAGES_UPSERT de grupos (3 camadas no codigo Baileys)

**Recuperacao de fotos perdidas**:
1. O daemon WhatsApp pessoal (porta 3847) salva todas as imagens localmente em `whatsapp-mcp-pessoal/media/`
2. Consultar `GET /messages/{group_jid}?limit=30` no daemon pra listar imagens com msg_id e timestamp
3. Cruzar msg_ids com `tp_mensagens_raw` no Supabase pra identificar as faltantes
4. Converter imagem pra base64 e injetar via `POST /api/tp/webhook` simulando payload Evolution:
   ```json
   {"event":"messages.upsert","instance":"marcofassa","data":{"key":{"remoteJid":"GROUP_JID","fromMe":false,"id":"MSG_ID"},"messageTimestamp":UNIX_TS,"message":{"imageMessage":{"mimetype":"image/jpeg"},"base64":"..."}}}
   ```
5. Enviar confirmacoes manualmente via `POST /api/tp/confirma-frete` ou daemon local (porta 3847)

**Prevencao**: o cron `tp-healthcheck.js` roda a cada 30min e deveria detectar isso. Validar que o healthcheck testa envio real (nao apenas connectionState).

### PINs de acesso ao app

| Usuario | PIN | Role |
|---------|-----|------|
| TPaulino (Thiago) | 1234 | admin |
| Manutencao | 9999 | supervisor |
| Mae Thiago | ? | admin |

## URLs

- **Producao**: `https://tpaulino-gestao-fretes-production.up.railway.app/`
- **Railway**: `https://railway.com/project/4c501140-119d-46a7-b642-0b3ec1ac6cb8`
- **GitHub**: `https://github.com/marcoantoniofassa/tpaulino-gestao-fretes`
