import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Clock3, Search, Trash2, X } from 'lucide-react'
import type { HistoryEntry } from '@shared/models'
import { invoke } from '@/lib/ipc'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'
import { displayLabel } from '@/lib/url'
import { useUi } from '@/state/ui'

const PAGE_SIZE = 100
const DAY_MS = 86_400_000

/** Clear ranges offered in the footer. `null` means everything. */
const CLEAR_RANGES: ReadonlyArray<{ label: string; hours: number | null }> = [
  { label: 'Last hour', hours: 1 },
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 7 days', hours: 24 * 7 },
  { label: 'Everything', hours: null },
]

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * "Today", "Yesterday", else a written date. Pure: the caller passes the day
 * boundary it captured when the panel opened, so rendering never reads a clock.
 */
function dayLabel(timestamp: number, todayStart: number): string {
  const day = new Date(timestamp)
  day.setHours(0, 0, 0, 0)
  const diffDays = Math.round((todayStart - day.getTime()) / DAY_MS)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(day.getFullYear() === new Date(todayStart).getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Module scope: reading the clock is not allowed inside a component body. */
function clearBoundary(hours: number | null): number | null {
  return hours === null ? null : Date.now() - hours * 3_600_000
}

const timeLabel = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/**
 * The history manager (⌘Y). The dialog lives in its own component so every
 * open starts from clean state — no reset effects.
 */
export function HistoryPanel(): React.JSX.Element {
  const open = useUi((s) => s.historyOpen)
  return <AnimatePresence>{open && <HistoryDialog />}</AnimatePresence>
}

/**
 * Everything visited, newest first, searchable, with per-visit delete, "forget
 * this site", and clear-by-range. Incognito Spaces never record, so nothing
 * from them can appear here. Renders over a page snapshot (ADR-0003).
 */
function HistoryDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeHistory)

  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [exhausted, setExhausted] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  // Captured once so day headings stay stable while the panel is open.
  const [todayStart] = useState(startOfToday)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Ignore responses from a search that is no longer the current one.
  const requestId = useRef(0)

  useEffect(() => {
    void holdOverlay('history')
    return () => releaseOverlay('history')
  }, [])

  const load = useCallback(async (q: string): Promise<void> => {
    const id = ++requestId.current
    setLoading(true)
    const rows = await invoke('history:list', { query: q || undefined, limit: PAGE_SIZE })
    if (id !== requestId.current) return
    setEntries(rows)
    setExhausted(rows.length < PAGE_SIZE)
    setLoading(false)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced (re)load as the query changes; the first pass runs immediately.
  const firstLoad = useRef(true)
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      void load('')
      return
    }
    const timer = setTimeout(() => void load(query), 140)
    return () => clearTimeout(timer)
  }, [query, load])

  const loadMore = async (): Promise<void> => {
    const last = entries[entries.length - 1]
    if (!last || loading) return
    const id = ++requestId.current
    setLoading(true)
    const rows = await invoke('history:list', {
      query: query || undefined,
      before: last.visitedAt,
      limit: PAGE_SIZE,
    })
    if (id !== requestId.current) return
    setEntries((current) => [...current, ...rows])
    setExhausted(rows.length < PAGE_SIZE)
    setLoading(false)
  }

  const openEntry = (entry: HistoryEntry): void => {
    void invoke('tabs:create', { url: entry.url, activate: true })
    close()
  }

  const removeEntry = (entry: HistoryEntry): void => {
    setEntries((current) => current.filter((e) => e.id !== entry.id))
    void invoke('history:delete', { ids: [entry.id] })
  }

  const forgetSite = (entry: HistoryEntry): void => {
    setEntries((current) => current.filter((e) => e.url !== entry.url))
    void invoke('history:delete', { url: entry.url })
  }

  const clearRange = async (hours: number | null): Promise<void> => {
    await invoke('history:clear', { since: clearBoundary(hours) })
    setConfirmClear(false)
    await load(query)
  }

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-start justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      data-testid="history-panel"
    >
      <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={close} />
      <motion.div
        className="dialog relative mt-[8vh] flex max-h-[80vh] w-[min(760px,92vw)] flex-col rounded-2xl shadow-2xl"
        initial={{ opacity: 0, y: -14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 480, damping: 34 }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
      >
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border-glass)' }}
        >
          <Clock3 size={17} style={{ color: 'var(--accent)' }} />
          <span className="text-[14px] font-medium" style={{ color: 'var(--ink-1)' }}>
            History
          </span>
          <div className="glass ml-2 flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5">
            <Search size={13} style={{ color: 'var(--ink-3)' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history…"
              spellCheck={false}
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: 'var(--ink-1)' }}
              data-testid="history-search"
            />
          </div>
          <button
            type="button"
            onClick={close}
            title="Close"
            aria-label="Close history"
            className="cursor-pointer rounded-lg p-1 transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-3)' }}
            data-testid="history-close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" data-testid="history-list">
          {entries.length === 0 && !loading && (
            <p className="px-3 py-8 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
              {query ? 'Nothing matches that search.' : 'No history yet.'}
            </p>
          )}
          {entries.map((entry, index) => {
            const day = dayLabel(entry.visitedAt, todayStart)
            const previous = entries[index - 1]
            const heading =
              !previous || dayLabel(previous.visitedAt, todayStart) !== day ? day : null
            return (
              <div key={entry.id}>
                {heading && (
                  <div
                    className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-wide uppercase"
                    style={{ color: 'var(--ink-3)' }}
                    data-testid="history-day"
                  >
                    {heading}
                  </div>
                )}
                <div
                  className="group flex cursor-default items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-(--surface-hover)"
                  onClick={() => openEntry(entry)}
                  data-testid="history-entry"
                  data-url={entry.url}
                >
                  <span
                    className="w-11 shrink-0 text-[11px] tabular-nums"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    {timeLabel(entry.visitedAt)}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13px]"
                    style={{ color: 'var(--ink-1)' }}
                    data-testid="history-title"
                  >
                    {entry.title || displayLabel(entry.url)}
                  </span>
                  <span
                    className="w-48 shrink-0 truncate text-[12px]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    {displayLabel(entry.url)}
                  </span>
                  <button
                    type="button"
                    title={`Forget every visit to ${displayLabel(entry.url)}`}
                    aria-label={`Forget ${displayLabel(entry.url)}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      forgetSite(entry)
                    }}
                    className="shrink-0 cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--surface-hover)"
                    style={{ color: 'var(--ink-3)' }}
                    data-testid="history-forget-site"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    type="button"
                    title="Remove this visit"
                    aria-label="Remove this visit"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeEntry(entry)
                    }}
                    className="shrink-0 cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--surface-hover)"
                    style={{ color: 'var(--ink-3)' }}
                    data-testid="history-remove"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )
          })}
          {!exhausted && entries.length > 0 && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className="mx-auto my-3 block cursor-pointer rounded-lg px-3 py-1.5 text-[12px] transition-colors hover:bg-(--surface-hover) disabled:opacity-50"
              style={{ color: 'var(--ink-2)' }}
              data-testid="history-load-more"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>

        <div
          className="flex shrink-0 items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: 'var(--border-glass)' }}
        >
          {confirmClear ? (
            <>
              <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                Clear history from:
              </span>
              {CLEAR_RANGES.map((range) => (
                <button
                  key={range.label}
                  type="button"
                  onClick={() => void clearRange(range.hours)}
                  className="cursor-pointer rounded-lg px-2.5 py-1 text-[12px] transition-colors hover:bg-(--surface-hover)"
                  style={{ color: 'var(--danger)' }}
                  data-testid={`history-clear-${range.hours ?? 'all'}`}
                >
                  {range.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="ml-auto cursor-pointer rounded-lg px-2.5 py-1 text-[12px] transition-colors hover:bg-(--surface-hover)"
                style={{ color: 'var(--ink-2)' }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                Incognito Spaces are never recorded.
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] transition-colors hover:bg-(--surface-hover)"
                style={{ color: 'var(--ink-2)' }}
                data-testid="history-clear-open"
              >
                <Trash2 size={13} />
                Clear history…
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
