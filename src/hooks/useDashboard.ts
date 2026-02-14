import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { FreteWithRelations } from '@/types/database'

interface DashboardData {
  totalFretes: number
  receitaLiquida: number
  mediaDiaria: number
  fretesHoje: number
  fretesPorTerminal: { terminal: string; count: number; receita: number }[]
  fretesPorMotorista: { motorista: string; count: number; receita: number }[]
  receitaPorDia: { data: string; receita: number; fretes: number }[]
  ultimosFretes: FreteWithRelations[]
}

export function useDashboard(mes?: string) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const now = new Date()
      const mesAtual = mes || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const inicioMes = `${mesAtual}-01`
      const fimMes = `${mesAtual}-31`
      const hoje = now.toISOString().split('T')[0]

      // Fetch fretes do mes
      const { data: fretes } = await supabase
        .from('tp_fretes')
        .select('*, tp_motoristas(id, nome), tp_veiculos(id, placa), tp_terminais(id, codigo, nome)')
        .gte('data_frete', inicioMes)
        .lte('data_frete', fimMes)
        .order('data_frete', { ascending: false })

      if (!fretes) { setLoading(false); return }

      const fretesTyped = fretes as FreteWithRelations[]

      // KPIs
      const totalFretes = fretesTyped.length
      const receitaLiquida = fretesTyped.reduce((sum, f) => sum + f.valor_liquido, 0)
      const diasUnicos = new Set(fretesTyped.map(f => f.data_frete)).size
      const mediaDiaria = diasUnicos > 0 ? receitaLiquida / diasUnicos : 0
      const fretesHoje = fretesTyped.filter(f => f.data_frete === hoje).length

      // Por terminal
      const terminalMap = new Map<string, { count: number; receita: number }>()
      fretesTyped.forEach(f => {
        const key = f.tp_terminais?.codigo || 'N/A'
        const curr = terminalMap.get(key) || { count: 0, receita: 0 }
        terminalMap.set(key, { count: curr.count + 1, receita: curr.receita + f.valor_liquido })
      })
      const fretesPorTerminal = Array.from(terminalMap.entries()).map(([terminal, v]) => ({
        terminal,
        ...v,
      }))

      // Por motorista
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

      // Por dia
      const diaMap = new Map<string, { receita: number; fretes: number }>()
      fretesTyped.forEach(f => {
        const curr = diaMap.get(f.data_frete) || { receita: 0, fretes: 0 }
        diaMap.set(f.data_frete, { receita: curr.receita + f.valor_liquido, fretes: curr.fretes + 1 })
      })
      const receitaPorDia = Array.from(diaMap.entries())
        .map(([data, v]) => ({ data, ...v }))
        .sort((a, b) => a.data.localeCompare(b.data))

      setData({
        totalFretes,
        receitaLiquida,
        mediaDiaria,
        fretesHoje,
        fretesPorTerminal,
        fretesPorMotorista,
        receitaPorDia,
        ultimosFretes: fretesTyped.slice(0, 5),
      })
      setLoading(false)
    }
    fetch()
  }, [mes])

  return { data, loading }
}
