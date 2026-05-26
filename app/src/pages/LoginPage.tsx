import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Map raw fetch/network errors to user-friendly messages
      const msg = error.message.toLowerCase()
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed')) {
        setError('Unable to connect. Check your internet connection and try again.')
      } else if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('password')) {
        setError('Incorrect email or password.')
      } else {
        setError(error.message)
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green">Pathway</h1>
          <p className="text-gray-600 mt-1 text-sm">Rural Senior Life Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-cream-dark p-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="email" type="email" autoComplete="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              id="password" type="password" autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green"
            />
          </div>

          {error && (
            <p role="alert" className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full bg-green text-white rounded-lg py-3 font-semibold text-base
                       hover:bg-green-light active:bg-green-dark
                       disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
