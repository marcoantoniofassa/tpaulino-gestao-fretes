import { useState } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { KPIGrid } from '@/components/dashboard/KPIGrid'
import { RevenueTimeline, FretesByTerminal, FretesByDriver } from '@/components/dashboard/Charts'
import { FreteCard } from '@/components/fretes/FreteCard'
import { Spinner } from '@/components/ui/Spinner'
import { useDashboard } from '@/hooks/useDashboard'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

export function DashboardPage() {
  const now = new Date()
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const { data, loading } = useDashboard(mes)

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

  return (
    <PageContainer>
      {/* Month selector */}
      <div className="mb-5">
        <p className="text-sm text-slate-400 flex items-center gap-1.5">
          <Calendar size={14} />
          {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <div className="flex items-center justify-between mt-2 bg-white rounded-xl px-2 py-1 shadow-sm border border-slate-100">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <h2 className="text-base font-bold text-slate-800 capitalize">{mesLabel}</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronRight size={20} className="text-slate-500" />
          </button>
        </div>
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
          />

          <div className="mt-5 space-y-4">
            <RevenueTimeline data={data.receitaPorDia} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FretesByTerminal data={data.fretesPorTerminal} />
              <FretesByDriver data={data.fretesPorMotorista} />
            </div>
          </div>

          {data.ultimosFretes.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Ultimos Fretes</h3>
              <div className="flex flex-col gap-3">
                {data.ultimosFretes.map(f => (
                  <FreteCard key={f.id} frete={f} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}
