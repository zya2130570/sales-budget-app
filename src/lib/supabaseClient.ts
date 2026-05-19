import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const supabaseUrl = rawSupabaseUrl?.trim()
const supabaseAnonKey = rawSupabaseAnonKey?.trim()

const hasRealSupabaseUrl = Boolean(
  supabaseUrl &&
  supabaseUrl.startsWith('https://') &&
  supabaseUrl.includes('.supabase.co') &&
  !supabaseUrl.includes('your-project-id')
)

const hasRealSupabaseKey = Boolean(
  supabaseAnonKey &&
  supabaseAnonKey.length > 20 &&
  !supabaseAnonKey.includes('your-anon') &&
  !supabaseAnonKey.includes('your-publishable')
)

export const isSupabaseConfigured = hasRealSupabaseUrl && hasRealSupabaseKey

const createSupabaseClient = (): SupabaseClient | null => {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) return null

  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  } catch {
    return null
  }
}

export const supabase: SupabaseClient | null = createSupabaseClient()
