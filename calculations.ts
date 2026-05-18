import type { Account, AccountType, SavedTargetSet, Target, Transaction, TransactionRule, TransactionType } from '../types'
import { normalizeMerchant } from './merchantNormalization'
import { findMatchingRule, applyRulesToTransactions, buildBulkMerchantRuleSuggestion, buildMerchantRuleSuggestion, buildRulesFromSuggestion } from './rulesEngine'

export type AccountFormValues = {
  name: string
  type: AccountType
  balance: string
  institution: string
}

export type TransactionFormValues = {
  date: string
  accountId: string
  merchant: string
  amount: string
  type: TransactionType
  categoryId: string
  notes: string
  toAccountId: string
}

export type RuleFormValues = {
  name: string
  matchText: string
  matchField: 'merchant' | 'notes'
  categoryId: string
  type: '' | TransactionType
}

export type TargetFormValues = {
  name: string
  goalAmount: string
  currentSaved: string
  startDate: string
  deadline: string
}

export type RuleSuggestion = { merchants: string[]; categoryId: string; txIds: string[] }

export function buildAccountFromForm(form: AccountFormValues, nowDate: string, id: string): Account {
  const rawBalance = parseFloat(form.balance) || 0
  const balance = form.type === 'credit card' && rawBalance > 0 ? -rawBalance : rawBalance
  return {
    id,
    name: form.name.trim(),
    type: form.type,
    balance,
    institution: form.institution.trim(),
    createdAt: nowDate,
  }
}

export function addAccount(accounts: Account[], form: AccountFormValues, id: string, nowDate: string): Account[] {
  return [buildAccountFromForm(form, nowDate, id), ...accounts]
}

export function updateAccount(accounts: Account[], accountId: string, form: AccountFormValues): Account[] {
  const next = buildAccountFromForm(form, '', accountId)
  return accounts.map(account => account.id === accountId
    ? { ...account, name: next.name, type: next.type, balance: next.balance, institution: next.institution }
    : account
  )
}

export function reconcileAccountAction(accounts: Account[], accountId: string, actualBalance: number, txnImpact: number, nowDate: string): Account[] {
  const newStartingBalance = actualBalance - txnImpact
  return accounts.map(account => account.id === accountId
    ? { ...account, startingBalance: newStartingBalance, lastReconciledAt: nowDate } as Account & { startingBalance: number; lastReconciledAt: string }
    : account
  )
}

export function deleteAccount(accounts: Account[], accountId: string): Account[] {
  return accounts.filter(account => account.id !== accountId)
}

export function buildTransactionFromForm(params: {
  form: TransactionFormValues
  id: string
  createdAt: string
  resolvedAccountId: string
  merchant: string
  amount: number
  rules: TransactionRule[]
}): Transaction {
  const { form, id, createdAt, resolvedAccountId, merchant, amount, rules } = params
  let autoCategoryId = form.categoryId
  let matchedRuleId: string | undefined

  if (!form.categoryId) {
    const matchingRule = findMatchingRule({ merchant, notes: form.notes, type: form.type }, rules)
    if (matchingRule) {
      autoCategoryId = matchingRule.categoryId
      matchedRuleId = matchingRule.id
    }
  }

  return {
    id,
    date: form.date,
    accountId: resolvedAccountId,
    merchant,
    amount,
    type: form.type,
    categoryId: autoCategoryId || undefined,
    notes: form.notes.trim() || undefined,
    toAccountId: form.toAccountId || undefined,
    appliedByRule: matchedRuleId,
    createdAt,
    source: 'manual',
    updatedAt: createdAt,
  }
}

export function addTransaction(transactions: Transaction[], transaction: Transaction): Transaction[] {
  return [transaction, ...transactions]
}

export function updateTransaction(transactions: Transaction[], transactionId: string, form: TransactionFormValues, originalTx?: Transaction): Transaction[] {
  const merchant = form.merchant.trim()
  const amount = parseFloat(form.amount) || 0
  const categoryChangedManually =
    originalTx?.appliedByRule &&
    form.categoryId !== (originalTx.categoryId ?? '')

  return transactions.map(tx => tx.id === transactionId
    ? {
        ...tx,
        date: form.date,
        accountId: form.accountId,
        merchant,
        amount,
        type: form.type,
        categoryId: form.categoryId || undefined,
        notes: form.notes.trim() || undefined,
        toAccountId: form.toAccountId || undefined,
        appliedByRule: categoryChangedManually ? undefined : tx.appliedByRule,
        updatedAt: new Date().toISOString(),
      }
    : tx
  )
}

export function deleteTransaction(transactions: Transaction[], transactionId: string): Transaction[] {
  return transactions.filter(tx => tx.id !== transactionId)
}

export function restoreTransaction(transactions: Transaction[], transaction: Transaction): Transaction[] {
  return [transaction, ...transactions]
}

export function assignTransactionCategory(transactions: Transaction[], transactionId: string, categoryId: string): Transaction[] {
  return transactions.map(tx => tx.id === transactionId ? { ...tx, categoryId } : tx)
}

export function assignTransactionCategoryBulk(transactions: Transaction[], transactionIds: Set<string>, categoryId: string): Transaction[] {
  return transactions.map(tx => transactionIds.has(tx.id) ? { ...tx, categoryId } : tx)
}

export function applyTransactionRulesAction(
  transactions: Transaction[],
  rules: TransactionRule[],
  overwriteCategories: boolean,
): { transactions: Transaction[]; updatedCount: number } {
  return applyRulesToTransactions(transactions, rules, {
    overwriteCategories,
    clearStaleRuleOwnership: true,
  })
}

export function buildRuleFromForm(form: RuleFormValues, id: string, createdAt: string): TransactionRule {
  return {
    id,
    name: form.name.trim(),
    matchText: form.matchText.trim(),
    matchField: form.matchField,
    categoryId: form.categoryId,
    type: form.type || undefined,
    createdAt,
  }
}

export function addRule(rules: TransactionRule[], rule: TransactionRule): TransactionRule[] {
  return [rule, ...rules]
}

export function updateRule(rules: TransactionRule[], ruleId: string, form: RuleFormValues): TransactionRule[] {
  return rules.map(rule => rule.id === ruleId
    ? {
        ...rule,
        name: form.name.trim(),
        matchText: form.matchText.trim(),
        matchField: form.matchField,
        categoryId: form.categoryId,
        type: form.type || undefined,
      }
    : rule
  )
}

export function createRulesFromSuggestionAction(rules: TransactionRule[], suggestion: RuleSuggestion, createdAt: string): TransactionRule[] {
  return [...rules, ...buildRulesFromSuggestion(suggestion, createdAt)]
}

export function createMerchantRuleSuggestionForTransaction(
  merchant: string,
  categoryId: string,
  transactionId: string,
  rules: TransactionRule[],
): RuleSuggestion | null {
  return buildMerchantRuleSuggestion(normalizeMerchant(merchant), categoryId, [transactionId], rules)
}

export function createBulkMerchantRuleSuggestionForTransactions(
  transactions: Transaction[],
  categoryId: string,
  transactionIds: Set<string>,
  rules: TransactionRule[],
): RuleSuggestion | null {
  return buildBulkMerchantRuleSuggestion(
    transactions.map(tx => normalizeMerchant(tx.merchant)),
    categoryId,
    [...transactionIds],
    rules,
  )
}

export function buildTargetFromForm(form: TargetFormValues, id: string, today: string): Target {
  return {
    id,
    name: form.name.trim(),
    goalAmount: Number(form.goalAmount) || 0,
    currentSaved: Number(form.currentSaved) || 0,
    startDate: form.startDate || today,
    deadline: form.deadline,
    createdAt: today,
    type: 'savings',
    contributions: [],
    completed: false,
  }
}

export function addSavingsGoal(targets: Target[], target: Target): Target[] {
  return [target, ...targets]
}

export function updateSavingsGoal(targets: Target[], targetId: string, form: TargetFormValues): Target[] {
  const name = form.name.trim()
  const goalAmount = Number(form.goalAmount) || 0
  const currentSaved = Number(form.currentSaved) || 0
  return targets.map(target => target.id === targetId
    ? { ...target, name, goalAmount, currentSaved, startDate: form.startDate, deadline: form.deadline, updatedAt: new Date().toISOString() }
    : target
  )
}

export function deleteSavingsGoal(targets: Target[], targetId: string): Target[] {
  return targets.filter(target => target.id !== targetId)
}

export function addContribution(targets: Target[], targetId: string, amount: number, date: string, note: string, contributionId: string): Target[] {
  if (amount <= 0) return targets
  return targets.map(target => target.id === targetId
    ? {
        ...target,
        currentSaved: target.currentSaved + amount,
        contributions: [{ id: contributionId, amount, date, note }, ...target.contributions],
      }
    : target
  )
}

export function updateContribution(targets: Target[], targetId: string, contributionId: string, amount: number, date: string, note: string): Target[] {
  return targets.map(target => {
    if (target.id !== targetId) return target
    const oldContrib = target.contributions.find(contribution => contribution.id === contributionId)
    const oldAmount = oldContrib ? oldContrib.amount : 0
    return {
      ...target,
      currentSaved: Math.max(0, target.currentSaved - oldAmount + amount),
      contributions: target.contributions.map(contribution => contribution.id === contributionId
        ? { ...contribution, date, amount, note }
        : contribution
      ),
    }
  })
}

export function deleteContribution(targets: Target[], targetId: string, contributionId: string): Target[] {
  return targets.map(target => {
    if (target.id !== targetId) return target
    const oldContrib = target.contributions.find(contribution => contribution.id === contributionId)
    const oldAmount = oldContrib ? oldContrib.amount : 0
    return {
      ...target,
      currentSaved: Math.max(0, target.currentSaved - oldAmount),
      contributions: target.contributions.filter(contribution => contribution.id !== contributionId),
    }
  })
}

export function pauseGoal(targets: Target[], targetId: string): Target[] {
  return targets.map(target => target.id === targetId ? { ...target, paused: true, updatedAt: new Date().toISOString() } : target)
}

export function resumeGoal(targets: Target[], targetId: string): Target[] {
  return targets.map(target => target.id === targetId ? { ...target, paused: false, updatedAt: new Date().toISOString() } : target)
}

export function saveGoalSet(savedSets: SavedTargetSet[], name: string, targets: Target[], savedAt: string): SavedTargetSet[] {
  const cleanName = name.trim()
  return [
    { name: cleanName, targets, savedAt },
    ...savedSets.filter(set => set.name.toLowerCase() !== cleanName.toLowerCase()),
  ]
}

export function loadGoalSet(savedSet: SavedTargetSet): Target[] {
  return savedSet.targets
}

export function renameGoalSet(savedSets: SavedTargetSet[], index: number, newName: string, savedAt: string): SavedTargetSet[] {
  return savedSets.map((set, idx) => idx === index ? { ...set, name: newName.trim(), savedAt } : set)
}

export function deleteGoalSet(savedSets: SavedTargetSet[], name: string): SavedTargetSet[] {
  return savedSets.filter(set => set.name !== name)
}
