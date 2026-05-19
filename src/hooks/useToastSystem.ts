import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastState = {
  message: string
  visible: boolean
  onUndo?: () => void
} | null

const TOAST_TIMEOUT_MS = 5000

export function useToastSystem() {
  const [toast, setToast] = useState<ToastState>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
  }, [])

  const dismissToast = useCallback(() => {
    clearToastTimer()
    setToast(null)
  }, [clearToastTimer])

  const showToast = useCallback((message: string) => {
    clearToastTimer()
    setToast({ message, visible: true })
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_TIMEOUT_MS)
  }, [clearToastTimer])

  const showUndoableToast = useCallback((message: string, onUndo: () => void) => {
    clearToastTimer()
    setToast({ message, visible: true, onUndo })
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_TIMEOUT_MS)
  }, [clearToastTimer])

  const runToastUndo = useCallback(() => {
    const undo = toast?.onUndo
    dismissToast()
    undo?.()
  }, [dismissToast, toast])

  useEffect(() => () => clearToastTimer(), [clearToastTimer])

  return {
    toast,
    showToast,
    showUndoableToast,
    dismissToast,
    runToastUndo,
  }
}
