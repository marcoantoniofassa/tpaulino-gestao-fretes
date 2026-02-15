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

// Week helpers - semana fecha na quarta (quinta a quarta)
export function getWeekRange(date: Date): { inicio: string; fim: string } {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 4=Thu, ..., 6=Sat
  // Find Thursday (start of payment week)
  // If today is Thu(4), Fri(5), Sat(6), Sun(0), Mon(1), Tue(2), Wed(3)
  // diffToThursday: 4→0, 5→-1, 6→-2, 0→-3, 1→-4, 2→-5, 3→-6
  const diffToThursday = day >= 4 ? 4 - day : 4 - day - 7
  const thursday = new Date(d)
  thursday.setDate(d.getDate() + diffToThursday)
  const wednesday = new Date(thursday)
  wednesday.setDate(thursday.getDate() + 6)
  return {
    inicio: localDateStr(thursday),
    fim: localDateStr(wednesday),
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
