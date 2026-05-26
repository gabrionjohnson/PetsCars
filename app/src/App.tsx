import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { AppShell } from './components/AppShell'
import { AmbassadorSignupPage } from './pages/ambassador/AmbassadorSignupPage'
import { AmbassadorDashboard } from './pages/ambassador/AmbassadorDashboard'

const PUBLIC_PREFIXES = ['/join', '/ambassador/']

function RoleRedirect({ role }: { role: string | null }) {
  switch (role) {
    case 'navigator':    return <Navigate to="/nav" replace />
    case 'driver':       return <Navigate to="/driver" replace />
    case 'family_proxy': return <Navigate to="/family" replace />
    case 'admin':        return <Navigate to="/admin" replace />
    default:             return <Navigate to="/nav" replace />
  }
}

function PublicRoutes() {
  return (
    <Routes>
      <Route path="/join" element={<AmbassadorSignupPage />} />
      <Route path="/ambassador/:token" element={<AmbassadorDashboard />} />
    </Routes>
  )
}

export default function App() {
  const { user, role, loading } = useAuth()
  const { pathname } = useLocation()

  // Render public pages immediately — no auth required, no spinner
  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p))) {
    return <PublicRoutes />
  }

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
