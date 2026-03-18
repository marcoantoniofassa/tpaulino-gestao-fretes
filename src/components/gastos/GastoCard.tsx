import { useState } from 'react'
import { Trash2, Image, Fuel, FileText, Copy, Check, CheckCircle, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toggleGastoStatus, deleteGasto } from '@/hooks/useGastos'
import type { GastoWithRelations } from '@/types/database'

interface GastoCardProps {
  gasto: GastoWithRelations
}

const tipoBadgeColor: Record<string, string> = {
  ABASTECIMENTO: 'bg-green-100 text-green-700',
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

function isPdf(url: string) {
  return url.toLowerCase().endsWith('.pdf')
}

export function GastoCard({ gasto }: GastoCardProps) {
  const [copied, setCopied] = useState(false)

  async function handleToggleStatus(e: React.MouseEvent) {
    e.stopPropagation()
    await toggleGastoStatus(gasto.id, gasto.status)
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirm('Excluir esta despesa?')) {
      await deleteGasto(gasto.id)
    }
  }

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    if (!gasto.dados_pagamento) return
    try {
      await navigator.clipboard.writeText(gasto.dados_pagamento)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback silencioso
    }
  }

  const isAbastecimento = gasto.tipo === 'ABASTECIMENTO'
  const isPago = gasto.status === 'PAGO'
  const hasDadosPagamento = !!gasto.dados_pagamento
  const isBoleto = gasto.forma_pagamento === 'BOLETO'
  const isPix = gasto.forma_pagamento === 'PIX'

  return (
    <div
      className={`w-full bg-white rounded-xl p-4 shadow-sm border text-left transition-all ${
        isPago
          ? 'border-green-200 opacity-60'
          : 'border-slate-100'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tipoBadgeColor[gasto.tipo] || tipoBadgeColor.OUTRO}`}>
              {gasto.tipo}
            </span>
            <Badge variant={isPago ? 'success' : 'warning'}>
              {gasto.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500 mb-1">
            {gasto.tp_veiculos && <span>{gasto.tp_veiculos.placa}</span>}
            <span>{formatDate(gasto.data)}</span>
            <span className="text-slate-300">|</span>
            <span>{gasto.forma_pagamento}</span>
          </div>
          {isAbastecimento && (gasto.litros || gasto.km_odometro) && (
            <div className="flex items-center gap-2 text-xs text-green-600 mb-1">
              <Fuel size={12} />
              {gasto.litros && <span>{gasto.litros}L</span>}
              {gasto.preco_litro && <span>R${gasto.preco_litro}/L</span>}
              {gasto.km_odometro && <span>{gasto.km_odometro.toLocaleString('pt-BR')} km</span>}
            </div>
          )}
          {gasto.descricao && (
            <p className="text-xs text-slate-400 truncate">{gasto.descricao}</p>
          )}
          {/* Dados de pagamento: boleto ou PIX */}
          {hasDadosPagamento && (isBoleto || isPix) && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-slate-400 truncate max-w-[200px]">
                {isBoleto ? 'Boleto: ' : 'PIX: '}
                {gasto.dados_pagamento!.length > 24
                  ? gasto.dados_pagamento!.slice(0, 24) + '...'
                  : gasto.dados_pagamento}
              </span>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                title="Copiar"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 ml-2">
          <div className="flex items-center gap-2">
            {gasto.foto_url && (
              <a
                href={gasto.foto_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                {isPdf(gasto.foto_url) ? <FileText size={16} /> : <Image size={16} />}
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
          {/* Botao explicito de baixa */}
          <button
            onClick={handleToggleStatus}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isPago
                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {isPago ? (
              <>
                <Undo2 size={13} />
                Desfazer
              </>
            ) : (
              <>
                <CheckCircle size={13} />
                Dar baixa
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
