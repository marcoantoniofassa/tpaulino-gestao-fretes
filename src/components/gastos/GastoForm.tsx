import { useState, useEffect } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { useVeiculos } from '@/hooks/useVeiculos'
import { createGasto } from '@/hooks/useGastos'
import { localDateStr } from '@/lib/utils'

const TIPOS = ['ABASTECIMENTO', 'BORRACHARIA', 'MANUTENCAO', 'PNEU', 'PECA', 'LAVAGEM', 'SEGURO', 'MULTA', 'DOCUMENTACAO', 'OUTRO']
const FORMAS = ['PIX', 'BOLETO', 'DINHEIRO', 'CARTAO']

export function GastoForm() {
  const { veiculos } = useVeiculos()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [tipo, setTipo] = useState('MANUTENCAO')
  const [valor, setValor] = useState('')
  const [veiculoId, setVeiculoId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('PIX')
  const [vencimento, setVencimento] = useState('')
  const [dadosPagamento, setDadosPagamento] = useState('')
  const [foto, setFoto] = useState<File | null>(null)

  // Abastecimento fields
  const [litros, setLitros] = useState('')
  const [precoLitro, setPrecoLitro] = useState('')
  const [kmOdometro, setKmOdometro] = useState('')

  const isAbastecimento = tipo === 'ABASTECIMENTO'

  // Auto-calculate valor when litros or precoLitro change
  useEffect(() => {
    if (isAbastecimento) {
      const l = parseFloat(litros)
      const p = parseFloat(precoLitro)
      if (l > 0 && p > 0) {
        setValor((l * p).toFixed(2))
      }
    }
  }, [litros, precoLitro, isAbastecimento])

  function reset() {
    setTipo('MANUTENCAO')
    setValor('')
    setVeiculoId('')
    setDescricao('')
    setFormaPagamento('PIX')
    setVencimento('')
    setDadosPagamento('')
    setFoto(null)
    setLitros('')
    setPrecoLitro('')
    setKmOdometro('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = parseFloat(valor)
    if (!v || v <= 0) return
    if (isAbastecimento && !veiculoId) return

    setSaving(true)
    const result = await createGasto(
      {
        data: localDateStr(),
        tipo,
        valor: v,
        veiculo_id: veiculoId || null,
        descricao: descricao || null,
        vencimento: vencimento || null,
        forma_pagamento: formaPagamento,
        dados_pagamento: dadosPagamento || null,
        litros: isAbastecimento && litros ? parseFloat(litros) : null,
        preco_litro: isAbastecimento && precoLitro ? parseFloat(precoLitro) : null,
        km_odometro: isAbastecimento && kmOdometro ? parseInt(kmOdometro) : null,
      },
      foto
    )
    setSaving(false)

    if (result) {
      reset()
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 bg-white rounded-xl p-3 shadow-sm border border-dashed border-slate-300 text-slate-500 font-medium hover:border-tp-blue hover:text-tp-blue transition-colors"
      >
        <Plus size={18} />
        Nova Despesa
      </button>
    )
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3 animate-slide-down">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {!isAbastecimento && (
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={valor}
              onChange={e => setValor(e.target.value)}
              className={inputCls}
              required
            />
          </div>
        )}
      </div>

      {/* Abastecimento specific fields */}
      {isAbastecimento && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Litros</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={litros}
              onChange={e => setLitros(e.target.value)}
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">R$/Litro</label>
            <input
              type="number"
              step="0.001"
              min="0"
              placeholder="0,000"
              value={precoLitro}
              onChange={e => setPrecoLitro(e.target.value)}
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Km</label>
            <input
              type="number"
              step="1"
              min="0"
              placeholder="Km"
              value={kmOdometro}
              onChange={e => setKmOdometro(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {isAbastecimento && valor && (
        <div className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
          Total: <span className="font-bold text-tp-blue">R$ {parseFloat(valor).toFixed(2)}</span>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">
          Veiculo {isAbastecimento && <span className="text-red-500">*</span>}
        </label>
        <select value={veiculoId} onChange={e => setVeiculoId(e.target.value)} className={inputCls} required={isAbastecimento}>
          <option value="">Geral (sem veiculo)</option>
          {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Descricao</label>
        <input
          type="text"
          placeholder="Descricao da despesa (opcional)"
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Pagamento</label>
          <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className={inputCls}>
            {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        {formaPagamento === 'BOLETO' && (
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Vencimento</label>
            <input
              type="date"
              value={vencimento}
              onChange={e => setVencimento(e.target.value)}
              className={inputCls}
            />
          </div>
        )}
      </div>

      {(formaPagamento === 'PIX' || formaPagamento === 'BOLETO') && (
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">
            {formaPagamento === 'PIX' ? 'Chave PIX' : 'Linha digitavel'}
          </label>
          <input
            type="text"
            placeholder={formaPagamento === 'PIX' ? 'Chave PIX (opcional)' : 'Codigo do boleto (opcional)'}
            value={dadosPagamento}
            onChange={e => setDadosPagamento(e.target.value)}
            className={inputCls}
          />
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Foto comprovante</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={e => setFoto(e.target.files?.[0] || null)}
          className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || (!valor && !isAbastecimento) || (isAbastecimento && (!litros || !precoLitro))}
          className="flex-1 flex items-center justify-center gap-2 bg-tp-blue text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Salvar
        </button>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false) }}
          className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-500 font-medium hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
