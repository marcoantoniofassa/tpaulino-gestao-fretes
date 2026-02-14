import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { FreteWithRelations } from '@/types/database'

interface FreteCardProps {
  frete: FreteWithRelations
}

const statusVariant = {
  VALIDADO: 'success' as const,
  CORRIGIDO: 'warning' as const,
  ERRO: 'error' as const,
  PENDENTE: 'default' as const,
}

export function FreteCard({ frete }: FreteCardProps) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(`/fretes/${frete.id}`)}
      className="w-full bg-white rounded-xl p-4 shadow-sm border border-slate-100 text-left active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-slate-800 truncate">
              {frete.tp_motoristas?.nome || 'N/A'}
            </span>
            <Badge variant={statusVariant[frete.status as keyof typeof statusVariant] || 'default'}>
              {frete.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500 mb-1">
            <span>{frete.tp_terminais?.codigo || 'N/A'}</span>
            <span className="text-slate-300">|</span>
            <span>{frete.tp_veiculos?.placa || 'N/A'}</span>
            {frete.sequencia && (
              <>
                <span className="text-slate-300">|</span>
                <span>#{frete.sequencia}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">{formatDate(frete.data_frete)}</span>
            {frete.container && (
              <span className="text-slate-400 font-mono text-xs">{frete.container}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-lg font-bold text-tp-blue">
            {formatCurrency(frete.valor_liquido)}
          </span>
          <ChevronRight size={18} className="text-slate-300" />
        </div>
      </div>
    </button>
  )
}
