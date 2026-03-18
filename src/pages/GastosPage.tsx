import { useState, useMemo } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { GastoCard } from '@/components/gastos/GastoCard'
import { GastoForm } from '@/components/gastos/GastoForm'
import { GastoFilters } from '@/components/gastos/GastoFilters'
import { Spinner } from '@/components/ui/Spinner'
import { useGastos } from '@/hooks/useGastos'
import { formatCurrency, getWeekRange, formatWeekRange, addWeeks } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Receipt, Clock, CheckCircle, Fuel, Droplets } from 'lucide-react'
import type { GastoWithRelations } from '@/types/database'

type ViewMode = 'todos' | 'diesel'

interface WeekGroup {
  label: string
  inicio: string
  fim: string
  gastos: GastoWithRelations[]
  totalValor: number
  totalLitros: number
  count: number
  isCurrent: boolean
}

export function GastosPage() {
  const now = new Date()
  const [viewMode, setViewMode] = useState<ViewMode>('todos')
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [weekDate, setWeekDate] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState('')

  const weekRange = useMemo(() => getWeekRange(weekDate), [weekDate])

  const filters = useMemo(() => {
    if (viewMode === 'diesel') {
      return {
        tipo: 'ABASTECIMENTO',
        semanaInicio: weekRange.inicio,
        semanaFim: weekRange.fim,
        ...(statusFilter ? { status: statusFilter } : {}),
      }
    }
    return {
      mes,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(tipoFilter ? { tipo: tipoFilter } : {}),
    }
  }, [viewMode, mes, weekRange.inicio, weekRange.fim, statusFilter, tipoFilter])

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

  // Resumo for "Todos" view
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

  // Diesel weekly summary
  const dieselResumo = useMemo(() => {
    if (viewMode !== 'diesel') return null
    const totalLitros = gastos.reduce((sum, g) => sum + (g.litros || 0), 0)
    const totalValor = gastos.reduce((sum, g) => sum + g.valor, 0)
    const count = gastos.length
    const currentWeek = getWeekRange(new Date())
    const isCurrent = weekRange.inicio === currentWeek.inicio
    return { totalLitros, totalValor, count, isCurrent }
  }, [gastos, viewMode, weekRange.inicio])

  // Group gastos by week (for diesel view, all are same week; kept for future monthly diesel view)
  const weekGroups = useMemo((): WeekGroup[] => {
    if (viewMode !== 'diesel' || gastos.length === 0) return []
    const currentWeek = getWeekRange(new Date())
    const isCurrent = weekRange.inicio === currentWeek.inicio
    return [{
      label: formatWeekRange(weekRange.inicio, weekRange.fim),
      inicio: weekRange.inicio,
      fim: weekRange.fim,
      gastos,
      totalValor: gastos.reduce((sum, g) => sum + g.valor, 0),
      totalLitros: gastos.reduce((sum, g) => sum + (g.litros || 0), 0),
      count: gastos.length,
      isCurrent,
    }]
  }, [gastos, viewMode, weekRange])

  return (
    <PageContainer>
      {/* Toggle Diesel / Todos */}
      <div className="flex bg-white rounded-xl p-1 shadow-sm border border-slate-100 mb-4">
        <button
          onClick={() => setViewMode('todos')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'todos' ? 'bg-tp-blue text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setViewMode('diesel')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            viewMode === 'diesel' ? 'bg-green-600 text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          <Fuel size={14} />
          Diesel
        </button>
      </div>

      {/* Period navigator */}
      {viewMode === 'todos' ? (
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
      ) : (
        <div className="mb-4">
          <div className="flex items-center justify-between bg-white rounded-xl px-2 py-1 shadow-sm border border-slate-100">
            <button onClick={() => setWeekDate(addWeeks(weekDate, -1))} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronLeft size={20} className="text-slate-500" />
            </button>
            <div className="text-center">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Periodo Semanal</p>
              <h2 className="text-base font-bold text-slate-800">{formatWeekRange(weekRange.inicio, weekRange.fim)}</h2>
            </div>
            <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronRight size={20} className="text-slate-500" />
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {viewMode === 'todos' ? (
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
      ) : dieselResumo && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="gradient-green rounded-2xl p-3 text-white shadow-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-white/70 uppercase tracking-wide">Total</span>
              <span className="p-1 rounded-lg bg-white/20"><Receipt size={14} /></span>
            </div>
            <p className="text-lg font-bold">{formatCurrency(dieselResumo.totalValor)}</p>
            <p className="text-[10px] text-white/70">{dieselResumo.count} abastec.</p>
          </div>
          <div className="gradient-blue rounded-2xl p-3 text-white shadow-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-white/70 uppercase tracking-wide">Litros</span>
              <span className="p-1 rounded-lg bg-white/20"><Droplets size={14} /></span>
            </div>
            <p className="text-lg font-bold">{dieselResumo.totalLitros.toFixed(1)}L</p>
          </div>
          <div className={`${dieselResumo.isCurrent ? 'gradient-amber' : 'gradient-dark'} rounded-2xl p-3 text-white shadow-lg`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-white/70 uppercase tracking-wide">Status</span>
              <span className="p-1 rounded-lg bg-white/20">
                {dieselResumo.isCurrent ? <Clock size={14} /> : <CheckCircle size={14} />}
              </span>
            </div>
            <p className="text-sm font-bold mt-1">
              {dieselResumo.isCurrent ? 'Aberta' : 'Fechada'}
            </p>
          </div>
        </div>
      )}

      {/* Filters (only in Todos view) */}
      {viewMode === 'todos' && (
        <div className="mb-4">
          <GastoFilters
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            tipoFilter={tipoFilter}
            onTipoChange={setTipoFilter}
          />
        </div>
      )}

      {/* Status filter pills for diesel view */}
      {viewMode === 'diesel' && (
        <div className="flex gap-2 mb-4">
          {[
            { value: '', label: 'Todos' },
            { value: 'PENDENTE', label: 'Pendentes' },
            { value: 'PAGO', label: 'Pagos' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Form (only in Todos view) */}
      {viewMode === 'todos' && (
        <div className="mb-4">
          <GastoForm />
        </div>
      )}

      {/* List */}
      {loading ? (
        <Spinner />
      ) : gastos.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          {viewMode === 'diesel' ? (
            <>
              <Fuel size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum abastecimento nesta semana</p>
            </>
          ) : (
            <>
              <Receipt size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma despesa encontrada</p>
            </>
          )}
        </div>
      ) : viewMode === 'diesel' ? (
        /* Diesel view: cards with week header */
        <div>
          {weekGroups.map(group => (
            <div key={group.inicio}>
              {/* Week separator with subtotal */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-xl mb-3 ${
                group.isCurrent ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'
              }`}>
                <div>
                  <p className="text-xs font-semibold text-slate-600">{group.label}</p>
                  <p className="text-[10px] text-slate-400">{group.count} abastec.</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(group.totalValor)}</p>
                  <p className="text-[10px] text-slate-400">{group.totalLitros.toFixed(1)}L</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {group.gastos.map(g => (
                  <GastoCard key={g.id} gasto={g} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Todos view: flat list */
        <div className="flex flex-col gap-3">
          {gastos.map(g => (
            <GastoCard key={g.id} gasto={g} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
