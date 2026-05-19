import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from './ui'
import type { AuthStatus } from '../hooks/useAuth'

interface AuthPanelProps {
  user: User | null
  status: AuthStatus
  authError: string
  isSupabaseConfigured: boolean
  onSignIn: (email: string, password: string) => Promise<boolean>
  onSignUp: (email: string, password: string) => Promise<boolean>
  onSignOut: () => Promise<void>
  onClearError: () => void
}

export function AuthPanel({
  user,
  status,
  authError,
  isSupabaseConfigured,
  onSignIn,
  onSignUp,
  onSignOut,
  onClearError,
}: AuthPanelProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const ok = mode === 'signin'
      ? await onSignIn(email.trim(), password)
      : await onSignUp(email.trim(), password)
    setBusy(false)

    if (ok) {
      setPassword('')
      setMessage(mode === 'signup' ? 'Account created. Check your email if confirmation is required.' : 'Signed in.')
      if (mode === 'signin') setOpen(false)
    }
  }

  const badge = user
    ? user.email ?? 'Signed in'
    : isSupabaseConfigured
      ? 'Guest mode'
      : 'Local only'

  return (
    <div className="relative">
      <button
        onClick={() => {
          onClearError()
          setMessage('')
          setOpen(prev => !prev)
        }}
        className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 transition-colors min-w-[150px]"
      >
        <div className="font-semibold text-slate-100">{badge}</div>
        <div className="text-[11px] text-slate-500">
          {status === 'checking' ? 'Checking session' : user ? 'Cloud account active' : 'Local-first app'}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-100">Cloud account</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              V12.2 adds login only. Your app data still stays local until a later sync version.
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-xs text-amber-200">
              Supabase environment variables are not configured. Guest/local mode still works.
            </div>
          )}

          {user ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3 text-xs text-slate-300">
                Signed in as <span className="font-semibold text-slate-100">{user.email}</span>.
              </div>
              <Button tone="secondary" size="sm" onClick={onSignOut} className="w-full">
                Sign out
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs transition ${mode === 'signin' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs transition ${mode === 'signup' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  Sign up
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                  placeholder="Password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                />
              </div>

              {(authError || message) && (
                <div className={`rounded-lg border p-2 text-xs ${authError ? 'border-red-700/50 bg-red-950/30 text-red-200' : 'border-emerald-700/50 bg-emerald-950/30 text-emerald-200'}`}>
                  {authError || message}
                </div>
              )}

              <Button type="submit" tone="primary" size="sm" disabled={busy || !isSupabaseConfigured} className="w-full">
                {busy ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>

              <p className="text-[11px] leading-relaxed text-slate-500">
                Guest mode remains available. V12.3 will add local-to-cloud migration.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
