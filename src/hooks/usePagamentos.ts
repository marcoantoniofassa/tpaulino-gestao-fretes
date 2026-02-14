import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface MotoristaPagamento {
  motorista_id: string
  motorista_nome: string
  total_fretes: number
  valor_bruto: number
  comissao: number
  valor_liquido: number
  pago: boolean
}

const LS_KEY = 'tp_pagamentos_local'

function getLocalPagamentos(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch { return {} }
}

function setLocalPagamento(key: string, pago: boolean) {
  const all = getLocalPagamentos()
  all[key] = pago
  localStorage.setItem(LS_KEY, JSON.stringify(all))
}

export function usePagamentos(semanaInicio: string, semanaFim: string) {
  const [motoristas, setMotoristas] = useState<MotoristaPagamento[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)

    const { data: fretes } = await supabase
      .from('tp_fretes')
      .select('motorista_id, valor_bruto, comissao, pedagio, valor_liquido, tp_motoristas(id, nome)')
      .gte('data_frete', semanaInicio)
      .lte('data_frete', semanaFim)

    if (!fretes) { setLoading(false); return }

    const map = new Map<string, MotoristaPagamento>()
    for (const f of fretes as any[]) {
      const mid = f.motorista_id || 'unknown'
      const nome = f.tp_motoristas?.nome || 'N/A'
      const curr = map.get(mid) || {
        motorista_id: mid,
        motorista_nome: nome,
        total_fretes: 0,
        valor_bruto: 0,
        comissao: 0,
        valor_liquido: 0,
        pago: false,
      }
      curr.total_fretes++
      curr.valor_bruto += f.valor_bruto || 0
      curr.comissao += f.comissao || 0
      curr.valor_liquido += f.valor_liquido || 0
      map.set(mid, curr)
    }

    // Try Supabase table first, fall back to localStorage
    const { data: pagamentos, error } = await supabase
      .from('tp_pagamentos')
      .select('*')
      .eq('semana_inicio', semanaInicio)

    if (pagamentos && !error) {
      for (const p of pagamentos as any[]) {
        const m = map.get(p.motorista_id)
        if (m) m.pago = p.status === 'PAGO'
      }
    } else {
      // Fallback: localStorage
      const local = getLocalPagamentos()
      for (const [, m] of map) {
        const key = `${semanaInicio}:${m.motorista_id}`
        if (local[key]) m.pago = true
      }
    }

    setMotoristas(Array.from(map.values()).sort((a, b) => a.motorista_nome.localeCompare(b.motorista_nome)))
    setLoading(false)
  }, [semanaInicio, semanaFim])

  useEffect(() => { fetchData() }, [fetchData])

  const totalComissao = motoristas.reduce((s, m) => s + m.comissao, 0)
  const totalPago = motoristas.filter(m => m.pago).reduce((s, m) => s + m.comissao, 0)

  async function togglePagamento(motorista_id: string, pago: boolean) {
    setMotoristas(prev => prev.map(m =>
      m.motorista_id === motorista_id ? { ...m, pago } : m
    ))

    const m = motoristas.find(x => x.motorista_id === motorista_id)
    if (!m) return

    // Try Supabase first
    const { error } = await supabase
      .from('tp_pagamentos')
      .upsert({
        motorista_id,
        semana_inicio: semanaInicio,
        semana_fim: semanaFim,
        total_fretes: m.total_fretes,
        valor_total: m.comissao,
        status: pago ? 'PAGO' : 'PENDENTE',
        data_pagamento: pago ? new Date().toISOString() : null,
      } as any, { onConflict: 'motorista_id,semana_inicio' })

    // Fallback to localStorage
    if (error) {
      setLocalPagamento(`${semanaInicio}:${motorista_id}`, pago)
    }
  }

  return { motoristas, totalComissao, totalPago, loading, togglePagamento }
}
