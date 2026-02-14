import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts'
import { formatDateShort, formatCurrency } from '@/lib/utils'

const COLORS = ['#1e40af', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6']

const tooltipStyle = {
  borderRadius: 12,
  border: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
}

interface RevenueTimelineProps {
  data: { data: string; receita: number; fretes: number }[]
}

export function RevenueTimeline({ data }: RevenueTimelineProps) {
  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Receita por Dia</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1e40af" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#1e40af" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="data"
            tickFormatter={formatDateShort}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(value: number) => [formatCurrency(value), 'Receita']}
            labelFormatter={formatDateShort}
            contentStyle={tooltipStyle}
          />
          <Area
            type="monotone"
            dataKey="receita"
            stroke="#1e40af"
            strokeWidth={2}
            fill="url(#colorReceita)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

interface FretesByTerminalProps {
  data: { terminal: string; count: number; receita: number }[]
}

export function FretesByTerminal({ data }: FretesByTerminalProps) {
  if (data.length === 0) return null
  const total = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Por Terminal</h3>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="terminal"
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={65}
            paddingAngle={3}
            label={({ terminal, count }) => `${terminal} (${count})`}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, _name: string, props: any) => [
              `${value} fretes - ${formatCurrency(props?.payload?.receita || 0)}`,
              props?.payload?.terminal || '',
            ]}
            contentStyle={tooltipStyle}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="text-center text-xs text-slate-400 -mt-2">{total} fretes total</p>
    </div>
  )
}

interface FretesByDriverProps {
  data: { motorista: string; count: number; receita: number }[]
}

export function FretesByDriver({ data }: FretesByDriverProps) {
  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Por Motorista</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="motorista"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip
            formatter={(value: number, _name: string, props: any) => [
              `${value} fretes - ${formatCurrency(props?.payload?.receita || 0)}`,
              'Total',
            ]}
            contentStyle={tooltipStyle}
          />
          <Bar dataKey="count" fill="#1e40af" radius={[0, 6, 6, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
