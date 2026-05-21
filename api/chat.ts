export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set. Add it to Vercel environment variables.' })
  const { messages, context } = req.body ?? {}
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' })
  const system = [
    'You are a personal finance assistant built into the Flow app.',
    'You have the user\'s real financial data below. Answer in 2-4 sentences unless more detail is asked.',
    'Always use real numbers. Be direct and actionable.',
    'If data is missing/zero, say so and explain what the user needs to set up.',
    '', '--- FINANCIAL DATA ---', JSON.stringify(context, null, 2), '--- END ---', '',
    'Common questions: "Can I afford X?" (compare to safeToSpend/surplus), "Why budget over income?" (explain gap),',
    '"How much to save?" (use goals+deadlines), "What to cut?" (suggest highest over-budget variable categories).',
  ].join('\n')
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, system, messages }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message ?? 'Anthropic API error' })
    const text = Array.isArray(data.content) ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') : ''
    return res.status(200).json({ reply: text })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
