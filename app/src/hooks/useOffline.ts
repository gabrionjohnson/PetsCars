import { useEffect, useState } from 'react'
import { queueCount } from '../lib/db'

export function useOffline() {
  const [isOffline,   setIsOffline]   = useState(!navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    async function refresh() {
      const n = await queueCount()
      setPendingCount(n)
    }

    const goOffline = () => setIsOffline(true)
    const goOnline  = () => { setIsOffline(false); refresh() }

    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    refresh()

    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [])

  return { isOffline, pendingCount }
}
