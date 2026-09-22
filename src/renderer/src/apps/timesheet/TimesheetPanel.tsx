import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Settings2,
  Trash2,
} from 'lucide-react'
import {
  INTERVAL_CHOICES,
  dayToCsv,
  dayToMarkdown,
  formatDuration,
  nextPromptAt,
  startOfDay,
  summariseDay,
  withinWorkingHours,
  type TimesheetConfig,
  type TimesheetEntry,
} from '@shared/schedule'
import { invoke } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { Panel } from '@/components/Panel'
import { useTimesheet } from '@/state/timesheet'
import { useUi } from '@/state/ui'
import { AppIcon } from '../icons'

const DAY = 86_400_000
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function dayTitle(day: number, today: number): string {
  if (day === today) return 'Today'
  if (day === today - DAY) return 'Yesterday'
  return new Date(day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function TimesheetPanel(): React.JSX.Element {
  const open = useUi((s) => s.timesheetOpen)
  return <AnimatePresence>{open && <TimesheetDialog />}</AnimatePresence>
}

/**
 * The day, read back. Every answer becomes a block of time — the stretch until
 * the next question — so a day of one-line answers turns into totals per
 * activity and a timeline, both a copy away from a real timesheet. The
 * schedule that asks the question lives behind the gear, in the same place.
 */
function TimesheetDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeTimesheet)
  const config = useTimesheet((s) => s.config)
  const changed = useTimesheet((s) => s.changed)
  const [now] = useState(() => Date.now())
  const today = startOfDay(now)
  const [day, setDay] = useState(today)
  // The day's entries and the moment they were read: the open block runs to
  // that moment, and nothing here needs a clock of its own during render.
  const [loaded, setLoaded] = useState<{ entries: TimesheetEntry[]; at: number }>({
    entries: [],
    at: now,
  })
  const entries = loaded.entries
  const [showConfig, setShowConfig] = useState(false)
  const [copied, setCopied] = useState<'md' | 'csv' | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void invoke('timesheet:day', { day }).then((rows) => {
        if (!cancelled) setLoaded({ entries: rows, at: Date.now() })
      })
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [day, changed])

  const summary = useMemo(
    () => (config ? summariseDay(loaded.entries, day, loaded.at, config) : null),
    [loaded, day, config],
  )
  const maxTotal = summary?.totals[0]?.duration ?? 0

  const copy = async (kind: 'md' | 'csv'): Promise<void> => {
    if (!summary) return
    await navigator.clipboard.writeText(kind === 'md' ? dayToMarkdown(summary) : dayToCsv(summary))
    setCopied(kind)
    setTimeout(() => setCopied(null), 1400)
  }

  const nextAt = useMemo(() => {
    if (!config || day !== today) return null
    const lastAsked = loaded.entries.reduce<number | null>(
      (m, e) => (m === null || e.askedAt > m ? e.askedAt : m),
      null,
    )
    return nextPromptAt(loaded.at, lastAsked, config)
  }, [config, loaded, day, today])

  return (
    <Panel
      overlayKey="timesheet"
      icon={<AppIcon id="timesheet" size={17} />}
      title="Timesheet"
      width={880}
      onClose={close}
      testId="timesheet-panel"
      header={
        <>
          <div className="ml-3 flex items-center gap-1">
            <IconButton
              label="Previous day"
              onClick={() => setDay((d) => d - DAY)}
              testId="timesheet-prev"
            >
              <ChevronLeft size={15} />
            </IconButton>
            <button
              type="button"
              onClick={() => setDay(today)}
              className="min-w-[9ch] cursor-pointer rounded-lg px-2 py-1 text-center text-[13px] font-medium hover:bg-(--surface-hover)"
              style={{ color: 'var(--ink-1)' }}
              data-testid="timesheet-day"
            >
              {dayTitle(day, today)}
            </button>
            <IconButton
              label="Next day"
              onClick={() => setDay((d) => Math.min(today, d + DAY))}
              disabled={day >= today}
              testId="timesheet-next"
            >
              <ChevronRight size={15} />
            </IconButton>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => void copy('md')}
              disabled={!summary || summary.blocks.length === 0}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] hover:bg-(--surface-hover) disabled:cursor-default disabled:opacity-40"
              style={{ color: 'var(--ink-2)' }}
              data-testid="timesheet-copy-md"
            >
              {copied === 'md' ? <Check size={13} /> : <Copy size={13} />}
              Markdown
            </button>
            <button
              type="button"
              onClick={() => void copy('csv')}
              disabled={!summary || summary.blocks.length === 0}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] hover:bg-(--surface-hover) disabled:cursor-default disabled:opacity-40"
              style={{ color: 'var(--ink-2)' }}
              data-testid="timesheet-copy-csv"
            >
              {copied === 'csv' ? <Check size={13} /> : <Copy size={13} />}
              CSV
            </button>
            <IconButton
              label="Schedule and question"
              onClick={() => setShowConfig((v) => !v)}
              active={showConfig}
              testId="timesheet-settings"
            >
              <Settings2 size={15} />
            </IconButton>
          </div>
        </>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-4" data-testid="timesheet-body">
        <AnimatePresence initial={false}>
          {showConfig && config && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0, transition: { duration: 0.14 } }}
              className="overflow-hidden"
            >
              <ConfigCard config={config} />
            </motion.div>
          )}
        </AnimatePresence>

        {summary &&
        summary.blocks.length === 0 &&
        summary.skipped === 0 &&
        summary.unanswered === 0 ? (
          <EmptyDay config={config} nextAt={nextAt} isToday={day === today} now={loaded.at} />
        ) : (
          summary && (
            <>
              <div className="mt-1 grid grid-cols-3 gap-3" data-testid="timesheet-stats">
                <Stat label="Tracked" value={formatDuration(summary.totalDuration)} accent />
                <Stat label="Answers" value={String(summary.blocks.length)} />
                <Stat
                  label={summary.unanswered > 0 ? 'Skipped · unanswered' : 'Skipped'}
                  value={
                    summary.unanswered > 0
                      ? `${summary.skipped} · ${summary.unanswered}`
                      : String(summary.skipped)
                  }
                />
              </div>

              {summary.totals.length > 0 && (
                <section className="mt-5" data-testid="timesheet-totals">
                  <SectionLabel>By activity</SectionLabel>
                  <ul className="space-y-2">
                    {summary.totals.map((t, i) => (
                      <li key={t.answer} className="flex items-center gap-3">
                        <span
                          className="w-[38%] truncate text-[13px]"
                          style={{ color: 'var(--ink-1)' }}
                          title={t.answer}
                        >
                          {t.answer}
                        </span>
                        <span
                          className="h-2 min-w-0 flex-1 rounded-full"
                          style={{ background: 'var(--surface-glass-strong)' }}
                        >
                          <motion.span
                            className="block h-2 rounded-full"
                            style={{ background: 'var(--accent)', opacity: 1 - i * 0.12 }}
                            initial={{ width: 0 }}
                            animate={{ width: `${maxTotal ? (t.duration / maxTotal) * 100 : 0}%` }}
                            transition={{ type: 'spring', stiffness: 220, damping: 30 }}
                          />
                        </span>
                        <span
                          className="w-[8ch] shrink-0 text-right text-[12.5px] tabular-nums"
                          style={{ color: 'var(--ink-2)' }}
                        >
                          {formatDuration(t.duration)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="mt-5" data-testid="timesheet-timeline">
                <SectionLabel>Through the day</SectionLabel>
                <ol
                  className="relative ml-[64px] border-l pl-4"
                  style={{ borderColor: 'var(--border-glass)' }}
                >
                  {entries.map((e) => {
                    const block = summary.blocks.find((b) => b.start === e.askedAt)
                    const faint = !block
                    return (
                      <li
                        key={e.id}
                        className="group relative py-1.5"
                        data-testid="timesheet-entry"
                      >
                        <span
                          className="absolute top-[13px] -left-[21px] h-2.5 w-2.5 rounded-full"
                          style={{
                            background: faint ? 'transparent' : 'var(--accent)',
                            border: `1.5px solid ${faint ? 'var(--ink-3)' : 'var(--accent)'}`,
                          }}
                        />
                        <span
                          className="absolute top-[9px] -left-[72px] w-[48px] text-right text-[11px] tabular-nums"
                          style={{ color: 'var(--ink-3)' }}
                        >
                          {clock(e.askedAt)}
                        </span>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div
                              className={`text-[13.5px] ${faint ? 'italic' : ''}`}
                              style={{ color: faint ? 'var(--ink-3)' : 'var(--ink-1)' }}
                            >
                              {e.skipped ? 'Skipped' : e.answer || 'No answer'}
                            </div>
                            <div
                              className="mt-0.5 flex items-center gap-2 text-[11.5px]"
                              style={{ color: 'var(--ink-3)' }}
                            >
                              {block && <span>{formatDuration(block.duration)}</span>}
                              {e.tabUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (e.tabUrl)
                                      void invoke('tabs:create', { url: e.tabUrl, activate: true })
                                    close()
                                  }}
                                  className="flex max-w-[32ch] cursor-pointer items-center gap-1 hover:underline"
                                  title={e.tabUrl}
                                >
                                  <ExternalLink size={10} className="shrink-0" />
                                  <span className="truncate">
                                    {e.tabTitle || displayLabel(e.tabUrl)}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void invoke('timesheet:deleteEntry', { id: e.id })}
                            title="Remove this entry"
                            aria-label="Remove this entry"
                            className="cursor-pointer rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--surface-hover)"
                            style={{ color: 'var(--ink-3)' }}
                            data-testid="timesheet-entry-delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>

              {nextAt !== null && (
                <p
                  className="mt-4 text-[11.5px]"
                  style={{ color: 'var(--ink-3)' }}
                  data-testid="timesheet-next-question"
                >
                  Next question {nextAt <= loaded.at ? 'is due now' : `at ${clock(nextAt)}`}.
                </p>
              )}
            </>
          )
        )}
      </div>
    </Panel>
  )
}

function EmptyDay({
  config,
  nextAt,
  isToday,
  now,
}: {
  config: TimesheetConfig | null
  nextAt: number | null
  isToday: boolean
  now: number
}): React.JSX.Element {
  const inHours = config ? withinWorkingHours(now, config) : false
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
      <span style={{ color: 'var(--ink-3)' }}>
        <AppIcon id="timesheet" size={28} />
      </span>
      <p className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
        {isToday ? 'Nothing answered yet today.' : 'Nothing was asked that day.'}
      </p>
      {config && isToday && (
        <p className="max-w-[46ch] text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Aura asks <em style={{ color: 'var(--ink-2)' }}>“{config.question}”</em> every{' '}
          {config.intervalMinutes} minutes inside your working hours.{' '}
          {nextAt === null
            ? 'No working days are set — open the schedule to choose some.'
            : inHours
              ? `The next one comes at ${clock(nextAt)}.`
              : `The first one comes at ${clock(nextAt)}.`}
        </p>
      )}
    </div>
  )
}

function ConfigCard({ config }: { config: TimesheetConfig }): React.JSX.Element {
  const [question, setQuestion] = useState(config.question)
  // The field is typed into, so it holds its own text — but a change that
  // arrives from elsewhere (the palette, another window, a test) has to show
  // here too. Adjusting during render, not in an effect, keeps it one pass.
  const [seenQuestion, setSeenQuestion] = useState(config.question)
  if (config.question !== seenQuestion) {
    setSeenQuestion(config.question)
    setQuestion(config.question)
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = (patch: Partial<TimesheetConfig>): void => {
    void invoke('apps:setTimesheetConfig', patch).then((cfg) =>
      useTimesheet.getState().setConfig(cfg),
    )
  }
  const saveQuestion = (q: string): void => {
    setQuestion(q)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (q.trim()) save({ question: q.trim() })
    }, 500)
  }
  const toggleDay = (d: number): void => {
    const days = config.days.includes(d)
      ? config.days.filter((x) => x !== d)
      : [...config.days, d].sort()
    save({ days })
  }
  const hours = Array.from({ length: 25 }, (_, i) => i)
  const hourLabel = (h: number): string => (h === 0 || h === 24 ? 'Midnight' : `${h}:00`)

  return (
    <div
      className="glass mb-4 rounded-2xl p-4"
      style={{ border: '1px solid var(--border-glass)' }}
      data-testid="timesheet-config"
    >
      <label className="block">
        <span
          className="text-[11px] font-medium tracking-wide uppercase"
          style={{ color: 'var(--ink-3)' }}
        >
          The question
        </span>
        <input
          value={question}
          onChange={(e) => saveQuestion(e.target.value)}
          spellCheck
          className="mt-1 w-full rounded-lg bg-transparent px-0 py-1 text-[14px] outline-none"
          style={{ color: 'var(--ink-1)', borderBottom: '1px solid var(--border-glass)' }}
          data-testid="timesheet-question"
        />
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <span
            className="text-[11px] font-medium tracking-wide uppercase"
            style={{ color: 'var(--ink-3)' }}
          >
            Every
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="timesheet-interval">
            {INTERVAL_CHOICES.map((m) => {
              const active = config.intervalMinutes === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => save({ intervalMinutes: m })}
                  className="cursor-pointer rounded-full px-2.5 py-1 text-[12px]"
                  style={{
                    background: active ? 'var(--accent)' : 'var(--surface-glass-strong)',
                    color: active ? 'var(--accent-ink)' : 'var(--ink-2)',
                  }}
                  data-active={active || undefined}
                >
                  {m < 60
                    ? `${m}m`
                    : m % 60 === 0
                      ? `${m / 60}h`
                      : `${Math.floor(m / 60)}h ${m % 60}m`}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <span
            className="text-[11px] font-medium tracking-wide uppercase"
            style={{ color: 'var(--ink-3)' }}
          >
            On
          </span>
          <div className="mt-1.5 flex gap-1" data-testid="timesheet-days">
            {DAY_LETTERS.map((letter, d) => {
              const active = config.days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={active}
                  aria-label={
                    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
                      d
                    ]
                  }
                  className="h-7 w-7 cursor-pointer rounded-full text-[12px] font-medium"
                  style={{
                    background: active ? 'var(--accent)' : 'var(--surface-glass-strong)',
                    color: active ? 'var(--accent-ink)' : 'var(--ink-3)',
                  }}
                >
                  {letter}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div
        className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px]"
        style={{ color: 'var(--ink-2)' }}
      >
        <span>Between</span>
        <select
          value={config.startHour}
          onChange={(e) => save({ startHour: Number(e.target.value) })}
          className="glass cursor-pointer rounded-lg px-2 py-1 outline-none"
          style={{ color: 'var(--ink-1)' }}
          data-testid="timesheet-start"
        >
          {hours.slice(0, 24).map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
        <span>and</span>
        <select
          value={config.endHour}
          onChange={(e) => save({ endHour: Number(e.target.value) })}
          className="glass cursor-pointer rounded-lg px-2 py-1 outline-none"
          style={{ color: 'var(--ink-1)' }}
          data-testid="timesheet-end"
        >
          {hours.slice(1).map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
        {config.startHour >= config.endHour && (
          <span style={{ color: 'var(--danger)' }}>The window has to end after it starts.</span>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}): React.JSX.Element {
  return (
    <div
      className="glass rounded-xl px-3.5 py-2.5"
      style={{ border: '1px solid var(--border-glass)' }}
    >
      <div
        className="text-[11px] font-medium tracking-wide uppercase"
        style={{ color: 'var(--ink-3)' }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-[20px] font-semibold tabular-nums"
        style={{ color: accent ? 'var(--accent)' : 'var(--ink-1)' }}
      >
        {value}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      className="mb-2 text-[11px] font-medium tracking-wide uppercase"
      style={{ color: 'var(--ink-3)' }}
    >
      {children}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  active,
  testId,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  active?: boolean
  testId?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-(--surface-hover) disabled:cursor-default disabled:opacity-30"
      style={{ color: active ? 'var(--accent)' : 'var(--ink-2)' }}
      data-testid={testId}
    >
      {children}
    </button>
  )
}
