import { useEffect, useRef } from 'react'

/**
 * Shared blur-save timer helper for inline edit rows/cards.
 * Keeps the timer ref stable so existing blur-save flows can keep using
 * ref.current directly while cleanup is centralized on unmount.
 */
export function useInlineEditTimer(delayMs = 150) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const schedule = (callback: () => void) => {
    cancel()
    timerRef.current = setTimeout(callback, delayMs)
  }

  useEffect(() => cancel, [])

  return { timerRef, cancel, schedule }
}
