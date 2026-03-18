const TIPOS = ['ABASTECIMENTO', 'BORRACHARIA', 'MANUTENCAO', 'PNEU', 'PECA', 'LAVAGEM', 'SEGURO', 'MULTA', 'DOCUMENTACAO', 'OUTRO']
const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'PENDENTE', label: 'Pendentes' },
  { value: 'PAGO', label: 'Pagos' },
]

interface GastoFiltersProps {
  statusFilter: string
  onStatusChange: (status: string) => void
  tipoFilter: string
  onTipoChange: (tipo: string) => void
}

export function GastoFilters({ statusFilter, onStatusChange, tipoFilter, onTipoChange }: GastoFiltersProps) {
  return (
    <div className="space-y-3">
      {/* Status pills */}
      <div className="flex gap-2">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onStatusChange(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-tp-blue text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {/* Tipo dropdown */}
      <select
        value={tipoFilter}
        onChange={e => onTipoChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
      >
        <option value="">Todos os tipos</option>
        {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  )
}
