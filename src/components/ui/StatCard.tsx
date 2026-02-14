import { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  color?: 'blue' | 'green' | 'amber' | 'red'
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
}

export function StatCard({ label, value, icon, color = 'blue' }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        {icon && (
          <span className={`p-1.5 rounded-lg ${colorMap[color]}`}>{icon}</span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  )
}
