import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { Toast } from '../../../components/ui/Toast'

interface County {
  id:         string
  name:       string
  state:      string
  fips:       string | null
  population: number | null
  created_at: string
}

interface NavigatorCounty {
  county_id:  string
  navigator_id: string
  navigators: { id: string; name: string; active_clients: number } | null
}

export function TerritoryMapPage() {
  const [counties,   setCounties]   = useState<County[]>([])
  const [coverage,   setCoverage]   = useState<NavigatorCounty[]>([])
  const [navigators, setNavigators] = useState<{ id: string; name: string; active_clients: number }[]>([])
  const [loading,    setLoading]    = useState(true)
  const [toast,      setToast]      = useState<string | null>(null)
  const [assigning,  setAssigning]  = useState<{ countyId: string; navId: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, ncRes, nRes] = await Promise.all([
      supabase.from('counties').select('*').order('name'),
      supabase
        .from('navigator_counties')
        .select('county_id, navigator_id, navigators(id, name, active_clients)'),
      supabase
        .from('navigators')
        .select('id, name, active_clients')
        .eq('active', true)
        .order('name'),
    ])
    setCounties((cRes.data ?? []) as County[])
    setCoverage((ncRes.data ?? []) as unknown as NavigatorCounty[])
    setNavigators((nRes.data ?? []) as { id: string; name: string; active_clients: number }[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function assignNavigator(countyId: string, navId: string) {
    setAssigning({ countyId, navId })
    const { error } = await supabase
      .from('navigator_counties')
      .upsert({ county_id: countyId, navigator_id: navId }, { onConflict: 'county_id,navigator_id' })
    if (error) setToast('Error assigning navigator.')
    else { setToast('Navigator assigned.'); load() }
    setAssigning(null)
  }

  async function removeNavigator(countyId: string, navId: string) {
    const { error } = await supabase
      .from('navigator_counties')
      .delete()
      .eq('county_id', countyId)
      .eq('navigator_id', navId)
    if (error) setToast('Error removing navigator.')
    else { setToast('Navigator removed.'); load() }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  const covered  = counties.filter(c => coverage.some(nc => nc.county_id === c.id)).length
  const uncovered = counties.length - covered

  // Navigator load map: navId → # counties
  const navCountyCounts = coverage.reduce<Record<string, number>>((acc, nc) => {
    acc[nc.navigator_id] = (acc[nc.navigator_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Territory Coverage</h2>
        <span className="text-sm text-gray-500">{counties.length} counties</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Covered',   value: covered, color: 'text-green-700' },
          { label: 'Uncovered', value: uncovered, color: uncovered > 0 ? 'text-amber-600' : 'text-gray-400' },
          { label: 'Navigators', value: navigators.length, color: 'text-gray-900' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Navigator load summary */}
      {navigators.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Navigator Assignments</h3>
          <div className="space-y-2">
            {navigators.map(nav => (
              <div key={nav.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-800">{nav.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{nav.active_clients} clients</span>
                  <span className="text-xs font-medium text-[#1a5c38]">
                    {navCountyCounts[nav.id] ?? 0} counties
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* County list */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">County Coverage</h3>
        </div>
        <ul className="divide-y divide-gray-100">
          {counties.map(county => {
            const countyNavs = coverage
              .filter(nc => nc.county_id === county.id)
              .map(nc => nc.navigators)
              .filter(Boolean) as { id: string; name: string; active_clients: number }[]

            return (
              <li key={county.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{county.name} County</p>
                    {county.population && (
                      <p className="text-xs text-gray-400">Pop. {county.population.toLocaleString()}</p>
                    )}
                    {countyNavs.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {countyNavs.map(nav => (
                          <span key={nav.id} className="inline-flex items-center gap-1 bg-green-50 text-green-800 text-xs px-2 py-0.5 rounded-full">
                            {nav.name}
                            <button
                              onClick={() => removeNavigator(county.id, nav.id)}
                              className="text-green-600 hover:text-red-600 font-bold"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-block mt-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        Unassigned
                      </span>
                    )}
                  </div>
                  {/* Assign dropdown */}
                  <select
                    onChange={e => { if (e.target.value) assignNavigator(county.id, e.target.value) }}
                    value=""
                    disabled={assigning?.countyId === county.id}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a5c38] shrink-0"
                  >
                    <option value="">+ Assign…</option>
                    {navigators
                      .filter(nav => !countyNavs.some(cn => cn.id === nav.id))
                      .map(nav => (
                        <option key={nav.id} value={nav.id}>{nav.name}</option>
                      ))
                    }
                  </select>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
