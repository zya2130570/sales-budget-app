/// <reference types="node" />
/**
 * api/parse-pdf.ts — V54
 *
 * Sends a base64-encoded PDF bank statement to Gemini and extracts
 * transactions as structured JSON. Works with ANY bank format.
 *
 * Requires Vercel env vars:
 *   GEMINI_API_KEY            — from aistudio.google.com (free)
 *   SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY — for JWT auth
 *
 * Auth: requires a valid Supabase JWT in the Authorization: Bearer header.
 *
 * Response contract (success):
 *   { transactions: [{date, merchant, amount, type}], count: number,
 *     dropped: number, warning?: string }
 * Errors keep the existing { error: string } shape.
 */
import { createClient } from '@supabase/supabase-js'

// ~5.5M base64 chars ≈ 4MB of binary PDF
const MAX_PDF_BASE64_CHARS = 5_500_000

const ALLOWED_TYPES = ['expense', 'income', 'transfer', 'credit-card-payment'] as const
type TxType = (typeof ALLOWED_TYPES)[number]

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

const pad2 = (s: string) => s.padStart(2, '0')

/** Returns YYYY-MM-DD or null if the date can't be understood. */
function coerceDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null

  // Already ISO (possibly with time suffix)
  const iso = s.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso

  // MM/DD/YYYY (also tolerates M/D/YYYY)
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`

  // DD Mon YYYY (e.g. "5 Mar 2026", "05 March 2026")
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/)
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (month) return `${m[3]}-${month}-${pad2(m[1])}`
  }

  return null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return res.status(200).json({
      error: 'GEMINI_API_KEY not set in Vercel env vars. Add it at aistudio.google.com (free).',
    })
  }

  // ---- Auth: require a valid Supabase session (same pattern as schema-migrate) ----
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: 'Server misconfigured: SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set.',
    })
  }

  const rawAuth = req.headers.authorization ?? req.headers.Authorization
  const token = (Array.isArray(rawAuth) ? rawAuth[0] : rawAuth ?? '').replace(/^Bearer /i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: authData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authData.user) return res.status(401).json({ error: 'Invalid session.' })

  // ---- Input validation ----
  const { pdfBase64 } = req.body ?? {}
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    return res.status(400).json({ error: 'pdfBase64 required' })
  }
  if (pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    return res.status(413).json({
      error: 'PDF is too large (over ~4MB). Please split the statement into smaller PDFs or export a CSV from your bank instead.',
    })
  }

  const prompt = [
    'You are a financial data extractor. Extract EVERY individual transaction from this bank or credit card statement PDF.',
    '',
    'SIGN CONVENTION (critical — read twice):',
    '- POSITIVE amount = money OUT: purchases, charges, debits, withdrawals, fees, interest charged.',
    '- NEGATIVE amount = money IN: deposits, credits, refunds, payments received.',
    'To repeat the sign convention: money leaving the account is POSITIVE; money entering the account is NEGATIVE.',
    '- For credit cards: purchases/charges are positive; payments and refunds are negative.',
    '- For bank accounts: withdrawals/debits are positive; deposits/credits are negative.',
    '',
    'Each transaction object MUST have exactly these fields (all REQUIRED):',
    '  date: "YYYY-MM-DD"',
    '  merchant: string (payee/description, concise)',
    '  amount: number (per the sign convention above)',
    '  type: "expense" | "income" | "transfer" | "credit-card-payment" — the "type" field is REQUIRED on every transaction.',
    '',
    'Rules:',
    '- IGNORE running-balance columns entirely. The amount is the TRANSACTION column value, never the balance column.',
    '- If transaction dates omit the year, infer the year from the statement period. Handle December→January boundaries: a December date on a statement covering Dec–Jan belongs to the earlier year, a January date to the later year.',
    '- Normalize European number formats: 1.234,56 → 1234.56',
    '- Parenthesized amounts are NEGATIVE per accounting convention: (123.45) means -123.45.',
    '- "CR" suffix = credit (money in, negative). "DR" suffix = debit (money out, positive).',
    '- SKIP: summary rows, total rows, subtotal rows, beginning-balance rows, ending-balance rows, headers, footers, and pending-transactions sections.',
    '- DO include interest charges and fees as expenses (positive amounts).',
    '- Use "credit-card-payment" as the type for payments made toward a credit card balance.',
    '',
    'Output strictly the JSON array of transaction objects. Return [] if no transactions are found.',
  ].join('\n')

  const responseSchema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING' },
        merchant: { type: 'STRING' },
        amount: { type: 'NUMBER' },
        type: { type: 'STRING', enum: [...ALLOWED_TYPES] },
      },
      required: ['date', 'merchant', 'amount', 'type'],
    },
  }

  // Try newest models first, fall back to older. gemini-1.5-flash was deprecated.
  const MODEL_FALLBACKS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
  ]

  let lastErr = ''
  for (const model of MODEL_FALLBACKS) {
    try {
      const generationConfig: Record<string, any> = {
        temperature: 0.1,
        maxOutputTokens: 32768,
        responseMimeType: 'application/json',
        responseSchema,
      }
      // Disable thinking on 2.5 models so the token budget goes to output.
      if (model.includes('2.5')) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 }
      }

      const requestBody = JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig,
      })

      // On 429/503 retry the SAME model once after 2s before moving on.
      let r: Response | null = null
      for (let attempt = 0; attempt < 2; attempt++) {
        r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': geminiKey,
            },
            body: requestBody,
          }
        )
        if ((r.status === 429 || r.status === 503) && attempt === 0) {
          await sleep(2000)
          continue
        }
        break
      }
      if (!r) continue

      const data = await r.json() as Record<string, any>

      if (!r.ok) {
        const errMsg = (data as any)?.error?.message ?? `Gemini HTTP ${r.status}`
        // Still rate-limited/unavailable after retry → try next model.
        if (r.status === 429 || r.status === 503) {
          lastErr = errMsg
          continue
        }
        // Model-not-found → try next fallback. Other errors are real and bubble up.
        if (errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('not supported')) {
          lastErr = errMsg
          continue
        }
        return res.status(200).json({ error: `Gemini API error: ${errMsg}` })
      }

      // Surface safety blocks explicitly
      const blockReason = data.promptFeedback?.blockReason
      if (blockReason) {
        return res.status(200).json({ error: `Gemini blocked this request: ${blockReason}` })
      }

      // Truncated output means we'd silently lose transactions — refuse instead.
      if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        return res.status(200).json({
          error: 'Statement too long — the parser hit its output limit partway through. Try splitting the PDF.',
        })
      }

      const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      if (!rawText) return res.status(200).json({ error: 'Gemini returned empty response' })

      // Strip markdown code fences if Gemini adds them despite instructions
      const clean = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

      let parsed: any[]
      try {
        parsed = JSON.parse(clean)
        if (!Array.isArray(parsed)) throw new Error('Not an array')
      } catch {
        return res.status(200).json({
          error: 'AI could not return structured data from this PDF. Try a text-based PDF (not scanned/image) or use CSV export from your bank.',
          rawPreview: rawText.slice(0, 200),
        })
      }

      // ---- Validate + normalize each row; count what we drop ----
      let dropped = 0
      const transactions: Array<{ date: string; merchant: string; amount: number; type: TxType }> = []

      for (const t of parsed) {
        if (!t || typeof t !== 'object') { dropped++; continue }

        const merchant = typeof t.merchant === 'string' ? t.merchant.trim() : ''
        if (!merchant) { dropped++; continue }

        const amount = typeof t.amount === 'number' ? t.amount : NaN
        if (!Number.isFinite(amount) || Math.abs(amount) >= 100000) { dropped++; continue }

        const date = coerceDate(t.date)
        if (!date) { dropped++; continue }

        const type: TxType = (ALLOWED_TYPES as readonly string[]).includes(t.type)
          ? t.type
          : 'expense'

        transactions.push({
          date,
          merchant: merchant.slice(0, 120),
          amount: Math.round(amount * 100) / 100,
          type,
        })
      }

      if (transactions.length === 0) {
        return res.status(200).json({
          error: dropped > 0
            ? `No usable transactions: all ${dropped} extracted rows failed validation and were skipped.`
            : 'No transactions could be extracted. Make sure this is a bank or credit card statement, not an account summary.',
        })
      }

      return res.status(200).json({
        transactions,
        count: transactions.length,
        dropped,
        warning: dropped > 0
          ? `${dropped} row${dropped === 1 ? '' : 's'} could not be parsed and ${dropped === 1 ? 'was' : 'were'} skipped`
          : undefined,
      })
    } catch (err: any) {
      lastErr = err?.message ?? 'unknown error'
      // Continue to next model on transient errors
      continue
    }
  }

  // All models failed
  return res.status(200).json({ error: `All Gemini models failed. Last error: ${lastErr || 'unknown'}` })
}
