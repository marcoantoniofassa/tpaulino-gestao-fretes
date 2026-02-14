import { FreteCard } from './FreteCard'
import { Spinner } from '@/components/ui/Spinner'
import type { FreteWithRelations } from '@/types/database'

interface FreteListProps {
  fretes: FreteWithRelations[]
  loading: boolean
}

export function FreteList({ fretes, loading }: FreteListProps) {
  if (loading) return <Spinner />

  if (fretes.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p className="text-lg">Nenhum frete encontrado</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {fretes.map(frete => (
        <FreteCard key={frete.id} frete={frete} />
      ))}
    </div>
  )
}
