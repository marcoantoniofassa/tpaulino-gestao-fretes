import { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  color?: 'blue' | 'green' | 'amber' | 'purple'
  subtitle?: string
}

const gradients = {
  blue: 'gradient-blue',
  green: 'gradient-green',
  amber: 'gradient-amber',
  purple: 'gradient-purple',
}

export function StatCard({ label, value, icon, color = 'blue', subtitle }: StatCardProps) {
  return (
    <div className={`${gradients[color]} rounded-2xl p-4 text-white shadow-lg`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-white/70 uppercase tracking-wide">{label}</span>
        {icon && (
          <span className="p-1.5 rounded-lg bg-white/20">{icon}</span>
        )}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-[11px] text-white/60 mt-1">{subtitle}</p>}
    </div>
  )
}
