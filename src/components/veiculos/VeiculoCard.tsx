import { useRef, useState } from 'react'
import { CarFront, Camera } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import { uploadPhoto } from '@/lib/storage'
import type { VeiculoWithMotorista } from '@/hooks/useVeiculos'

interface VeiculoCardProps {
  veiculo: VeiculoWithMotorista
  onUpdate?: () => void
}

export function VeiculoCard({ veiculo, onUpdate }: VeiculoCardProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const url = await uploadPhoto(file, 'veiculos', veiculo.id)
    if (url) {
      await supabase
        .from('tp_veiculos')
        .update({ foto_url: url } as Record<string, unknown>)
        .eq('id', veiculo.id)
      onUpdate?.()
    }
    setUploading(false)
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-center gap-3">
        {/* Photo or icon */}
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-amber-50 flex items-center justify-center"
        >
          {veiculo.foto_url ? (
            <img src={veiculo.foto_url} alt={veiculo.placa} className="w-full h-full object-cover" />
          ) : (
            <CarFront size={24} className="text-amber-600" />
          )}
          <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center">
            <Camera size={14} className="text-white opacity-0 hover:opacity-100" />
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

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
