import { useState, useEffect, useMemo } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { FreteList } from '@/components/fretes/FreteList'
import { FreteFilters } from '@/components/fretes/FreteFilters'
import { useFretes } from '@/hooks/useFretes'
import { supabase } from '@/lib/supabase'
import { getWeekRange, formatWeekRange, addWeeks } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Motorista } from '@/types/database'

export function FretesPage() {
  const [motorista_id, setMotoristaId] = useState('')
  const [weekDate, setWeekDate] = useState(new Date())
  const [motoristas, setMotoristas] = useState<Motorista[]>([])

  const week = useMemo(() => getWeekRange(weekDate), [weekDate])

  const { fretes, loading } = useFretes({
    motorista_id: motorista_id || undefined,
    dataInicio: week.inicio,
    dataFim: week.fim,
  })

  useEffect(() => {
    supabase.from('tp_motoristas').select('*').order('nome').then(({ data }) => {
      if (data) setMotoristas(data)
    })
  }, [])

  return (
    <PageContainer title="Fretes">
      {/* Week navigator */}
      <div className="mb-4">
        <div className="flex items-center justify-between bg-white rounded-xl px-2 py-1 shadow-sm border border-slate-100">
          <button
            onClick={() => setWeekDate(addWeeks(weekDate, -1))}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <h2 className="text-base font-bold text-slate-800">
            {formatWeekRange(week.inicio, week.fim)}
          </h2>
          <button
            onClick={() => setWeekDate(addWeeks(weekDate, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronRight size={20} className="text-slate-500" />
          </button>
        </div>
      </div>

      <FreteFilters
        motoristas={motoristas}
        motorista_id={motorista_id}
        onMotoristaChange={setMotoristaId}
      />
      <div className="text-xs text-slate-400 mb-2">{fretes.length} fretes</div>
      <FreteList fretes={fretes} loading={loading} />
    </PageContainer>
  )
}
