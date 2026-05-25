import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { OfflineBanner } from './OfflineBanner'
import { NavigatorDashboard } from '../pages/navigator/DashboardPage'
import { ClientProfilePage } from '../pages/navigator/ClientProfilePage'
import { TaskListPage } from '../pages/navigator/tasks/TaskListPage'
import { CreateTaskPage } from '../pages/navigator/tasks/CreateTaskPage'
import { TaskDetailPage } from '../pages/navigator/tasks/TaskDetailPage'
import { LogSessionPage } from '../pages/navigator/sessions/LogSessionPage'
import { OnboardingWizard } from '../pages/navigator/onboarding/OnboardingWizard'
import { BenefitsScreenerPage } from '../pages/navigator/screener/BenefitsScreenerPage'
import { DriverDashboard } from '../pages/driver/DashboardPage'
import { FamilyDashboard } from '../pages/family/DashboardPage'
import { AdminDashboard } from '../pages/admin/DashboardPage'
import { ErrandOperationsPage } from '../pages/admin/errands/ErrandOperationsPage'
import { TripDetailPage } from '../pages/navigator/errands/TripDetailPage'
import { DriverProfilePage } from '../pages/admin/drivers/DriverProfilePage'
import { supabase } from '../lib/supabase'

type NavItem = { label: string; emoji: string; path: string }

const NAV_ITEMS: Record<string, NavItem[]> = {
  navigator:    [
    { label: 'Clients',  emoji: '👥', path: '/nav' },
    { label: 'Tasks',    emoji: '✅', path: '/nav/tasks' },
    { label: 'Onboard',  emoji: '➕', path: '/nav/onboard' },
  ],
  driver:       [
    { label: 'Trips',   emoji: '🚗', path: '/driver' },
    { label: 'History', emoji: '📂', path: '/driver/history' },
  ],
  family_proxy: [
    { label: 'Activity',   emoji: '📡', path: '/family' },
    { label: 'Documents',  emoji: '📄', path: '/family/docs' },
  ],
  admin:        [
    { label: 'Overview', emoji: '📊', path: '/admin' },
    { label: 'Errands',  emoji: '🚐', path: '/admin/errands' },
    { label: 'Drivers',  emoji: '🚗', path: '/admin/drivers' },
  ],
}

function NavigatorRoutes() {
  return (
    <Routes>
      <Route index element={<NavigatorDashboard />} />
      <Route path="clients/:id" element={<ClientProfilePage />} />
      <Route path="clients/:clientId/sessions/new" element={<LogSessionPage />} />
      <Route path="clients/:clientId/screener" element={<BenefitsScreenerPage />} />
      <Route path="tasks" element={<TaskListPage />} />
      <Route path="tasks/new" element={<CreateTaskPage />} />
      <Route path="tasks/:taskId" element={<TaskDetailPage />} />
      <Route path="onboard" element={<OnboardingWizard />} />
      <Route path="*" element={<Navigate to="/nav" replace />} />
    </Routes>
  )
}

export function AppShell() {
  const { role, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = NAV_ITEMS[role ?? ''] ?? []

  function AdminRoutes() {
    return (
      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="errands" element={<ErrandOperationsPage />} />
        <Route path="errands/:tripId" element={<TripDetailPage />} />
        <Route path="drivers/:driverId" element={<DriverProfilePage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    )
  }

  function MainContent() {
    switch (role) {
      case 'navigator':    return <NavigatorRoutes />
      case 'driver':       return <DriverDashboard />
      case 'family_proxy': return <FamilyDashboard />
      case 'admin':        return <AdminRoutes />
      default: return <div className="p-4 text-gray-500">Unknown role: {role}</div>
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <OfflineBanner />

      {/* Top header */}
      <header className="bg-green text-white px-4 py-3 flex items-center justify-between shadow">
        <div>
          <h1 className="font-bold text-lg leading-none">Pathway</h1>
          <p className="text-green-light text-xs capitalize">{role?.replace('_', ' ')} Dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-green-light truncate max-w-[140px]">{user?.email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs bg-green-dark px-2 py-1 rounded hover:bg-black/20 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <MainContent />
      </main>

      {/* Bottom navigation (mobile-first) */}
      {navItems.length > 0 && (
        <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex">
          {navItems.map(item => {
            const active = location.pathname === item.path ||
              (item.path !== '/nav' && location.pathname.startsWith(item.path))
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors
                  ${active ? 'text-green' : 'text-gray-500 hover:text-green'}`}
              >
                <span className="text-lg">{item.emoji}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
