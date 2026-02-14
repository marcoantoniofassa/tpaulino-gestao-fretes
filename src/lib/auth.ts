import { supabase } from './supabase'
import { SESSION_KEY, SESSION_EXPIRY_DAYS } from './constants'

interface Session {
  nome: string
  expiresAt: number
}

export async function verifyPin(pin: string): Promise<{ success: boolean; nome: string }> {
  const { data, error } = await supabase.rpc('tp_verify_pin', { pin_input: pin })
  if (error) throw error
  const rows = data as { nome: string }[] | null
  if (!rows || rows.length === 0) return { success: false, nome: '' }
  return { success: true, nome: rows[0].nome }
}

export function saveSession(nome: string) {
  const session: Session = {
    nome,
    expiresAt: Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  const session: Session = JSON.parse(raw)
  if (Date.now() > session.expiresAt) {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
  return session
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
