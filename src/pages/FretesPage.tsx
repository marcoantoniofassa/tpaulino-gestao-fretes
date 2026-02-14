import { useState, useEffect } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { FreteList } from '@/components/fretes/FreteList'
import { FreteFilters } from '@/components/fretes/FreteFilters'
import { useFretes } from '@/hooks/useFretes'
import { supabase } from '@/lib/supabase'
import type { Motorista, Terminal } from '@/types/database'

export function FretesPage() {
  const [motorista_id, setMotoristaId] = useState('')
  const [terminal_id, setTerminalId] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [terminais, setTerminais] = useState<Terminal[]>([])

  const { fretes, loading } = useFretes({
    motorista_id: motorista_id || undefined,
    terminal_id: terminal_id || undefined,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
  })

  useEffect(() => {
    supabase.from('tp_motoristas').select('*').order('nome').then(({ data }) => {
      if (data) setMotoristas(data)
    })
    supabase.from('tp_terminais').select('*').order('codigo').then(({ data }) => {
      if (data) setTerminais(data)
    })
  }, [])

  return (
    <PageContainer title="Fretes">
      <FreteFilters
        motoristas={motoristas}
        terminais={terminais}
        motorista_id={motorista_id}
        terminal_id={terminal_id}
        dataInicio={dataInicio}
        dataFim={dataFim}
        onMotoristaChange={setMotoristaId}
        onTerminalChange={setTerminalId}
        onDataInicioChange={setDataInicio}
        onDataFimChange={setDataFim}
      />
      <div className="text-xs text-slate-400 mb-2">{fretes.length} fretes</div>
      <FreteList fretes={fretes} loading={loading} />
    </PageContainer>
  )
}
