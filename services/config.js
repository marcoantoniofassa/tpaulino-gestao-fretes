// services/config.js — Shared configuration for all TP services

// Supabase
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dfuajmyhpfgxgonsejsc.supabase.co'
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''

// Evolution API
export const EVOLUTION_URL = process.env.EVOLUTION_API_ENDPOINT || 'https://evolution-evolution-api.u0otng.easypanel.host'
export const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''
export const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'marcofassa'

// Gemini OCR
export const GEMINI_KEY = process.env.GEMINI_API_KEY || ''

// Push
export const PUSH_URL = process.env.TP_PUSH_URL || 'https://tpaulino-gestao-fretes-production.up.railway.app/api/push/send'
export const PUSH_API_KEY = process.env.PUSH_API_KEY || 'tp-push-2026'

// Marco WhatsApp (for alerts)
export const MARCO_WHATSAPP = '5513997818442@s.whatsapp.net'

// Group -> Motorista mapping (GROUP defines the motorist, NOT OCR)
export const GROUP_MOTORISTA = {
  '120363039509825419@g.us': { motorista: 'ALESSANDRO', placa: 'FJR7B87' },
  '120363314612881947@g.us': { motorista: 'RONALDO', placa: 'ECS0E09' },
  '120363328619713776@g.us': { motorista: 'CHRISTIAN', placa: 'FEI3D86' },
  '120363423313474684@g.us': { motorista: 'CHRISTIAN', placa: 'FEI3D86' }, // alias
  '120363027158529382@g.us': { motorista: 'VALTER', placa: 'GFR6A86' },
  '120363406009484675@g.us': { motorista: 'LUIZ CARLOS', placa: null },
}

// Motorista UUIDs
export const MOTORISTAS = {
  'ALESSANDRO': '5da2dac6-5762-41ac-946a-9a5902a4f07f',
  'RONALDO': 'e3d4996a-ab79-4b38-bb51-b245be21828c',
  'CHRISTIAN': '6fd85e0f-c299-435b-8bf0-aa8dc31201f0',
  'VALTER': 'bc11ce16-94c4-4a47-94ec-378d21c36e16',
  'LUIZ CARLOS': 'f3ccac7f-2825-4887-a9d3-258b5276e0c2',
}

// Veiculo UUIDs (placa -> id)
export const VEICULOS = {
  'DVS8J28': '6efd9102-b6a2-4bf9-abee-79abfb539cb3',
  'NJY9B12': 'f6686e26-a600-4980-a947-b8a25773c87f',
  'FJR7B87': '30c1d111-e62d-4595-8d5b-27e559c43551',
  'ECS0E09': '86d3a3ae-8e25-47f8-afd8-511fd7992c81',
  'FEI3D86': '4d47c1f1-4c2f-4706-a96e-ab23e249bb59',
  'GFR6A86': '3fcde79f-1eaf-4721-b1ec-f00c9c8fb17f',
  // OCR aliases (Gemini misreads)
  'GFR686': '3fcde79f-1eaf-4721-b1ec-f00c9c8fb17f',
  'FE13D86': '4d47c1f1-4c2f-4706-a96e-ab23e249bb59',
  'FEI3086': '4d47c1f1-4c2f-4706-a96e-ab23e249bb59',
  'FJR7887': '30c1d111-e62d-4595-8d5b-27e559c43551',
}

// Terminal config
export const TERMINAIS = {
  'BTP': { id: '5618b9cf-386c-44b6-888a-9ec1d6f6a269', nome: 'Brasil Terminal Portuario', valor: 580 },
  'ECOPORTO': { id: 'd7e7dcb8-a731-45d3-93a4-bf735a3b5515', nome: 'EcoPorto', valor: 580 },
  'DPW': { id: 'ecf4b67c-e30c-4fd9-948a-06be80dd2e14', nome: 'DPW Santos', valor: 680 },
  'SANTOS BRASIL': { id: '42cb6f82-1b06-42b5-9caa-1b7a29625b07', nome: 'Santos Brasil', valor: 680 },
}

export const PEDAGIO = 54.90
export const COMISSAO_PERCENTUAL = 0.25
export const PRECO_LITRO_DIESEL = 6.25

// Supabase REST headers
export function supaHeaders(prefer = 'return=minimal') {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': prefer,
  }
}
