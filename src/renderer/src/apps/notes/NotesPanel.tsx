import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { ExternalLink, Plus, Search, Trash2 } from 'lucide-react'
import type { NoteEntry } from '@shared/models'
import { invoke, on } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { Panel } from '@/components/Panel'
import { captureNoteForActiveTab } from '@/state/sync'
import { useUi } from '@/state/ui'
import { AppIcon } from '../icons'

/** Long enough that typing never fights the write, short enough to feel saved. */
const SAVE_DEBOUNCE_MS = 400

function when(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (ts >= today.getTime()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function NotesPanel(): React.JSX.Element {
  const open = useUi((s) => s.notesOpen)
  return <AnimatePresence>{open && <NotesDialog />}</AnimatePresence>
}

/**
 * Notes: a list on the left, the note itself on the right.
 *
 * A note keeps the page it was taken on, which is what makes it findable later
 * by what you were reading — and the reason the command palette can offer a
 * note beside the tab and the history entry it came from. Notes are global,
 * not per Space: a thought had in one Space is still worth finding in another.
 */
function NotesDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeNotes)
  const requestedId = useUi((s) => s.notesRequestedId)

  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState<NoteEntry[]>([])
  /** What the reader clicked. A request from outside wins until they do. */
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)

  const load = useCallback(async (q: string, select?: number): Promise<void> => {
    const id = ++requestId.current
    const rows = await invoke('notes:search', { query: q, limit: 200 })
    if (id !== requestId.current) return
    setNotes(rows)
    if (select !== undefined) setPickedId(select)
  }, [])

  // First paint loads at once; later keystrokes are debounced, which also keeps
  // the write out of the effect body itself.
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

  // Selection, derived rather than stored: a note opened from the palette wins
  // until the reader clicks another, then the click does, then the newest note.
  const selectedId =
    [requestedId, pickedId, notes[0]?.id ?? null].find(
      (id) => id !== null && notes.some((n) => n.id === id),
    ) ?? null
  const selected = notes.find((n) => n.id === selectedId) ?? null
  const [shownId, setShownId] = useState<number | null>(null)
  if (selected && selected.id !== shownId) {
    setShownId(selected.id)
    setDraft(selected.body)
  }
  if (!selected && shownId !== null) {
    setShownId(null)
    setDraft('')
  }

  // Reload when a note is created elsewhere (⌘E, the palette, the page menu).
  useEffect(() => on('notes:changed', () => void load(query)), [load, query])

  // A brand-new note is empty: put the cursor in it rather than making the
  // reader click into the editor they just asked for.
  useEffect(() => {
    if (selected && selected.body === '') editorRef.current?.focus()
  }, [selected])

  const edit = (body: string): void => {
    setDraft(body)
    if (!selected) return
    const id = selected.id
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void invoke('notes:update', { id, body }).then(() => load(query, id))
    }, SAVE_DEBOUNCE_MS)
  }

  // A pending keystroke must not be lost when the panel closes.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )

  const remove = async (id: number): Promise<void> => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await invoke('notes:delete', { id })
    setPickedId(null)
    useUi.getState().clearNoteRequest()
    await load(query)
  }

  return (
    <Panel
      overlayKey="notes"
      icon={<AppIcon id="notes" size={17} />}
      title="Notes"
      width={860}
      onClose={close}
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
            title="New note"
            aria-label="New note"
            className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-2)' }}
            data-testid="notes-new"
          >
            <Plus size={16} />
          </button>
        </>
      }
    >
      {/* A fixed height, so the panel does not grow and shrink under the
          cursor as notes are added or a line is typed. */}
      <div className="flex h-[58vh] min-h-0 flex-1">
        <ul
          className="w-64 shrink-0 overflow-x-hidden overflow-y-auto border-r px-1 py-1"
          style={{ borderColor: 'var(--border-glass)' }}
          data-testid="notes-list"
        >
          {notes.length === 0 && (
            <li className="px-3 py-3 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              {query ? 'No notes match.' : 'No notes yet — press + to write one.'}
            </li>
          )}
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => {
                  setPickedId(note.id)
                  useUi.getState().clearNoteRequest()
                }}
                className="w-full cursor-pointer rounded-lg px-3 py-2 text-left"
                style={{
                  background: note.id === selectedId ? 'var(--surface-selected)' : 'transparent',
                }}
                data-testid="note-item"
                data-selected={note.id === selectedId || undefined}
              >
                <span
                  className="block truncate text-[13px]"
                  style={{ color: 'var(--ink-1)' }}
                  data-testid="note-title"
                >
                  {note.title || 'Untitled note'}
                </span>
                <span className="block truncate text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  {when(note.updatedAt)}
                  {note.url ? ` · ${displayLabel(note.url)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <textarea
                ref={editorRef}
                value={draft}
                onChange={(e) => edit(e.target.value)}
                placeholder="Write it down…"
                spellCheck
                className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-[13.5px] leading-relaxed outline-none"
                style={{ color: 'var(--ink-1)' }}
                data-testid="note-editor"
              />
              <div
                className="flex shrink-0 items-center gap-2 border-t px-3 py-2"
                style={{ borderColor: 'var(--border-glass)' }}
              >
                {selected.url ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selected.url)
                        void invoke('tabs:create', { url: selected.url, activate: true })
                      close()
                    }}
                    className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] hover:bg-(--surface-hover)"
                    style={{ color: 'var(--ink-2)' }}
                    data-testid="note-open-page"
                  >
                    <ExternalLink size={12} />
                    <span className="truncate">
                      {selected.pageTitle || displayLabel(selected.url)}
                    </span>
                  </button>
                ) : (
                  <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                    Not tied to a page
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void remove(selected.id)}
                  title="Delete note"
                  aria-label="Delete note"
                  className="ml-auto cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-(--surface-hover)"
                  style={{ color: 'var(--danger)' }}
                  data-testid="note-delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </>
          ) : (
            <div
              className="flex flex-1 items-center justify-center text-[13px]"
              style={{ color: 'var(--ink-3)' }}
            >
              Press + to write a note.
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
