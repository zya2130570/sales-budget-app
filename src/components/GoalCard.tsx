import type React from 'react'
import type { Category, Contribution, Period, Target } from '../types'
import { currency, formatDate } from '../utils/formatting'
import { Card, Row } from './ui'

type RequiredTarget = {
  remaining: number
  days: number
  weekly: number
  biWeekly: number
  monthly: number
  yearly: number
  payPeriods: number
} | null

type TargetLogForm = { date: string; amount: string; note: string }
type EditTargetForm = { name: string; goalAmount: string; currentSaved: string; startDate: string; deadline: string }
type EditContributionForm = { date: string; amount: string; note: string }
type Priority = 'high' | 'medium' | 'low'

type GoalCardProps = {
  t: Target
  req: RequiredTarget
  progressPct: number
  status: string
  log: TargetLogForm
  isEditingTarget: boolean
  isExpanded: boolean
  isPaused: boolean
  priority: Priority | null
  statusBadge: string
  barColor: string
  highlighted: boolean
  editTargetForm: EditTargetForm
  editTargetHint: string
  editContributionId: string | null
  editContributionTargetId: string | null
  editContributionForm: EditContributionForm
  editGoalAmountRef: React.RefObject<HTMLInputElement | null>
  editCurrentSavedRef: React.RefObject<HTMLInputElement | null>
  editStartDateRef: React.RefObject<HTMLInputElement | null>
  editDeadlineRef: React.RefObject<HTMLInputElement | null>
  editBlurTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  editStartDateArrowCount: React.MutableRefObject<number>
  editDeadlineArrowCount: React.MutableRefObject<number>
  editStartDateLeftArrowCount: React.MutableRefObject<number>
  editDeadlineLeftArrowCount: React.MutableRefObject<number>
  logDateRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>
  logAmountRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>
  logNoteRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>
  logDateArrowCounts: React.MutableRefObject<Record<string, number>>
  setGoalPriorities: React.Dispatch<React.SetStateAction<Record<string, Priority>>>
  setPausedGoals: React.Dispatch<React.SetStateAction<Set<string>>>
  cancelEditTarget: (id: string) => void
  setEditTargetId: React.Dispatch<React.SetStateAction<string | null>>
  setEditTargetOriginal: React.Dispatch<React.SetStateAction<Target | null>>
  setEditTargetForm: React.Dispatch<React.SetStateAction<EditTargetForm>>
  saveEditTarget: (id: string) => void
  setEditTargetHint: React.Dispatch<React.SetStateAction<string>>
  toggleExpanded: () => void
  setEditContributionForm: React.Dispatch<React.SetStateAction<EditContributionForm>>
  saveEditContribution: () => void
  cancelEditContribution: () => void
  startEditContribution: (targetId: string, contribution: Contribution) => void
  setTargetsWithHistory: (updater: (prev: Target[]) => Target[]) => void
  onDeleteTarget?: (id: string) => void
  onDeleteContribution?: (contributionId: string) => void
  setTargetLogForm: React.Dispatch<React.SetStateAction<Record<string, TargetLogForm>>>
  addTargetContribution: (targetId: string, amount: number, date: string, note: string) => void
  period: Period
  convertToMonthly: (value: number, period: Period) => number
  convertFromMonthly: (value: number, period: Period) => number
  categories: Category[]
  pushBudgetHistory: () => void
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>
  setTab: React.Dispatch<React.SetStateAction<any>>
  highlightTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  setHighlightedCategoryId: React.Dispatch<React.SetStateAction<string | null>>
  showToast: (message: string) => void
  setTargetFormHistory: React.Dispatch<React.SetStateAction<EditTargetForm[]>>
  setTargetFormRedo: React.Dispatch<React.SetStateAction<EditTargetForm[]>>
  targetForm: EditTargetForm
  setTargetForm: React.Dispatch<React.SetStateAction<EditTargetForm>>
  setTargetFormHint: React.Dispatch<React.SetStateAction<string>>
  targetNameRef: React.RefObject<HTMLInputElement | null>
}

export function GoalCard(props: GoalCardProps) {
  const {
    t, req, progressPct, status, log, isEditingTarget, isExpanded, isPaused, priority,
    statusBadge, barColor, highlighted, editTargetForm, editTargetHint, editContributionId,
    editContributionTargetId, editContributionForm, editGoalAmountRef, editCurrentSavedRef,
    editStartDateRef, editDeadlineRef, editBlurTimerRef, editStartDateArrowCount,
    editDeadlineArrowCount, editStartDateLeftArrowCount, editDeadlineLeftArrowCount,
    logDateRefs, logAmountRefs, logNoteRefs, logDateArrowCounts, setGoalPriorities,
    setPausedGoals, cancelEditTarget, setEditTargetId, setEditTargetOriginal, setEditTargetForm,
    saveEditTarget, setEditTargetHint, toggleExpanded, setEditContributionForm,
    saveEditContribution, cancelEditContribution, startEditContribution, setTargetsWithHistory,
    setTargetLogForm, addTargetContribution, period, convertToMonthly, convertFromMonthly,
    categories, pushBudgetHistory, setCategories, setTab, highlightTimerRef,
    setHighlightedCategoryId, showToast, setTargetFormHistory, setTargetFormRedo, targetForm,
    setTargetForm, setTargetFormHint, targetNameRef,
  } = props

  if (!req) return null

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5 flex-wrap">
          {isEditingTarget ? `Editing: ${t.name}` : t.name}
          {isPaused && <span className="text-[9px] bg-slate-600 text-slate-300 border border-slate-500/40 px-1.5 py-0.5 rounded font-semibold">Paused</span>}
          {priority === 'high'   && <span className="text-[9px] bg-red-900/40 text-red-300 border border-red-700/30 px-1.5 py-0.5 rounded font-semibold">High</span>}
          {priority === 'medium' && <span className="text-[9px] bg-amber-900/40 text-amber-300 border border-amber-700/30 px-1.5 py-0.5 rounded font-semibold">Medium</span>}
          {priority === 'low'    && <span className="text-[9px] bg-slate-700 text-slate-400 border border-slate-600/40 px-1.5 py-0.5 rounded font-semibold">Low</span>}
        </span>
      }
      className={highlighted ? 'ring-2 ring-blue-500/40 ring-inset transition-shadow duration-300' : isPaused ? 'opacity-60' : undefined}
      headerAction={
        <div className="flex gap-1.5 flex-wrap justify-end">
          <select
            value={priority ?? ''}
            onChange={e => setGoalPriorities(prev => ({ ...prev, [t.id]: e.target.value as Priority }))}
            className="text-xs px-1.5 py-0.5 rounded bg-slate-700 border border-slate-600 text-slate-300 focus:outline-none"
            title="Set goal priority"
          >
            <option value="">Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
            onClick={() => setPausedGoals(prev => { const n = new Set(prev); isPaused ? n.delete(t.id) : n.add(t.id); return n })}
          >{isPaused ? 'Resume' : 'Pause'}</button>
          {isEditingTarget ? (
            <button
              className="text-xs text-slate-300 hover:text-slate-100 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
              onClick={() => cancelEditTarget(t.id)}
            >Cancel</button>
          ) : (
            <button
              className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
              onClick={() => {
                setEditTargetId(t.id)
                setEditTargetOriginal(t)
                setEditTargetForm({
                  name: t.name,
                  goalAmount: String(t.goalAmount),
                  currentSaved: String(t.currentSaved),
                  startDate: t.startDate ?? t.createdAt ?? '',
                  deadline: t.deadline,
                })
                setTimeout(() => { editGoalAmountRef.current?.focus(); editGoalAmountRef.current?.select() }, 0)
              }}
            >Edit</button>
          )}
          <button
            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
            onClick={() => { if (props.onDeleteTarget) props.onDeleteTarget(t.id); setTargetsWithHistory(prev => prev.filter(x => x.id !== t.id)) }}
          >Delete</button>
        </div>
      }
    >
      {isEditingTarget ? (
        <div
          className="space-y-3"
          onBlur={e => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current)
            editBlurTimerRef.current = setTimeout(() => saveEditTarget(t.id), 0)
          }}
        >
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Goal Name</label>
            <input
              className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
              value={editTargetForm.name}
              onChange={e => setEditTargetForm(v => ({ ...v, name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) } }}
              placeholder="Goal name"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Goal Amount</label>
            <input
              ref={editGoalAmountRef}
              type="number"
              min={0}
              step={25}
              className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
              value={editTargetForm.goalAmount}
              onChange={e => setEditTargetForm(v => ({ ...v, goalAmount: e.target.value }))}
              onFocus={e => e.target.select()}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }
                if (e.key === 'ArrowRight') { e.preventDefault(); editCurrentSavedRef.current?.focus() }
              }}
              placeholder="Goal amount"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Current Saved</label>
            <input
              ref={editCurrentSavedRef}
              type="number"
              min={0}
              step={25}
              className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
              value={editTargetForm.currentSaved}
              onChange={e => setEditTargetForm(v => ({ ...v, currentSaved: e.target.value }))}
              onFocus={e => e.target.select()}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }
                if (e.key === 'ArrowRight') { e.preventDefault(); editStartDateRef.current?.focus() }
                if (e.key === 'ArrowLeft') { e.preventDefault(); editGoalAmountRef.current?.focus() }
              }}
              placeholder="Current saved"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Start Date</label>
            <input
              ref={editStartDateRef}
              type="date"
              className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
              value={editTargetForm.startDate}
              onChange={e => setEditTargetForm(v => ({ ...v, startDate: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }
                if (e.key === 'ArrowRight') {
                  editStartDateLeftArrowCount.current = 0
                  editStartDateArrowCount.current += 1
                  if (editStartDateArrowCount.current > 2) {
                    e.preventDefault()
                    editStartDateArrowCount.current = 0
                    editDeadlineRef.current?.focus()
                  }
                } else if (e.key === 'ArrowLeft') {
                  editStartDateArrowCount.current = 0
                  editStartDateLeftArrowCount.current += 1
                  if (editStartDateLeftArrowCount.current > 2) {
                    e.preventDefault()
                    editStartDateLeftArrowCount.current = 0
                    editCurrentSavedRef.current?.focus()
                  }
                } else {
                  editStartDateArrowCount.current = 0
                  editStartDateLeftArrowCount.current = 0
                }
              }}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Deadline</label>
            <input
              ref={editDeadlineRef}
              type="date"
              className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
              value={editTargetForm.deadline}
              onChange={e => setEditTargetForm(v => ({ ...v, deadline: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }
                if (e.key === 'ArrowLeft') {
                  editDeadlineArrowCount.current = 0
                  editDeadlineLeftArrowCount.current += 1
                  if (editDeadlineLeftArrowCount.current > 2) {
                    e.preventDefault()
                    editDeadlineLeftArrowCount.current = 0
                    editStartDateRef.current?.focus()
                  }
                } else if (e.key === 'ArrowRight') {
                  editDeadlineLeftArrowCount.current = 0
                  editDeadlineArrowCount.current += 1
                  if (editDeadlineArrowCount.current > 2) {
                    e.preventDefault()
                    editDeadlineArrowCount.current = 0
                    if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current)
                    saveEditTarget(t.id)
                  }
                } else {
                  editDeadlineArrowCount.current = 0
                  editDeadlineLeftArrowCount.current = 0
                }
              }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className="flex-1 rounded bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm transition-colors"
              onClick={() => { if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }}
            >
              Save Changes
            </button>
            <button
              className="flex-1 rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm transition-colors"
              onClick={() => { if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); setEditTargetHint(''); cancelEditTarget(t.id) }}
            >
              Cancel
            </button>
          </div>
          {editTargetHint && (
            <p className="mt-2 text-sm text-amber-300">{editTargetHint}</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge}`}>{status}</span>
              <span className="text-sm font-semibold text-slate-100">{progressPct.toFixed(1)}%</span>
              <span className="text-xs text-slate-300 font-semibold">· {currency(req.remaining)} remaining</span>
            </div>
          </div>

          <div className="mb-1">
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-3 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-xs text-slate-400">
              <span>{currency(t.currentSaved)} saved</span>
              <span>Goal: {currency(t.goalAmount)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3 mb-3 text-sm">
            <span className="text-slate-400">Deadline</span>
            <span className="text-slate-100 font-medium">{formatDate(t.deadline)}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{req.days} days left</span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-center">
              <div className="text-xs text-slate-400 mb-0.5">Weekly</div>
              <div className="text-sm font-semibold text-slate-100">{currency(req.weekly)}</div>
            </div>
            <div className="rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-center">
              <div className="text-xs text-slate-400 mb-0.5">Bi-weekly</div>
              <div className="text-sm font-semibold text-slate-100">{currency(req.biWeekly)}</div>
            </div>
            <div className="rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-center">
              <div className="text-xs text-slate-400 mb-0.5">Monthly</div>
              <div className="text-sm font-semibold text-slate-100">{currency(req.monthly)}</div>
            </div>
          </div>

          {/* linked budget category indicator */}
          {(() => {
            const linkedCat = categories.find(c => c.linkedGoalId === t.id)
            if (!linkedCat) return null
            const budgetWeekly = convertFromMonthly(linkedCat.amount, 'weekly')
            const covered = req ? budgetWeekly >= req.weekly : false
            return (
              <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 mb-3 border ${covered ? 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30' : 'text-amber-400 bg-amber-900/20 border-amber-700/30'}`}>
                <span>{covered ? '✓' : '!'}</span>
                <span>Budget allocates <strong>{currency(budgetWeekly)}/wk</strong> via <em>{linkedCat.name}</em></span>
                {!covered && req && <span className="ml-auto text-[10px] opacity-70">{currency(req.weekly - budgetWeekly)}/wk short</span>}
              </div>
            )
          })()}

          <div className="mb-3">
            <button
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              onClick={toggleExpanded}
            >
              {isExpanded ? 'Hide Details ▴' : 'Show Details ▾'}
            </button>
            {isExpanded && (
              <div className="mt-2 border-t border-slate-700/60 pt-2 space-y-0">
                <Row l="Start date" v={formatDate(t.startDate ?? t.createdAt)} />
                <Row l="Days remaining" v={`${req.days}`} />
                <Row l="Est. pay periods remaining" v={`${req.payPeriods}`} />
                <Row l="Yearly required" v={currency(req.yearly)} />
                {t.contributions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700/60">
                    <div className="text-xs text-slate-400 mb-1.5">Contribution history ({t.contributions.length})</div>
                    <div className="space-y-1">
                      {t.contributions.map(c => {
                        const isEditingThis = editContributionId === c.id && editContributionTargetId === t.id
                        if (isEditingThis) {
                          return (
                            <div key={c.id} className="rounded border border-slate-600 bg-slate-800 p-2 space-y-2">
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-slate-400 block mb-0.5">Date</label>
                                  <input
                                    type="date"
                                    className="w-full p-1.5 rounded bg-slate-700 border border-slate-500 text-sm"
                                    value={editContributionForm.date}
                                    onChange={e => setEditContributionForm(v => ({ ...v, date: e.target.value }))}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-400 block mb-0.5">Amount</label>
                                  <input
                                    type="number"
                                    min={0}
                                    step={25}
                                    className="w-full p-1.5 rounded bg-slate-700 border border-slate-500 text-sm"
                                    value={editContributionForm.amount}
                                    onChange={e => setEditContributionForm(v => ({ ...v, amount: e.target.value }))}
                                    onFocus={e => e.target.select()}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-400 block mb-0.5">Note</label>
                                  <input
                                    className="w-full p-1.5 rounded bg-slate-800 border border-slate-600 text-sm"
                                    value={editContributionForm.note}
                                    onChange={e => setEditContributionForm(v => ({ ...v, note: e.target.value }))}
                                    placeholder="Note"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button className="rounded bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs transition-colors" onClick={saveEditContribution}>Save</button>
                                <button className="rounded bg-slate-600 hover:bg-slate-500 px-3 py-1 text-xs transition-colors" onClick={cancelEditContribution}>Cancel</button>
                              </div>
                            </div>
                          )
                        }
                        return (
                          <div key={c.id} className="flex justify-between text-sm border-b border-slate-700 py-1">
                            <span>{c.date} · {currency(c.amount)}{c.note ? ` · ${c.note}` : ''}</span>
                            <div className="flex gap-2">
                              <button className="text-blue-300 hover:text-blue-200" onClick={() => startEditContribution(t.id, c)}>Edit</button>
                              <button
                                className="text-red-300 hover:text-red-200"
                                onClick={() => {
                                  if (props.onDeleteContribution) props.onDeleteContribution(c.id)
                                  setTargetsWithHistory(prev => prev.map(x => x.id === t.id
                                    ? { ...x, currentSaved: Math.max(0, x.currentSaved - c.amount), contributions: x.contributions.filter(k => k.id !== c.id) }
                                    : x
                                  ))
                                }}
                              >Delete</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {!t.completed && (
            <>
              <div className="border-t border-slate-700/60 pt-3 mt-1">
                <div className="text-xs text-slate-400 mb-2">Log a contribution</div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input
                    type="date"
                    ref={el => { logDateRefs.current[t.id] = el }}
                    className="p-2 rounded bg-slate-800 border border-slate-600 text-sm"
                    value={log.date}
                    onChange={(e) => setTargetLogForm(v => ({ ...v, [t.id]: { ...log, date: e.target.value } }))}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight') {
                        const count = (logDateArrowCounts.current[t.id + '-r'] ?? 0) + 1
                        logDateArrowCounts.current[t.id + '-r'] = count
                        logDateArrowCounts.current[t.id + '-l'] = 0
                        if (count > 2) {
                          e.preventDefault()
                          logDateArrowCounts.current[t.id + '-r'] = 0
                          logAmountRefs.current[t.id]?.focus()
                        }
                      } else if (e.key === 'ArrowLeft') {
                        const count = (logDateArrowCounts.current[t.id + '-l'] ?? 0) + 1
                        logDateArrowCounts.current[t.id + '-l'] = count
                        logDateArrowCounts.current[t.id + '-r'] = 0
                        if (count > 2) {
                          e.preventDefault()
                          logDateArrowCounts.current[t.id + '-l'] = 0
                        }
                      } else {
                        logDateArrowCounts.current[t.id + '-r'] = 0
                        logDateArrowCounts.current[t.id + '-l'] = 0
                      }
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    step={25}
                    ref={el => { logAmountRefs.current[t.id] = el }}
                    className="p-2 rounded bg-slate-800 border border-slate-600 text-sm"
                    value={log.amount}
                    onChange={(e) => setTargetLogForm(v => ({ ...v, [t.id]: { ...log, amount: e.target.value } }))}
                    onFocus={e => e.target.select()}
                    placeholder="Amount"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight') { e.preventDefault(); logNoteRefs.current[t.id]?.focus() }
                      if (e.key === 'ArrowLeft') { e.preventDefault(); logDateRefs.current[t.id]?.focus() }
                    }}
                  />
                  <input
                    ref={el => { logNoteRefs.current[t.id] = el }}
                    className="p-2 rounded bg-slate-800 border border-slate-600 text-sm"
                    value={log.note}
                    onChange={(e) => setTargetLogForm(v => ({ ...v, [t.id]: { ...log, note: e.target.value } }))}
                    placeholder="Note"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTargetContribution(t.id, Number(log.amount) || 0, log.date, log.note)
                        setTargetLogForm(v => ({ ...v, [t.id]: { ...log, amount: '', note: '' } }))
                      } else if (e.key === 'ArrowLeft' && (e.target as HTMLInputElement).selectionStart === 0) {
                        e.preventDefault()
                        logAmountRefs.current[t.id]?.focus()
                      }
                    }}
                  />
                </div>
                <button
                  className="w-full rounded bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm transition-colors"
                  onClick={() => { addTargetContribution(t.id, Number(log.amount) || 0, log.date, log.note); setTargetLogForm(v => ({ ...v, [t.id]: { ...log, amount: '', note: '' } })) }}
                >
                  Log Contribution
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700/60">
                <button
                  className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm transition-colors"
                  onClick={() => {
                    const amount = period === 'weekly' ? req.weekly : period === 'bi-weekly' ? req.biWeekly : period === 'yearly' ? req.yearly : req.monthly
                    const monthlyAmt = convertToMonthly(amount, period)
                    const periodAmtDisplay = currency(amount)
                    const existingIdx = categories.findIndex(c => c.name.trim().toLowerCase() === t.name.trim().toLowerCase() && c.type === 'savings')
                    let toastMsg: string
                    let affectedId: string
                    if (existingIdx >= 0) {
                      const old = categories[existingIdx].amount
                      const diff = monthlyAmt - old
                      affectedId = categories[existingIdx].id
                      if (Math.abs(diff) < 0.005) {
                        toastMsg = `No change: ${t.name} already matches ${periodAmtDisplay}`
                      } else if (diff > 0) {
                        toastMsg = `Updated: ${t.name} increased by ${currency(convertFromMonthly(diff, period))} to ${periodAmtDisplay}`
                      } else {
                        toastMsg = `Updated: ${t.name} decreased by ${currency(convertFromMonthly(Math.abs(diff), period))} to ${periodAmtDisplay}`
                      }
                    } else {
                      affectedId = crypto.randomUUID()
                      toastMsg = `New: ${t.name} added to Budget at ${periodAmtDisplay}`
                    }
                    pushBudgetHistory()
                    if (existingIdx >= 0) {
                      setCategories(prev => {
                        const cp = [...prev]
                        cp[existingIdx] = { ...cp[existingIdx], amount: monthlyAmt, linkedGoalId: t.id }
                        return cp
                      })
                    } else {
                      setCategories(prev => [...prev, { id: affectedId, name: t.name, amount: monthlyAmt, type: 'savings', linkedGoalId: t.id }])
                    }
                    setTab('Budget')
                    setTimeout(() => {
                      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
                      setHighlightedCategoryId(affectedId)
                      highlightTimerRef.current = setTimeout(() => setHighlightedCategoryId(null), 2500)
                    }, 80)
                    showToast(toastMsg)
                  }}
                >
                  Add to Current Budget
                </button>
                <button
                  className="rounded bg-green-700 hover:bg-green-600 px-3 py-1.5 text-sm transition-colors"
                  onClick={() => setTargetsWithHistory(prev => prev.map(x => x.id === t.id ? { ...x, completed: true } : x))}
                >
                  Move to Completed
                </button>
                <button
                  className="rounded bg-slate-600 hover:bg-slate-500 px-3 py-1.5 text-sm transition-colors min-w-[7rem]"
                  onClick={() => {
                    setTargetFormHistory(fh => [...fh.slice(-19), { ...targetForm }])
                    setTargetFormRedo([])
                    setTargetForm({
                      name: '',
                      goalAmount: String(t.goalAmount),
                      currentSaved: String(t.currentSaved),
                      startDate: t.startDate ?? t.createdAt ?? new Date().toISOString().slice(0, 10),
                      deadline: t.deadline ?? '',
                    })
                    setTargetFormHint('')
                    setTab('Targets')
                    setTimeout(() => targetNameRef.current?.focus(), 50)
                  }}
                >
                  Duplicate
                </button>
              </div>
            </>
          )}
          {t.completed && (
            <button
              className="mt-3 rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm transition-colors"
              onClick={() => setTargetsWithHistory(prev => prev.map(x => x.id === t.id ? { ...x, completed: false } : x))}
            >
              Move Back to Active
            </button>
          )}
        </>
      )}
    </Card>
  )
}
