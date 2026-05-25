export function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100)
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5">
      <div className="bg-[#1a5c38] h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}
