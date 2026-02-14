import { useParams } from 'react-router-dom'
import { PageContainer } from '@/components/layout/PageContainer'
import { FreteDetail } from '@/components/fretes/FreteDetail'
import { Spinner } from '@/components/ui/Spinner'
import { useFrete } from '@/hooks/useFretes'

export function FreteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { frete, loading } = useFrete(id)

  if (loading) return <PageContainer><Spinner /></PageContainer>
  if (!frete) return <PageContainer><p className="text-center text-slate-400">Frete nao encontrado</p></PageContainer>

  return (
    <PageContainer>
      <FreteDetail frete={frete} />
    </PageContainer>
  )
}
