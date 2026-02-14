import type { Motorista, Terminal } from '@/types/database'

interface FreteFiltersProps {
  motoristas: Motorista[]
  terminais: Terminal[]
  motorista_id: string
  terminal_id: string
  dataInicio: string
  dataFim: string
  onMotoristaChange: (id: string) => void
  onTerminalChange: (id: string) => void
  onDataInicioChange: (date: string) => void
  onDataFimChange: (date: string) => void
}

export function FreteFilters({
  motoristas,
  terminais,
  motorista_id,
  terminal_id,
  dataInicio,
  dataFim,
  onMotoristaChange,
  onTerminalChange,
  onDataInicioChange,
  onDataFimChange,
}: FreteFiltersProps) {
  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex gap-2">
        <select
          value={motorista_id}
          onChange={e => onMotoristaChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-tp-blue"
        >
          <option value="">Todos motoristas</option>
          {motoristas.map(m => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
        </select>
        <select
          value={terminal_id}
          onChange={e => onTerminalChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-tp-blue"
        >
          <option value="">Todos terminais</option>
          {terminais.map(t => (
            <option key={t.id} value={t.id}>{t.codigo}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <input
          type="date"
          value={dataInicio}
          onChange={e => onDataInicioChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-tp-blue"
          placeholder="Data inicio"
        />
        <input
          type="date"
          value={dataFim}
          onChange={e => onDataFimChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-tp-blue"
          placeholder="Data fim"
        />
      </div>
    </div>
  )
}
