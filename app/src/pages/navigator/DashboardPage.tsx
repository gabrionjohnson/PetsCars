import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { enqueue } from '../../lib/db'
import { useOffline } from '../../hooks/useOffline'

interface Client {
  id: string
  name: string
  phone: string
  county: string | null
  subscription_status: string
  subscription_tier: string | null
}

export function NavigatorDashboard() {
  const [clients, setClients]   = useState<Client[]>([])
  const [loading, setLoading]   = useState(true)
  const { isOffline, pendingCount } = useOffline()

  useEffect(() => {
    supabase
      .from('clients')
      .select('id,name,phone,county,subscription_status,subscription_tier')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) setClients(data)
        setLoading(false)
      })
  }, [])

  async function logSessionOffline(clientId: string) {
    await enqueue({
      table: 'sessions',
      op: 'INSERT',
      payload: {
        client_id: clientId,
        date: new Date().toISOString().split('T')[0],
        notes: '',
        sms_summary_sent: false,
      },
    })
    alert('Session queued — will sync when online.')
  }

  const statusColors: Record<string, string> = {
    active:    'bg-green-100 text-green-800',
    past_due:  'bg-amber-100 text-amber-800',
    inactive:  'bg-gray-100 text-gray-600',
    canceled:  'bg-red-100 text-red-700',
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">My Clients</h2>
        <span className="text-sm text-gray-500">{clients.length} total</span>
      </div>

      {isOffline && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <strong>Offline mode.</strong> Changes will sync when you reconnect.
          {pendingCount > 0 && ` (${pendingCount} pending)`}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No clients yet.</p>
          <p className="text-sm mt-1">Clients are added during in-person onboarding.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {clients.map(client => (
            <li key={client.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{client.name}</p>
                  <p className="text-sm text-gray-500">{client.phone}</p>
                  {client.county && (
                    <p className="text-xs text-gray-400 mt-0.5">{client.county} County</p>
                  )}
                </div>
                <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${statusColors[client.subscription_status] ?? statusColors['inactive']}`}>
                  {client.subscription_tier ?? client.subscription_status}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => logSessionOffline(client.id)}
                  className="flex-1 bg-green text-white text-sm font-medium py-2 rounded-lg
                             hover:bg-green-light active:bg-green-dark transition-colors"
                >
                  Log Session
                </button>
                <button
                  className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg
                             hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  View Tasks
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
