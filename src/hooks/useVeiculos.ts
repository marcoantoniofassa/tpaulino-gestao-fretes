import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Veiculo, Motorista } from '@/types/database'

export interface VeiculoWithMotorista extends Veiculo {
  tp_motoristas: Pick<Motorista, 'id' | 'nome'> | null
}

export function useVeiculos() {
  const [veiculos, setVeiculos] = useState<VeiculoWithMotorista[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('tp_veiculos')
        .select('*, tp_motoristas(id, nome)')
        .order('placa')

      if (error) {
        console.error('Error fetching veiculos:', error)
      } else {
        setVeiculos(data as VeiculoWithMotorista[])
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { veiculos, loading }
}
