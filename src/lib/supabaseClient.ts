/**
 * supabaseClient.ts — V12.2
 *
 * Safe Supabase client initialisation.
 * - Never throws during module load.
 * - Exports `supabase` (SupabaseClient | null) and `isSupabaseConfigured` (boolean).
 * - If env vars are absent / invalid the app runs normally in guest/local mode.
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

function initSupabase(): { client: SupabaseClient | null; configured: boolean } {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

    if (!url || !key) return { client: null, configured: false }
    if (typeof url !== 'string' || !url.startsWith('http')) return { client: null, configured: false }
    if (typeof key !== 'string' || key.trim() === '') return { client: null, configured: false }

    const client = createClient(url.trim(), key.trim(), {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })

    return { client, configured: true }
  } catch {
    return { client: null, configured: false }
  }
}

const { client, configured } = initSupabase()

export const supabase = client
export const isSupabaseConfigured = configured
