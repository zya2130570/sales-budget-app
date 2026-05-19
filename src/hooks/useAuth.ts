import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

type AuthStatus = 'guest' | 'loading' | 'signed-in' | 'signed-out' | 'error'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? 'loading' : 'guest')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setStatus('guest')
      setSession(null)
      setUser(null)
      setError('')
      return
    }

    let mounted = true

    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) return
        if (sessionError) {
          setError(sessionError.message)
          setStatus('error')
          return
        }
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setStatus(data.session ? 'signed-in' : 'signed-out')
      })
      .catch(err => {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Unable to load auth session')
        setStatus('error')
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setStatus(nextSession ? 'signed-in' : 'signed-out')
      setError('')
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signUp = async (email: string, password: string) => {
    if (!supabase) {
      setStatus('guest')
      setError('Supabase is not configured yet.')
      return { error: new Error('Supabase is not configured yet.') }
    }

    setError('')
    const result = await supabase.auth.signUp({ email, password })
    if (result.error) setError(result.error.message)
    return result
  }

  const signIn = async (email: string, password: string) => {
    if (!supabase) {
      setStatus('guest')
      setError('Supabase is not configured yet.')
      return { error: new Error('Supabase is not configured yet.') }
    }

    setError('')
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.error) setError(result.error.message)
    return result
  }

  const signOut = async () => {
    if (!supabase) {
      setStatus('guest')
      setError('')
      return { error: null }
    }

    setError('')
    const result = await supabase.auth.signOut()
    if (result.error) setError(result.error.message)
    return result
  }

  return {
    session,
    user,
    status,
    error,
    isConfigured: isSupabaseConfigured,
    isLoading: status === 'loading',
    isSignedIn: status === 'signed-in',
    signUp,
    signIn,
    signOut,
  }
}
