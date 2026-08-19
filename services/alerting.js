// services/alerting.js — Pipeline alerts (Discord + WhatsApp fallback)
//
// PONTO DE PASSAGEM UNICO do Discord neste repo. Todo post passa por `postDiscord`,
// que e o dono da regra de mencao. Quem alerta so escolhe o MODO.
//
// A REGRA
//   - 'alerta' = ERRO DE VERDADE (quebrou, parou, falhou, precisa de acao humana)
//       -> mencao do Marco no campo `content` do TOPO
//       -> allowed_mentions = { parse: [], users: [MARCO_DISCORD_ID] }
//   - 'log' = rotina, sucesso, recuperacao, informativo, metrica
//       -> sem mencao nenhuma
//       -> allowed_mentions = { parse: [] }
//
// POR QUE
//   1. `parse: []` vai nos DOIS modos. Sozinho ele mata @everyone/@here vindo de texto de
//      terceiro (nome de motorista, corpo de erro de API, texto de OCR). O par
//      `parse: [] + users: [id]` e o unico jeito de bloquear @everyone e ainda deixar
//      passar o ping que importa.
//   2. Mencao SO pinga no campo `content` do topo. `<@id>` dentro de `embeds` NAO pinga.
//      Como todo alerta daqui e embed, o ping vai no content acima do embed.
//   3. O modo e OBRIGATORIO e EXPLICITO. Sem default silencioso: se tudo cair em 'log' por
//      omissao, o parque de alerta fica MUDO, e alerta mudo e indistinguivel de "esta tudo
//      bem". Modo ausente ou invalido LANCA, nao assume nada.
//
// Autoteste (nao posta em Discord nenhum): node services/alerting.check.js
import { EVOLUTION_URL, EVOLUTION_KEY, EVOLUTION_INSTANCE, MARCO_WHATSAPP } from './config.js'

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || ''

// Discord ID do Marco. So entra no payload em modo 'alerta'.
export const MARCO_DISCORD_ID = '834406885309546568'

// Limites do Discord. Payload acima disso volta 400 e o alerta some calado, entao quem
// e dono do post corta ANTES de enviar em vez de confiar no texto que o caller montou.
// (content aqui e so a mencao, tamanho fixo: nao disputa espaco com texto de ninguem.)
const LIMITE = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, footer: 2048, fields: 25 }

function corta(txt, max) {
  const s = String(txt ?? '')
  return s.length <= max ? s : `${s.substring(0, max - 3)}...`
}

function cortaEmbed(embed) {
  const out = { ...embed }
  if (out.title) out.title = corta(out.title, LIMITE.title)
  if (out.description) out.description = corta(out.description, LIMITE.description)
  if (out.footer?.text) out.footer = { ...out.footer, text: corta(out.footer.text, LIMITE.footer) }
  if (Array.isArray(out.fields)) {
    out.fields = out.fields.slice(0, LIMITE.fields).map(f => ({
      ...f,
      name: corta(f.name, LIMITE.fieldName),
      value: corta(f.value, LIMITE.fieldValue),
    }))
  }
  return out
}

export async function postDiscord(mode, embed) {
  if (mode !== 'alerta' && mode !== 'log') {
    throw new Error(
      `postDiscord: modo obrigatorio 'alerta' ou 'log'. Recebido: ${JSON.stringify(mode)}. ` +
      `alerta = erro de verdade, pinga o Marco | log = rotina/recuperacao, mudo.`
    )
  }
  if (!embed) throw new Error(`postDiscord: embed obrigatorio (modo '${mode}')`)
  if (!DISCORD_WEBHOOK) return { skipped: 'webhook-nao-configurado' }

  const body = {
    embeds: [cortaEmbed(embed)],
    allowed_mentions: mode === 'alerta'
      ? { parse: [], users: [MARCO_DISCORD_ID] }
      : { parse: [] },
  }
  // Ping so aqui: dentro do embed a mencao nao notifica ninguem.
  if (mode === 'alerta') body.content = `<@${MARCO_DISCORD_ID}>`

  const res = await fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  // 4xx/5xx resolvem o fetch sem lancar: sem esta checagem o post recusado (webhook
  // rotacionado = 404, rate limit = 429, payload invalido = 400) some calado e o parque
  // de alerta fica mudo com aparencia de saudavel, que e a mesma falha uma camada abaixo.
  if (!res || !res.ok) {
    const corpo = res?.text ? await res.text().catch(() => '') : ''
    const msg = `Discord recusou o post (http=${res?.status ?? 'sem-resposta'}, modo=${mode}): ${corpo.substring(0, 200)}`
    console.error(`[ALERT] ${msg}`)
    throw new Error(msg)
  }
  return { ok: true, status: res.status }
}

// Erro de verdade: pipeline quebrou, confirmacao falhou, restart falhou. Pinga.
export async function alertError(title, details) {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  console.error(`[ALERT] ${title}: ${details}`)

  // Discord (primary if configured)
  try {
    await postDiscord('alerta', {
      title: `TP Frete: ${title}`,
      description: details.substring(0, 2000),
      color: 0xFF4444,
      timestamp: new Date().toISOString(),
      footer: { text: 'tpaulino-gestao-fretes' },
    })
  } catch (err) {
    console.warn('[ALERT] Discord failed:', err.message)
  }

  // WhatsApp Marco (fallback)
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_KEY,
      },
      body: JSON.stringify({
        number: MARCO_WHATSAPP,
        text: `*TP Frete ALERTA*\n${title}\n${details.substring(0, 500)}\n${timestamp}`,
      }),
    })
  } catch (err) {
    console.warn('[ALERT] WhatsApp failed:', err.message)
  }
}

// Send Discord embed with clickable action link (human-in-the-loop).
// Existe justamente porque alguem precisa CLICAR: e alerta, nao log.
export async function alertWithAction(title, details, actionLabel, actionUrl, color = 0xFFAA00) {
  console.log(`[ALERT] ${title}: ${details} | Action: ${actionLabel}`)

  if (!DISCORD_WEBHOOK) {
    console.warn('[ALERT] Discord webhook not configured, action link not sent')
    return
  }

  try {
    await postDiscord('alerta', {
      title: `TP Frete: ${title}`,
      description: details.substring(0, 2000),
      color,
      fields: [{
        name: 'Acao',
        value: `**[${actionLabel}](${actionUrl})**`,
        inline: false,
      }],
      timestamp: new Date().toISOString(),
      footer: { text: 'tpaulino-gestao-fretes | zombie-monitor' },
    })
  } catch (err) {
    console.warn('[ALERT] Discord action alert failed:', err.message)
  }
}

// Recuperacao concluida: ninguem precisa agir. Mudo.
export async function alertSuccess(title, details) {
  console.log(`[ALERT] ${title}: ${details}`)

  if (!DISCORD_WEBHOOK) return

  try {
    await postDiscord('log', {
      title: `TP Frete: ${title}`,
      description: details.substring(0, 2000),
      color: 0x44FF44,
      timestamp: new Date().toISOString(),
      footer: { text: 'tpaulino-gestao-fretes | zombie-monitor' },
    })
  } catch (err) {
    console.warn('[ALERT] Discord success alert failed:', err.message)
  }
}

// Degradacao que se auto-recupera (retry do Gemini) ou follow-up de falha que JA pingou
// por alertError (confirmacoes pendentes, que o cron retenta a cada 10min). Mudo de
// proposito: o que exige acao sai por alertError/alertWithAction.
export async function alertWarning(title, details) {
  console.warn(`[ALERT] ${title}: ${details}`)

  if (!DISCORD_WEBHOOK) return

  try {
    await postDiscord('log', {
      title: `TP Frete: ${title}`,
      description: details.substring(0, 2000),
      color: 0xFFAA00,
      timestamp: new Date().toISOString(),
      footer: { text: 'tpaulino-gestao-fretes' },
    })
  } catch (err) {
    console.warn('[ALERT] Discord warning failed:', err.message)
  }
}
