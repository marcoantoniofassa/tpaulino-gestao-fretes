import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadPhoto } from '@/lib/storage'
import type { GastoWithRelations } from '@/types/database'

interface GastosFilter {
  tipo?: string
  veiculo_id?: string
  mes?: string // YYYY-MM
}

export function useGastos(filters?: GastosFilter) {
  const [gastos, setGastos] = useState<GastoWithRelations[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGastos = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tp_gastos')
      .select('*, tp_veiculos(id, placa)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    if (filters?.tipo) {
      query = query.eq('tipo', filters.tipo)
    }
    if (filters?.veiculo_id) {
      query = query.eq('veiculo_id', filters.veiculo_id)
    }
    if (filters?.mes) {
      const inicioMes = `${filters.mes}-01`
      const [y, m] = filters.mes.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const fimMes = `${filters.mes}-${String(lastDay).padStart(2, '0')}`
      query = query.gte('data', inicioMes).lte('data', fimMes)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching gastos:', error)
    } else {
      setGastos((data ?? []) as GastoWithRelations[])
    }
    setLoading(false)
  }, [filters?.tipo, filters?.veiculo_id, filters?.mes])

  useEffect(() => { fetchGastos() }, [fetchGastos])

  useEffect(() => {
    const channel = supabase
      .channel('tp_gastos_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tp_gastos' }, () => {
        fetchGastos()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tp_gastos' }, () => {
        fetchGastos()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tp_gastos' }, () => {
        fetchGastos()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchGastos])

  return { gastos, loading, refetch: fetchGastos }
}

export async function createGasto(
  gasto: {
    data: string
    tipo: string
    valor: number
    veiculo_id?: string | null
    descricao?: string | null
    vencimento?: string | null
    forma_pagamento: string
    dados_pagamento?: string | null
  },
  foto?: File | null
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('tp_gastos')
    .insert({
      data: gasto.data,
      tipo: gasto.tipo,
      valor: gasto.valor,
      veiculo_id: gasto.veiculo_id || null,
      descricao: gasto.descricao || null,
      vencimento: gasto.vencimento || null,
      forma_pagamento: gasto.forma_pagamento,
      dados_pagamento: gasto.dados_pagamento || null,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('Error creating gasto:', error)
    return null
  }

  if (foto) {
    const fotoUrl = await uploadPhoto(foto, 'gastos', data.id)
    if (fotoUrl) {
      await supabase.from('tp_gastos').update({ foto_url: fotoUrl }).eq('id', data.id)
    }
  }

  return data
}

export async function toggleGastoStatus(id: string, currentStatus: string) {
  const newStatus = currentStatus === 'PAGO' ? 'PENDENTE' : 'PAGO'
  const { error } = await supabase.from('tp_gastos').update({ status: newStatus }).eq('id', id)
  if (error) console.error('Error toggling gasto status:', error)
}

export async function deleteGasto(id: string) {
  const { error } = await supabase.from('tp_gastos').delete().eq('id', id)
  if (error) console.error('Error deleting gasto:', error)
}
