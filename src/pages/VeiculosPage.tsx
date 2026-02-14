import { PageContainer } from '@/components/layout/PageContainer'
import { VeiculoCard } from '@/components/veiculos/VeiculoCard'
import { Spinner } from '@/components/ui/Spinner'
import { useVeiculos } from '@/hooks/useVeiculos'

export function VeiculosPage() {
  const { veiculos, loading } = useVeiculos()

  if (loading) return <PageContainer title="Veiculos"><Spinner /></PageContainer>

  return (
    <PageContainer title="Veiculos">
      <div className="flex flex-col gap-3">
        {veiculos.map(v => (
          <VeiculoCard key={v.id} veiculo={v} />
        ))}
      </div>
    </PageContainer>
  )
}
