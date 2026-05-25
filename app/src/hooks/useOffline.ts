import { useEffect, useState, useRef } from 'react'
import { queueCount, flushQueue } from '../lib/db'

export function useOffline() {
  const [isOffline,    setIsOffline]    = useState(!navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing,      setSyncing]      = useState(false)
  const syncingRef = useRef(false)

  async function refreshCount() {
    setPendingCount(await queueCount())
  }

  async function flush() {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      await flushQueue()
      await refreshCount()
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }

  useEffect(() => {
    refreshCount()

    const goOffline = () => setIsOffline(true)
    const goOnline  = async () => { setIsOffline(false); await flush() }

    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)

    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { isOffline, pendingCount, syncing, refreshCount }
}
