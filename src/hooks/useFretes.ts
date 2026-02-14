import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { FreteWithRelations } from '@/types/database'

interface FretesFilter {
  motorista_id?: string
  terminal_id?: string
  dataInicio?: string
  dataFim?: string
}

export function useFretes(filters?: FretesFilter) {
  const [fretes, setFretes] = useState<FreteWithRelations[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFretes = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tp_fretes')
      .select(`
        *,
        tp_motoristas(id, nome),
        tp_veiculos(id, placa),
        tp_terminais(id, codigo, nome)
      `)
      .order('data_frete', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    if (filters?.motorista_id) {
      query = query.eq('motorista_id', filters.motorista_id)
    }
    if (filters?.terminal_id) {
      query = query.eq('terminal_id', filters.terminal_id)
    }
    if (filters?.dataInicio) {
      query = query.gte('data_frete', filters.dataInicio)
    }
    if (filters?.dataFim) {
      query = query.lte('data_frete', filters.dataFim)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching fretes:', error)
    } else {
      setFretes((data ?? []) as FreteWithRelations[])
    }
    setLoading(false)
  }, [filters?.motorista_id, filters?.terminal_id, filters?.dataInicio, filters?.dataFim])

  useEffect(() => {
    fetchFretes()
  }, [fetchFretes])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('tp_fretes_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tp_fretes' }, () => {
        fetchFretes()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tp_fretes' }, () => {
        fetchFretes()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchFretes])

  return { fretes, loading, refetch: fetchFretes }
}

export function useFrete(id: string | undefined) {
  const [frete, setFrete] = useState<FreteWithRelations | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    async function fetchFrete() {
      const { data, error } = await supabase
        .from('tp_fretes')
        .select(`
          *,
          tp_motoristas(id, nome),
          tp_veiculos(id, placa),
          tp_terminais(id, codigo, nome)
        `)
        .eq('id', id)
        .single()

      if (error) {
        console.error('Error fetching frete:', error)
      } else {
        setFrete(data as FreteWithRelations)
      }
      setLoading(false)
    }
    fetchFrete()
  }, [id])

  return { frete, loading }
}
