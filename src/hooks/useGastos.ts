import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadPhoto } from '@/lib/storage'
import type { GastoWithRelations, GastoParcela } from '@/types/database'

interface GastosFilter {
  tipo?: string
  veiculo_id?: string
  mes?: string // YYYY-MM
  status?: string // PAGO | PENDENTE
  semanaInicio?: string // YYYY-MM-DD
  semanaFim?: string // YYYY-MM-DD
}

export interface ParcelaInput {
  numero: number
  total_parcelas: number
  valor: number
  vencimento: string | null
  forma_pagamento: string
  dados_pagamento: string | null
}

export function useGastos(filters?: GastosFilter) {
  const [gastos, setGastos] = useState<GastoWithRelations[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGastos = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tp_gastos')
      .select('*, tp_veiculos(id, placa), tp_gasto_parcelas(*)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    if (filters?.tipo) {
      query = query.eq('tipo', filters.tipo)
    }
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.veiculo_id) {
      query = query.eq('veiculo_id', filters.veiculo_id)
    }
    if (filters?.semanaInicio && filters?.semanaFim) {
      query = query.gte('data', filters.semanaInicio).lte('data', filters.semanaFim)
    } else if (filters?.mes) {
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
      // Sort parcelas by numero
      const gastosData = (data ?? []) as GastoWithRelations[]
      for (const g of gastosData) {
        if (g.tp_gasto_parcelas && g.tp_gasto_parcelas.length > 0) {
          g.tp_gasto_parcelas.sort((a, b) => a.numero - b.numero)
        }
      }
      setGastos(gastosData)
    }
    setLoading(false)
  }, [filters?.tipo, filters?.status, filters?.veiculo_id, filters?.mes, filters?.semanaInicio, filters?.semanaFim])

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

    // Also listen to parcelas changes
    const parcelasChannel = supabase
      .channel('tp_gasto_parcelas_changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tp_gasto_parcelas' }, () => {
        fetchGastos()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(parcelasChannel)
    }
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
    litros?: number | null
    preco_litro?: number | null
    km_odometro?: number | null
  },
  foto?: File | null,
  parcelas?: ParcelaInput[]
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
      litros: gasto.litros ?? null,
      preco_litro: gasto.preco_litro ?? null,
      km_odometro: gasto.km_odometro ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('Error creating gasto:', error)
    return null
  }

  // Insert parcelas if provided
  if (parcelas && parcelas.length > 0) {
    const parcelasRows = parcelas.map(p => ({
      gasto_id: data.id,
      numero: p.numero,
      total_parcelas: p.total_parcelas,
      valor: p.valor,
      vencimento: p.vencimento || null,
      forma_pagamento: p.forma_pagamento,
      dados_pagamento: p.dados_pagamento || null,
    }))

    const { error: parcelasError } = await supabase
      .from('tp_gasto_parcelas')
      .insert(parcelasRows)

    if (parcelasError) {
      console.error('Error creating parcelas:', parcelasError)
    }
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

export async function toggleParcelaStatus(parcela: GastoParcela) {
  const newStatus = parcela.status === 'PAGO' ? 'PENDENTE' : 'PAGO'

  // Update parcela status
  const { error } = await supabase
    .from('tp_gasto_parcelas')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', parcela.id)

  if (error) {
    console.error('Error toggling parcela status:', error)
    return
  }

  // Fetch all parcelas for this gasto to derive parent status
  const { data: allParcelas, error: fetchError } = await supabase
    .from('tp_gasto_parcelas')
    .select('status')
    .eq('gasto_id', parcela.gasto_id)

  if (fetchError || !allParcelas) {
    console.error('Error fetching parcelas:', fetchError)
    return
  }

  // Parent is PAGO only when ALL parcelas are PAGO
  const allPago = allParcelas.every(p => p.status === 'PAGO')
  const parentStatus = allPago ? 'PAGO' : 'PENDENTE'

  const { error: parentError } = await supabase
    .from('tp_gastos')
    .update({ status: parentStatus })
    .eq('id', parcela.gasto_id)

  if (parentError) console.error('Error updating parent gasto status:', parentError)
}

export async function updateGasto(
  id: string,
  fields: {
    litros?: number | null
    preco_litro?: number | null
    km_odometro?: number | null
    valor?: number
    descricao?: string | null
  }
): Promise<boolean> {
  const { error } = await supabase.from('tp_gastos').update(fields).eq('id', id)
  if (error) {
    console.error('Error updating gasto:', error)
    return false
  }
  return true
}

export async function deleteGasto(id: string) {
  const { error } = await supabase.from('tp_gastos').delete().eq('id', id)
  if (error) console.error('Error deleting gasto:', error)
}
