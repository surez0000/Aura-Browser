import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { UNPLANNED_STARTS } from '@shared/schedule'
import { invoke } from '@/lib/ipc'
import { useTabs, selectActiveTab } from '@/state/tabs'
import { useTimesheet } from '@/state/timesheet'
import { useUi } from '@/state/ui'
import { AppIcon } from '../icons'

const startLabel = (minutes: number): string => (minutes === 0 ? 'Now' : `${minutes}m ago`)

/**
 * Unplanned work, logged when it comes up instead of at the next question.
 * One line, like an answer, plus when it began — often a little before there
 * is a moment to log it. The schedule does not move for it.
 *
 * `bar` sits above the page like the question and goes away once logged;
 * `panel` is the day view's own line, which stays for the next one.
 */
export function LogWork({ variant }: { variant: 'bar' | 'panel' }): React.JSX.Element {
  const bar = variant === 'bar'
  const active = useTabs(selectActiveTab)
  const logFocus = useTimesheet((s) => s.logFocus)
  const [value, setValue] = useState('')
  const [minutesAgo, setMinutesAgo] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [logged, setLogged] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const suggestion = active?.title || ''

  // Asked for by hand, so it takes the keyboard, even from a page that held
  // it: the bar as it opens, either one whenever it is asked for again. The
  // day view's line waits to be asked; opening the day is for reading it.
  const answered = useRef(bar ? -1 : logFocus)
  useEffect(() => {
    if (answered.current === logFocus) return
    answered.current = logFocus
    // With the day view open, its own line is the one being asked for.
    if (bar && useUi.getState().timesheetOpen) return
    inputRef.current?.focus()
    void invoke('ui:focus', { target: 'chrome' }).then(() => inputRef.current?.focus())
  }, [logFocus, bar])

  const close = (): void => {
    useTimesheet.getState().closeLog()
    void invoke('ui:focus', { target: 'page' })
  }

  const submit = async (): Promise<void> => {
    const answer = (value || suggestion).trim()
    if (!answer || busy) return
    setBusy(true)
    try {
      await invoke('timesheet:log', { answer, minutesAgo })
    } finally {
      setBusy(false)
    }
    if (bar) {
      close()
      return
    }
    setValue('')
    setMinutesAgo(0)
    setLogged(true)
    setTimeout(() => setLogged(false), 1400)
  }

  const input = (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void submit()
        if (e.key === 'Escape' && bar) {
          e.preventDefault()
          close()
        }
      }}
      placeholder={
        suggestion ? `${suggestion} — Enter to accept` : 'What came up? One line is enough…'
      }
      aria-label="Unplanned work"
      spellCheck
      className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
      style={{ color: 'var(--ink-1)' }}
      data-testid="timesheet-log-input"
    />
  )

  const starts = (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
        Started
      </span>
      <div
        className="flex items-center rounded-lg p-0.5"
        style={{ background: 'var(--surface-glass)' }}
        role="radiogroup"
        aria-label="Started"
        data-testid="timesheet-log-start"
      >
        {UNPLANNED_STARTS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={minutesAgo === m}
            onClick={(e) => {
              e.stopPropagation()
              setMinutesAgo(m)
              inputRef.current?.focus()
            }}
            className="cursor-pointer rounded-md px-2 py-0.5 text-[11.5px] whitespace-nowrap transition-colors"
            style={{
              background: minutesAgo === m ? 'var(--surface-selected)' : 'transparent',
              color: minutesAgo === m ? 'var(--ink-1)' : 'var(--ink-3)',
            }}
            title={m === 0 ? 'Started just now' : `Started ${m} minutes ago`}
            data-testid={`timesheet-log-start-${m}`}
          >
            {startLabel(m)}
          </button>
        ))}
      </div>
    </div>
  )

  const logButton = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        void submit()
      }}
      disabled={busy || (!value.trim() && !suggestion)}
      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 text-[12.5px] font-medium disabled:cursor-default disabled:opacity-40"
      style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
      data-testid="timesheet-log-submit"
    >
      {logged && <Check size={13} />}
      {logged ? 'Logged' : 'Log it'}
    </button>
  )

  if (!bar) {
    return (
      <section
        className="glass mb-4 flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
        style={{ border: '1px solid var(--border-glass)' }}
        onClick={() => inputRef.current?.focus()}
        data-testid="timesheet-log"
      >
        <span className="shrink-0 text-[12.5px] font-medium" style={{ color: 'var(--ink-2)' }}>
          Log work now
        </span>
        {input}
        {starts}
        {logButton}
      </section>
    )
  }

  return (
    <div
      className="glass flex items-center gap-3 rounded-xl px-3 py-2"
      style={{ borderLeft: '3px solid var(--accent)' }}
      onClick={() => inputRef.current?.focus()}
      data-testid="timesheet-log-bar"
    >
      <span style={{ color: 'var(--accent)' }}>
        <AppIcon id="timesheet" size={16} />
      </span>
      <span className="shrink-0 text-[13px] font-medium" style={{ color: 'var(--ink-1)' }}>
        Unplanned work
      </span>
      {input}
      {starts}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          close()
        }}
        className="shrink-0 cursor-pointer rounded-lg px-3 py-1 text-[12.5px] font-medium hover:bg-(--surface-hover)"
        style={{ color: 'var(--ink-2)' }}
        data-testid="timesheet-log-cancel"
      >
        Cancel
      </button>
      {logButton}
    </div>
  )
}
