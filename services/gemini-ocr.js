// services/gemini-ocr.js — Gemini 2.0 Flash OCR for freight tickets and fuel receipts
import { GEMINI_KEY } from './config.js'
import { alertWarning } from './alerting.js'

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`

const TICKET_PROMPT = `You are an OCR specialist analyzing freight ticket images from Brazilian port logistics.

Analyze this image and extract:
1. TIPO_DOCUMENTO: "TICKET_FRETE" (freight ticket) or "OUTRO" (other/invalid)
2. CONTAINER: Container/shipment number (alphanumeric, e.g. OOLU6283142)
3. MOTORISTA: Driver name (UPPERCASE)
4. PLACA: Vehicle license plate (Brazilian format)
5. DATA: Date in DD/MM/YYYY format. IMPORTANT: The year is ALWAYS 2025 or 2026. If the year appears faded, truncated, or ambiguous, assume 2026. If handwritten American format (M/D/YYYY), convert. Never return years before 2025.
6. LOCAL: Terminal name. Keywords: BTP, DPW, SANTOS BRASIL, ECOPORTO
7. SEQUENCIA: Sequence number (integer 1-50). Careful with similar handwritten digits (1 vs 7, 4 vs 9).

Return ONLY valid JSON, no markdown. Example:
{"TIPO_DOCUMENTO":"TICKET_FRETE","CONTAINER":"OOLU6283142","MOTORISTA":"VALTER","PLACA":"GFR6A86","DATA":"12/03/2026","LOCAL":"DPW","SEQUENCIA":5}

If not a valid freight ticket: {"TIPO_DOCUMENTO":"OUTRO"}`

const ABASTECIMENTO_PROMPT = `You are an OCR specialist analyzing fuel receipt images from Brazilian logistics.

Analyze this image and extract:
1. TIPO_DOCUMENTO: "ABASTECIMENTO" (fuel receipt) or "OUTRO"
2. LITROS: Liters fueled (decimal number)
3. CONTROLE_POSTO: Gas station control number
4. BOMBA: Pump number
5. LEITURA: Meter reading
6. PLACA: Vehicle license plate
7. DATA: Date in DD/MM/YYYY format
8. KM_ODOMETRO: Odometer reading in km (integer). CRITICAL field.

Return ONLY valid JSON, no markdown. Example:
{"TIPO_DOCUMENTO":"ABASTECIMENTO","LITROS":120.5,"CONTROLE_POSTO":"1234","BOMBA":"3","LEITURA":"5678","PLACA":"GFR6A86","DATA":"12/03/2026","KM_ODOMETRO":85430}

If not a fuel receipt: {"TIPO_DOCUMENTO":"OUTRO"}`

const MAX_RETRIES = 3
const RETRY_CODES = new Set([429, 500, 502, 503, 529])

async function callGemini(base64, prompt) {
  let lastError

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) {
        const body = await res.text()
        lastError = new Error(`Gemini OCR: ${res.status} ${body}`)

        if (RETRY_CODES.has(res.status) && attempt < MAX_RETRIES) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000)
          console.warn(`[Gemini] ${res.status} on attempt ${attempt}/${MAX_RETRIES}, retrying in ${delay}ms`)
          if (attempt >= 2) alertWarning('Gemini retry', `Status ${res.status} na tentativa ${attempt}/${MAX_RETRIES}`)
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        throw lastError
      }

      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('Gemini returned empty response')

      // Strip markdown code fences if present
      const clean = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim()
      try {
        return JSON.parse(clean)
      } catch {
        throw new Error(`Gemini OCR parse error: ${clean.substring(0, 200)}`)
      }
    } catch (err) {
      lastError = err
      if (err.name === 'TimeoutError' && attempt < MAX_RETRIES) {
        console.warn(`[Gemini] Timeout on attempt ${attempt}/${MAX_RETRIES}, retrying`)
        continue
      }
      if (attempt === MAX_RETRIES) throw lastError
    }
  }

  throw lastError
}

export async function ocrTicket(base64) {
  return callGemini(base64, TICKET_PROMPT)
}

export async function ocrAbastecimento(base64) {
  return callGemini(base64, ABASTECIMENTO_PROMPT)
}
