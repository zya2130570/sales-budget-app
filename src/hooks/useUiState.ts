import { useEffect, useState } from 'react'
import type { Tab } from '../types'
import { loadTab, saveTab } from '../utils/storage'

export function useUiState() {
  const [tab, setTab] = useState<Tab>(() => loadTab() ?? 'Dashboard')
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [fullyFundedOpen, setFullyFundedOpen] = useState(true)
  const [completedOpen, setCompletedOpen] = useState(true)
  const [showRecentlyDeleted, setShowRecentlyDeleted] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(true)

  useEffect(() => saveTab(tab), [tab])

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return {
    tab,
    setTab,
    showScrollTop,
    fullyFundedOpen,
    setFullyFundedOpen,
    completedOpen,
    setCompletedOpen,
    showRecentlyDeleted,
    setShowRecentlyDeleted,
    reviewOpen,
    setReviewOpen,
  }
}
