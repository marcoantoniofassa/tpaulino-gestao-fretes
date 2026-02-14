import { useState } from 'react'
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
    <div className="min-h-screen relative flex flex-col items-center justify-center px-6">
      {/* Background with header image */}
      <div className="absolute inset-0">
        <img
          src="/header-bg.png"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-tp-dark/85 backdrop-blur-sm" />
      </div>

      <div className="relative z-10">
        <div className="mb-8 text-center">
          <img
            src="/logo.png"
            alt="T Paulino"
            className="w-24 h-24 rounded-2xl mx-auto mb-4 shadow-2xl border border-white/10"
          />
          <h1 className="text-2xl font-bold text-white">T Paulino</h1>
          <p className="text-blue-200/60 text-sm mt-1">Gestao de Fretes</p>
        </div>

        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-white/20">
          <p className="text-center text-sm text-slate-500 mb-6">Digite seu PIN de 4 digitos</p>
          <PinInput onComplete={handlePin} disabled={loading} />
          {error && (
            <p className="text-center text-sm text-red-500 mt-4">{error}</p>
          )}
          {loading && (
            <p className="text-center text-sm text-slate-400 mt-4">Verificando...</p>
          )}
        </div>

        <p className="text-center text-blue-300/30 text-xs mt-8">
          Porto de Santos &bull; Logistica
        </p>
      </div>
    </div>
  )
}
