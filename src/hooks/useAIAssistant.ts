import { useState, useCallback, useEffect } from 'react'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type AIAssistantStatus = 'idle' | 'loading' | 'error'

const AI_CHAT_HISTORY_KEY = 'flow_ai_chat_history_v1'

function loadStoredMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(AI_CHAT_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((m): m is ChatMessage =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
      )
      .slice(-30)
  } catch {
    return []
  }
}

function saveStoredMessages(messages: ChatMessage[]) {
  try {
    localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-30)))
  } catch {
    // localStorage may be unavailable in private mode; chat still works for the session.
  }
}

export function useAIAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages())
  const [status, setStatus] = useState<AIAssistantStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    saveStoredMessages(messages)
  }, [messages])

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

  const clearHistory = useCallback(() => {
    setMessages([])
    saveStoredMessages([])
    setError(null)
    setStatus('idle')
  }, [])

  return { messages, status, error, sendMessage, clearHistory }
}
