import { PageContainer } from '@/components/layout/PageContainer'
import { MotoristaCard } from '@/components/motoristas/MotoristaCard'
import { Spinner } from '@/components/ui/Spinner'
import { useMotoristasWithStats } from '@/hooks/useMotoristas'

export function MotoristasPage() {
  const { stats, loading } = useMotoristasWithStats()

  if (loading) return <PageContainer title="Motoristas"><Spinner /></PageContainer>

  return (
    <PageContainer title="Motoristas">
      <div className="flex flex-col gap-3">
        {stats.map(s => (
          <MotoristaCard key={s.motorista.id} data={s} />
        ))}
      </div>
    </PageContainer>
  )
}
