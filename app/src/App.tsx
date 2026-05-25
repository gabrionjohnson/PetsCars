import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { AppShell } from './components/AppShell'

function RoleRedirect({ role }: { role: string | null }) {
  switch (role) {
    case 'navigator':    return <Navigate to="/nav" replace />
    case 'driver':       return <Navigate to="/driver" replace />
    case 'family_proxy': return <Navigate to="/family" replace />
    case 'admin':        return <Navigate to="/admin" replace />
    default:             return <Navigate to="/nav" replace />
  }
}

export default function App() {
  const { user, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <Routes>
      <Route path="/" element={<RoleRedirect role={role} />} />
      <Route path="/nav/*" element={<AppShell />} />
      <Route path="/driver/*" element={<AppShell />} />
      <Route path="/family/*" element={<AppShell />} />
      <Route path="/admin/*" element={<AppShell />} />
      <Route path="*" element={<RoleRedirect role={role} />} />
    </Routes>
  )
}
