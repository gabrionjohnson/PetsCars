import { type ReactNode, type ButtonHTMLAttributes } from 'react'
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  children: ReactNode
  fullWidth?: boolean
}
export function Button({ variant = 'primary', loading, children, fullWidth, className = '', ...rest }: Props) {
  const base = 'inline-flex items-center justify-center rounded-xl font-semibold text-base py-3 px-5 transition-colors min-h-[48px] disabled:opacity-60 disabled:cursor-not-allowed'
  const variants: Record<Variant, string> = {
    primary:   'bg-[#1a5c38] text-white hover:bg-[#2d7a50] active:bg-[#0f3d25]',
    secondary: 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50',
    danger:    'bg-red-600 text-white hover:bg-red-700',
    ghost:     'text-[#1a5c38] hover:bg-green-50',
  }
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`${base} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {loading ? <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> : null}
      {children}
    </button>
  )
}
