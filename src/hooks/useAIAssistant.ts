/**
 * useAIAssistant.ts — V14
 * Manages the AI assistant chat state and API calls.
 */
import { useState, useCallback } from 'react'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AIAssistantStatus = 'idle' | 'loading' | 'error'

export function useAIAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<AIAssistantStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(async (
    userText: string,
    context: Record<string, unknown>,
  ) => {
    if (!userText.trim()) return

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: userText.trim() },
    ]
    setMessages(newMessages)
    setStatus('loading')
    setError(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context,
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        const msg = data.error ?? `Server error ${res.status}`
        setError(msg)
        setStatus('error')
        // Remove the user message so they can retry
        setMessages(messages)
        return
      }

      setMessages([...newMessages, { role: 'assistant', content: data.reply }])
      setStatus('idle')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(msg.includes('ANTHROPIC_API_KEY')
        ? 'AI assistant not configured. Add ANTHROPIC_API_KEY to your Vercel environment variables.'
        : msg)
      setStatus('error')
      setMessages(messages)
    }
  }, [messages])

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
    setStatus('idle')
  }, [])

  return { messages, status, error, sendMessage, clearHistory }
}
