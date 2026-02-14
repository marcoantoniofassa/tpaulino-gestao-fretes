import { useState } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { KPIGrid } from '@/components/dashboard/KPIGrid'
import { RevenueTimeline, FretesByTerminal, FretesByDriver } from '@/components/dashboard/Charts'
import { FreteCard } from '@/components/fretes/FreteCard'
import { Spinner } from '@/components/ui/Spinner'
import { useDashboard } from '@/hooks/useDashboard'

export function DashboardPage() {
  const now = new Date()
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const { data, loading } = useDashboard(mes)

  if (loading || !data) return <PageContainer><Spinner /></PageContainer>

  return (
    <PageContainer>
      {/* Month selector */}
      <div className="mb-4">
        <input
          type="month"
          value={mes}
          onChange={e => setMes(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-tp-blue"
        />
      </div>

      <KPIGrid
        totalFretes={data.totalFretes}
        receitaLiquida={data.receitaLiquida}
        mediaDiaria={data.mediaDiaria}
        fretesHoje={data.fretesHoje}
      />

      <div className="mt-4 space-y-4">
        <RevenueTimeline data={data.receitaPorDia} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FretesByTerminal data={data.fretesPorTerminal} />
          <FretesByDriver data={data.fretesPorMotorista} />
        </div>
      </div>

      {/* Ultimos fretes */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Ultimos Fretes</h3>
        <div className="flex flex-col gap-3">
          {data.ultimosFretes.map(f => (
            <FreteCard key={f.id} frete={f} />
          ))}
        </div>
      </div>
    </PageContainer>
  )
}
