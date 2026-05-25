import { useOffline } from '../hooks/useOffline'

export function OfflineBanner() {
  const { isOffline, pendingCount } = useOffline()

  if (!isOffline && pendingCount === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2
        py-2 px-4 text-sm font-medium
        ${isOffline
          ? 'bg-amber-500 text-white'
          : 'bg-green text-white'}
      `}
    >
      <span className="inline-block w-2 h-2 rounded-full bg-white opacity-80 animate-pulse" />
      {isOffline
        ? `Offline${pendingCount > 0 ? ` — ${pendingCount} change${pendingCount !== 1 ? 's' : ''} pending sync` : ''}`
        : `Back online — syncing ${pendingCount} change${pendingCount !== 1 ? 's' : ''}…`}
    </div>
  )
}
