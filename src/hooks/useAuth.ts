/**
 * useAuth.ts — V12.2
 *
 * Provides auth state for the app.
 * - Resolves immediately if Supabase is not configured (loading = false, user = null).
 * - Applies a 5-second timeout guard so auth never hangs indefinitely.
 * - Never crashes or blocks the rest of the app.
 */

import { useState, useEffect, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

export interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Not configured — stay in guest mode immediately
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    // Timeout guard: resolve after 5 s no matter what
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 5000)

    // Fetch current session
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (cancelled) return
      clearTimeout(timer)
      if (err) setError(err.message)
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
      setLoading(false)
    }).catch((err: unknown) => {
      if (cancelled) return
      clearTimeout(timer)
      setError(err instanceof Error ? err.message : 'Auth check failed')
      setLoading(false)
    })

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return
      setSession(newSession ?? null)
      setUser(newSession?.user ?? null)
      setError(null)
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured || !supabase) return
    setError(null)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) setError(err.message)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured || !supabase) return
    setError(null)
    try {
      const { error: err } = await supabase.auth.signUp({ email, password })
      if (err) setError(err.message)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return
    setError(null)
    try {
      const { error: err } = await supabase.auth.signOut()
      if (err) setError(err.message)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign out failed')
    }
  }, [])

  return { user, session, loading, error, isConfigured: isSupabaseConfigured, signIn, signUp, signOut }
}
