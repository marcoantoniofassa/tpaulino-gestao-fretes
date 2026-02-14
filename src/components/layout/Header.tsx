import { LogOut } from 'lucide-react'

interface HeaderProps {
  title: string
  userName: string
  onLogout: () => void
}

export function Header({ title, userName, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 bg-tp-dark text-white z-40">
      <div className="flex items-center justify-between px-4 h-14">
        <div>
          <h1 className="text-lg font-bold">{title}</h1>
          <p className="text-xs text-slate-400">{userName}</p>
        </div>
        <button
          onClick={onLogout}
          className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
          aria-label="Sair"
        >
          <LogOut size={20} />
        </button>
      </div>
    </header>
  )
}
