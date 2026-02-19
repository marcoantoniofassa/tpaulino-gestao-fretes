/** Returns YYYY-MM-DD in local timezone (avoids UTC shift near midnight) */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Formats ISO timestamp to "14/02/2026 15:30" in local timezone */
export function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Formats ISO timestamp to "15:30" in local timezone */
export function formatTime(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateShort(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Week helpers - semana fecha na terça (quarta a terça)
export function getWeekRange(date: Date): { inicio: string; fim: string } {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  // Find Wednesday (start of payment week)
  // Wed(3)→0, Thu(4)→-1, Fri(5)→-2, Sat(6)→-3, Sun(0)→-4, Mon(1)→-5, Tue(2)→-6
  const diffToWednesday = day >= 3 ? 3 - day : 3 - day - 7
  const wednesday = new Date(d)
  wednesday.setDate(d.getDate() + diffToWednesday)
  const tuesday = new Date(wednesday)
  tuesday.setDate(wednesday.getDate() + 6)
  return {
    inicio: localDateStr(wednesday),
    fim: localDateStr(tuesday),
  }
}

export function formatWeekRange(inicio: string, fim: string): string {
  const i = new Date(inicio + 'T12:00:00')
  const f = new Date(fim + 'T12:00:00')
  const di = i.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const df = f.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${di} - ${df}`
}

export function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + weeks * 7)
  return d
}
