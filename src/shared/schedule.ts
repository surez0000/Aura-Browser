/**
 * When things happen — pure functions, no clock of their own. The scheduler in
 * the main process calls these with `Date.now()`; the tests call them with
 * whatever moment they like.
 */

// ─── Timesheet ────────────────────────────────────────────────────────────────

export interface TimesheetConfig {
  /** The thing Aura asks. */
  question: string
  /** How often, in minutes, inside the working window. */
  intervalMinutes: number
  /** Days it asks on: 0 = Sunday … 6 = Saturday. */
  days: number[]
  /** Local hours, `start` inclusive, `end` exclusive. */
  startHour: number
  endHour: number
}

export const DEFAULT_TIMESHEET: TimesheetConfig = {
  question: 'What are you working on right now?',
  intervalMinutes: 30,
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
}

export const INTERVAL_CHOICES = [15, 30, 45, 60, 90, 120] as const

const MINUTE = 60_000
const DAY = 86_400_000

/** Inside the working window, in local time. An all-day window is 0 → 24. */
export function withinWorkingHours(at: number, cfg: TimesheetConfig): boolean {
  const d = new Date(at)
  if (!cfg.days.includes(d.getDay())) return false
  const hour = d.getHours() + d.getMinutes() / 60
  return hour >= cfg.startHour && hour < cfg.endHour
}

/** The moment the working window next opens at or after `from`. */
export function nextWindowStart(from: number, cfg: TimesheetConfig): number | null {
  if (cfg.days.length === 0 || cfg.startHour >= cfg.endHour) return null
  const d = new Date(from)
  for (let i = 0; i < 8; i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, cfg.startHour, 0, 0, 0)
    if (!cfg.days.includes(day.getDay())) continue
    if (day.getTime() >= from) return day.getTime()
    // Today, and the window has already opened — is it still open?
    if (i === 0 && withinWorkingHours(from, cfg)) return from
  }
  return null
}

/**
 * When the next question is due. Never before the last one plus the interval,
 * never outside the window, and — if there has never been a question — as
 * soon as the window is open.
 */
export function nextPromptAt(
  now: number,
  lastAskedAt: number | null,
  cfg: TimesheetConfig,
): number | null {
  const earliest = lastAskedAt === null ? now : lastAskedAt + cfg.intervalMinutes * MINUTE
  const from = Math.max(now, earliest)
  return nextWindowStart(from, cfg)
}

export interface TimesheetEntry {
  id: number
  askedAt: number
  answeredAt: number | null
  answer: string | null
  tabTitle: string | null
  tabUrl: string | null
  skipped: boolean
}

export interface DayBlock {
  answer: string
  start: number
  end: number
  /** Milliseconds this answer covered. */
  duration: number
  tabUrl: string | null
}

export interface DaySummary {
  date: string
  blocks: DayBlock[]
  /** Answers grouped, longest first. */
  totals: Array<{ answer: string; duration: number; count: number }>
  totalDuration: number
  skipped: number
  unanswered: number
}

export function startOfDay(at: number): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function dateKey(at: number): string {
  const d = new Date(at)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Turn a day's answers into time. Each answer is taken to cover the stretch
 * from when it was asked until the next question — the interval, in practice —
 * and the last one runs to now, or to the end of the window if the day is over.
 * Skipped and unanswered prompts break the chain: they are counted, not timed.
 */
export function summariseDay(
  entries: TimesheetEntry[],
  day: number,
  now: number,
  cfg: TimesheetConfig,
): DaySummary {
  const dayStart = startOfDay(day)
  const dayEnd = dayStart + DAY
  const rows = entries
    .filter((e) => e.askedAt >= dayStart && e.askedAt < dayEnd)
    .sort((a, b) => a.askedAt - b.askedAt)

  const blocks: DayBlock[] = []
  let skipped = 0
  let unanswered = 0
  const windowClose = new Date(dayStart)
  windowClose.setHours(cfg.endHour, 0, 0, 0)

  rows.forEach((row, i) => {
    if (row.skipped) {
      skipped++
      return
    }
    if (!row.answer) {
      unanswered++
      return
    }
    const next = rows[i + 1]?.askedAt
    const cap = Math.min(now, windowClose.getTime() > row.askedAt ? windowClose.getTime() : now)
    const fallback = Math.min(cap, row.askedAt + cfg.intervalMinutes * MINUTE)
    const end = next !== undefined ? Math.min(next, fallback) : fallback
    const duration = Math.max(0, end - row.askedAt)
    blocks.push({ answer: row.answer, start: row.askedAt, end, duration, tabUrl: row.tabUrl })
  })

  const byAnswer = new Map<string, { duration: number; count: number }>()
  for (const b of blocks) {
    const key = b.answer.trim().toLowerCase()
    const cur = byAnswer.get(key) ?? { duration: 0, count: 0 }
    byAnswer.set(key, { duration: cur.duration + b.duration, count: cur.count + 1 })
  }
  const label = new Map<string, string>()
  for (const b of blocks)
    if (!label.has(b.answer.trim().toLowerCase()))
      label.set(b.answer.trim().toLowerCase(), b.answer.trim())
  const totals = [...byAnswer.entries()]
    .map(([key, v]) => ({ answer: label.get(key) ?? key, ...v }))
    .sort((a, b) => b.duration - a.duration)

  return {
    date: dateKey(dayStart),
    blocks,
    totals,
    totalDuration: blocks.reduce((sum, b) => sum + b.duration, 0),
    skipped,
    unanswered,
  }
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / MINUTE)
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The day as Markdown a timesheet will take: totals first, then the timeline. */
export function dayToMarkdown(summary: DaySummary): string {
  const lines = [`## ${summary.date} — ${formatDuration(summary.totalDuration)}`, '']
  for (const t of summary.totals) lines.push(`- **${t.answer}** — ${formatDuration(t.duration)}`)
  if (summary.blocks.length > 0) {
    lines.push('', '| From | To | Doing |', '|---|---|---|')
    for (const b of summary.blocks)
      lines.push(`| ${clock(b.start)} | ${clock(b.end)} | ${b.answer} |`)
  }
  return lines.join('\n')
}

export function dayToCsv(summary: DaySummary): string {
  const esc = (s: string): string => `"${s.replace(/"/g, '""')}"`
  const lines = ['date,from,to,minutes,doing,page']
  for (const b of summary.blocks) {
    lines.push(
      [
        summary.date,
        clock(b.start),
        clock(b.end),
        String(Math.round(b.duration / MINUTE)),
        esc(b.answer),
        esc(b.tabUrl ?? ''),
      ].join(','),
    )
  }
  return lines.join('\n')
}

// ─── Reminders ────────────────────────────────────────────────────────────────

export const REPEAT_RULES = ['none', 'daily', 'weekdays', 'weekly'] as const
export type RepeatRule = (typeof REPEAT_RULES)[number]

export const REPEAT_LABELS: Record<RepeatRule, string> = {
  none: 'Once',
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Every week',
}

export interface ReminderEntry {
  id: number
  text: string
  dueAt: number
  repeat: RepeatRule
  doneAt: number | null
  /** Put off until this moment; null when it has not been snoozed. */
  snoozedUntil: number | null
  /** When Aura last told you about it, so a tick does not tell you twice. */
  notifiedAt: number | null
  url: string | null
  pageTitle: string | null
  createdAt: number
}

/** The occurrence after `dueAt`, for a repeating reminder; null for a one-off. */
export function nextOccurrence(dueAt: number, repeat: RepeatRule): number | null {
  if (repeat === 'none') return null
  const d = new Date(dueAt)
  const step = (days: number): void => {
    d.setDate(d.getDate() + days)
  }
  if (repeat === 'daily') step(1)
  else if (repeat === 'weekly') step(7)
  else {
    // Weekdays: skip the weekend.
    step(1)
    while (d.getDay() === 0 || d.getDay() === 6) step(1)
  }
  return d.getTime()
}

/** The moment a reminder should next be raised, or null when it is done. */
export function raiseAt(r: ReminderEntry): number | null {
  if (r.doneAt !== null) return null
  return r.snoozedUntil !== null && r.snoozedUntil > r.dueAt ? r.snoozedUntil : r.dueAt
}

/** Reminders whose moment has come and that have not been told since. */
export function dueNow(reminders: ReminderEntry[], now: number): ReminderEntry[] {
  return reminders.filter((r) => {
    const at = raiseAt(r)
    if (at === null || at > now) return false
    return r.notifiedAt === null || r.notifiedAt < at
  })
}

/**
 * Raised and still on the table: told, and neither done nor snoozed since.
 * The bars above the page are exactly this set, derived from the list rather
 * than remembered — so a window that opens after the telling shows them too.
 */
export function stillRaised(reminders: ReminderEntry[], now: number): ReminderEntry[] {
  return reminders.filter((r) => {
    const at = raiseAt(r)
    return at !== null && at <= now && r.notifiedAt !== null && r.notifiedAt >= at
  })
}

export type ReminderBucket = 'overdue' | 'today' | 'tomorrow' | 'later' | 'done'

export function bucketOf(r: ReminderEntry, now: number): ReminderBucket {
  if (r.doneAt !== null) return 'done'
  const at = raiseAt(r) ?? r.dueAt
  if (at <= now) return 'overdue'
  const today = startOfDay(now)
  if (at < today + DAY) return 'today'
  if (at < today + 2 * DAY) return 'tomorrow'
  return 'later'
}

export const BUCKET_ORDER: ReminderBucket[] = ['overdue', 'today', 'tomorrow', 'later', 'done']
export const BUCKET_LABELS: Record<ReminderBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  later: 'Later',
  done: 'Done',
}

/** Quick choices for "when", relative to now. */
export function quickTimes(now: number): Array<{ label: string; at: number }> {
  const d = new Date(now)
  const at = (h: number, m: number, dayOffset = 0): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, h, m, 0, 0).getTime()
  const inAnHour = now + 60 * MINUTE
  const thisEvening = at(18, 0)
  const tomorrowMorning = at(9, 0, 1)
  const nextWeek = at(9, 0, 7)
  const options = [
    { label: 'In an hour', at: inAnHour },
    { label: 'This evening', at: thisEvening },
    { label: 'Tomorrow morning', at: tomorrowMorning },
    { label: 'Next week', at: nextWeek },
  ]
  return options.filter((o) => o.at > now + MINUTE)
}
