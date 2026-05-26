import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { Badge } from '../../../components/ui/Badge'

interface DriverRow {
  id:                string
  active:            boolean
  online:            boolean
  county:            string | null
  rating:            number | null
  total_trips:       number
  cancel_flag_count: number
  background_check_status: string
  stripe_connect_complete: boolean
  license_expiry:    string | null
  insurance_expiry:  string | null
  profiles:          { name: string; phone: string | null } | null
}

function checkExpiry(dateStr: string | null): 'ok' | 'expiring' | 'expired' {
  if (!dateStr) return 'ok'
  const days = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0)  return 'expired'
  if (days < 30) return 'expiring'
  return 'ok'
}

function ExpiryBadge({ date }: { date: string | null }) {
  const state = checkExpiry(date)
  if (state === 'ok') return null
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
      state === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
    }`}>
      {state === 'expired' ? 'Expired' : 'Expiring soon'}
    </span>
  )
}

export function DriverListPage() {
  const navigate = useNavigate()
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<'all' | 'active' | 'pending' | 'flagged'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('drivers')
      .select('id, active, online, county, rating, total_trips, cancel_flag_count, background_check_status, stripe_connect_complete, license_expiry, insurance_expiry, profiles(name, phone)')
      .order('active', { ascending: false })
    setDrivers((data ?? []) as unknown as DriverRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = drivers.filter(d => {
    if (filter === 'active')  return d.active && d.background_check_status === 'approved'
    if (filter === 'pending') return !d.active || d.background_check_status !== 'approved'
    if (filter === 'flagged') return d.cancel_flag_count >= 3 || (d.rating ?? 5) < 4.0
    return true
  })

  const needsAttention = drivers.filter(d =>
    d.cancel_flag_count >= 3 ||
    (d.rating != null && d.rating < 4.0) ||
    checkExpiry(d.license_expiry) !== 'ok' ||
    checkExpiry(d.insurance_expiry) !== 'ok'
  ).length

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Drivers</h2>
        <span className="text-sm text-gray-500">{drivers.length} total</span>
      </div>

      {needsAttention > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <span className="text-amber-600 text-lg">⚠️</span>
          <p className="text-sm text-amber-800 font-medium">
            {needsAttention} driver{needsAttention !== 1 ? 's' : ''} need attention — expired docs, low rating, or cancel flags.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'active', 'pending', 'flagged'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-[#1a5c38] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'pending' ? 'Pending' : 'Flagged'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">🚗</p>
          <p className="font-medium">No drivers match this filter.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(driver => {
            const licState = checkExpiry(driver.license_expiry)
            const insState = checkExpiry(driver.insurance_expiry)
            const flagged  = driver.cancel_flag_count >= 3 || (driver.rating != null && driver.rating < 4.0)

            return (
              <li
                key={driver.id}
                onClick={() => navigate(`/admin/drivers/${driver.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer hover:border-[#1a5c38] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">
                        {driver.profiles?.name ?? 'Unnamed Driver'}
                      </p>
                      {flagged && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">⚠ Flagged</span>}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {driver.county ?? 'No county'} · {driver.total_trips} trip{driver.total_trips !== 1 ? 's' : ''}
                      {driver.rating != null && ` · ⭐ ${driver.rating.toFixed(1)}`}
                    </p>
                    {(licState !== 'ok' || insState !== 'ok') && (
                      <div className="flex gap-1.5 mt-1.5">
                        {licState !== 'ok' && <span className="text-xs">📄 License: <ExpiryBadge date={driver.license_expiry} /></span>}
                        {insState !== 'ok' && <span className="text-xs">🛡 Insurance: <ExpiryBadge date={driver.insurance_expiry} /></span>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge color={driver.active && driver.background_check_status === 'approved' ? 'green' : driver.background_check_status === 'pending' ? 'gray' : 'red'}>
                      {driver.active && driver.background_check_status === 'approved' ? 'Active' : driver.background_check_status === 'pending' ? 'Pending' : 'Inactive'}
                    </Badge>
                    {driver.online && driver.active && (
                      <span className="text-xs text-green-700 font-medium">● Online</span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
