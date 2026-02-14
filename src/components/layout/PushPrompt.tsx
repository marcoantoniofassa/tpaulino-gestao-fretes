import { useState, useEffect } from 'react'
import { Bell, X } from 'lucide-react'
import { isPushSupported, subscribeToPush, getCurrentSubscription } from '@/lib/push'

const DISMISSED_KEY = 'tp_push_prompt_dismissed'

export function PushPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    async function check() {
      // Don't show if already dismissed or not supported
      if (localStorage.getItem(DISMISSED_KEY)) return
      const supported = await isPushSupported()
      if (!supported) return
      const existing = await getCurrentSubscription()
      if (existing) return
      // Show after a short delay so it doesn't flash immediately
      setTimeout(() => setShow(true), 800)
    }
    check()
  }, [])

  async function handleEnable() {
    const sub = await subscribeToPush()
    if (sub) {
      localStorage.setItem(DISMISSED_KEY, '1')
    }
    setShow(false)
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed top-14 left-0 right-0 z-50 px-4 pt-2 animate-slide-down">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-tp-blue/10 flex items-center justify-center shrink-0">
          <Bell size={20} className="text-tp-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">Ativar notificacoes?</p>
          <p className="text-xs text-slate-500 mt-0.5">Receba alertas quando um novo frete entrar</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
          <button
            onClick={handleEnable}
            className="px-4 py-2 bg-tp-blue text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Ativar
          </button>
        </div>
      </div>
    </div>
  )
}
