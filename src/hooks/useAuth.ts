import { useState, useEffect, useCallback } from 'react'
import { getSession, saveSession, clearSession, verifyPin } from '@/lib/auth'
import type { UserRole } from '@/lib/auth'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState<UserRole>('admin')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (session) {
      setIsAuthenticated(true)
      setUserName(session.nome)
      setRole(session.role)
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (pin: string) => {
    const result = await verifyPin(pin)
    if (result.success) {
      saveSession(result.nome, result.role)
      setIsAuthenticated(true)
      setUserName(result.nome)
      setRole(result.role)
    }
    return result.success
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setIsAuthenticated(false)
    setUserName('')
    setRole('admin')
  }, [])

  return { isAuthenticated, userName, role, loading, login, logout }
}
