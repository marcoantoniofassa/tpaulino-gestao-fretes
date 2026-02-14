import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'
import { formatDateShort } from '@/lib/utils'

const COLORS = ['#1e40af', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6']

interface RevenueTimelineProps {
  data: { data: string; receita: number; fretes: number }[]
}

export function RevenueTimeline({ data }: RevenueTimelineProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Receita por Dia</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <XAxis
            dataKey="data"
            tickFormatter={formatDateShort}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(value: number) => [`R$ ${value.toFixed(0)}`, 'Receita']}
            labelFormatter={formatDateShort}
          />
          <Line
            type="monotone"
            dataKey="receita"
            stroke="#1e40af"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

interface FretesByTerminalProps {
  data: { terminal: string; count: number; receita: number }[]
}

export function FretesByTerminal({ data }: FretesByTerminalProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Fretes por Terminal</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="terminal"
            cx="50%"
            cy="50%"
            outerRadius={70}
            label={({ terminal, count }) => `${terminal} (${count})`}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

interface FretesByDriverProps {
  data: { motorista: string; count: number; receita: number }[]
}

export function FretesByDriver({ data }: FretesByDriverProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Fretes por Motorista</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis dataKey="motorista" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip />
          <Bar dataKey="count" fill="#1e40af" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
