import { Truck, DollarSign, TrendingUp, CalendarCheck } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { formatCurrency } from '@/lib/utils'

interface KPIGridProps {
  totalFretes: number
  receitaLiquida: number
  mediaDiaria: number
  fretesHoje: number
}

export function KPIGrid({ totalFretes, receitaLiquida, mediaDiaria, fretesHoje }: KPIGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        label="Fretes Mes"
        value={totalFretes}
        icon={<Truck size={16} />}
        color="blue"
      />
      <StatCard
        label="Receita Liquida"
        value={formatCurrency(receitaLiquida)}
        icon={<DollarSign size={16} />}
        color="green"
      />
      <StatCard
        label="Media Diaria"
        value={formatCurrency(mediaDiaria)}
        icon={<TrendingUp size={16} />}
        color="amber"
      />
      <StatCard
        label="Fretes Hoje"
        value={fretesHoje}
        icon={<CalendarCheck size={16} />}
        color="blue"
      />
    </div>
  )
}
