import { PageContainer } from '@/components/layout/PageContainer'
import { VeiculoCard } from '@/components/veiculos/VeiculoCard'
import { Spinner } from '@/components/ui/Spinner'
import { useVeiculos } from '@/hooks/useVeiculos'

export function VeiculosPage() {
  const { veiculos, loading, refetch } = useVeiculos()

  if (loading) return <PageContainer title="Veiculos"><Spinner /></PageContainer>

  return (
    <PageContainer title="Veiculos">
      <p className="text-sm text-slate-400 mb-3">Toque na foto para alterar</p>
      <div className="flex flex-col gap-3">
        {veiculos.map(v => (
          <VeiculoCard key={v.id} veiculo={v} onUpdate={refetch} />
        ))}
      </div>
    </PageContainer>
  )
}
