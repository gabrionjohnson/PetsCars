import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  user:    User | null
  session: Session | null
  role:    string | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null, session: null, role: null, loading: true,
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session
      const role    = session?.access_token
        ? (JSON.parse(atob(session.access_token.split('.')[1])) as Record<string, unknown>).user_role as string | null
        : null
      setState({ user: session?.user ?? null, session, role, loading: false })
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const role = session?.access_token
        ? (JSON.parse(atob(session.access_token.split('.')[1])) as Record<string, unknown>).user_role as string | null
        : null
      setState({ user: session?.user ?? null, session, role, loading: false })
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return state
}
