/// <reference types="node" />
/**
 * api/chat.ts — V25
 *
 * Unified chat endpoint supporting Gemini Flash (free, preferred) and
 * Anthropic Claude (fallback). Handles systemOverride for guide-specific prompts.
 *
 * Required: ONE of these in Vercel env vars:
 *   GEMINI_API_KEY      — from aistudio.google.com (free, 1M tokens/day)
 *   ANTHROPIC_API_KEY   — from console.anthropic.com (paid)
 *
 * If both are set, Gemini is used. If neither is set, returns a clear setup error.
 */

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const geminiKey   = process.env.GEMINI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!geminiKey && !anthropicKey) {
    return res.status(500).json({
      error:
        'AI assistant not configured. Add GEMINI_API_KEY (free at aistudio.google.com) or ' +
        'ANTHROPIC_API_KEY to your Vercel environment variables.',
    })
  }

  const { messages, context, systemOverride } = req.body ?? {}
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' })
  }

  // Default system prompt for the financial assistant
  const defaultSystem = [
    'You are a personal finance assistant built into the Flow app.',
    'You have the user\'s real financial data below. Answer in 2-4 sentences unless more detail is asked.',
    'Always use real numbers. Be direct and actionable.',
    'If data is missing or zero, say so and explain what the user needs to set up.',
    '',
    '--- FINANCIAL DATA ---',
    JSON.stringify(context ?? {}, null, 2),
    '--- END ---',
    '',
    'Common questions: "Can I afford X?" → compare to safeToSpend/surplus.',
    '"Why is my budget over income?" → explain the gap between budget total and income.',
    '"How much should I save?" → use goals with deadlines.',
    '"What should I cut?" → suggest highest over-budget variable categories.',
  ].join('\n')

  // systemOverride replaces the default prompt (used by OnboardingGuide)
  const system = typeof systemOverride === 'string' && systemOverride.length > 0
    ? systemOverride
    : defaultSystem

  // ── Gemini (preferred — free tier) ─────────────────────────────────────────
  if (geminiKey) {
    try {
      const geminiMessages = messages.map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

      const normalizeModel = (name: string) => name.startsWith('models/') ? name.slice('models/'.length) : name

      async function getAvailableGeminiModels(): Promise<string[]> {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
          { method: 'GET' },
        )
        const data = await r.json() as { models?: { name?: string; supportedGenerationMethods?: string[] }[]; error?: { message?: string } }
        if (!r.ok) {
          const msg = data.error?.message ?? `ListModels failed with HTTP ${r.status}`
          throw new Error(`Gemini ListModels error: ${msg}`)
        }
        return (data.models ?? [])
          .filter(model => model.name && (model.supportedGenerationMethods ?? []).includes('generateContent'))
          .map(model => normalizeModel(model.name ?? ''))
          .filter(Boolean)
      }

      const requestedModel = process.env.GEMINI_MODEL ? normalizeModel(process.env.GEMINI_MODEL) : ''
      const preferredModels = [
        requestedModel,
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
      ].filter(Boolean)

      const availableModels = await getAvailableGeminiModels()
      const selectedPreferred = preferredModels.filter(model => availableModels.includes(model))
      const fallbackModels = [
        ...selectedPreferred,
        ...availableModels.filter(model => !selectedPreferred.includes(model)),
      ]

      if (fallbackModels.length === 0) {
        const fullErr = 'Gemini API error — key works, but ListModels returned no models that support generateContent.'
        if (!anthropicKey) return res.status(200).json({ error: fullErr, isGeminiError: true })
      }

      let lastGeminiError = ''

      for (const model of fallbackModels) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: geminiMessages,
              generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
            }),
          },
        )

        const data = await r.json() as Record<string, unknown>

        if (!r.ok) {
          const errData = data as { error?: { message?: string; status?: string; code?: number } }
          const geminiMsg = errData.error?.message ?? 'Unknown Gemini error'
          const geminiStatus = errData.error?.status ?? ''
          lastGeminiError = `${model}: ${geminiMsg}${geminiStatus ? ` [${geminiStatus}]` : ''} (HTTP ${r.status})`
          console.error('[chat.ts] Gemini failed:', lastGeminiError)
          continue
        }

        const candidates = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates
        const text = candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        if (!text) {
          lastGeminiError = `${model}: Gemini returned empty response. Full data: ${JSON.stringify(data).slice(0, 200)}`
          console.error('[chat.ts] Gemini returned no text. Full response:', JSON.stringify(data).slice(0, 500))
          continue
        }

        return res.status(200).json({ content: text, model })
      }

      const attempted = fallbackModels.slice(0, 8).join(', ')
      const fullErr = `Gemini API error — all available generateContent models failed. Attempted: ${attempted}. Last error: ${lastGeminiError || 'Unknown Gemini error'}`
      if (!anthropicKey) return res.status(200).json({ error: fullErr, isGeminiError: true })
      // else fall through to Anthropic below
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini request failed'
      if (!anthropicKey) {
        return res.status(200).json({ error: msg, isGeminiError: true })
      }
      // Fall through to Anthropic
    }
  }

  // ── Anthropic Claude (fallback) ─────────────────────────────────────────────
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system,
          messages,
        }),
      })
      const data = await r.json() as Record<string, unknown>
      if (!r.ok) {
        const errMsg = (data as { error?: { message?: string } }).error?.message ?? 'Anthropic API error'
        return res.status(r.status).json({ error: errMsg })
      }
      const content = data.content as { type: string; text: string }[]
      const text = Array.isArray(content)
        ? content.filter(b => b.type === 'text').map(b => b.text).join('\n')
        : ''
      return res.status(200).json({ content: text })
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Anthropic request failed' })
    }
  }

  return res.status(500).json({ error: 'No AI provider configured.' })
}
