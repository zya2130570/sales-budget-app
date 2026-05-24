/**
 * api/health.ts — diagnostic endpoint
 * Visit /api/health in browser to see which env vars are present
 * Safe: shows presence/length only, never the actual key values
 */
export default function handler(req: any, res: any) {
  res.status(200).json({
    gemini: {
      present: !!process.env.GEMINI_API_KEY,
      length: process.env.GEMINI_API_KEY?.length ?? 0,
      prefix: process.env.GEMINI_API_KEY?.slice(0, 4) ?? 'none',
    },
    anthropic: {
      present: !!process.env.ANTHROPIC_API_KEY,
    },
    supabase: {
      url: !!process.env.VITE_SUPABASE_URL,
    },
    timestamp: new Date().toISOString(),
  })
}
