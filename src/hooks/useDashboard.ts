import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { localDateStr } from '@/lib/utils'
import type { FreteWithRelations } from '@/types/database'

export interface ProjecaoMensal {
  fretes: number
  receitaLiquida: number
  despesas: number
  margem: number
  diasComFrete: number
  diasUteisEstimados: number
}

interface DashboardData {
  totalFretes: number
  receitaLiquida: number
  mediaDiaria: number
  fretesHoje: number
  totalGastos: number
  lucro: number
  fretesPorMotorista: { motorista: string; count: number; receita: number }[]
  receitaPorDia: { data: string; receita: number; fretes: number }[]
  projecao: ProjecaoMensal | null
}

export function useDashboard(inicio: string, fim: string) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    const hoje = localDateStr(new Date())

    const { data: fretes } = await supabase
      .from('tp_fretes')
      .select('*, tp_motoristas(id, nome), tp_veiculos(id, placa), tp_terminais(id, codigo, nome)')
      .gte('data_frete', inicio)
      .lte('data_frete', fim)
      .order('data_frete', { ascending: false })

    const { data: gastosList } = await supabase
      .from('tp_gastos')
      .select('valor')
      .gte('data', inicio)
      .lte('data', fim)

    if (!fretes) { setLoading(false); return }

    const fretesTyped = fretes as FreteWithRelations[]

    const totalFretes = fretesTyped.length
    const receitaLiquida = fretesTyped.reduce((sum, f) => sum + f.valor_liquido, 0)
    const totalGastos = (gastosList || []).reduce((sum, g) => sum + (g.valor || 0), 0)
    const lucro = receitaLiquida - totalGastos
    const diasUnicos = new Set(fretesTyped.map(f => f.data_frete)).size
    const mediaDiaria = diasUnicos > 0 ? receitaLiquida / diasUnicos : 0
    const fretesHoje = fretesTyped.filter(f => f.data_frete === hoje).length

    const motoristaMap = new Map<string, { count: number; receita: number }>()
    fretesTyped.forEach(f => {
      const key = f.tp_motoristas?.nome || 'N/A'
      const curr = motoristaMap.get(key) || { count: 0, receita: 0 }
      motoristaMap.set(key, { count: curr.count + 1, receita: curr.receita + f.valor_liquido })
    })
    const fretesPorMotorista = Array.from(motoristaMap.entries()).map(([motorista, v]) => ({
      motorista,
      ...v,
    }))

    const diaMap = new Map<string, { receita: number; fretes: number }>()
    fretesTyped.forEach(f => {
      const curr = diaMap.get(f.data_frete) || { receita: 0, fretes: 0 }
      diaMap.set(f.data_frete, { receita: curr.receita + f.valor_liquido, fretes: curr.fretes + 1 })
    })
    const receitaPorDia = Array.from(diaMap.entries())
      .map(([data, v]) => ({ data, ...v }))
      .sort((a, b) => a.data.localeCompare(b.data))

    // Projecao mensal: estimar fechamento do mes com base nos dias uteis
    let projecao: ProjecaoMensal | null = null
    const [anoInicio, mesInicio] = inicio.split('-').map(Number)
    const [anoFim, mesFim] = fim.split('-').map(Number)
    const isMonthView = anoInicio === anoFim && mesInicio === mesFim
      && inicio.endsWith('-01')
      && fim === `${anoFim}-${String(mesFim).padStart(2, '0')}-${String(new Date(anoFim, mesFim, 0).getDate()).padStart(2, '0')}`

    if (isMonthView && diasUnicos > 0) {
      // Contar domingos no mes para estimar dias uteis (~dias no mes - domingos)
      const diasNoMes = new Date(anoInicio, mesInicio, 0).getDate()
      let domingos = 0
      for (let d = 1; d <= diasNoMes; d++) {
        if (new Date(anoInicio, mesInicio - 1, d).getDay() === 0) domingos++
      }
      const diasUteisEstimados = diasNoMes - domingos

      const diasRestantes = Math.max(0, diasUteisEstimados - diasUnicos)
      const mediaFreteDia = totalFretes / diasUnicos
      const mediaReceitaDia = receitaLiquida / diasUnicos
      const mediaDespesaDia = totalGastos / diasUnicos

      projecao = {
        fretes: Math.round(totalFretes + mediaFreteDia * diasRestantes),
        receitaLiquida: receitaLiquida + mediaReceitaDia * diasRestantes,
        despesas: totalGastos + mediaDespesaDia * diasRestantes,
        margem: (receitaLiquida + mediaReceitaDia * diasRestantes) - (totalGastos + mediaDespesaDia * diasRestantes),
        diasComFrete: diasUnicos,
        diasUteisEstimados,
      }
    }

    setData({
      totalFretes,
      receitaLiquida,
      mediaDiaria,
      fretesHoje,
      totalGastos,
      lucro,
      fretesPorMotorista,
      receitaPorDia,
      projecao,
    })
    setLoading(false)
  }, [inicio, fim])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  // Realtime: atualiza dashboard quando fretes mudam
  useEffect(() => {
    const channel = supabase
      .channel('tp_dashboard_fretes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tp_fretes' }, () => {
        fetchDashboard()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tp_fretes' }, () => {
        fetchDashboard()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tp_fretes' }, () => {
        fetchDashboard()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchDashboard])

  // Realtime: atualiza dashboard quando gastos mudam
  useEffect(() => {
    const channel = supabase
      .channel('tp_dashboard_gastos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tp_gastos' }, () => {
        fetchDashboard()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tp_gastos' }, () => {
        fetchDashboard()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tp_gastos' }, () => {
        fetchDashboard()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchDashboard])

  return { data, loading }
}
