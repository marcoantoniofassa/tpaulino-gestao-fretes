import { LogOut } from 'lucide-react'
import { NotificationCenter } from './NotificationCenter'

interface HeaderProps {
  title: string
  userName: string
  onLogout: () => void
}

export function Header({ title, userName, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 shadow-lg overflow-hidden">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img
          src="/header-bg.png"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-tp-dark/90 via-tp-dark/70 to-tp-blue/60" />
      </div>
      <div className="relative flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3">
          <img
            src="/icon-192.png"
            alt="T Paulino"
            className="w-9 h-9 rounded-lg object-cover"
          />
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">{title}</h1>
            <p className="text-[11px] text-blue-200/70 leading-tight">{userName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NotificationCenter />
          <button
            onClick={onLogout}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Sair"
          >
            <LogOut size={20} className="text-blue-200/70" />
          </button>
        </div>
      </div>
    </header>
  )
}
