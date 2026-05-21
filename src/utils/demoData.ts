import type { Account, Category, Target, Transaction, TransactionRule } from '../types'

const now = new Date().toISOString()
const today = new Date().toISOString().slice(0, 10)

export const DEMO_ACCOUNTS: Account[] = [
  {
    id: 'demo-checking',
    name: 'Demo Checking',
    type: 'checking',
    balance: 2450,
    institution: 'Demo Bank',
    createdAt: now,
    updatedAt: now,
    startingBalance: 2450,
  },
  {
    id: 'demo-savings',
    name: 'Demo Savings',
    type: 'savings',
    balance: 1800,
    institution: 'Demo Bank',
    createdAt: now,
    updatedAt: now,
    startingBalance: 1800,
  },
]

export const DEMO_CATEGORIES: Category[] = [
  { id: 'demo-rent', name: 'Rent', amount: 1450, type: 'fixed bill', updatedAt: now },
  { id: 'demo-car-insurance', name: 'Car Insurance', amount: 110, type: 'fixed bill', updatedAt: now },
  { id: 'demo-groceries', name: 'Groceries', amount: 350, type: 'variable spending', updatedAt: now },
  { id: 'demo-gas', name: 'Gas', amount: 120, type: 'variable spending', updatedAt: now },
  { id: 'demo-roth', name: 'Roth IRA', amount: 100, type: 'investing', updatedAt: now },
  { id: 'demo-emergency-fund', name: 'Emergency Fund', amount: 200, type: 'savings', updatedAt: now },
]

export const DEMO_TRANSACTIONS: Transaction[] = [
  {
    id: 'demo-tx-paycheck',
    date: today,
    accountId: 'demo-checking',
    merchant: 'Priority 1 Paycheck',
    amount: 1538.46,
    type: 'income',
    source: 'manual',
    reviewStatus: 'reviewed',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'demo-tx-rent',
    date: today,
    accountId: 'demo-checking',
    merchant: 'Apartment Rent',
    amount: 1450,
    type: 'expense',
    categoryId: 'demo-rent',
    source: 'manual',
    reviewStatus: 'reviewed',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'demo-tx-grocery',
    date: today,
    accountId: 'demo-checking',
    merchant: 'Fry\'s Food Stores',
    amount: 62.18,
    type: 'expense',
    categoryId: 'demo-groceries',
    source: 'manual',
    reviewStatus: 'reviewed',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'demo-tx-gas',
    date: today,
    accountId: 'demo-checking',
    merchant: 'Circle K',
    amount: 38.54,
    type: 'expense',
    categoryId: 'demo-gas',
    source: 'manual',
    reviewStatus: 'reviewed',
    createdAt: now,
    updatedAt: now,
  },
]

export const DEMO_TARGETS: Target[] = [
  {
    id: 'demo-target-emergency',
    name: 'Emergency Fund',
    goalAmount: 3000,
    currentSaved: 1800,
    startDate: today,
    deadline: '2026-12-31',
    createdAt: now,
    updatedAt: now,
    type: 'savings',
    contributions: [
      { id: 'demo-contribution-1', date: today, amount: 200, note: 'Demo contribution' },
    ],
    completed: false,
    paused: false,
  },
]

export const DEMO_RULES: TransactionRule[] = [
  {
    id: 'demo-rule-grocery',
    name: 'Fry\'s → Groceries',
    matchText: 'fry',
    matchField: 'merchant',
    categoryId: 'demo-groceries',
    type: 'expense',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'demo-rule-gas',
    name: 'Circle K → Gas',
    matchText: 'circle k',
    matchField: 'merchant',
    categoryId: 'demo-gas',
    type: 'expense',
    createdAt: now,
    updatedAt: now,
  },
]
