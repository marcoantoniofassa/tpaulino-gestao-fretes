import { useState, useMemo } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { GastoCard } from '@/components/gastos/GastoCard'
import { GastoForm } from '@/components/gastos/GastoForm'
import { GastoFilters } from '@/components/gastos/GastoFilters'
import { Spinner } from '@/components/ui/Spinner'
import { useGastos } from '@/hooks/useGastos'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Receipt, Clock, CheckCircle } from 'lucide-react'

export function GastosPage() {
  const now = new Date()
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [statusFilter, setStatusFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState('')

  const filters = useMemo(() => ({
    mes,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(tipoFilter ? { tipo: tipoFilter } : {}),
  }), [mes, statusFilter, tipoFilter])

  const { gastos, loading } = useGastos(filters)

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
    const pendentesArr = gastos.filter(g => g.status === 'PENDENTE')
    const pagosArr = gastos.filter(g => g.status === 'PAGO')
    return {
      total,
      totalPendente: pendentesArr.reduce((sum, g) => sum + g.valor, 0),
      totalPago: pagosArr.reduce((sum, g) => sum + g.valor, 0),
      countPendente: pendentesArr.length,
      countPago: pagosArr.length,
    }
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

      {/* Summary cards: 3 columns */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="gradient-red rounded-2xl p-3 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-white/70 uppercase tracking-wide">Total</span>
            <span className="p-1 rounded-lg bg-white/20"><Receipt size={14} /></span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(resumo.total)}</p>
        </div>
        <div className="gradient-amber rounded-2xl p-3 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-white/70 uppercase tracking-wide">Pendente</span>
            <span className="p-1 rounded-lg bg-white/20"><Clock size={14} /></span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(resumo.totalPendente)}</p>
          <p className="text-[10px] text-white/70">{resumo.countPendente} itens</p>
        </div>
        <div className="gradient-green rounded-2xl p-3 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-white/70 uppercase tracking-wide">Pago</span>
            <span className="p-1 rounded-lg bg-white/20"><CheckCircle size={14} /></span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(resumo.totalPago)}</p>
          <p className="text-[10px] text-white/70">{resumo.countPago} itens</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <GastoFilters
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          tipoFilter={tipoFilter}
          onTipoChange={setTipoFilter}
        />
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
          <p className="text-sm">Nenhuma despesa encontrada</p>
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
