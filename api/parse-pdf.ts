/**
 * api/parse-pdf.ts — V36
 *
 * Sends a base64-encoded PDF bank statement to Gemini and extracts
 * transactions as structured JSON. Works with ANY bank format.
 *
 * Requires: GEMINI_API_KEY in Vercel environment variables.
 * Gemini 1.5 Flash reads the full PDF visually — no OCR needed.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return res.status(200).json({
      error: 'GEMINI_API_KEY not set in Vercel env vars. Add it at aistudio.google.com (free).',
    })
  }

  const { pdfBase64 } = req.body ?? {}
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    return res.status(400).json({ error: 'pdfBase64 required' })
  }

  const prompt = [
    'You are a financial data extractor. Extract ALL transactions from this bank statement PDF.',
    'Return ONLY a raw JSON array — no markdown, no code fences, no explanation.',
    'Each object must have exactly these fields:',
    '  date: "YYYY-MM-DD" (use statement date if individual date unclear)',
    '  merchant: string (payee/description, concise)',
    '  amount: number (POSITIVE = expense/charge/debit, NEGATIVE = credit/deposit/refund)',
    '  type: "expense" | "income" | "transfer"',
    'Rules:',
    '- Include every individual transaction line',
    '- Skip: balance totals, summary rows, headers, footers, interest accrual rows',
    '- For credit cards: purchases are positive, payments are negative',
    '- For bank accounts: withdrawals/debits are positive, deposits are negative',
    'Return [ ] if no transactions are found. Return ONLY the JSON array, nothing else.',
  ].join('\n')

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        }),
      }
    )

    const data = await r.json() as Record<string, any>

    if (!r.ok) {
      const errMsg = (data as any)?.error?.message ?? `Gemini HTTP ${r.status}`
      return res.status(200).json({ error: `Gemini API error: ${errMsg}` })
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

    // Validate + normalize each row
    const transactions = parsed
      .filter((t: any) => t && t.merchant && typeof t.amount === 'number')
      .map((t: any) => ({
        date: String(t.date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        merchant: String(t.merchant).trim().slice(0, 120),
        amount: Math.round(parseFloat(t.amount) * 100) / 100,
        type: (['expense', 'income', 'transfer'] as const).includes(t.type) ? t.type : 'expense',
      }))

    if (transactions.length === 0) {
      return res.status(200).json({
        error: 'No transactions could be extracted. Make sure this is a bank or credit card statement, not an account summary.',
      })
    }

    return res.status(200).json({ transactions, count: transactions.length })
  } catch (err: any) {
    return res.status(200).json({ error: `Request failed: ${err?.message ?? 'unknown error'}` })
  }
}
