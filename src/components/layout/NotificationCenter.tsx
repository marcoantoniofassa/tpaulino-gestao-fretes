import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, CheckCheck, Truck, AlertTriangle, Info, X, Check } from 'lucide-react'
import { useNotificacoes, type Notificacao } from '@/hooks/useNotificacoes'
import { isPushSupported, subscribeToPush, getCurrentSubscription } from '@/lib/push'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

function tipoIcon(tipo: string) {
  switch (tipo) {
    case 'novo_frete': return <Truck size={16} className="text-tp-blue" />
    case 'erro': return <AlertTriangle size={16} className="text-tp-red" />
    default: return <Info size={16} className="text-slate-400" />
  }
}

function NotificacaoItem({ n, onRead }: { n: Notificacao; onRead: (n: Notificacao) => void }) {
  return (
    <button
      onClick={() => onRead(n)}
      className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors ${
        n.lida ? 'bg-white' : 'bg-blue-50/70'
      } hover:bg-slate-50 border-b border-slate-100 last:border-0`}
    >
      <div className="mt-0.5 shrink-0">{tipoIcon(n.tipo)}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${n.lida ? 'text-slate-600' : 'text-slate-800 font-medium'}`}>
          {n.titulo}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{n.mensagem}</p>
      </div>
      <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{timeAgo(n.created_at)}</span>
      {!n.lida && <span className="w-2 h-2 rounded-full bg-tp-blue shrink-0 mt-1.5" />}
    </button>
  )
}

export function NotificationCenter() {
  const { notificacoes, naoLidas, marcarLida, marcarTodasLidas } = useNotificacoes()
  const [open, setOpen] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    isPushSupported().then(setPushSupported)
    getCurrentSubscription().then(sub => setPushEnabled(!!sub))
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function enablePush() {
    const sub = await subscribeToPush()
    setPushEnabled(!!sub)
  }

  function handleRead(n: Notificacao) {
    marcarLida(n.id)
    setOpen(false)
    navigate(n.url)
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors relative"
        aria-label="Notificacoes"
      >
        {naoLidas > 0 ? (
          <BellRing size={20} className="text-tp-accent" />
        ) : (
          <Bell size={20} className="text-blue-200/70" />
        )}
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-tp-red text-white text-[10px] font-bold flex items-center justify-center px-1">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 max-h-[70vh] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-700">Notificacoes</h3>
            <div className="flex items-center gap-2">
              {naoLidas > 0 && (
                <button
                  onClick={marcarTodasLidas}
                  className="text-[11px] text-tp-blue hover:underline flex items-center gap-1"
                >
                  <CheckCheck size={14} /> Ler todas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-200 rounded">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
          </div>

          {/* Push banner */}
          {pushSupported && !pushEnabled && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
              <button
                onClick={enablePush}
                className="text-xs text-amber-800 font-medium flex items-center gap-2 w-full"
              >
                <Bell size={14} />
                Ativar notificacoes push
                <span className="ml-auto text-amber-600 text-[10px] bg-amber-200/60 px-2 py-0.5 rounded-full">Toque aqui</span>
              </button>
            </div>
          )}
          {pushEnabled && (
            <div className="px-4 py-1.5 bg-green-50 border-b border-green-100">
              <p className="text-[11px] text-green-700 flex items-center gap-1.5">
                <Check size={12} /> Push ativo neste dispositivo
              </p>
            </div>
          )}

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notificacoes.length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={32} className="text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Nenhuma notificacao</p>
              </div>
            ) : (
              notificacoes.map(n => (
                <NotificacaoItem key={n.id} n={n} onRead={handleRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
