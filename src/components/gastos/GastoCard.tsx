import { useState } from 'react'
import { Trash2, Image, Fuel, FileText, Copy, Check, CheckCircle, Undo2, ChevronDown, ChevronUp, Pencil, X, Save, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toggleGastoStatus, toggleParcelaStatus, deleteGasto, updateGasto } from '@/hooks/useGastos'
import type { GastoWithRelations, GastoParcela } from '@/types/database'

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
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editLitros, setEditLitros] = useState('')
  const [editPrecoLitro, setEditPrecoLitro] = useState('')
  const [editKm, setEditKm] = useState('')

  const parcelas = gasto.tp_gasto_parcelas ?? []
  const temParcelas = parcelas.length > 0
  const parcelasPagas = parcelas.filter(p => p.status === 'PAGO').length

  function startEditing(e: React.MouseEvent) {
    e.stopPropagation()
    setEditLitros(gasto.litros?.toString() || '')
    setEditPrecoLitro(gasto.preco_litro?.toString() || '')
    setEditKm(gasto.km_odometro?.toString() || '')
    setEditing(true)
  }

  function cancelEditing(e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(false)
  }

  async function handleSaveEdit(e: React.MouseEvent) {
    e.stopPropagation()
    const litros = parseFloat(editLitros) || null
    const preco_litro = parseFloat(editPrecoLitro) || null
    const km_odometro = editKm ? parseInt(editKm) : null
    const valor = litros && preco_litro ? litros * preco_litro : gasto.valor

    setSaving(true)
    const ok = await updateGasto(gasto.id, { litros, preco_litro, km_odometro, valor })
    setSaving(false)
    if (ok) setEditing(false)
  }

  const editValorCalc = (() => {
    const l = parseFloat(editLitros)
    const p = parseFloat(editPrecoLitro)
    return l > 0 && p > 0 ? l * p : null
  })()

  async function handleToggleStatus(e: React.MouseEvent) {
    e.stopPropagation()
    await toggleGastoStatus(gasto.id, gasto.status)
  }

  async function handleToggleParcela(e: React.MouseEvent, parcela: GastoParcela) {
    e.stopPropagation()
    await toggleParcelaStatus(parcela)
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirm('Excluir esta despesa?')) {
      await deleteGasto(gasto.id)
    }
  }

  async function handleCopy(e: React.MouseEvent, text?: string) {
    e.stopPropagation()
    const toCopy = text || gasto.dados_pagamento
    if (!toCopy) return
    try {
      await navigator.clipboard.writeText(toCopy)
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
            {temParcelas ? (
              <Badge variant={isPago ? 'success' : 'warning'}>
                {`${parcelasPagas}/${parcelas.length} pagas`}
              </Badge>
            ) : (
              <Badge variant={isPago ? 'success' : 'warning'}>
                {gasto.status}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500 mb-1">
            {gasto.tp_veiculos && <span>{gasto.tp_veiculos.placa}</span>}
            <span>{formatDate(gasto.data)}</span>
            <span className="text-slate-300">|</span>
            <span>{temParcelas ? `${parcelas.length}x` : gasto.forma_pagamento}</span>
          </div>
          {isAbastecimento && !editing && (gasto.litros || gasto.km_odometro) && (
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
          {/* Dados de pagamento (simple, non-parcelado) */}
          {!temParcelas && hasDadosPagamento && (isBoleto || isPix) && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-slate-400 truncate max-w-[200px]">
                {isBoleto ? 'Boleto: ' : 'PIX: '}
                {gasto.dados_pagamento!.length > 24
                  ? gasto.dados_pagamento!.slice(0, 24) + '...'
                  : gasto.dados_pagamento}
              </span>
              <button
                onClick={(e) => handleCopy(e)}
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
              {editing && editValorCalc ? formatCurrency(editValorCalc) : formatCurrency(gasto.valor)}
            </span>
            {isAbastecimento && !editing && (
              <button
                onClick={startEditing}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-300 hover:text-blue-500 transition-colors"
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
          {/* Toggle status (only for simple gastos without parcelas) */}
          {!temParcelas && (
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
          )}
          {/* Expand/collapse for parcelas */}
          {temParcelas && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              Parcelas
            </button>
          )}
        </div>
      </div>

      {/* Inline edit form for abastecimento */}
      {editing && (
        <div className="mt-3 pt-3 border-t border-blue-100 space-y-2 animate-slide-down" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-medium text-slate-400 block">Litros</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editLitros}
                onChange={e => setEditLitros(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-400 block">R$/Litro</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={editPrecoLitro}
                onChange={e => setEditPrecoLitro(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-400 block">Km</label>
              <input
                type="number"
                step="1"
                min="0"
                value={editKm}
                onChange={e => setEditKm(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          {editValorCalc && (
            <div className="text-xs text-slate-500 bg-blue-50 rounded-lg px-2 py-1">
              Valor calculado: <span className="font-bold text-blue-700">{formatCurrency(editValorCalc)}</span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar
            </button>
            <button
              onClick={cancelEditing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <X size={13} />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Expanded parcelas list */}
      {temParcelas && expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          {parcelas.map((p) => (
            <ParcelaRow key={p.id} parcela={p} onToggle={handleToggleParcela} onCopy={handleCopy} />
          ))}
        </div>
      )}
    </div>
  )
}

function ParcelaRow({
  parcela,
  onToggle,
  onCopy,
}: {
  parcela: GastoParcela
  onToggle: (e: React.MouseEvent, p: GastoParcela) => void
  onCopy: (e: React.MouseEvent, text?: string) => void
}) {
  const isPago = parcela.status === 'PAGO'
  const hasDados = !!parcela.dados_pagamento

  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${
      isPago ? 'bg-green-50 border border-green-100' : 'bg-slate-50 border border-slate-100'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-700">
            {parcela.numero}/{parcela.total_parcelas}
          </span>
          <span className="text-slate-500">{parcela.forma_pagamento}</span>
          <span className="font-semibold text-slate-800">{formatCurrency(parcela.valor)}</span>
          {parcela.vencimento && (
            <span className="text-slate-400">{formatDate(parcela.vencimento)}</span>
          )}
          {isPago && (
            <span className="text-green-600 font-medium">PAGO</span>
          )}
        </div>
        {hasDados && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-slate-400 truncate max-w-[180px]">
              {parcela.dados_pagamento!.length > 20
                ? parcela.dados_pagamento!.slice(0, 20) + '...'
                : parcela.dados_pagamento}
            </span>
            <button
              onClick={(e) => onCopy(e, parcela.dados_pagamento!)}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-400"
            >
              <Copy size={11} />
            </button>
          </div>
        )}
      </div>
      <button
        onClick={(e) => onToggle(e, parcela)}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex-shrink-0 ${
          isPago
            ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            : 'bg-green-500 text-white hover:bg-green-600'
        }`}
      >
        {isPago ? <Undo2 size={11} /> : <CheckCircle size={11} />}
        {isPago ? 'Desfazer' : 'Pagar'}
      </button>
    </div>
  )
}
