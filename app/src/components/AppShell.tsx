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
import { NavigatorEarningsPage } from '../pages/navigator/earnings/EarningsPage'
import { DriverDashboard } from '../pages/driver/DashboardPage'
import { FamilyDashboard } from '../pages/family/DashboardPage'
import { FamilyBookErrandPage } from '../pages/family/BookErrandPage'
import { NemtPage as FamilyNemtPage } from '../pages/family/NemtPage'
import { BillingPage as FamilyBillingPage } from '../pages/family/billing/BillingPage'
import { FamilyDocumentsPage } from '../pages/family/FamilyDocumentsPage'
import { AdminDashboard } from '../pages/admin/DashboardPage'
import { ErrandOperationsPage } from '../pages/admin/errands/ErrandOperationsPage'
import { ErrandQueuePage } from '../pages/navigator/errands/ErrandQueuePage'
import { BookErrandPage } from '../pages/navigator/errands/BookErrandPage'
import { TripDetailPage } from '../pages/navigator/errands/TripDetailPage'
import { DriverProfilePage } from '../pages/admin/drivers/DriverProfilePage'
import { DriverListPage } from '../pages/admin/drivers/DriverListPage'
import { NemtQueuePage } from '../pages/navigator/nemt/NemtQueuePage'
import { BookNemtPage } from '../pages/navigator/nemt/BookNemtPage'
import { NemtTripDetailPage } from '../pages/navigator/nemt/NemtTripDetailPage'
import { NemtClaimsPage } from '../pages/admin/nemt/NemtClaimsPage'
import { NemtClaimDetailPage } from '../pages/admin/nemt/NemtClaimDetailPage'
import { NemtRevenuePage } from '../pages/admin/nemt/NemtRevenuePage'
import { AmbassadorListPage } from '../pages/admin/ambassadors/AmbassadorListPage'
import { AmbassadorLedgerPage } from '../pages/admin/ambassadors/AmbassadorLedgerPage'
import { BillingManagementPage } from '../pages/admin/billing/BillingManagementPage'
import { TerritoryMapPage } from '../pages/admin/territory/TerritoryMapPage'
import { FlyerGeneratorPage } from '../pages/admin/flyer/FlyerGeneratorPage'
import { PlatformSettingsPage } from '../pages/admin/settings/PlatformSettingsPage'
import { supabase } from '../lib/supabase'

type NavItem = { label: string; emoji: string; path: string }

const NAV_ITEMS: Record<string, NavItem[]> = {
  navigator:    [
    { label: 'Clients',   emoji: '👥', path: '/nav' },
    { label: 'Tasks',     emoji: '✅', path: '/nav/tasks' },
    { label: 'Errands',   emoji: '🚐', path: '/nav/errands' },
    { label: 'NEMT',      emoji: '🏥', path: '/nav/nemt' },
    { label: 'Earnings',  emoji: '💰', path: '/nav/earnings' },
  ],
  driver:       [
    { label: 'Trips',   emoji: '🚗', path: '/driver' },
    { label: 'History', emoji: '📂', path: '/driver/history' },
  ],
  family_proxy: [
    { label: 'Activity',  emoji: '📡', path: '/family' },
    { label: 'NEMT',      emoji: '🏥', path: '/family/nemt' },
    { label: 'Billing',   emoji: '💳', path: '/family/billing' },
    { label: 'Documents', emoji: '📄', path: '/family/docs' },
  ],
  admin:        [
    { label: 'Overview',  emoji: '📊', path: '/admin' },
    { label: 'Errands',   emoji: '🚐', path: '/admin/errands' },
    { label: 'NEMT',      emoji: '🏥', path: '/admin/nemt' },
    { label: 'Drivers',   emoji: '🚗', path: '/admin/drivers' },
    { label: 'More',      emoji: '⋯',  path: '/admin/more' },
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
      <Route path="errands" element={<ErrandQueuePage />} />
      <Route path="errands/new" element={<BookErrandPage />} />
      <Route path="errands/:tripId" element={<TripDetailPage />} />
      <Route path="nemt" element={<NemtQueuePage />} />
      <Route path="nemt/new" element={<BookNemtPage />} />
      <Route path="nemt/:tripId" element={<NemtTripDetailPage />} />
      <Route path="onboard" element={<OnboardingWizard />} />
      <Route path="earnings" element={<NavigatorEarningsPage />} />
      <Route path="*" element={<Navigate to="/nav" replace />} />
    </Routes>
  )
}

function FamilyRoutes() {
  return (
    <Routes>
      <Route index element={<FamilyDashboard />} />
      <Route path="book" element={<FamilyBookErrandPage />} />
      <Route path="nemt" element={<FamilyNemtPage />} />
      <Route path="billing" element={<FamilyBillingPage />} />
      <Route path="docs" element={<FamilyDocumentsPage />} />
      <Route path="*" element={<Navigate to="/family" replace />} />
    </Routes>
  )
}

/** Admin "More" menu — secondary pages not in bottom nav */
function AdminMorePage() {
  const navigate = useNavigate()
  const links = [
    { label: 'Ambassadors',  emoji: '🤝', path: '/admin/ambassadors' },
    { label: 'Billing',      emoji: '💳', path: '/admin/billing' },
    { label: 'Territory',    emoji: '🗺️',  path: '/admin/territory' },
    { label: 'Flyer Gen',    emoji: '📄', path: '/admin/flyer' },
    { label: 'Settings',     emoji: '⚙️',  path: '/admin/settings' },
    { label: 'Revenue',      emoji: '📈', path: '/admin/nemt/revenue' },
  ]
  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-bold text-gray-900">More</h2>
      <div className="grid grid-cols-2 gap-3">
        {links.map(l => (
          <button
            key={l.path}
            onClick={() => navigate(l.path)}
            className="bg-white border border-gray-200 rounded-xl p-4 text-left shadow-sm hover:border-[#1a5c38] transition-colors"
          >
            <p className="text-2xl mb-1">{l.emoji}</p>
            <p className="text-sm font-semibold text-gray-900">{l.label}</p>
          </button>
        ))}
      </div>
    </div>
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
        <Route path="nemt" element={<NemtClaimsPage />} />
        <Route path="nemt/revenue" element={<NemtRevenuePage />} />
        <Route path="nemt/claims/:claimId" element={<NemtClaimDetailPage />} />
        <Route path="drivers" element={<DriverListPage />} />
        <Route path="drivers/:driverId" element={<DriverProfilePage />} />
        <Route path="ambassadors" element={<AmbassadorListPage />} />
        <Route path="ambassadors/:id" element={<AmbassadorLedgerPage />} />
        <Route path="billing" element={<BillingManagementPage />} />
        <Route path="territory" element={<TerritoryMapPage />} />
        <Route path="flyer" element={<FlyerGeneratorPage />} />
        <Route path="settings" element={<PlatformSettingsPage />} />
        <Route path="more" element={<AdminMorePage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    )
  }

  function MainContent() {
    switch (role) {
      case 'navigator':    return <NavigatorRoutes />
      case 'driver':       return <DriverDashboard />
      case 'family_proxy': return <FamilyRoutes />
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
              (item.path !== '/nav' && item.path !== '/family' && item.path !== '/admin' &&
               location.pathname.startsWith(item.path))
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
