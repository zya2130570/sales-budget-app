/**
 * api/chat.ts — V14
 * Vercel serverless function that proxies to the Anthropic API.
 * The API key lives in Vercel environment variables (never exposed to the browser).
 *
 * Setup: add ANTHROPIC_API_KEY to your Vercel project environment variables.
 */

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set. Add it to your Vercel environment variables.',
    })
  }

  const { messages, context } = req.body ?? {}
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const systemPrompt = buildSystemPrompt(context ?? {})

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    })

    const data = await anthropicRes.json()

    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({ error: data?.error?.message ?? 'Anthropic API error' })
    }

    const text: string = Array.isArray(data.content)
      ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
      : ''

    return res.status(200).json({ reply: text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: msg })
  }
}

function buildSystemPrompt(ctx: Record<string, unknown>): string {
  const lines: string[] = [
    'You are a personal finance assistant built into the Flow app.',
    'You have access to the user\'s real financial data shown below.',
    'Answer concisely (2-4 sentences max unless asked for detail).',
    'Always use real numbers from the data. Be direct and actionable.',
    'If data is missing or zero, say so and explain what the user needs to set up.',
    '',
    '--- FINANCIAL DATA ---',
    JSON.stringify(ctx, null, 2),
    '--- END DATA ---',
    '',
    'Common questions you handle:',
    '- "Can I afford X?" — compare X against safeToSpend and monthly surplus',
    '- "Why is my budget over my income?" — explain the income vs plannedBudget gap',
    '- "How much should I save per month?" — use savings goals and deadlines',
    '- "What should I cut?" — suggest the highest over-budget variable categories',
    '- "When will I hit my [goal]?" — use goal progress + monthly contribution pace',
  ]
  return lines.join('\n')
}
