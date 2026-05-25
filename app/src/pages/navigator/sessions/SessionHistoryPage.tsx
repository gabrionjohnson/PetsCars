import { useSessions } from '../../../hooks/useSessions'

interface Props {
  clientId: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function SessionHistoryPage({ clientId }: Props) {
  const { sessions, loading, error } = useSessions(clientId)

  const totalHours = sessions.reduce((acc, s) => acc + (s.duration_minutes ?? 0), 0) / 60

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>
  }

  return (
    <div className="p-4 space-y-4">
      {sessions.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-900">
          <strong>{sessions.length} total sessions</strong> — {totalHours.toFixed(1)} hours logged
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-base font-medium">No sessions logged yet.</p>
          <p className="text-sm mt-1">Log a session to track your work.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sessions.map(session => (
            <li key={session.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{formatDate(session.date)}</p>
                  {session.duration_minutes != null && (
                    <p className="text-xs text-gray-500 mt-0.5">{session.duration_minutes} minutes</p>
                  )}
                </div>
              </div>
              {session.tasks_completed.length > 0 && (
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  Tasks: {session.tasks_completed.join(', ')}
                </p>
              )}
              {session.notes && (
                <p className="text-xs text-gray-500 mt-2 italic leading-relaxed">
                  {session.notes.length > 100 ? `${session.notes.slice(0, 100)}…` : session.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
