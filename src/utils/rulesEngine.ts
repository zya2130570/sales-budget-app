import type { Transaction, TransactionRule, TransactionType } from '../types'

export type RuleCandidate = {
  matchText: string
  matchField: TransactionRule['matchField']
  categoryId: string
  type?: TransactionType | ''
}

export type RuleConflict = {
  rule: TransactionRule
  overlapAlias: string
}

export type RuleSuggestion = {
  merchants: string[]
  categoryId: string
  txIds: string[]
}

const trimAlias = (value: string): string =>
  value.replace(/^[\'"\u2018\u2019\s]+|[\'"\u2018\u2019\s]+$/g, '')

// Case-insensitive, comma-separated alias matching with apostrophe tolerance.
export const normalizeAlias = (value: string): string =>
  value.replace(/[\u2018\u2019\u02BC]/g, "'").toLowerCase()

export const splitRuleAliases = (matchText: string): string[] =>
  matchText
    .split(',')
    .map(alias => normalizeAlias(trimAlias(alias)))
    .filter(Boolean)

export const matchesAnyAlias = (haystack: string, matchText: string): boolean => {
  const normHaystack = normalizeAlias(haystack)
  const normHaystackNoApos = normHaystack.replace(/'/g, '')
  return splitRuleAliases(matchText).some(alias => {
    const aliasNoApos = alias.replace(/'/g, '')
    return normHaystack.includes(alias) || normHaystackNoApos.includes(aliasNoApos)
  })
}

export const ruleTypeMatches = (rule: TransactionRule, txType?: TransactionType): boolean =>
  !rule.type || !txType || rule.type === txType

export const findMatchingRule = (
  tx: Pick<Transaction, 'merchant' | 'notes' | 'type'>,
  rules: TransactionRule[],
): TransactionRule | undefined =>
  rules.find(rule => {
    if (!ruleTypeMatches(rule, tx.type)) return false
    const haystack = rule.matchField === 'merchant' ? tx.merchant : (tx.notes ?? '')
    return matchesAnyAlias(haystack, rule.matchText)
  })

export const applyRulesToTransaction = (
  tx: Transaction,
  rules: TransactionRule[],
  options: { overwriteCategory: boolean; clearStaleRuleOwnership?: boolean },
): { tx: Transaction; updated: boolean } => {
  const activeRuleIds = new Set(rules.map(rule => rule.id))
  const isStaleRule = Boolean(tx.appliedByRule && !activeRuleIds.has(tx.appliedByRule))
  const baseTx = options.clearStaleRuleOwnership && isStaleRule
    ? { ...tx, categoryId: undefined, appliedByRule: undefined }
    : tx

  if (!options.overwriteCategory && baseTx.categoryId) {
    return { tx: baseTx, updated: false }
  }

  const matchingRule = findMatchingRule(baseTx, rules)
  if (!matchingRule) return { tx: baseTx, updated: false }

  const updated = baseTx.categoryId !== matchingRule.categoryId
  return {
    tx: { ...baseTx, categoryId: matchingRule.categoryId, appliedByRule: matchingRule.id },
    updated,
  }
}

export const applyRulesToTransactions = (
  transactions: Transaction[],
  rules: TransactionRule[],
  options: { overwriteCategories: boolean; clearStaleRuleOwnership?: boolean },
): { transactions: Transaction[]; updatedCount: number } => {
  let updatedCount = 0
  const nextTransactions = transactions.map(tx => {
    const result = applyRulesToTransaction(tx, rules, {
      overwriteCategory: options.overwriteCategories,
      clearStaleRuleOwnership: options.clearStaleRuleOwnership,
    })
    if (result.updated) updatedCount++
    return result.tx
  })
  return { transactions: nextTransactions, updatedCount }
}

export const detectRuleConflict = (
  rules: TransactionRule[],
  candidate: RuleCandidate,
  excludeRuleId?: string | null,
): RuleConflict | null => {
  const newAliases = splitRuleAliases(candidate.matchText)
  const newTypeIsAny = !candidate.type

  for (const existing of rules) {
    if (excludeRuleId && existing.id === excludeRuleId) continue
    if (existing.matchField !== candidate.matchField) continue

    const existingAliases = splitRuleAliases(existing.matchText)
    const hasOverlapAlias = newAliases.some(alias => existingAliases.includes(alias))
    if (!hasOverlapAlias) continue

    const existingTypeIsAny = !existing.type
    const typesOverlap = newTypeIsAny || existingTypeIsAny || candidate.type === existing.type
    if (!typesOverlap) continue

    if (existing.categoryId !== candidate.categoryId) {
      return {
        rule: existing,
        overlapAlias: newAliases.find(alias => existingAliases.includes(alias)) ?? candidate.matchText,
      }
    }
  }

  return null
}

export const hasMerchantRuleForCategory = (
  rules: TransactionRule[],
  merchant: string,
  categoryId: string,
): boolean => {
  const normalizedMerchant = normalizeAlias(merchant.trim())
  return rules.some(rule =>
    rule.matchField === 'merchant' &&
    rule.categoryId === categoryId &&
    splitRuleAliases(rule.matchText).some(alias => alias === normalizedMerchant)
  )
}

export const buildMerchantRuleSuggestion = (
  merchant: string,
  categoryId: string,
  txIds: string[],
  rules: TransactionRule[],
): RuleSuggestion | null =>
  hasMerchantRuleForCategory(rules, merchant, categoryId)
    ? null
    : { merchants: [merchant], categoryId, txIds }

export const buildBulkMerchantRuleSuggestion = (
  merchants: string[],
  categoryId: string,
  txIds: string[],
  rules: TransactionRule[],
): RuleSuggestion | null => {
  const uniqueMerchants = [...new Set(merchants)]
    .filter(merchant => !hasMerchantRuleForCategory(rules, merchant, categoryId))

  return uniqueMerchants.length > 0
    ? { merchants: uniqueMerchants, categoryId, txIds }
    : null
}

export const buildRulesFromSuggestion = (
  suggestion: RuleSuggestion,
  nowIso: string,
): TransactionRule[] =>
  suggestion.merchants.map(merchant => ({
    id: crypto.randomUUID(),
    name: merchant,
    matchText: merchant,
    matchField: 'merchant',
    categoryId: suggestion.categoryId,
    createdAt: nowIso,
  }))
