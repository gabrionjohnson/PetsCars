type Color = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'orange'
export function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: Color }) {
  const colors: Record<Color, string> = {
    green:  'bg-green-100 text-green-800',
    amber:  'bg-amber-100 text-amber-800',
    red:    'bg-red-100 text-red-700',
    gray:   'bg-gray-100 text-gray-600',
    blue:   'bg-blue-100 text-blue-800',
    orange: 'bg-orange-100 text-orange-800',
  }
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${colors[color]}`}>{children}</span>
}
