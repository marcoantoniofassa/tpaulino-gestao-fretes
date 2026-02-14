import { useState } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { Spinner } from '@/components/ui/Spinner'
import { usePagamentos } from '@/hooks/usePagamentos'
import { formatCurrency, formatWeekRange, getWeekRange, addWeeks } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CheckCircle, Clock, Wallet } from 'lucide-react'

export function PagamentosPage() {
  const [weekDate, setWeekDate] = useState(new Date())
  const { inicio, fim } = getWeekRange(weekDate)
  const { motoristas, totalComissao, totalPago, loading, togglePagamento } = usePagamentos(inicio, fim)

  return (
    <PageContainer>
      {/* Week navigator */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setWeekDate(addWeeks(weekDate, -1))}
            className="p-2 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <div className="text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Fechamento Semanal</p>
            <h2 className="text-lg font-bold text-slate-800">{formatWeekRange(inicio, fim)}</h2>
          </div>
          <button
            onClick={() => setWeekDate(addWeeks(weekDate, 1))}
            className="p-2 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <ChevronRight size={20} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="gradient-amber rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={14} className="text-white/70" />
            <span className="text-[11px] text-white/70 uppercase">Total Comissao</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalComissao)}</p>
        </div>
        <div className={`${totalPago >= totalComissao && totalComissao > 0 ? 'gradient-green' : 'gradient-blue'} rounded-2xl p-4 text-white shadow-lg`}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-white/70" />
            <span className="text-[11px] text-white/70 uppercase">Pago</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalPago)}</p>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-3">
          {motoristas.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Wallet size={40} className="mx-auto mb-2 text-slate-300" />
              <p>Nenhum frete nesta semana</p>
            </div>
          ) : (
            motoristas.map(m => (
              <div
                key={m.motorista_id}
                className={`bg-white rounded-2xl p-4 shadow-sm border-2 transition-all ${
                  m.pago ? 'border-green-200 bg-green-50/30' : 'border-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-slate-800">{m.motorista_nome}</h3>
                    <p className="text-xs text-slate-400">{m.total_fretes} fretes na semana</p>
                  </div>
                  <p className="text-lg font-bold text-tp-blue">
                    {formatCurrency(m.comissao)}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-400">
                    Bruto: {formatCurrency(m.valor_bruto)} | Liq: {formatCurrency(m.valor_liquido)}
                  </div>
                  <button
                    onClick={() => togglePagamento(m.motorista_id, !m.pago)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      m.pago
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700'
                    }`}
                  >
                    {m.pago ? <CheckCircle size={14} /> : <Clock size={14} />}
                    {m.pago ? 'PAGO' : 'Pendente'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </PageContainer>
  )
}
