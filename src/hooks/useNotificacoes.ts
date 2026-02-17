import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { FreteWithRelations } from '@/types/database'

export interface Notificacao {
  id: string
  tipo: 'novo_frete' | 'erro'
  titulo: string
  mensagem: string
  url: string
  lida: boolean
  created_at: string
}

const STORAGE_KEY = 'tp_notificacoes_lidas'
const INIT_KEY = 'tp_notificacoes_init'
const MAX_NOTIFICACOES = 30

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function isInitialized(): boolean {
  return localStorage.getItem(INIT_KEY) === '1'
}

function saveReadIds(ids: Set<string>) {
  // Keep only last 100 IDs to avoid bloat
  const arr = [...ids].slice(-100)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
}

function freteToNotificacao(frete: FreteWithRelations): Notificacao {
  const terminal = frete.tp_terminais?.codigo || '?'
  const motorista = frete.tp_motoristas?.nome || '?'
  const valor = frete.valor_liquido?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || ''
  return {
    id: frete.id,
    tipo: 'novo_frete',
    titulo: `${motorista} — ${terminal}`,
    mensagem: `${frete.container || 'S/N'} — ${valor}`,
    url: `/fretes/${frete.id}`,
    lida: false,
    created_at: frete.created_at,
  }
}

export function useNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)

  const fetchRecentes = useCallback(async () => {
    const { data } = await supabase
      .from('tp_fretes')
      .select('*, tp_motoristas(id, nome), tp_veiculos(id, placa), tp_terminais(id, codigo, nome)')
      .order('created_at', { ascending: false })
      .limit(MAX_NOTIFICACOES)

    if (!data) return

    const readIds = getReadIds()
    const firstTime = !isInitialized()

    // On first load, mark all existing fretes as read
    if (firstTime) {
      data.forEach((f: FreteWithRelations) => readIds.add(f.id))
      saveReadIds(readIds)
      localStorage.setItem(INIT_KEY, '1')
    }

    const notifs = (data as FreteWithRelations[]).map(f => {
      const n = freteToNotificacao(f)
      n.lida = readIds.has(n.id)
      return n
    })

    setNotificacoes(notifs)
    setNaoLidas(notifs.filter(n => !n.lida).length)
  }, [])

  useEffect(() => { fetchRecentes() }, [fetchRecentes])

  // Realtime: new fretes trigger refetch
  useEffect(() => {
    const channel = supabase
      .channel('tp_notif_fretes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tp_fretes' }, () => {
        fetchRecentes()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchRecentes])

  const marcarLida = useCallback((id: string) => {
    const readIds = getReadIds()
    readIds.add(id)
    saveReadIds(readIds)
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
    setNaoLidas(prev => Math.max(0, prev - 1))
  }, [])

  const marcarTodasLidas = useCallback(() => {
    const readIds = getReadIds()
    notificacoes.forEach(n => readIds.add(n.id))
    saveReadIds(readIds)
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
    setNaoLidas(0)
  }, [notificacoes])

  return { notificacoes, naoLidas, marcarLida, marcarTodasLidas }
}
