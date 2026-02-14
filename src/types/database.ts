export interface Database {
  public: {
    Tables: {
      tp_motoristas: {
        Row: Motorista
        Insert: Omit<Motorista, 'id' | 'created_at'>
        Update: Partial<Omit<Motorista, 'id'>>
      }
      tp_veiculos: {
        Row: Veiculo
        Insert: Omit<Veiculo, 'id' | 'created_at'>
        Update: Partial<Omit<Veiculo, 'id'>>
      }
      tp_terminais: {
        Row: Terminal
        Insert: Omit<Terminal, 'id'>
        Update: Partial<Omit<Terminal, 'id'>>
      }
      tp_fretes: {
        Row: Frete
        Insert: Omit<Frete, 'id' | 'created_at'>
        Update: Partial<Omit<Frete, 'id'>>
      }
      tp_placa_aliases: {
        Row: PlacaAlias
        Insert: PlacaAlias
        Update: Partial<PlacaAlias>
      }
      tp_auth: {
        Row: Auth
        Insert: Auth
        Update: Partial<Auth>
      }
    }
    Functions: {
      tp_verify_pin: {
        Args: { pin_input: string }
        Returns: { nome: string }[]
      }
      tp_dashboard_monthly: {
        Args: { mes: string }
        Returns: DashboardMonthly[]
      }
    }
  }
}

export interface Motorista {
  id: string
  nome: string
  nome_normalizado: string
  telefone: string | null
  status: 'ativo' | 'inativo'
  whatsapp_group_jid: string | null
  created_at: string
}

export interface Veiculo {
  id: string
  placa: string
  placa_normalizada: string
  reboque_placa: string | null
  motorista_fixo_id: string | null
  status: 'ativo' | 'inativo'
  created_at: string
}

export interface Terminal {
  id: string
  codigo: string
  nome: string
  aliases: string[]
  valor_frete: number
  pedagio: number
}

export interface Frete {
  id: string
  data_frete: string
  container: string | null
  motorista_id: string | null
  veiculo_id: string | null
  terminal_id: string | null
  sequencia: number | null
  tipo_frete: string
  valor_bruto: number
  pedagio: number
  comissao: number
  valor_liquido: number
  ocr_raw: Record<string, unknown> | null
  ai_corrections: Record<string, unknown> | null
  status: string
  n8n_execution_id: string | null
  created_at: string
}

export interface FreteWithRelations extends Frete {
  tp_motoristas: Pick<Motorista, 'id' | 'nome'> | null
  tp_veiculos: Pick<Veiculo, 'id' | 'placa'> | null
  tp_terminais: Pick<Terminal, 'id' | 'codigo' | 'nome'> | null
}

export interface PlacaAlias {
  placa_ocr: string
  veiculo_id: string
}

export interface Auth {
  id: string
  pin_hash: string
  nome: string
}

export interface DashboardMonthly {
  total_fretes: number
  receita_liquida: number
  media_diaria: number
  fretes_hoje: number
}
