import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, RotateCcw } from 'lucide-react'
import type { ReminderEntry } from '@shared/schedule'
import { invoke } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { useReminders } from '@/state/reminders'
import { useTabs, selectActiveTab } from '@/state/tabs'
import { useTimesheet, type TimesheetPrompt } from '@/state/timesheet'
import { AppIcon } from './icons'

/**
 * What the apps have to say, said above the page — the page shrinks under
 * the bar the way it does for a permission prompt, so nothing floats over the
 * native view and nothing takes the focus you were using. A reminder whose
 * time has come; the timesheet's question. Several stack.
 */
export function AppPrompts(): React.JSX.Element {
  const due = useReminders((s) => s.due)
  const prompt = useTimesheet((s) => s.prompt)

  return (
    <AnimatePresence initial={false}>
      {due.map((r) => (
        <motion.div
          key={`reminder-${r.id}`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        >
          <ReminderBar reminder={r} />
        </motion.div>
      ))}
      {prompt && (
        <motion.div
          key={`timesheet-${prompt.entry.id}`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        >
          <TimesheetBar prompt={prompt} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ReminderBar({ reminder: r }: { reminder: ReminderEntry }): React.JSX.Element {
  const dismiss = useReminders((s) => s.dismiss)
  const [snoozing, setSnoozing] = useState(false)

  const done = (): void => {
    void invoke('reminders:complete', { id: r.id })
    dismiss(r.id)
  }
  const snooze = (minutes: number): void => {
    void invoke('reminders:snooze', { id: r.id, minutes })
    dismiss(r.id)
  }

  return (
    <div
      className="glass flex items-center gap-3 rounded-xl px-3 py-2"
      style={{ borderLeft: '3px solid var(--accent)' }}
      data-testid="reminder-bar"
      data-reminder={r.id}
    >
      <span style={{ color: 'var(--accent)' }}>
        <AppIcon id="reminders" size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--ink-1)' }}>
        {r.text}
      </span>
      {r.url && (
        <button
          type="button"
          onClick={() => {
            if (r.url) void invoke('tabs:create', { url: r.url, activate: true })
          }}
          className="flex max-w-[22ch] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)', border: '1px solid var(--border-glass)' }}
          title={r.url}
          data-testid="reminder-bar-page"
        >
          <ExternalLink size={11} className="shrink-0" />
          <span className="truncate">{r.pageTitle || displayLabel(r.url)}</span>
        </button>
      )}
      {snoozing ? (
        <span
          className="flex shrink-0 items-center gap-1"
          data-testid="reminder-bar-snooze-options"
        >
          {[
            { label: '10m', minutes: 10 },
            { label: '1h', minutes: 60 },
            { label: 'Tomorrow', minutes: 24 * 60 },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => snooze(s.minutes)}
              className="cursor-pointer rounded-lg px-2 py-1 text-[12px] hover:bg-(--surface-hover)"
              style={{ color: 'var(--ink-2)' }}
            >
              {s.label}
            </button>
          ))}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setSnoozing(true)}
          className="shrink-0 cursor-pointer rounded-lg px-3 py-1 text-[12.5px] font-medium hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)' }}
          data-testid="reminder-bar-snooze"
        >
          Later
        </button>
      )}
      <button
        type="button"
        onClick={done}
        className="shrink-0 cursor-pointer rounded-lg px-3 py-1 text-[12.5px] font-medium"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        data-testid="reminder-bar-done"
      >
        {r.repeat === 'none' ? 'Done' : 'Done for today'}
      </button>
    </div>
  )
}

/**
 * The question, answerable in place. Nothing is pre-filled — the page's title
 * sits in the placeholder as a suggestion, and Enter on an empty field takes
 * it, so the common case is one keypress. "Same as last" is one click.
 */
function TimesheetBar({ prompt }: { prompt: TimesheetPrompt }): React.JSX.Element {
  const active = useTabs(selectActiveTab)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const suggestion = prompt.entry.tabTitle || active?.title || ''

  const submit = (answer: string): void => {
    const text = answer.trim()
    if (!text) return
    void invoke('timesheet:answer', { id: prompt.entry.id, answer: text })
    useTimesheet.getState().setPrompt(null)
  }
  const skip = (): void => {
    void invoke('timesheet:skip', { id: prompt.entry.id })
    useTimesheet.getState().setPrompt(null)
  }

  return (
    <div
      className="glass flex items-center gap-3 rounded-xl px-3 py-2"
      style={{ borderLeft: '3px solid var(--accent)' }}
      onClick={() => inputRef.current?.focus()}
      data-testid="timesheet-bar"
    >
      <span style={{ color: 'var(--accent)' }}>
        <AppIcon id="timesheet" size={16} />
      </span>
      <span
        className="shrink-0 text-[13px] font-medium"
        style={{ color: 'var(--ink-1)' }}
        data-testid="timesheet-bar-question"
      >
        {prompt.question}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit(value || suggestion)
          if (e.key === 'Escape') skip()
        }}
        placeholder={suggestion ? `${suggestion} — Enter to accept` : 'One line is enough…'}
        spellCheck
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        style={{ color: 'var(--ink-1)' }}
        data-testid="timesheet-bar-input"
      />
      {prompt.lastAnswer && (
        <button
          type="button"
          onClick={() => submit(prompt.lastAnswer ?? '')}
          className="flex max-w-[26ch] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)', border: '1px solid var(--border-glass)' }}
          title={`Same as last: ${prompt.lastAnswer}`}
          data-testid="timesheet-bar-same"
        >
          <RotateCcw size={11} className="shrink-0" />
          <span className="truncate">{prompt.lastAnswer}</span>
        </button>
      )}
      <button
        type="button"
        onClick={skip}
        className="shrink-0 cursor-pointer rounded-lg px-3 py-1 text-[12.5px] font-medium hover:bg-(--surface-hover)"
        style={{ color: 'var(--ink-2)' }}
        data-testid="timesheet-bar-skip"
      >
        Skip
      </button>
      <button
        type="button"
        onClick={() => submit(value || suggestion)}
        disabled={!value.trim() && !suggestion}
        className="shrink-0 cursor-pointer rounded-lg px-3 py-1 text-[12.5px] font-medium disabled:cursor-default disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        data-testid="timesheet-bar-submit"
      >
        Log it
      </button>
    </div>
  )
}
