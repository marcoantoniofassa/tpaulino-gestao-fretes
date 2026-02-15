import { useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { FreteWithRelations } from '@/types/database'

interface FreteDetailProps {
  frete: FreteWithRelations
}

const statusVariant = {
  VALIDADO: 'success' as const,
  CORRIGIDO: 'warning' as const,
  ERRO: 'error' as const,
  PENDENTE: 'default' as const,
}

export function FreteDetail({ frete }: FreteDetailProps) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [container, setContainer] = useState(frete.container || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('tp_fretes')
      .update({ container } as Record<string, unknown>)
      .eq('id', frete.id)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div>
      <button
        onClick={() => navigate('/fretes')}
        className="flex items-center gap-1 text-tp-blue font-medium mb-4"
      >
        <ArrowLeft size={18} />
        Voltar
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-tp-dark text-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold">{frete.tp_motoristas?.nome || 'N/A'}</h3>
            <Badge variant={statusVariant[frete.status as keyof typeof statusVariant] || 'default'}>
              {frete.status}
            </Badge>
          </div>
          <p className="text-2xl font-bold text-tp-accent">{formatCurrency(frete.valor_liquido)}</p>
        </div>

        {/* Fields */}
        <div className="p-4 space-y-3">
          <Row label="Data" value={formatDate(frete.data_frete)} />
          <Row label="Registrado em" value={formatDateTime(frete.created_at)} subtle />
          <Row label="Terminal" value={frete.tp_terminais?.nome || 'N/A'} />
          <Row label="Placa" value={frete.tp_veiculos?.placa || 'N/A'} />
          <Row label="Sequencia" value={frete.sequencia?.toString() || '-'} />
          <Row label="Tipo" value={frete.tipo_frete} />

          {/* Container (editable) */}
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-sm text-slate-500">Container</span>
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={container}
                  onChange={e => setContainer(e.target.value.toUpperCase())}
                  className="px-2 py-1 border border-slate-200 rounded text-sm font-mono w-32"
                />
                <button onClick={handleSave} disabled={saving} className="text-tp-blue">
                  <Save size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-sm font-mono text-slate-800 underline decoration-dashed"
              >
                {frete.container || '-'}
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 mt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Valores</h4>
            <Row label="Valor Bruto" value={formatCurrency(frete.valor_bruto)} />
            <Row label="Pedagio" value={formatCurrency(frete.pedagio)} />
            <Row label="Comissao (25%)" value={formatCurrency(frete.comissao)} />
            <Row label="Valor Liquido" value={formatCurrency(frete.valor_liquido)} bold />
          </div>

          {/* Foto do ticket */}
          {frete.foto_ticket_url && (
            <div className="pt-2 border-t border-slate-100 mt-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Foto do Ticket</h4>
              <img
                src={frete.foto_ticket_url}
                alt="Ticket original"
                className="w-full rounded-lg border border-slate-200"
              />
            </div>
          )}

          {/* OCR Raw */}
          {frete.ocr_raw && (
            <div className="pt-2 border-t border-slate-100 mt-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Dados OCR (raw)</h4>
              <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-x-auto">
                {JSON.stringify(frete.ocr_raw, null, 2)}
              </pre>
            </div>
          )}

          {/* AI Corrections */}
          {frete.ai_corrections && Object.keys(frete.ai_corrections).length > 0 && (
            <div className="pt-2 border-t border-slate-100 mt-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Correcoes IA</h4>
              <pre className="text-xs bg-amber-50 p-3 rounded-lg overflow-x-auto">
                {JSON.stringify(frete.ai_corrections, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold, subtle }: { label: string; value: string; bold?: boolean; subtle?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100">
      <span className={`text-sm ${subtle ? 'text-slate-400 text-xs' : 'text-slate-500'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-slate-800' : subtle ? 'text-slate-400 text-xs' : 'text-slate-700'}`}>{value}</span>
    </div>
  )
}
