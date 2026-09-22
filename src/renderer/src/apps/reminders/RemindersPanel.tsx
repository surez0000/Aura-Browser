import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlarmClockPlus, Check, ExternalLink, Link2, Repeat, Trash2, X } from 'lucide-react'
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  REPEAT_LABELS,
  REPEAT_RULES,
  bucketOf,
  quickTimes,
  raiseAt,
  type ReminderBucket,
  type ReminderEntry,
  type RepeatRule,
} from '@shared/schedule'
import { invoke, modKeyLabel } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { Panel } from '@/components/Panel'
import { useReminders } from '@/state/reminders'
import { useUi } from '@/state/ui'
import { AppIcon } from '../icons'

const DAY = 86_400_000

/** "Today 15:00", "Tomorrow 09:00", "Mon 28 Sep, 09:00" — or how long ago. */
export function whenLabel(at: number, now: number): string {
  const d = new Date(at)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = today.getTime()
  if (at < now) {
    const ago = now - at
    if (ago < 3_600_000) return `${Math.max(1, Math.round(ago / 60_000))}m overdue`
    if (at >= start) return `Due ${time}`
    return `Due ${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`
  }
  if (at < start + DAY) return `Today ${time}`
  if (at < start + 2 * DAY) return `Tomorrow ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

/** For the datetime-local field: local time, to the minute. */
function toLocalInput(at: number): string {
  const d = new Date(at)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function RemindersPanel(): React.JSX.Element {
  const open = useUi((s) => s.remindersOpen)
  return <AnimatePresence>{open && <RemindersDialog />}</AnimatePresence>
}

/**
 * Reminders are about *when*, so the list is ordered by time and cut into the
 * buckets a person actually thinks in — overdue, today, tomorrow, later. The
 * composer sits on top: text, a handful of moments that cover most needs, and
 * a real picker for the rest.
 */
function RemindersDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeReminders)
  const compose = useUi((s) => s.remindersCompose)
  const reminders = useReminders((s) => s.reminders)
  // Captured once per open so the buckets do not shuffle under the cursor.
  const [now] = useState(() => Date.now())

  const grouped = useMemo(() => {
    const map = new Map<ReminderBucket, ReminderEntry[]>()
    for (const b of BUCKET_ORDER) map.set(b, [])
    for (const r of reminders) map.get(bucketOf(r, now))!.push(r)
    return map
  }, [reminders, now])

  const doneCount = grouped.get('done')?.length ?? 0

  return (
    <Panel
      overlayKey="reminders"
      icon={<AppIcon id="reminders" size={17} />}
      title="Reminders"
      width={760}
      onClose={close}
      testId="reminders-panel"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-3" data-testid="reminders-body">
        <Composer key={compose?.seq ?? 0} page={compose} now={now} />

        {reminders.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span style={{ color: 'var(--ink-3)' }}>
              <AppIcon id="reminders" size={26} />
            </span>
            <p className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
              Nothing to be reminded of.
            </p>
            <p
              className="max-w-[44ch] text-[12.5px] leading-relaxed"
              style={{ color: 'var(--ink-3)' }}
            >
              Aura will tell you here if you are looking, and as a system notification if you are
              not.{' '}
              <kbd
                className="rounded px-1 text-[11px]"
                style={{ background: 'var(--surface-glass-strong)', color: 'var(--ink-1)' }}
              >
                ⇧{modKeyLabel()}E
              </kbd>{' '}
              sets one about the page you are on.
            </p>
          </div>
        )}

        {BUCKET_ORDER.map((bucket) => {
          const rows = grouped.get(bucket) ?? []
          if (rows.length === 0) return null
          return (
            <section key={bucket} className="mt-4" data-testid={`reminders-${bucket}`}>
              <div className="mb-1.5 flex items-center px-1">
                <span
                  className="text-[11px] font-medium tracking-wide uppercase"
                  style={{ color: bucket === 'overdue' ? 'var(--danger)' : 'var(--ink-3)' }}
                >
                  {BUCKET_LABELS[bucket]}
                </span>
                {bucket === 'done' && doneCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void invoke('reminders:clearDone', {})}
                    className="ml-auto cursor-pointer rounded-md px-2 py-0.5 text-[11px] hover:bg-(--surface-hover)"
                    style={{ color: 'var(--ink-3)' }}
                    data-testid="reminders-clear-done"
                  >
                    Clear
                  </button>
                )}
              </div>
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {rows.map((r) => (
                    <motion.li
                      key={r.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 12, transition: { duration: 0.12 } }}
                      transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                    >
                      <Row reminder={r} bucket={bucket} now={now} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          )
        })}
      </div>
    </Panel>
  )
}

function Composer({
  page,
  now,
}: {
  page: { url: string | null; pageTitle: string | null } | null
  now: number
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [at, setAt] = useState<number | null>(null)
  const [repeat, setRepeat] = useState<RepeatRule>('none')
  const [picking, setPicking] = useState(false)
  const [attach, setAttach] = useState(page?.url !== null && page?.url !== undefined)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const quick = useMemo(() => quickTimes(now), [now])
  const fallback = quick[0]?.at ?? now + 3_600_000

  const add = (): void => {
    const body = text.trim()
    if (!body) {
      inputRef.current?.focus()
      return
    }
    void invoke('reminders:create', {
      text: body,
      dueAt: at ?? fallback,
      repeat,
      url: attach ? (page?.url ?? null) : null,
      pageTitle: attach ? (page?.pageTitle ?? null) : null,
    })
    setText('')
    setAt(null)
    setRepeat('none')
    setPicking(false)
    inputRef.current?.focus()
  }

  return (
    <div
      className="glass rounded-2xl p-3"
      style={{ border: '1px solid var(--border-glass)' }}
      data-testid="reminder-composer"
    >
      <div className="flex items-center gap-2">
        <AlarmClockPlus size={16} style={{ color: 'var(--accent)' }} />
        <input
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="Remind me to…"
          spellCheck
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
          style={{ color: 'var(--ink-1)' }}
          data-testid="reminder-text"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          data-testid="reminder-add"
        >
          Add
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {quick.map((q) => (
          <Chip
            key={q.label}
            active={at === q.at}
            onClick={() => {
              setAt(q.at)
              setPicking(false)
            }}
            testId="reminder-quick"
          >
            {q.label}
          </Chip>
        ))}
        <Chip active={picking} onClick={() => setPicking((p) => !p)} testId="reminder-pick">
          Pick a time…
        </Chip>
        {picking && (
          <input
            type="datetime-local"
            defaultValue={toLocalInput(at ?? fallback)}
            min={toLocalInput(now)}
            onChange={(e) => {
              const t = new Date(e.target.value).getTime()
              if (Number.isFinite(t)) setAt(t)
            }}
            className="glass rounded-lg px-2 py-1 text-[12px] outline-none"
            style={{ color: 'var(--ink-1)', colorScheme: 'dark light' }}
            data-testid="reminder-datetime"
          />
        )}
        <span className="ml-auto text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
          {at ? whenLabel(at, now) : `${quick[0]?.label ?? 'In an hour'} unless you pick`}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Repeat size={12} style={{ color: 'var(--ink-3)' }} />
        {REPEAT_RULES.map((r) => (
          <Chip
            key={r}
            active={repeat === r}
            onClick={() => setRepeat(r)}
            testId="reminder-repeat"
            small
          >
            {REPEAT_LABELS[r]}
          </Chip>
        ))}
        {page?.url && (
          <button
            type="button"
            onClick={() => setAttach((a) => !a)}
            title={attach ? 'Set without the page' : 'Attach the page you are on'}
            className="ml-auto flex max-w-[24ch] cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]"
            style={{
              border: `1px solid ${attach ? 'var(--accent)' : 'var(--border-glass)'}`,
              color: attach ? 'var(--ink-1)' : 'var(--ink-3)',
            }}
            data-testid="reminder-attach"
            data-on={attach || undefined}
          >
            <Link2 size={11} className="shrink-0" />
            <span className="truncate">{page.pageTitle || displayLabel(page.url)}</span>
            {attach && <X size={10} className="shrink-0" />}
          </button>
        )}
      </div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
  testId,
  small,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  testId?: string
  small?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full transition-colors ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'}`}
      style={{
        background: active ? 'var(--accent)' : 'var(--surface-glass-strong)',
        color: active ? 'var(--accent-ink)' : 'var(--ink-2)',
      }}
      data-testid={testId}
      data-active={active || undefined}
    >
      {children}
    </button>
  )
}

function Row({
  reminder: r,
  bucket,
  now,
}: {
  reminder: ReminderEntry
  bucket: ReminderBucket
  now: number
}): React.JSX.Element {
  const done = r.doneAt !== null
  const at = raiseAt(r) ?? r.dueAt
  const overdue = bucket === 'overdue'

  return (
    <div
      className="group relative flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-(--surface-hover)"
      data-testid="reminder-row"
      data-bucket={bucket}
    >
      {overdue && (
        <span
          className="absolute inset-y-2 left-0 w-[3px] rounded-full"
          style={{ background: 'var(--danger)' }}
        />
      )}
      <button
        type="button"
        onClick={() => void invoke('reminders:complete', { id: r.id })}
        title={
          done
            ? 'Done'
            : r.repeat === 'none'
              ? 'Mark done'
              : 'Done for now — it will come round again'
        }
        aria-label={done ? 'Done' : `Mark ${r.text} done`}
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
        style={{
          border: `1.5px solid ${done ? 'var(--accent)' : 'var(--ink-3)'}`,
          background: done ? 'var(--accent)' : 'transparent',
          color: 'var(--accent-ink)',
        }}
        data-testid="reminder-complete"
      >
        {done && <Check size={11} strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={`text-[13.5px] ${done ? 'line-through' : ''}`}
          style={{ color: done ? 'var(--ink-3)' : 'var(--ink-1)' }}
          data-testid="reminder-label"
        >
          {r.text}
        </div>
        <div
          className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]"
          style={{ color: overdue ? 'var(--danger)' : 'var(--ink-3)' }}
        >
          <span data-testid="reminder-when">{whenLabel(at, now)}</span>
          {r.repeat !== 'none' && (
            <span className="flex items-center gap-1" style={{ color: 'var(--ink-3)' }}>
              <Repeat size={10} /> {REPEAT_LABELS[r.repeat]}
            </span>
          )}
          {r.url && (
            <button
              type="button"
              onClick={() => {
                if (r.url) void invoke('tabs:create', { url: r.url, activate: true })
                useUi.getState().closeReminders()
              }}
              className="flex max-w-[28ch] cursor-pointer items-center gap-1 hover:underline"
              style={{ color: 'var(--ink-3)' }}
              title={r.url}
              data-testid="reminder-page"
            >
              <ExternalLink size={10} className="shrink-0" />
              <span className="truncate">{r.pageTitle || displayLabel(r.url)}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!done && (
          <>
            {[
              { label: '10m', minutes: 10 },
              { label: '1h', minutes: 60 },
              { label: 'Tomorrow', minutes: 24 * 60 },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => void invoke('reminders:snooze', { id: r.id, minutes: s.minutes })}
                title={`Snooze ${s.label}`}
                className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] hover:bg-(--surface-glass-strong)"
                style={{ color: 'var(--ink-2)' }}
                data-testid="reminder-snooze"
              >
                {s.label}
              </button>
            ))}
          </>
        )}
        <button
          type="button"
          onClick={() => void invoke('reminders:delete', { id: r.id })}
          title="Delete"
          aria-label={`Delete ${r.text}`}
          className="cursor-pointer rounded-md p-1 hover:bg-(--surface-glass-strong)"
          style={{ color: 'var(--ink-3)' }}
          data-testid="reminder-delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
