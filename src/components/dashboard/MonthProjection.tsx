import type { ProjecaoMensal } from '@/hooks/useDashboard'

function fmtCompact(value: number): string {
  if (value >= 1000) {
    const k = value / 1000
    return `R$ ${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`
  }
  return `R$ ${Math.round(value)}`
}

interface MonthProjectionProps {
  projecao: ProjecaoMensal
}

export function MonthProjection({ projecao }: MonthProjectionProps) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5">
        Projecao do mes ({projecao.diasComFrete}/{projecao.diasUteisEstimados} dias uteis)
      </p>
      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
        <span>~{projecao.fretes} fretes</span>
        <span className="text-slate-300">|</span>
        <span>Liq ~{fmtCompact(projecao.receitaLiquida)}</span>
        <span className="text-slate-300">|</span>
        <span>Desp ~{fmtCompact(projecao.despesas)}</span>
        <span className="text-slate-300">|</span>
        <span>Margem ~{fmtCompact(projecao.margem)}</span>
      </div>
    </div>
  )
}
