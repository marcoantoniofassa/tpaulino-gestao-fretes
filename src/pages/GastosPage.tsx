import { useState, useMemo } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { GastoCard } from '@/components/gastos/GastoCard'
import { GastoForm } from '@/components/gastos/GastoForm'
import { Spinner } from '@/components/ui/Spinner'
import { useGastos } from '@/hooks/useGastos'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Receipt, Clock } from 'lucide-react'

export function GastosPage() {
  const now = new Date()
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const { gastos, loading } = useGastos({ mes })

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

  const resumo = useMemo(() => {
    const total = gastos.reduce((sum, g) => sum + g.valor, 0)
    const pendentes = gastos.filter(g => g.status === 'PENDENTE').length
    return { total, pendentes }
  }, [gastos])

  return (
    <PageContainer>
      {/* Month selector */}
      <div className="mb-4">
        <div className="flex items-center justify-between bg-white rounded-xl px-2 py-1 shadow-sm border border-slate-100">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <h2 className="text-base font-bold text-slate-800 capitalize">{mesLabel}</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronRight size={20} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="gradient-red rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-white/70 uppercase tracking-wide">Total Despesas</span>
            <span className="p-1.5 rounded-lg bg-white/20"><Receipt size={16} /></span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(resumo.total)}</p>
        </div>
        <div className="gradient-amber rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-white/70 uppercase tracking-wide">Pendentes</span>
            <span className="p-1.5 rounded-lg bg-white/20"><Clock size={16} /></span>
          </div>
          <p className="text-2xl font-bold">{resumo.pendentes}</p>
        </div>
      </div>

      {/* Form */}
      <div className="mb-4">
        <GastoForm />
      </div>

      {/* List */}
      {loading ? (
        <Spinner />
      ) : gastos.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Receipt size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma despesa neste mes</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {gastos.map(g => (
            <GastoCard key={g.id} gasto={g} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
