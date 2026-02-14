import { useState, useEffect, useCallback } from 'react'
import { getSession, saveSession, clearSession, verifyPin } from '@/lib/auth'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (session) {
      setIsAuthenticated(true)
      setUserName(session.nome)
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (pin: string) => {
    const result = await verifyPin(pin)
    if (result.success) {
      saveSession(result.nome)
      setIsAuthenticated(true)
      setUserName(result.nome)
    }
    return result.success
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setIsAuthenticated(false)
    setUserName('')
  }, [])

  return { isAuthenticated, userName, loading, login, logout }
}
