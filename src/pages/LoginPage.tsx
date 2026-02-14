import { useState } from 'react'
import { Truck } from 'lucide-react'
import { PinInput } from '@/components/ui/PinInput'

interface LoginPageProps {
  onLogin: (pin: string) => Promise<boolean>
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handlePin(pin: string) {
    setError('')
    setLoading(true)
    try {
      const ok = await onLogin(pin)
      if (!ok) setError('PIN incorreto')
    } catch {
      setError('Erro de conexao')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-tp-dark flex flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-tp-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Truck size={32} className="text-tp-accent" />
        </div>
        <h1 className="text-2xl font-bold text-white">T Paulino</h1>
        <p className="text-slate-400 text-sm mt-1">Gestao de Fretes</p>
      </div>

      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <p className="text-center text-sm text-slate-500 mb-6">Digite seu PIN de 4 digitos</p>
        <PinInput onComplete={handlePin} disabled={loading} />
        {error && (
          <p className="text-center text-sm text-red-500 mt-4">{error}</p>
        )}
        {loading && (
          <p className="text-center text-sm text-slate-400 mt-4">Verificando...</p>
        )}
      </div>
    </div>
  )
}
