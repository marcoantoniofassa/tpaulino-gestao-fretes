import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Truck, Users, CarFront, Wallet, Receipt } from 'lucide-react'
import type { UserRole } from '@/lib/auth'

const allNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', adminOnly: true },
  { to: '/fretes', icon: Truck, label: 'Fretes', adminOnly: true },
  { to: '/pagamentos', icon: Wallet, label: 'Pagam.', adminOnly: true },
  { to: '/gastos', icon: Receipt, label: 'Despesas', adminOnly: false },
  { to: '/motoristas', icon: Users, label: 'Motoristas', adminOnly: true },
  { to: '/veiculos', icon: CarFront, label: 'Veiculos', adminOnly: true },
]

interface MobileNavProps {
  role: UserRole
}

export function MobileNav({ role }: MobileNavProps) {
  const navItems = role === 'supervisor'
    ? allNavItems.filter(item => !item.adminOnly)
    : allNavItems

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
