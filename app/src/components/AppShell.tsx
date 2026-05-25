import { useAuth } from '../hooks/useAuth'
import { OfflineBanner } from './OfflineBanner'
import { NavigatorDashboard } from '../pages/navigator/DashboardPage'
import { DriverDashboard } from '../pages/driver/DashboardPage'
import { FamilyDashboard } from '../pages/family/DashboardPage'
import { AdminDashboard } from '../pages/admin/DashboardPage'
import { supabase } from '../lib/supabase'

const NAV_ITEMS: Record<string, { label: string; emoji: string }[]> = {
  navigator:    [{ label: 'Clients', emoji: '👥' }, { label: 'Tasks', emoji: '✅' }, { label: 'Sessions', emoji: '📋' }],
  driver:       [{ label: 'Trips', emoji: '🚗' }, { label: 'History', emoji: '📂' }],
  family_proxy: [{ label: 'Activity', emoji: '📡' }, { label: 'Documents', emoji: '📄' }, { label: 'Billing', emoji: '💳' }],
  admin:        [{ label: 'Overview', emoji: '📊' }, { label: 'Navigators', emoji: '🗺️' }, { label: 'Drivers', emoji: '🚗' }],
}

export function AppShell() {
  const { role, user } = useAuth()

  function DashboardContent() {
    switch (role) {
      case 'navigator':    return <NavigatorDashboard />
      case 'driver':       return <DriverDashboard />
      case 'family_proxy': return <FamilyDashboard />
      case 'admin':        return <AdminDashboard />
      default: return <div className="p-4 text-gray-500">Unknown role: {role}</div>
    }
  }

  const navItems = NAV_ITEMS[role ?? ''] ?? []

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
        <DashboardContent />
      </main>

      {/* Bottom navigation (mobile-first) */}
      {navItems.length > 0 && (
        <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex">
          {navItems.map(item => (
            <button
              key={item.label}
              className="flex-1 flex flex-col items-center gap-1 py-2 text-xs text-gray-600
                         hover:text-green active:text-green-dark transition-colors"
            >
              <span className="text-lg">{item.emoji}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
