import { useState, useEffect } from 'react'
import { Plus, Loader2, Trash2 } from 'lucide-react'
import { useVeiculos } from '@/hooks/useVeiculos'
import { createGasto } from '@/hooks/useGastos'
import type { ParcelaInput } from '@/hooks/useGastos'
import { localDateStr } from '@/lib/utils'

const TIPOS = ['ABASTECIMENTO', 'BORRACHARIA', 'MANUTENCAO', 'PNEU', 'PECA', 'LAVAGEM', 'SEGURO', 'MULTA', 'DOCUMENTACAO', 'OUTRO']
const FORMAS = ['PIX', 'BOLETO', 'DINHEIRO', 'CARTAO']

interface ParcelaFormRow {
  numero: number
  valor: string
  vencimento: string
  forma_pagamento: string
  dados_pagamento: string
}

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

  // Parcelamento fields
  const [parcelado, setParcelado] = useState(false)
  const [parcelas, setParcelas] = useState<ParcelaFormRow[]>([])

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

  // Initialize parcelas when toggling parcelado on
  useEffect(() => {
    if (parcelado && parcelas.length === 0) {
      setParcelas([
        { numero: 1, valor: '', vencimento: '', forma_pagamento: 'PIX', dados_pagamento: '' },
        { numero: 2, valor: '', vencimento: '', forma_pagamento: 'BOLETO', dados_pagamento: '' },
      ])
    }
    if (!parcelado) {
      setParcelas([])
    }
  }, [parcelado]) // eslint-disable-line react-hooks/exhaustive-deps

  function addParcela() {
    const next = parcelas.length + 1
    setParcelas([...parcelas, {
      numero: next,
      valor: '',
      vencimento: '',
      forma_pagamento: 'BOLETO',
      dados_pagamento: '',
    }])
  }

  function removeParcela(index: number) {
    if (parcelas.length <= 2) return
    const updated = parcelas.filter((_, i) => i !== index).map((p, i) => ({ ...p, numero: i + 1 }))
    setParcelas(updated)
  }

  function updateParcela(index: number, field: keyof ParcelaFormRow, value: string) {
    const updated = [...parcelas]
    updated[index] = { ...updated[index], [field]: value }
    setParcelas(updated)
  }

  function distribuirIgualmente() {
    const v = parseFloat(valor)
    if (!v || v <= 0 || parcelas.length === 0) return
    const valorParcela = (v / parcelas.length).toFixed(2)
    const updated = parcelas.map(p => ({ ...p, valor: valorParcela }))
    // Ajustar centavos na ultima parcela
    const soma = updated.reduce((s, p) => s + parseFloat(p.valor || '0'), 0)
    const diff = v - soma
    if (Math.abs(diff) > 0.001) {
      const last = updated[updated.length - 1]
      last.valor = (parseFloat(last.valor) + diff).toFixed(2)
    }
    setParcelas(updated)
  }

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
    setParcelado(false)
    setParcelas([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = parseFloat(valor)
    if (!v || v <= 0) return
    if (isAbastecimento && !veiculoId) return

    // Validate parcelas
    if (parcelado) {
      const somaParcelas = parcelas.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
      if (Math.abs(somaParcelas - v) > 0.01) {
        alert(`Soma das parcelas (R$ ${somaParcelas.toFixed(2)}) difere do valor total (R$ ${v.toFixed(2)})`)
        return
      }
      for (const p of parcelas) {
        if (!p.valor || parseFloat(p.valor) <= 0) {
          alert(`Parcela ${p.numero} sem valor`)
          return
        }
      }
    }

    setSaving(true)

    // Build parcelas input
    let parcelasInput: ParcelaInput[] | undefined
    if (parcelado && parcelas.length > 0) {
      parcelasInput = parcelas.map(p => ({
        numero: p.numero,
        total_parcelas: parcelas.length,
        valor: parseFloat(p.valor),
        vencimento: p.vencimento || null,
        forma_pagamento: p.forma_pagamento,
        dados_pagamento: p.dados_pagamento || null,
      }))
    }

    // For parcelado: forma_pagamento = PARCELADO, vencimento = last parcela
    const gastoFormaPgto = parcelado ? 'PARCELADO' : formaPagamento
    const gastoVencimento = parcelado
      ? (parcelas.filter(p => p.vencimento).sort((a, b) => b.vencimento.localeCompare(a.vencimento))[0]?.vencimento || null)
      : (vencimento || null)

    const result = await createGasto(
      {
        data: localDateStr(),
        tipo,
        valor: v,
        veiculo_id: veiculoId || null,
        descricao: descricao || null,
        vencimento: gastoVencimento,
        forma_pagamento: gastoFormaPgto,
        dados_pagamento: parcelado ? null : (dadosPagamento || null),
        litros: isAbastecimento && litros ? parseFloat(litros) : null,
        preco_litro: isAbastecimento && precoLitro ? parseFloat(precoLitro) : null,
        km_odometro: isAbastecimento && kmOdometro ? parseInt(kmOdometro) : null,
      },
      foto,
      parcelasInput
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
            <label className="text-xs font-medium text-slate-500 mb-1 block">Valor Total (R$)</label>
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

      {/* Parcelamento toggle */}
      <div className="flex items-center gap-3 py-1">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={parcelado}
            onChange={e => setParcelado(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
        <span className="text-sm font-medium text-slate-600">Parcelado?</span>
      </div>

      {/* Simple payment fields (when NOT parcelado) */}
      {!parcelado && (
        <>
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
                {formaPagamento === 'PIX' ? 'Chave PIX' : 'Codigo do boleto'}
              </label>
              {formaPagamento === 'BOLETO' ? (
                <textarea
                  placeholder="Cole aqui a linha digitavel ou codigo de barras"
                  value={dadosPagamento}
                  onChange={e => setDadosPagamento(e.target.value)}
                  inputMode="numeric"
                  rows={2}
                  className={inputCls + ' resize-none'}
                />
              ) : (
                <input
                  type="text"
                  placeholder="Chave PIX (opcional)"
                  value={dadosPagamento}
                  onChange={e => setDadosPagamento(e.target.value)}
                  className={inputCls}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Parcelas editor (when parcelado) */}
      {parcelado && (
        <div className="space-y-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              {parcelas.length} Parcelas
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={distribuirIgualmente}
                className="text-xs text-blue-600 font-medium hover:text-blue-700"
                disabled={!valor || parseFloat(valor) <= 0}
              >
                Dividir igual
              </button>
              <button
                type="button"
                onClick={addParcela}
                className="text-xs text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1"
              >
                <Plus size={12} /> Parcela
              </button>
            </div>
          </div>

          {parcelas.map((p, i) => (
            <div key={i} className="bg-white rounded-lg p-3 border border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Parcela {p.numero}</span>
                {parcelas.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeParcela(i)}
                    className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={p.valor}
                    onChange={e => updateParcela(i, 'valor', e.target.value)}
                    className={inputCls + ' text-xs'}
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Forma</label>
                  <select
                    value={p.forma_pagamento}
                    onChange={e => updateParcela(i, 'forma_pagamento', e.target.value)}
                    className={inputCls + ' text-xs'}
                  >
                    {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">Vencimento</label>
                  <input
                    type="date"
                    value={p.vencimento}
                    onChange={e => updateParcela(i, 'vencimento', e.target.value)}
                    className={inputCls + ' text-xs'}
                  />
                </div>
                {(p.forma_pagamento === 'PIX' || p.forma_pagamento === 'BOLETO') && (
                  <div>
                    <label className="text-[10px] text-slate-400 block">
                      {p.forma_pagamento === 'PIX' ? 'Chave PIX' : 'Cod. boleto'}
                    </label>
                    <input
                      type="text"
                      placeholder={p.forma_pagamento === 'PIX' ? 'Chave' : 'Linha digitavel'}
                      value={p.dados_pagamento}
                      onChange={e => updateParcela(i, 'dados_pagamento', e.target.value)}
                      className={inputCls + ' text-xs'}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Soma das parcelas */}
          {parcelas.length > 0 && (
            <div className="text-xs text-slate-500 text-right">
              Soma parcelas: <span className="font-bold">
                R$ {parcelas.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0).toFixed(2)}
              </span>
              {valor && Math.abs(parcelas.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0) - parseFloat(valor)) > 0.01 && (
                <span className="text-red-500 ml-2">
                  (difere do total R$ {parseFloat(valor).toFixed(2)})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Anexar documento</label>
        <input
          type="file"
          accept="image/*,.pdf,.jpg,.jpeg,.png"
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
