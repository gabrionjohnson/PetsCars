import { useNavigate } from 'react-router-dom'
import { useNemtTrips, NEMT_TRIP_TYPE_EMOJI, NEMT_TRIP_TYPE_LABELS } from '../../../hooks/useNemt'
import { Badge } from '../../../components/ui/Badge'
import { useState } from 'react'

type Filter = 'all' | 'upcoming' | 'active' | 'completed'

function statusBadgeColor(status: string): 'gray' | 'amber' | 'blue' | 'green' | 'red' {
  if (status === 'completed') return 'green'
  if (status === 'canceled')  return 'red'
  if (status === 'en_route')  return 'blue'
  if (status === 'assigned')  return 'amber'
  return 'gray'
}

function statusLabel(status: string): string {
  if (status === 'pending')   return 'Pending'
  if (status === 'assigned')  return 'Driver assigned'
  if (status === 'en_route')  return 'En route'
  if (status === 'completed') return 'Completed'
  if (status === 'canceled')  return 'Canceled'
  return status
}

function claimBadgeColor(cs: string): 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'orange' {
  if (cs === 'not_submitted') return 'gray'
  if (cs === 'submitted')     return 'amber'
  if (cs === 'paid')          return 'green'
  if (cs === 'denied')        return 'red'
  return 'gray'
}

function formatAppt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function NemtQueuePage() {
  const navigate = useNavigate()
  const { trips, loading } = useNemtTrips()
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = trips.filter(t => {
    if (filter === 'upcoming')  return t.status === 'pending' || t.status === 'assigned'
    if (filter === 'active')    return t.status === 'en_route'
    if (filter === 'completed') return t.status === 'completed' || t.status === 'canceled'
    return true
  })

  const upcomingCount = trips.filter(t => t.status === 'pending' || t.status === 'assigned').length
  const activeCount   = trips.filter(t => t.status === 'en_route').length

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">NEMT Trips</h2>
        <button
          onClick={() => navigate('/nav/nemt/new')}
          className="bg-[#1a5c38] text-white text-sm px-4 py-2 rounded-xl font-medium"
        >
          + Book Trip
        </button>
      </div>

      {/* Summary chips */}
      {(upcomingCount > 0 || activeCount > 0) && (
        <div className="flex gap-2 flex-wrap">
          {activeCount > 0 && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-medium">
              {activeCount} active now
            </span>
          )}
          {upcomingCount > 0 && (
            <span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">
              {upcomingCount} upcoming
            </span>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'upcoming', 'active', 'completed'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f ? 'bg-[#1a5c38] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'All' : f === 'upcoming' ? 'Upcoming' : f === 'active' ? 'Active' : 'Completed'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🏥</p>
          <p className="font-medium text-gray-500">No NEMT trips match this filter.</p>
          <button
            onClick={() => navigate('/nav/nemt/new')}
            className="mt-4 text-sm text-[#1a5c38] font-medium underline"
          >
            Book a trip
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(trip => (
            <li
              key={trip.id}
              onClick={() => navigate(`/nav/nemt/${trip.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer hover:border-[#1a5c38] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg">{NEMT_TRIP_TYPE_EMOJI[trip.trip_type]}</span>
                    <span className="font-semibold text-gray-900 text-sm">{NEMT_TRIP_TYPE_LABELS[trip.trip_type]}</span>
                    {trip.return_included && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Round-trip</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{formatAppt(trip.scheduled_datetime)}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{trip.pickup_address}</p>
                  {trip.appointment_provider && (
                    <p className="text-xs text-gray-500 mt-0.5">{trip.appointment_provider}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge color={statusBadgeColor(trip.status)}>{statusLabel(trip.status)}</Badge>
                  {trip.claim_status !== 'not_submitted' && (
                    <Badge color={claimBadgeColor(trip.claim_status)}>
                      {trip.claim_status === 'submitted' ? 'Submitted' :
                       trip.claim_status === 'paid'      ? 'Paid'      :
                       trip.claim_status === 'denied'    ? 'Denied'    : trip.claim_status}
                    </Badge>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
