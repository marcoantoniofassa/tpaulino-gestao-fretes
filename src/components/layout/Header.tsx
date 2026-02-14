import { LogOut, Truck } from 'lucide-react'

interface HeaderProps {
  title: string
  userName: string
  onLogout: () => void
}

export function Header({ title, userName, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 gradient-dark text-white z-40 shadow-lg">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-tp-accent/20 rounded-lg flex items-center justify-center">
            <Truck size={18} className="text-tp-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            <p className="text-[11px] text-slate-400 leading-tight">{userName}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Sair"
        >
          <LogOut size={20} className="text-slate-400" />
        </button>
      </div>
    </header>
  )
}
