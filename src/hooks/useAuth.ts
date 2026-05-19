import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export type AuthMode = 'guest' | 'authenticated'
export type AuthStatus = 'checking' | 'guest' | 'authenticated'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setStatus('guest')
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) setAuthError(error.message)
      const sessionUser = data.session?.user ?? null
      setUser(sessionUser)
      setStatus(sessionUser ? 'authenticated' : 'guest')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      setStatus(sessionUser ? 'authenticated' : 'guest')
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    setAuthError('')
    if (!supabase) {
      setAuthError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return false
    }

    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setAuthError(error.message)
      return false
    }

    return true
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError('')
    if (!supabase) {
      setAuthError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return false
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message)
      return false
    }

    return true
  }, [])

  const signOut = useCallback(async () => {
    setAuthError('')
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
  }, [])

  const clearAuthError = useCallback(() => setAuthError(''), [])

  return {
    user,
    status,
    authMode: (user ? 'authenticated' : 'guest') as AuthMode,
    authError,
    isSupabaseConfigured,
    signUp,
    signIn,
    signOut,
    clearAuthError,
  }
}
