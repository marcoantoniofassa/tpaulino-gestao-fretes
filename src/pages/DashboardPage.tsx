import { useState, useMemo } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { KPIGrid } from '@/components/dashboard/KPIGrid'
import { RevenueTimeline, FretesByDriver } from '@/components/dashboard/Charts'
import { Spinner } from '@/components/ui/Spinner'
import { useDashboard } from '@/hooks/useDashboard'
import { getWeekRange, formatWeekRange, addWeeks } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

type ViewMode = 'mes' | 'semana'

export function DashboardPage() {
  const now = new Date()
  const [viewMode, setViewMode] = useState<ViewMode>('mes')
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [weekDate, setWeekDate] = useState(new Date())

  const range = useMemo(() => {
    if (viewMode === 'semana') {
      return getWeekRange(weekDate)
    }
    const inicioMes = `${mes}-01`
    const [y, m] = mes.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const fimMes = `${mes}-${String(lastDay).padStart(2, '0')}`
    return { inicio: inicioMes, fim: fimMes }
  }, [viewMode, mes, weekDate])

  const { data, loading } = useDashboard(range.inicio, range.fim)

  const mesLabel = new Date(mes + '-01T12:00:00').toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })

  function prevMonth() {
    const d = new Date(mes + '-01T12:00:00')
    d.setMonth(d.getMonth() - 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  function nextMonth() {
    const d = new Date(mes + '-01T12:00:00')
    d.setMonth(d.getMonth() + 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const week = useMemo(() => getWeekRange(weekDate), [weekDate])

  return (
    <PageContainer>
      {/* Today */}
      <div className="mb-3">
        <p className="text-sm text-slate-400 flex items-center gap-1.5">
          <Calendar size={14} />
          {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Toggle Mes / Semana */}
      <div className="flex bg-white rounded-xl p-1 shadow-sm border border-slate-100 mb-4">
        <button
          onClick={() => setViewMode('mes')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'mes' ? 'bg-tp-blue text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          Mes
        </button>
        <button
          onClick={() => setViewMode('semana')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'semana' ? 'bg-tp-blue text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          Semana
        </button>
      </div>

      {/* Period navigator */}
      <div className="mb-5">
        {viewMode === 'mes' ? (
          <div className="flex items-center justify-between bg-white rounded-xl px-2 py-1 shadow-sm border border-slate-100">
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronLeft size={20} className="text-slate-500" />
            </button>
            <h2 className="text-base font-bold text-slate-800 capitalize">{mesLabel}</h2>
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronRight size={20} className="text-slate-500" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-white rounded-xl px-2 py-1 shadow-sm border border-slate-100">
            <button onClick={() => setWeekDate(addWeeks(weekDate, -1))} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronLeft size={20} className="text-slate-500" />
            </button>
            <h2 className="text-base font-bold text-slate-800">
              {formatWeekRange(week.inicio, week.fim)}
            </h2>
            <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronRight size={20} className="text-slate-500" />
            </button>
          </div>
        )}
      </div>

      {loading || !data ? (
        <Spinner />
      ) : (
        <>
          <KPIGrid
            totalFretes={data.totalFretes}
            receitaLiquida={data.receitaLiquida}
            mediaDiaria={data.mediaDiaria}
            fretesHoje={data.fretesHoje}
            totalGastos={data.totalGastos}
            lucro={data.lucro}
            periodLabel={viewMode === 'mes' ? 'Mes' : 'Semana'}
          />

          <div className="mt-5 space-y-4">
            <RevenueTimeline data={data.receitaPorDia} />
            <FretesByDriver data={data.fretesPorMotorista} />
          </div>
        </>
      )}
    </PageContainer>
  )
}
