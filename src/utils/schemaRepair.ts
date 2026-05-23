import { supabase } from '../lib/supabaseClient'

export type SchemaRepairResult = {
  ok: boolean
  applied?: string
  missing?: string[]
  error?: string
}

export async function runSchemaRepair(): Promise<SchemaRepairResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'You must be logged in to repair schema.' }

  try {
    const response = await fetch('/api/schema-migrate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      return { ok: false, error: body?.error ?? `Schema repair failed (${response.status}).` }
    }

    return {
      ok: Boolean(body?.ok),
      applied: body?.applied,
      missing: Array.isArray(body?.missing) ? body.missing : [],
      error: body?.ok ? undefined : 'Schema repair ran, but some checks still failed.',
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Schema repair failed.' }
  }
}
