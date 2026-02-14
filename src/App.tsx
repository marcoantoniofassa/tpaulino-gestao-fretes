import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { FretesPage } from '@/pages/FretesPage'
import { FreteDetailPage } from '@/pages/FreteDetailPage'
import { MotoristasPage } from '@/pages/MotoristasPage'
import { VeiculosPage } from '@/pages/VeiculosPage'
import { Spinner } from '@/components/ui/Spinner'

export default function App() {
  const { isAuthenticated, userName, loading, login, logout } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tp-dark">
        <Spinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={login} />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header title="T Paulino" userName={userName} onLogout={logout} />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/fretes" element={<FretesPage />} />
        <Route path="/fretes/:id" element={<FreteDetailPage />} />
        <Route path="/motoristas" element={<MotoristasPage />} />
        <Route path="/veiculos" element={<VeiculosPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <MobileNav />
    </div>
  )
}
