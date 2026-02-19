import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Truck, Users, CarFront, Wallet, Receipt } from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/fretes', icon: Truck, label: 'Fretes' },
  { to: '/pagamentos', icon: Wallet, label: 'Pagam.' },
  { to: '/gastos', icon: Receipt, label: 'Gastos' },
  { to: '/motoristas', icon: Users, label: 'Motoristas' },
  { to: '/veiculos', icon: CarFront, label: 'Veiculos' },
]

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors relative ${
                isActive ? 'text-tp-blue' : 'text-slate-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute -top-1 w-6 h-0.5 bg-tp-blue rounded-full" />
                )}
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
