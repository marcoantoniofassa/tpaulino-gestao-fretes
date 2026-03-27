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
5. DATA: Date in DD/MM/YYYY format. IMPORTANT: The year is ALWAYS 2026. If the year appears faded, truncated, or ambiguous, use 2026. If handwritten American format (M/D/YYYY), convert. Never return years other than 2026.
6. LOCAL: Terminal name. Keywords: BTP, DPW, SANTOS BRASIL, ECOPORTO
7. SEQUENCIA: Sequence number (integer 1-50). Careful with similar handwritten digits (1 vs 7, 4 vs 9).

Return ONLY valid JSON, no markdown. Example:
{"TIPO_DOCUMENTO":"TICKET_FRETE","CONTAINER":"OOLU6283142","MOTORISTA":"VALTER","PLACA":"GFR6A86","DATA":"12/03/2026","LOCAL":"DPW","SEQUENCIA":5}

If not a valid freight ticket: {"TIPO_DOCUMENTO":"OUTRO"}`

const ABASTECIMENTO_PROMPT = `You are an OCR specialist. You ONLY extract data from the standardized "S-10 Controle de Abastecimento" paper ticket used at Brazilian fuel stations.

## What is the S-10 ticket?
A printed/handwritten paper form with header "S - 10" and title "Controle de Abastecimento Nº XXXXX".
It has these fields in order:
- TRANSPORTADORA (transport company number)
- NOME (driver name, handwritten)
- PLACA (vehicle plate, handwritten, Brazilian format like ABC1D23 or ABC1234)
- KM (odometer, often left blank)
- Nº BOMBA (pump number, 01 or 02)
- LEITURA (two meter readings: start/end, separated by / or on same line)
- LTS DIESEL (liters, handwritten number — this is the CRITICAL field)
- V. UNIT (unit price, often blank)
- TOTAL R$ (total cost, often blank)
- DATA (date, handwritten DD/MM/YY or DD/MM/YYYY — year is ALWAYS 2026)
- ASSINATURA (signature)

## CRITICAL RULES
- ONLY classify as "ABASTECIMENTO" if the image shows this S-10 paper ticket.
- If the image shows a pump digital display, a generic receipt, a fuel nozzle, or anything else: return {"TIPO_DOCUMENTO":"OUTRO"}
- The pump display (digital numbers on the machine) is NOT the ticket. Ignore it.
- LTS DIESEL: Read the handwritten number carefully. Typical range is 100-800 liters (it's a truck). If you read a number outside 30-999, double-check.
- CONTROLE: The number after "Controle de Abastecimento Nº" (printed, usually 5 digits like 34444).
- DATA: Handwritten date. Year is ALWAYS 2026 regardless of what appears written. If only 2 digits for year (e.g. "16" or "26"), use 2026.
- PLACA: Handwritten plate. Common plates in this fleet: FJR7B87, ECS0E09, FEI3D86, GFR6A86. Use these as reference if the handwriting is ambiguous.

Extract and return ONLY valid JSON:
{"TIPO_DOCUMENTO":"ABASTECIMENTO","LITROS":410,"CONTROLE_POSTO":"34444","BOMBA":"02","LEITURA":"20845502/20845932","PLACA":"FJR7B87","DATA":"26/03/2026","KM_ODOMETRO":null}

If KM is blank or illegible, set KM_ODOMETRO to null.
If not an S-10 ticket: {"TIPO_DOCUMENTO":"OUTRO"}`

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
