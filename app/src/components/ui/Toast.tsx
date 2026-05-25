import { useEffect } from 'react'
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div className="fixed bottom-20 inset-x-4 z-50 bg-gray-900 text-white text-sm rounded-xl px-4 py-3 shadow-lg flex items-center gap-2">
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-gray-400 hover:text-white">✕</button>
    </div>
  )
}
