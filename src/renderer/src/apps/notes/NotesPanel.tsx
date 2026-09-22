import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, Pin, Plus, Search, Trash2 } from 'lucide-react'
import type { NoteEntry } from '@shared/models'
import { STICKY_COLORS, type StickyColor } from '@shared/sticky'
import { invoke, on, modKeyLabel } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { Panel } from '@/components/Panel'
import {
  PAPER_GRAIN,
  PAPER_SHADOW,
  PAPER_SHADOW_LIFTED,
  STICKY_LABELS,
  stickySkin,
  stickyTilt,
} from '@/theme/sticky'
import { captureNoteForActiveTab } from '@/state/sync'
import { useUi } from '@/state/ui'
import { AppIcon } from '../icons'

/** Long enough that typing never fights the write, short enough to feel saved. */
const SAVE_DEBOUNCE_MS = 400

/**
 * A note is one string and its first line is its title — that is what the store
 * indexes and what the palette shows. The editor splits it in two because a
 * title deserves to look like one, and joins it back, so the stored shape is
 * unchanged.
 */
function splitNote(body: string): { title: string; rest: string } {
  const i = body.indexOf('\n')
  return i === -1 ? { title: body, rest: '' } : { title: body.slice(0, i), rest: body.slice(i + 1) }
}

function joinNote(title: string, rest: string): string {
  return rest ? `${title}\n${rest}` : title
}

function ago(ts: number): string {
  const seconds = Math.max(0, (Date.now() - ts) / 1000)
  if (seconds < 90) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`
  const days = Math.round(seconds / 86_400)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function NotesPanel(): React.JSX.Element {
  const open = useUi((s) => s.notesOpen)
  return <AnimatePresence>{open && <NotesBoard />}</AnimatePresence>
}

/**
 * The board. Notes are stickies on it: colour first, words second, because a
 * sticky is found by its colour before it is read — which is the whole reason
 * the metaphor beats a list. Pinned ones stay at the top.
 *
 * Each sticky carries the page it was written on, so a thought can be found by
 * what you were reading at the time; that is the part only a browser can do.
 */
function NotesBoard(): React.JSX.Element {
  const close = useUi((s) => s.closeNotes)
  const theme = useUi((s) => s.themeName)
  const requestedId = useUi((s) => s.notesRequestedId)
  const compose = useUi((s) => s.notesCompose)

  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState<NoteEntry[]>([])
  // Seeded from the request, because the board usually *mounts* because of one:
  // the palette opens the panel and names a note in the same breath.
  const [openId, setOpenId] = useState<number | null>(requestedId)
  const requestId = useRef(0)

  const load = useCallback(async (q: string): Promise<void> => {
    const id = ++requestId.current
    const rows = await invoke('notes:search', { query: q, limit: 200 })
    if (id === requestId.current) setNotes(rows)
  }, [])

  const firstLoad = useRef(true)
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      const timer = setTimeout(() => void load(''), 0)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => void load(query), 140)
    return () => clearTimeout(timer)
  }, [query, load])

  useEffect(() => on('notes:changed', () => void load(query)), [load, query])

  // A note the palette asked for opens straight into the editor.
  const [handledRequest, setHandledRequest] = useState(requestedId)
  if (requestedId !== handledRequest) {
    setHandledRequest(requestedId)
    if (requestedId !== null) setOpenId(requestedId)
  }

  const composing = compose !== null
  const editing = notes.find((n) => n.id === openId) ?? null
  const pinned = notes.filter((n) => n.pinned)
  const rest = notes.filter((n) => !n.pinned)

  const closeEditor = (): void => {
    setOpenId(null)
    useUi.getState().clearCompose()
    useUi.getState().clearNoteRequest()
  }

  return (
    <Panel
      overlayKey="notes"
      icon={<AppIcon id="notes" size={17} />}
      title="Notes"
      width={1040}
      onClose={close}
      // A sticky is open on top of the board: Escape puts it down first.
      onEscape={editing || composing ? closeEditor : close}
      testId="notes-panel"
      header={
        <>
          <div className="glass ml-2 flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5">
            <Search size={13} style={{ color: 'var(--ink-3)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              spellCheck={false}
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: 'var(--ink-1)' }}
              data-testid="notes-search"
            />
          </div>
          <button
            type="button"
            onClick={() => captureNoteForActiveTab()}
            title={`New note (${modKeyLabel()}E)`}
            aria-label="New note"
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            data-testid="notes-new"
          >
            <Plus size={14} />
            New
          </button>
        </>
      }
    >
      <div className="relative min-h-0 flex-1">
        <div
          className="h-[62vh] overflow-x-hidden overflow-y-auto px-4 py-4"
          data-testid="notes-board"
        >
          {notes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span style={{ color: 'var(--ink-3)' }}>
                <AppIcon id="notes" size={28} />
              </span>
              <p className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
                {query ? 'Nothing matches.' : 'The board is empty.'}
              </p>
              {!query && (
                <p
                  className="max-w-[40ch] text-[12.5px] leading-relaxed"
                  style={{ color: 'var(--ink-3)' }}
                >
                  Press{' '}
                  <kbd
                    className="rounded px-1.5 py-0.5 text-[11px]"
                    style={{ background: 'var(--surface-glass-strong)', color: 'var(--ink-1)' }}
                  >
                    {modKeyLabel()}E
                  </kbd>{' '}
                  on any page — the note remembers where you were.
                </p>
              )}
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <Section label="Pinned" notes={pinned} theme={theme} onOpen={setOpenId} />
              )}
              {rest.length > 0 && (
                <Section
                  label={pinned.length > 0 ? 'Others' : null}
                  notes={rest}
                  theme={theme}
                  onOpen={setOpenId}
                />
              )}
            </>
          )}
        </div>

        <AnimatePresence>
          {(editing || composing) && (
            <StickyEditor
              key={editing ? `note-${editing.id}` : `compose-${compose?.seq}`}
              note={editing}
              page={editing ?? compose}
              theme={theme}
              onClose={closeEditor}
              onSaved={(id) => {
                setOpenId(id)
                useUi.getState().clearCompose()
                void load(query)
              }}
              onChanged={() => void load(query)}
            />
          )}
        </AnimatePresence>
      </div>
    </Panel>
  )
}

function Section({
  label,
  notes,
  theme,
  onOpen,
}: {
  label: string | null
  notes: NoteEntry[]
  theme: 'light' | 'dark'
  onOpen: (id: number) => void
}): React.JSX.Element {
  return (
    <div className="mb-2">
      {label && (
        <div
          className="mb-2 px-1 text-[11px] font-medium tracking-wide uppercase"
          style={{ color: 'var(--ink-3)' }}
        >
          {label}
        </div>
      )}
      {/* Columns rather than a grid: stickies keep their own height, and the
          board fills the way a real one does. */}
      <div className="columns-3 gap-3 [column-fill:_balance]">
        {notes.map((note) => (
          <StickyCard key={note.id} note={note} theme={theme} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

/**
 * What makes the sheet read as paper: a fine grain over the colour, and the
 * darker glue strip along the top edge that every real sticky has. Both are
 * the note's own ink at a whisper, so they sit right on any colour.
 */
function Paper({ ink }: { ink: string }): React.JSX.Element {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.11] mix-blend-soft-light"
        style={{ backgroundImage: PAPER_GRAIN, backgroundSize: '160px 160px' }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[22px]"
        style={{ background: `linear-gradient(to bottom, ${ink}, transparent)`, opacity: 0.09 }}
      />
    </>
  )
}

function StickyCard({
  note,
  theme,
  onOpen,
}: {
  note: NoteEntry
  theme: 'light' | 'dark'
  onOpen: (id: number) => void
}): React.JSX.Element {
  const skin = stickySkin(note.color as StickyColor, theme)
  const { title, rest } = splitNote(note.body)

  return (
    <motion.div
      className="group relative mb-3 inline-block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-[5px] p-3.5 pt-5"
      style={{
        background: skin.background,
        rotate: stickyTilt(note.id),
        boxShadow: PAPER_SHADOW[theme],
      }}
      whileHover={{ rotate: 0, y: -3, boxShadow: PAPER_SHADOW_LIFTED[theme] }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      onClick={() => onOpen(note.id)}
      data-testid="note-item"
      data-color={note.color}
      data-pinned={note.pinned || undefined}
    >
      <Paper ink={skin.ink} />
      <div className="flex items-start gap-2">
        <span
          className="min-w-0 flex-1 text-[13.5px] leading-snug font-semibold"
          style={{ color: skin.ink }}
          data-testid="note-title"
        >
          {title.trim() || 'Untitled note'}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void invoke('notes:setPinned', { id: note.id, pinned: !note.pinned })
          }}
          title={note.pinned ? 'Unpin' : 'Pin to the top'}
          aria-label={note.pinned ? `Unpin ${title}` : `Pin ${title}`}
          className={`shrink-0 cursor-pointer rounded-md p-1 transition-opacity ${
            note.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ color: skin.ink }}
          data-testid="note-pin"
        >
          <Pin size={12} fill={note.pinned ? 'currentColor' : 'none'} />
        </button>
      </div>

      {rest.trim() && (
        <p
          className="mt-1.5 line-clamp-[8] text-[12.5px] leading-relaxed whitespace-pre-wrap"
          style={{ color: skin.inkSoft }}
        >
          {rest.trim()}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-1.5 text-[11px]" style={{ color: skin.inkSoft }}>
        <span>{ago(note.updatedAt)}</span>
        {note.url && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{displayLabel(note.url)}</span>
          </>
        )}
      </div>
    </motion.div>
  )
}

/**
 * One sticky, opened. The same paper as the card it came from, over a dimmed
 * board — so editing feels like picking the note up rather than moving house.
 */
function StickyEditor({
  note,
  page,
  theme,
  onClose,
  onSaved,
  onChanged,
}: {
  note: NoteEntry | null
  page: { url: string | null; pageTitle: string | null } | null
  theme: 'light' | 'dark'
  onClose: () => void
  onSaved: (id: number) => void
  onChanged: () => void
}): React.JSX.Element {
  const [color, setColor] = useState<StickyColor>((note?.color as StickyColor) ?? 'amber')
  const [draft, setDraft] = useState(splitNote(note?.body ?? ''))
  const [saved, setSaved] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const createdId = useRef<number | null>(note?.id ?? null)
  /** The write that has not happened yet, so closing can still make it. */
  const pending = useRef<(() => Promise<void>) | null>(null)
  /** True once the sticky is being put down: a flush must not raise it again. */
  const closing = useRef(false)

  const skin = stickySkin(color, theme)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  // Putting a sticky down within the debounce window must neither lose what was
  // typed nor pop the editor back open when the write lands. Flush, quietly.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const run = pending.current
      pending.current = null
      closing.current = true
      if (run) void run()
    },
    [],
  )

  const schedule = (run: () => Promise<void>): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pending.current = run
    saveTimer.current = setTimeout(() => {
      pending.current = null
      void run()
    }, SAVE_DEBOUNCE_MS)
  }

  /** Nothing is written until there is something to write. */
  const persist = (next: { title: string; rest: string }, nextColor: StickyColor): void => {
    const body = joinNote(next.title, next.rest)
    const id = createdId.current

    if (id === null) {
      if (!body.trim()) return
      schedule(async () => {
        const created = await invoke('notes:create', {
          body,
          url: page?.url ?? null,
          pageTitle: page?.pageTitle ?? null,
          color: nextColor,
        })
        createdId.current = created.id
        if (closing.current) onChanged()
        else {
          setSaved(true)
          onSaved(created.id)
        }
      })
      return
    }

    schedule(async () => {
      await invoke('notes:update', { id, body })
      if (!closing.current) setSaved(true)
      onChanged()
    })
  }

  const edit = (next: { title: string; rest: string }): void => {
    setDraft(next)
    setSaved(false)
    persist(next, color)
  }

  const pickColor = (next: StickyColor): void => {
    setColor(next)
    const id = createdId.current
    if (id === null) persist(draft, next)
    else void invoke('notes:setColor', { id, color: next }).then(() => onChanged())
  }

  return (
    <>
      <motion.div
        className="absolute inset-0 z-10"
        style={{ background: 'var(--scrim)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        onClick={onClose}
      />
      <motion.div
        className="absolute top-6 left-1/2 z-20 flex max-h-[54vh] w-[min(560px,88%)] flex-col overflow-hidden rounded-[6px]"
        style={{ background: skin.background, boxShadow: PAPER_SHADOW_LIFTED[theme], x: '-50%' }}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        // Picking a sticky up springs; putting it down is a bounded tween. A
        // spring's tail has no fixed end, and a dismissal that outlives the
        // gesture reads as the app ignoring you.
        exit={{
          opacity: 0,
          y: -6,
          scale: 0.98,
          transition: { duration: 0.14, ease: 'easeOut' },
        }}
        transition={{ type: 'spring', stiffness: 480, damping: 34 }}
        data-testid="note-editor-card"
      >
        <Paper ink={skin.ink} />
        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-3">
          <input
            ref={titleRef}
            value={draft.title}
            onChange={(e) => edit({ ...draft, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                bodyRef.current?.focus()
              }
            }}
            placeholder="Title"
            spellCheck
            className="w-full bg-transparent text-[17px] font-semibold tracking-tight outline-none placeholder:opacity-50"
            style={{ color: skin.ink }}
            data-testid="note-title-input"
          />
          <textarea
            ref={bodyRef}
            value={draft.rest}
            onChange={(e) => edit({ ...draft, rest: e.target.value })}
            placeholder="Write it down…"
            spellCheck
            rows={8}
            className="mt-2.5 w-full resize-none bg-transparent text-[13.5px] leading-[1.7] outline-none placeholder:opacity-50"
            style={{ color: skin.inkSoft }}
            data-testid="note-editor"
          />
        </div>

        <div
          className="relative flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-2.5"
          style={{ borderColor: skin.border }}
        >
          <div className="flex items-center gap-1" data-testid="note-colors">
            {STICKY_COLORS.map((c) => {
              const swatch = stickySkin(c, theme)
              const active = c === color
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickColor(c)}
                  title={STICKY_LABELS[c]}
                  aria-label={STICKY_LABELS[c]}
                  className="h-4 w-4 cursor-pointer rounded-full transition-transform hover:scale-110"
                  style={{
                    background: swatch.background,
                    border: `1px solid ${swatch.border}`,
                    boxShadow: active ? `0 0 0 2px ${skin.ink}` : undefined,
                  }}
                  data-testid="note-color"
                  data-color={c}
                  data-active={active || undefined}
                />
              )
            })}
          </div>

          {page?.url && (
            <button
              type="button"
              onClick={() => {
                if (page.url) void invoke('tabs:create', { url: page.url, activate: true })
                onClose()
              }}
              title={page.url}
              className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-[11px]"
              style={{ color: skin.inkSoft, border: `1px solid ${skin.border}` }}
              data-testid="note-open-page"
            >
              <ExternalLink size={11} className="shrink-0" />
              <span className="max-w-[16ch] truncate">
                {page.pageTitle || displayLabel(page.url)}
              </span>
            </button>
          )}

          <span
            className="ml-auto text-[11px] transition-opacity"
            style={{ color: skin.inkSoft, opacity: saved ? 1 : 0 }}
            data-testid="note-saved"
          >
            Saved
          </span>

          {note && (
            <button
              type="button"
              onClick={() => {
                void invoke('notes:delete', { id: note.id }).then(() => {
                  onClose()
                  onChanged()
                })
              }}
              title="Delete note"
              aria-label="Delete note"
              className="cursor-pointer rounded-lg p-1.5"
              style={{ color: skin.inkSoft }}
              data-testid="note-delete"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </motion.div>
    </>
  )
}
