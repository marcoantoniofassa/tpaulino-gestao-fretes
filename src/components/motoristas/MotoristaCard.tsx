import { User, TrendingUp, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { MotoristaStats } from '@/hooks/useMotoristas'

interface MotoristaCardProps {
  data: MotoristaStats
}

export function MotoristaCard({ data }: MotoristaCardProps) {
  const { motorista, totalFretes, receitaLiquida, ultimoFrete } = data

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-tp-blue/10 rounded-full flex items-center justify-center">
          <User size={20} className="text-tp-blue" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800">{motorista.nome}</h3>
          <Badge variant={motorista.status === 'ativo' ? 'success' : 'default'}>
            {motorista.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
            <TrendingUp size={12} />
          </div>
          <p className="text-lg font-bold text-slate-800">{totalFretes}</p>
          <p className="text-xs text-slate-400">Fretes</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
            <TrendingUp size={12} />
          </div>
          <p className="text-sm font-bold text-tp-blue">{formatCurrency(receitaLiquida)}</p>
          <p className="text-xs text-slate-400">Receita</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
            <Calendar size={12} />
          </div>
          <p className="text-sm font-bold text-slate-800">
            {ultimoFrete ? formatDate(ultimoFrete) : '-'}
          </p>
          <p className="text-xs text-slate-400">Ultimo</p>
        </div>
      </div>
    </div>
  )
}
