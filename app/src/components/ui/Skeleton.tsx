interface SkeletonProps {
  className?: string
  rows?: number
  rowHeight?: string
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} />
}

export function SkeletonList({ rows = 3, rowHeight = 'h-20' }: SkeletonProps) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <Skeleton key={i} className={rowHeight} />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3 animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-1.5">
          <div className="h-4 w-32 bg-gray-100 rounded" />
          <div className="h-3 w-24 bg-gray-100 rounded" />
        </div>
        <div className="h-6 w-16 bg-gray-100 rounded-full" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 h-9 bg-gray-100 rounded-lg" />
        <div className="flex-1 h-9 bg-gray-100 rounded-lg" />
      </div>
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 animate-pulse">
      <div className="h-3 w-12 bg-gray-100 rounded mb-2" />
      <div className="h-7 w-10 bg-gray-100 rounded" />
    </div>
  )
}
