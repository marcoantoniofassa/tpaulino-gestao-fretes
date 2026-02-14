import { CarFront } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { VeiculoWithMotorista } from '@/hooks/useVeiculos'

interface VeiculoCardProps {
  veiculo: VeiculoWithMotorista
}

export function VeiculoCard({ veiculo }: VeiculoCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
          <CarFront size={20} className="text-amber-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-slate-800 font-mono">{veiculo.placa}</h3>
          <div className="flex items-center gap-2">
            {veiculo.tp_motoristas ? (
              <span className="text-sm text-slate-500">{veiculo.tp_motoristas.nome}</span>
            ) : (
              <span className="text-sm text-slate-400 italic">Sem motorista fixo</span>
            )}
            <Badge variant={veiculo.status === 'ativo' ? 'success' : 'default'}>
              {veiculo.status}
            </Badge>
          </div>
        </div>
      </div>
      {veiculo.reboque_placa && (
        <p className="mt-2 text-xs text-slate-400">Reboque: {veiculo.reboque_placa}</p>
      )}
    </div>
  )
}
