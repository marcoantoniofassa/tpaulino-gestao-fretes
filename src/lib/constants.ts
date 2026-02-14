export const TERMINAIS = {
  BTP: { nome: 'BTP', valorBruto: 580, pedagio: 0 },
  ECOPORTO: { nome: 'EcoPorto', valorBruto: 580, pedagio: 0 },
  DPW: { nome: 'DPW', valorBruto: 680, pedagio: 54.9 },
  SANTOS_BRASIL: { nome: 'Santos Brasil', valorBruto: 680, pedagio: 54.9 },
} as const

export const COMISSAO_PCT = 0.25

export const STATUS_FRETE = {
  VALIDADO: 'VALIDADO',
  CORRIGIDO: 'CORRIGIDO',
  ERRO: 'ERRO',
  PENDENTE: 'PENDENTE',
} as const

export const SESSION_KEY = 'tp_session'
export const SESSION_EXPIRY_DAYS = 30
