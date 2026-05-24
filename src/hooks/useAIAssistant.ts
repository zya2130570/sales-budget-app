import { useState, useCallback } from 'react'
export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type AIAssistantStatus = 'idle' | 'loading' | 'error'
export function useAIAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<AIAssistantStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const sendMessage = useCallback(async (userText: string, context: Record<string, unknown>) => {
    if (!userText.trim()) return
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userText.trim() }]
    setMessages(newMessages)
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error ?? `Server error ${res.status}`); setStatus('error'); setMessages(messages); return }
      setMessages([...newMessages, { role: 'assistant', content: data.content ?? data.reply ?? '' }])
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setStatus('error')
      setMessages(messages)
    }
  }, [messages])
  const clearHistory = useCallback(() => { setMessages([]); setError(null); setStatus('idle') }, [])
  return { messages, status, error, sendMessage, clearHistory }
}
