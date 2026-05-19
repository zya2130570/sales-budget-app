import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

type AuthStatus = 'guest' | 'loading' | 'signed-in' | 'signed-out' | 'error'

const SESSION_TIMEOUT_MS = 2500

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Supabase session check timed out. Continuing in guest/local mode.'))
    }, ms)

    promise
      .then(value => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch(error => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
}

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
    const fallbackTimer = window.setTimeout(() => {
      if (!mounted) return
      setStatus(current => current === 'loading' ? 'signed-out' : current)
    }, SESSION_TIMEOUT_MS + 500)

    withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS)
      .then(({ data, error: sessionError }) => {
        if (!mounted) return
        if (sessionError) {
          setError(sessionError.message)
          setStatus('signed-out')
          return
        }
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setStatus(data.session ? 'signed-in' : 'signed-out')
      })
      .catch(err => {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Authentication is unavailable. Guest/local mode is still active.')
        setStatus('signed-out')
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
      window.clearTimeout(fallbackTimer)
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
