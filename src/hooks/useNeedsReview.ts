import { useRef, useState } from 'react'
import type { Transaction } from '../types'

export type RuleSuggestionState = {
  merchants: string[]
  categoryId: string
  txIds: string[]
} | null

/**
 * UI-only orchestration state for the Needs Review workflow.
 * Transaction state, rules engine behavior, and duplicate detection remain owned by App/hooks.
 */
export function useNeedsReview() {
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [ruleSuggestion, setRuleSuggestion] = useState<RuleSuggestionState>(null)
  const lastReviewSelectIdxRef = useRef<number>(-1)

  const clearReviewSelection = () => {
    setSelectedTxnIds(new Set())
    setBulkCategoryId('')
    lastReviewSelectIdxRef.current = -1
  }

  const selectedReviewTransactions = (transactions: Transaction[]) =>
    transactions.filter(tx => selectedTxnIds.has(tx.id))

  return {
    selectedTxnIds,
    setSelectedTxnIds,
    bulkCategoryId,
    setBulkCategoryId,
    ruleSuggestion,
    setRuleSuggestion,
    lastReviewSelectIdxRef,
    clearReviewSelection,
    selectedReviewTransactions,
  }
}
