import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export function AuthPanel() {
  const {
    user,
    status,
    error,
    isConfigured,
    isLoading,
    isSignedIn,
    signIn,
    signUp,
    signOut,
  } = useAuth()

  const [mode, setMode] = useState<'collapsed' | 'sign-in' | 'sign-up'>('collapsed')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setMessage('')
    setSubmitting(false)
  }

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setMessage('Enter an email and password.')
      return
    }

    setSubmitting(true)
    setMessage('')

    const result = mode === 'sign-up'
      ? await signUp(email.trim(), password)
      : await signIn(email.trim(), password)

    setSubmitting(false)

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    setMessage(mode === 'sign-up' ? 'Account created. Check your email if confirmation is required.' : 'Signed in.')
    if (mode === 'sign-in') {
      resetForm()
      setMode('collapsed')
    }
  }

  if (!isConfigured) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
        Guest mode
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
        Checking session...
      </div>
    )
  }

  if (isSignedIn) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm">
        <div className="text-slate-300 truncate max-w-64">{user?.email}</div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-600"
        >
          Sign out
        </button>
      </div>
    )
  }

  if (mode === 'collapsed') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('sign-in')}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode('sign-up')}
          className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600"
        >
          Create account
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm md:w-80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-semibold text-slate-100">{mode === 'sign-up' ? 'Create account' : 'Sign in'}</div>
        <button
          type="button"
          onClick={() => {
            resetForm()
            setMode('collapsed')
          }}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-2">
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
        />
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSubmit()}
          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Working...' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
        </button>
      </div>

      {(message || error || status === 'error') && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {message || error || 'Authentication is unavailable right now.'}
        </div>
      )}

      <div className="mt-2 text-xs text-slate-500">
        Local guest data stays on this device. Cloud sync comes in a later version.
      </div>
    </div>
  )
}
