/**
 * AuthPanel.tsx — V12.2
 *
 * Compact auth widget rendered in the app header.
 * - Shows "Guest mode" if Supabase is not configured.
 * - Shows email/password sign-in + sign-up form if configured but signed out.
 * - Shows user email + sign-out button if signed in.
 * - Never blocks the app from rendering.
 * - Auth errors appear only inside this panel.
 */

import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export function AuthPanel() {
  const { user, loading, error, isConfigured, signIn, signUp, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  // Not configured — show guest badge, no UI blocker
  if (!isConfigured) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 select-none">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          Guest mode
        </span>
      </div>
    )
  }

  // Loading — brief spinner, never hung
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 select-none">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Connecting…
        </span>
      </div>
    )
  }

  // Signed in — show email and sign-out
  if (user) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-green-700/60 bg-green-900/30 px-3 py-1 text-xs text-green-300">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          {user.email}
        </span>
        <button
          onClick={signOut}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
        >
          Sign out
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    )
  }

  // Signed out — toggle form
  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(v => !v)}
        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
      >
        {expanded ? 'Cancel' : 'Sign in'}
      </button>

      {expanded && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-2xl space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 rounded-lg py-1 text-xs font-medium transition-colors ${mode === 'signin' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 rounded-lg py-1 text-xs font-medium transition-colors ${mode === 'signup' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              Sign up
            </button>
          </div>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                mode === 'signin' ? signIn(email, password) : signUp(email, password)
              }
            }}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <button
            onClick={() => mode === 'signin' ? signIn(email, password) : signUp(email, password)}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-medium text-white transition-colors"
          >
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          {error && (
            <p className="text-xs text-red-400 break-words">{error}</p>
          )}

          {mode === 'signup' && (
            <p className="text-xs text-slate-500">
              Check your email to confirm your account after sign up.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
