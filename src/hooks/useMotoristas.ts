import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Motorista } from '@/types/database'

export function useMotoristas() {
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('tp_motoristas')
        .select('*')
        .order('nome')

      if (error) {
        console.error('Error fetching motoristas:', error)
      } else {
        setMotoristas(data as Motorista[])
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { motoristas, loading }
}

export interface MotoristaStats {
  motorista: Motorista
  totalFretes: number
  receitaLiquida: number
  ultimoFrete: string | null
}

export function useMotoristasWithStats() {
  const [stats, setStats] = useState<MotoristaStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data: motoristas } = await supabase
        .from('tp_motoristas')
        .select('*')
        .order('nome')

      if (!motoristas) { setLoading(false); return }

      const statsPromises = (motoristas as Motorista[]).map(async (m) => {
        const { data: fretes } = await supabase
          .from('tp_fretes')
          .select('valor_liquido, data_frete')
          .eq('motorista_id', m.id)
          .order('data_frete', { ascending: false })

        const rows = (fretes ?? []) as { valor_liquido: number; data_frete: string }[]

        return {
          motorista: m,
          totalFretes: rows.length,
          receitaLiquida: rows.reduce((sum, f) => sum + f.valor_liquido, 0),
          ultimoFrete: rows[0]?.data_frete ?? null,
        }
      })

      setStats(await Promise.all(statsPromises))
      setLoading(false)
    }
    fetch()
  }, [])

  return { stats, loading }
}
