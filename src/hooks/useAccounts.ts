import { useEffect, useState } from 'react'
import type { Account, AccountType } from '../types'
import { loadAccounts, saveAccounts, runMigrations } from '../utils/storage'

type AccountForm = { name: string; type: AccountType; balance: string; institution: string }

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountForm, setAccountForm] = useState<AccountForm>({ name: '', type: 'checking', balance: '', institution: '' })
  const [editAccountId, setEditAccountId] = useState<string | null>(null)
  const [accountHistory, setAccountHistory] = useState<Account[][]>([])
  const [accountRedo, setAccountRedo] = useState<Account[][]>([])

  const [inlineAccountEditId, setInlineAccountEditId] = useState<string | null>(null)
  const [inlineAccountEditForm, setInlineAccountEditForm] = useState<AccountForm>({
    name: '', type: 'checking', balance: '', institution: '',
  })

  useEffect(() => {
    runMigrations()
    const saved = loadAccounts()
    if (saved) setAccounts(saved)
  }, [])

  useEffect(() => saveAccounts(accounts), [accounts])

  return {
    accounts,
    setAccounts,
    accountForm,
    setAccountForm,
    editAccountId,
    setEditAccountId,
    accountHistory,
    setAccountHistory,
    accountRedo,
    setAccountRedo,
    inlineAccountEditId,
    setInlineAccountEditId,
    inlineAccountEditForm,
    setInlineAccountEditForm,
  }
}
