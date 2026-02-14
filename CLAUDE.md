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
| Auth | PIN 4 digitos (sem Supabase Auth) |
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
│   │   ├── auth.ts         # PIN verify via RPC
│   │   ├── push.ts         # Push subscription helpers
│   │   ├── constants.ts
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useFretes.ts       # Realtime + filtros
│   │   ├── useDashboard.ts    # KPIs mensais
│   │   ├── usePagamentos.ts   # Pagamentos semanais
│   │   ├── useMotoristas.ts
│   │   ├── useVeiculos.ts
│   │   └── useNotificacoes.ts # Realtime notifications
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx           # Header c/ imagem de fundo
│   │   │   ├── MobileNav.tsx        # Bottom tabs
│   │   │   ├── NotificationCenter.tsx  # Sininho + painel dropdown
│   │   │   ├── PushPrompt.tsx       # Banner "ativar push" pos-login
│   │   │   └── PageContainer.tsx
│   │   ├── ui/          # Card, Badge, Button, PinInput, etc
│   │   ├── fretes/       # FreteCard, FreteList, FreteFilters
│   │   ├── dashboard/    # KPIGrid, Charts
│   │   ├── motoristas/
│   │   └── veiculos/
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── FretesPage.tsx
│   │   ├── FreteDetailPage.tsx
│   │   ├── PagamentosPage.tsx
│   │   ├── MotoristasPage.tsx
│   │   ├── VeiculosPage.tsx
│   │   └── LoginPage.tsx
│   └── types/
│       └── database.ts
└── supabase/
    └── migrations/
```

## Tabelas Supabase (prefixo `tp_`)

| Tabela | Descricao |
|--------|-----------|
| `tp_fretes` | Fretes (data, container, motorista, veiculo, terminal, valores, OCR raw) |
| `tp_motoristas` | 4 motoristas ativos |
| `tp_veiculos` | 6 veiculos |
| `tp_terminais` | BTP, ECOPORTO, DPW, SANTOS_BRASIL |
| `tp_placa_aliases` | Correcoes OCR de placa |
| `tp_auth` | PIN hash |
| `tp_abastecimentos` | Stub fase 2 |
| `tp_manutencoes` | Stub fase 2 |

## Push Notifications

**Arquitetura**:
- `server.js` armazena subscriptions in-memory (reseta no redeploy)
- Service Worker (`sw.js`) recebe push e mostra notificacao nativa
- N8N dispara push apos inserir frete no Supabase
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

## Env Vars (Railway)

| Var | Descricao |
|-----|-----------|
| `PORT` | Injetado pelo Railway |
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
- Cores: `tp-blue` (#1e40af), `tp-dark` (#0f172a), `tp-accent` (#f59e0b)
- Mobile-first: bottom nav, cards touch-friendly
- Realtime: Supabase channels para fretes e notificacoes
- Build: `npm run build` (tsc + vite)
- Start: `node server.js` (Express, NAO serve)

## URLs

- **Producao**: `https://tpaulino-gestao-fretes-production.up.railway.app/`
- **Railway**: `https://railway.com/project/4c501140-119d-46a7-b642-0b3ec1ac6cb8`
- **GitHub**: `https://github.com/marcoantoniofassa/tpaulino-gestao-fretes`
