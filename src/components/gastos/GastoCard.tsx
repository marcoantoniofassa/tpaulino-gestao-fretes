import { Trash2, Image } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toggleGastoStatus, deleteGasto } from '@/hooks/useGastos'
import type { GastoWithRelations } from '@/types/database'

interface GastoCardProps {
  gasto: GastoWithRelations
}

const tipoBadgeColor: Record<string, string> = {
  BORRACHARIA: 'bg-amber-100 text-amber-700',
  MANUTENCAO: 'bg-blue-100 text-blue-700',
  PNEU: 'bg-slate-100 text-slate-700',
  PECA: 'bg-purple-100 text-purple-700',
  LAVAGEM: 'bg-cyan-100 text-cyan-700',
  SEGURO: 'bg-emerald-100 text-emerald-700',
  MULTA: 'bg-red-100 text-red-700',
  DOCUMENTACAO: 'bg-indigo-100 text-indigo-700',
  OUTRO: 'bg-slate-100 text-slate-700',
}

export function GastoCard({ gasto }: GastoCardProps) {
  async function handleToggleStatus() {
    await toggleGastoStatus(gasto.id, gasto.status)
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirm('Excluir este gasto?')) {
      await deleteGasto(gasto.id)
    }
  }

  return (
    <button
      onClick={handleToggleStatus}
      className="w-full bg-white rounded-xl p-4 shadow-sm border border-slate-100 text-left active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tipoBadgeColor[gasto.tipo] || tipoBadgeColor.OUTRO}`}>
              {gasto.tipo}
            </span>
            <Badge variant={gasto.status === 'PAGO' ? 'success' : 'warning'}>
              {gasto.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500 mb-1">
            {gasto.tp_veiculos && <span>{gasto.tp_veiculos.placa}</span>}
            <span>{formatDate(gasto.data)}</span>
            <span className="text-slate-300">|</span>
            <span>{gasto.forma_pagamento}</span>
          </div>
          {gasto.descricao && (
            <p className="text-xs text-slate-400 truncate">{gasto.descricao}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-2">
          {gasto.foto_url && (
            <a
              href={gasto.foto_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            >
              <Image size={16} />
            </a>
          )}
          <span className="text-lg font-bold text-red-600">
            {formatCurrency(gasto.valor)}
          </span>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </button>
  )
}
