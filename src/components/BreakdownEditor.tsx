/**
 * BreakdownEditor.tsx — V33
 * Modal for editing/creating sub-item breakdowns on a budget category.
 * Example: "Bills to Mom" → Car insurance $121, Parking $53, Phone $98
 * Breakdowns are display/reference only — the category's total amount is set independently.
 */
import { useState, useEffect } from 'react'
import type { BreakdownItem } from '../types'

type Props = {
  categoryName: string
  categoryAmount: number  // weekly amount for reference
  items: BreakdownItem[]
  onSave: (items: BreakdownItem[]) => void
  onClose: () => void
}

export function BreakdownEditor({ categoryName, categoryAmount, items: initialItems, onSave, onClose }: Props) {
  const [items, setItems] = useState<BreakdownItem[]>(initialItems)
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editAmount, setEditAmount] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const totalBreakdown = items.reduce((s, i) => s + i.amount, 0)
  const monthlyTotal = categoryAmount * 4.33

  const addItem = () => {
    const amt = parseFloat(newAmount)
    if (!newLabel.trim() || isNaN(amt) || amt <= 0) return
    setItems(prev => [...prev, { id: `bd-${Date.now()}`, label: newLabel.trim(), amount: amt }])
    setNewLabel('')
    setNewAmount('')
  }

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))

  const startEdit = (item: BreakdownItem) => {
    setEditingId(item.id)
    setEditLabel(item.label)
    setEditAmount(String(item.amount))
  }

  const saveEdit = () => {
    const amt = parseFloat(editAmount)
    if (!editLabel.trim() || isNaN(amt)) { setEditingId(null); return }
    setItems(prev => prev.map(i => i.id === editingId ? { ...i, label: editLabel.trim(), amount: amt } : i))
    setEditingId(null)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-slate-100">{categoryName} — Breakdown</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Category total: ${monthlyTotal.toFixed(2)}/mo · Breakdown total: ${totalBreakdown.toFixed(2)}/mo
              {Math.abs(totalBreakdown - monthlyTotal) > 0.5 && (
                <span className="text-amber-400 ml-1">({totalBreakdown > monthlyTotal ? '+' : ''}{(totalBreakdown - monthlyTotal).toFixed(2)} difference)</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-4">No breakdown items yet. Add one below.</p>
          )}
          {items.map(item => (
            <div key={item.id}>
              {editingId === item.id ? (
                <div className="flex gap-2 items-center p-2 rounded-xl border border-blue-600/40 bg-blue-950/20">
                  <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                    className="flex-1 text-sm px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus />
                  <span className="text-slate-500 text-sm flex-shrink-0">$</span>
                  <input value={editAmount} onChange={e => setEditAmount(e.target.value)} type="number" step="0.01"
                    className="w-24 text-sm px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                  <button onClick={saveEdit} className="text-xs px-2 py-1 rounded-lg bg-blue-600 text-white">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 group">
                  <span className="flex-1 text-sm text-slate-200">{item.label}</span>
                  <span className="text-sm font-medium text-slate-300">${item.amount.toFixed(2)}/mo</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(item)} className="text-[11px] text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded">Edit</button>
                    <button onClick={() => removeItem(item.id)} className="text-[11px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded">Remove</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new item */}
        <div className="px-4 py-3 border-t border-slate-700/60 flex-shrink-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Add item</p>
          <div className="flex gap-2">
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Car insurance)"
              className="flex-1 text-sm px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
              onKeyDown={e => e.key === 'Enter' && addItem()} />
            <span className="text-slate-500 self-center text-sm">$</span>
            <input value={newAmount} onChange={e => setNewAmount(e.target.value)} type="number" step="0.01" placeholder="0.00"
              className="w-24 text-sm px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
              onKeyDown={e => e.key === 'Enter' && addItem()} />
            <button onClick={addItem} disabled={!newLabel.trim() || !newAmount}
              className="text-sm px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-30 transition-colors">
              +
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/60 flex-shrink-0">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
          <button onClick={() => { onSave(items); onClose() }}
            className="text-sm px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors">
            Save breakdown
          </button>
        </div>
      </div>
    </div>
  )
}
