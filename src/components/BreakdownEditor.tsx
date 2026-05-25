/**
 * BreakdownEditor.tsx — V33.1
 * Modal for editing/creating sub-item breakdowns on a budget category.
 * Shows existing budget categories as quick-add options.
 * Breakdown items are monthly amounts for display/reference.
 */
import { useState, useEffect } from 'react'
import type { BreakdownItem, Category } from '../types'

type Props = {
  categoryName: string
  categoryAmount: number  // weekly amount
  items: BreakdownItem[]
  allCategories?: Category[]  // V33.1 — for quick-add from existing budget
  excludeCategoryId?: string  // don't show the current category in the list
  onSave: (items: BreakdownItem[]) => void
  onClose: () => void
}

export function BreakdownEditor({ categoryName, categoryAmount, items: initialItems, allCategories = [], excludeCategoryId, onSave, onClose }: Props) {
  const [items, setItems] = useState<BreakdownItem[]>(initialItems)
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [showExisting, setShowExisting] = useState(allCategories.length > 0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const totalBreakdown = items.reduce((s, i) => s + i.amount, 0)
  const monthlyTotal = categoryAmount * 4.33
  const diff = totalBreakdown - monthlyTotal

  const addItem = () => {
    const amt = parseFloat(newAmount)
    if (!newLabel.trim() || isNaN(amt) || amt <= 0) return
    setItems(prev => [...prev, { id: `bd-${Date.now()}`, label: newLabel.trim(), amount: amt }])
    setNewLabel('')
    setNewAmount('')
  }

  const addFromCategory = (cat: Category) => {
    const monthly = cat.amount * 4.33
    const already = items.some(i => i.label === cat.name)
    if (already) return
    setItems(prev => [...prev, { id: `bd-cat-${cat.id}`, label: cat.name, amount: parseFloat(monthly.toFixed(2)) }])
  }

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))

  const startEdit = (item: BreakdownItem) => {
    setEditingId(item.id); setEditLabel(item.label); setEditAmount(String(item.amount))
  }

  const saveEdit = () => {
    const amt = parseFloat(editAmount)
    if (!editLabel.trim() || isNaN(amt)) { setEditingId(null); return }
    setItems(prev => prev.map(i => i.id === editingId ? { ...i, label: editLabel.trim(), amount: amt } : i))
    setEditingId(null)
  }

  const quickAddCats = allCategories.filter(c =>
    c.id !== excludeCategoryId &&
    !items.some(i => i.label === c.name)
  )

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-slate-100">{categoryName} — Group breakdown</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Category: ${monthlyTotal.toFixed(2)}/mo · Breakdown: ${totalBreakdown.toFixed(2)}/mo
              {Math.abs(diff) > 0.5 && (
                <span className="text-amber-400 ml-1">({diff > 0 ? '+' : ''}{diff.toFixed(2)} difference)</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Quick-add from existing budget */}
          {quickAddCats.length > 0 && (
            <div className="p-4 border-b border-slate-700/40">
              <button
                onClick={() => setShowExisting(v => !v)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wide transition-colors mb-2"
              >
                <span>{showExisting ? '▾' : '▸'}</span>
                Add from existing budget categories
              </button>
              {showExisting && (
                <div className="flex flex-wrap gap-1.5">
                  {quickAddCats.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => addFromCategory(cat)}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200 transition-all text-left"
                      title={`Add ${cat.name} (${(cat.amount * 4.33).toFixed(2)}/mo)`}
                    >
                      {cat.name} <span className="text-slate-600">${(cat.amount * 4.33).toFixed(0)}/mo</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Current breakdown items */}
          <div className="p-4 space-y-2">
            {items.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-3">No items yet. Add from existing categories above or create custom items below.</p>
            )}
            {items.map(item => (
              <div key={item.id}>
                {editingId === item.id ? (
                  <div className="flex gap-2 items-center p-2.5 rounded-xl border border-blue-600/40 bg-blue-950/20">
                    <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                      className="flex-1 text-sm px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                      onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus />
                    <span className="text-slate-500 text-sm flex-shrink-0">$</span>
                    <input value={editAmount} onChange={e => setEditAmount(e.target.value)} type="number" step="0.01"
                      className="w-24 text-sm px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                      onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    <span className="text-slate-600 text-xs">/mo</span>
                    <button onClick={saveEdit} className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors">✓</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 hover:text-slate-300 px-1">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 group">
                    <span className="flex-1 text-sm text-slate-200">{item.label}</span>
                    <span className="text-sm font-medium text-slate-300 flex-shrink-0">${item.amount.toFixed(2)}<span className="text-slate-600 text-xs">/mo</span></span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => startEdit(item)} className="text-[11px] text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded">Edit</button>
                      <button onClick={() => removeItem(item.id)} className="text-[11px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded">Remove</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add custom item */}
        <div className="px-4 py-3 border-t border-slate-700/60 flex-shrink-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Add custom item</p>
          <div className="flex gap-2">
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Car insurance)"
              className="flex-1 text-sm px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
              onKeyDown={e => e.key === 'Enter' && addItem()} />
            <span className="text-slate-500 self-center text-sm flex-shrink-0">$</span>
            <input value={newAmount} onChange={e => setNewAmount(e.target.value)} type="number" step="0.01" placeholder="0"
              className="w-20 text-sm px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
              onKeyDown={e => e.key === 'Enter' && addItem()} />
            <span className="text-slate-500 self-center text-xs flex-shrink-0">/mo</span>
            <button onClick={addItem} disabled={!newLabel.trim() || !newAmount}
              className="text-sm px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-30 transition-colors flex-shrink-0">
              +
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/60 flex-shrink-0">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
            Cancel
          </button>
          <button onClick={() => { onSave(items); onClose() }}
            className="text-sm px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">
            Save breakdown
          </button>
        </div>
      </div>
    </div>
  )
}
