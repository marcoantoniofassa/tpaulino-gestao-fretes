import type { Motorista } from '@/types/database'

interface FreteFiltersProps {
  motoristas: Motorista[]
  motorista_id: string
  onMotoristaChange: (id: string) => void
}

export function FreteFilters({
  motoristas,
  motorista_id,
  onMotoristaChange,
}: FreteFiltersProps) {
  return (
    <div className="mb-4">
      <select
        value={motorista_id}
        onChange={e => onMotoristaChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-tp-blue"
      >
        <option value="">Todos motoristas</option>
        {motoristas.map(m => (
          <option key={m.id} value={m.id}>{m.nome}</option>
        ))}
      </select>
    </div>
  )
}
