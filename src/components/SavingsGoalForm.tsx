import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import { Card } from './ui'

type SavingsGoalFormState = {
  name: string
  goalAmount: string
  currentSaved: string
  startDate: string
  deadline: string
}

type SavingsGoalFormProps = {
  targetForm: SavingsGoalFormState
  setTargetForm: Dispatch<SetStateAction<SavingsGoalFormState>>
  targetFormHint: string
  setTargetFormHint: Dispatch<SetStateAction<string>>
  editTargetHint: string
  targetSuggestionList: string[]
  showTargetSuggestions: boolean
  setShowTargetSuggestions: Dispatch<SetStateAction<boolean>>
  targetSuggestionIndex: number
  setTargetSuggestionIndex: Dispatch<SetStateAction<number>>
  targetAutocompleteWrapRef: RefObject<HTMLDivElement | null>
  targetNameRef: RefObject<HTMLInputElement | null>
  targetGoalRef: RefObject<HTMLInputElement | null>
  targetSavedRef: RefObject<HTMLInputElement | null>
  targetStartDateRef: RefObject<HTMLInputElement | null>
  targetDeadlineRef: RefObject<HTMLInputElement | null>
  startDateArrowCount: MutableRefObject<number>
  deadlineArrowCount: MutableRefObject<number>
  startDateLeftArrowCount: MutableRefObject<number>
  deadlineLeftArrowCount: MutableRefObject<number>
  createTarget: () => void
  generateSampleGoal: () => void
}

export function SavingsGoalForm({
  targetForm,
  setTargetForm,
  targetFormHint,
  setTargetFormHint,
  editTargetHint,
  targetSuggestionList,
  showTargetSuggestions,
  setShowTargetSuggestions,
  targetSuggestionIndex,
  setTargetSuggestionIndex,
  targetAutocompleteWrapRef,
  targetNameRef,
  targetGoalRef,
  targetSavedRef,
  targetStartDateRef,
  targetDeadlineRef,
  startDateArrowCount,
  deadlineArrowCount,
  startDateLeftArrowCount,
  deadlineLeftArrowCount,
  createTarget,
  generateSampleGoal,
}: SavingsGoalFormProps) {
  return (
    <Card title="Create Savings Goal" noHover>
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Goal Name</label>
          <div ref={targetAutocompleteWrapRef} className="relative">
            <input
              ref={targetNameRef}
              className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
              value={targetForm.name}
              placeholder="e.g. Emergency Fund"
              onFocus={() => setShowTargetSuggestions(true)}
              onChange={(e) => { setTargetForm((v) => ({ ...v, name: e.target.value })); setTargetSuggestionIndex(-1); setShowTargetSuggestions(true); setTargetFormHint('') }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  if (targetSuggestionList.length) { setTargetSuggestionIndex((v) => Math.min(v + 1, targetSuggestionList.length - 1)); setShowTargetSuggestions(true) }
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  if (targetSuggestionList.length) { setTargetSuggestionIndex((v) => Math.max(v - 1, 0)); setShowTargetSuggestions(true) }
                  return
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (targetSuggestionIndex >= 0 && targetSuggestionList.length) {
                    setTargetForm((v) => ({ ...v, name: targetSuggestionList[targetSuggestionIndex] }))
                    setShowTargetSuggestions(false); setTargetSuggestionIndex(-1); targetGoalRef.current?.focus(); return
                  }
                  if (targetSuggestionList.length === 1) {
                    setTargetForm((v) => ({ ...v, name: targetSuggestionList[0] }))
                    setShowTargetSuggestions(false); setTargetSuggestionIndex(-1); targetGoalRef.current?.focus(); return
                  }
                  if (targetForm.name.trim()) { setShowTargetSuggestions(false); setTargetSuggestionIndex(-1); targetGoalRef.current?.focus() }
                }
              }}
            />
            {showTargetSuggestions && targetSuggestionList.length > 0 && (
              <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg">
                {targetSuggestionList.map((preset, i) => (
                  <button
                    key={preset}
                    type="button"
                    className={`w-full text-left px-2 py-1 text-sm ${i === targetSuggestionIndex ? 'bg-slate-700' : 'hover:bg-slate-700'}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setTargetForm((v) => ({ ...v, name: preset })); setShowTargetSuggestions(false); setTargetSuggestionIndex(-1); targetGoalRef.current?.focus() }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Goal Amount</label>
          <input
            ref={targetGoalRef}
            type="number"
            min={0}
            step={25}
            className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
            value={targetForm.goalAmount}
            onChange={(e) => setTargetForm((v) => ({ ...v, goalAmount: e.target.value }))}
            onFocus={e => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); targetSavedRef.current?.focus() }
            }}
            placeholder="e.g. 1000"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Current Saved</label>
          <input
            ref={targetSavedRef}
            type="number"
            min={0}
            step={25}
            className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
            value={targetForm.currentSaved}
            onChange={(e) => setTargetForm((v) => ({ ...v, currentSaved: e.target.value }))}
            onFocus={e => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); targetStartDateRef.current?.focus() }
              if (e.key === 'ArrowLeft') { e.preventDefault(); targetGoalRef.current?.focus() }
            }}
            placeholder="e.g. 250"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Start Date (when you began saving)</label>
          <input
            ref={targetStartDateRef}
            type="date"
            className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
            value={targetForm.startDate}
            onChange={(e) => setTargetForm((v) => ({ ...v, startDate: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                startDateLeftArrowCount.current = 0
                startDateArrowCount.current += 1
                if (startDateArrowCount.current > 2) {
                  e.preventDefault()
                  startDateArrowCount.current = 0
                  targetDeadlineRef.current?.focus()
                }
              } else if (e.key === 'ArrowLeft') {
                startDateArrowCount.current = 0
                startDateLeftArrowCount.current += 1
                if (startDateLeftArrowCount.current > 2) {
                  e.preventDefault()
                  startDateLeftArrowCount.current = 0
                  targetSavedRef.current?.focus()
                }
              } else if (e.key === 'Enter') {
                e.preventDefault()
                startDateArrowCount.current = 0
                startDateLeftArrowCount.current = 0
                targetDeadlineRef.current?.focus()
              } else {
                startDateArrowCount.current = 0
                startDateLeftArrowCount.current = 0
              }
            }}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Deadline (when the goal is due)</label>
          <input
            ref={targetDeadlineRef}
            type="date"
            className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
            value={targetForm.deadline}
            onChange={(e) => setTargetForm((v) => ({ ...v, deadline: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                deadlineLeftArrowCount.current = 0
                deadlineArrowCount.current += 1
                if (deadlineArrowCount.current > 2) {
                  e.preventDefault()
                  deadlineArrowCount.current = 0
                  createTarget()
                }
              } else if (e.key === 'ArrowLeft') {
                deadlineArrowCount.current = 0
                deadlineLeftArrowCount.current += 1
                if (deadlineLeftArrowCount.current > 2) {
                  e.preventDefault()
                  deadlineLeftArrowCount.current = 0
                  targetStartDateRef.current?.focus()
                }
              } else if (e.key === 'Enter') {
                e.preventDefault()
                deadlineArrowCount.current = 0
                deadlineLeftArrowCount.current = 0
                createTarget()
              } else {
                deadlineArrowCount.current = 0
                deadlineLeftArrowCount.current = 0
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <button className="w-full px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 transition-colors" onClick={createTarget}>Create Savings Goal</button>
          <button
            className="w-full px-3 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors"
            title="Instantly add a randomized sample savings goal"
            onClick={generateSampleGoal}
          >Generate Sample</button>
        </div>
      </div>
      {targetFormHint && (
        <p className="mt-2 text-sm text-amber-300">{targetFormHint}</p>
      )}
      {editTargetHint && (
        <p className="text-xs text-yellow-300 mt-1">
          {editTargetHint}
        </p>
      )}
    </Card>
  )
}
