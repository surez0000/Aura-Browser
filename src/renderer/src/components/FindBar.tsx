import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { useTabs } from '@/state/tabs'
import { useUi } from '@/state/ui'

/**
 * Find-in-page. Lives *above* the page card in the chrome column, so the
 * native view simply shrinks underneath it — no overlay/compositing tricks,
 * and live match highlighting stays visible.
 */
export function FindBar(): React.JSX.Element | null {
  const open = useUi((s) => s.findOpen)
  const query = useUi((s) => s.findQuery)
  const result = useUi((s) => s.findResult)
  const activeTabId = useTabs((s) => s.activeTabId)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Main stops the find session on tab switches; mirror by closing the bar.
  useEffect(() => {
    const ui = useUi.getState()
    if (ui.findOpen) ui.closeFind()
  }, [activeTabId])

  const closeBar = (): void => {
    void invoke('find:stop', {})
    useUi.getState().closeFind()
  }

  const search = (text: string): void => {
    useUi.getState().setFindQuery(text)
    if (text) {
      void invoke('find:start', { text })
    } else {
      void invoke('find:stop', {})
      useUi.getState().setFindResult(null)
    }
  }

  const step = (forward: boolean): void => {
    if (query) void invoke('find:start', { text: query, findNext: true, forward })
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          className="flex justify-end"
          data-testid="find-bar"
        >
          <div className="glass flex items-center gap-2 rounded-xl px-3 py-1.5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => search(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') step(!e.shiftKey)
                else if (e.key === 'Escape') closeBar()
              }}
              placeholder="Find in page…"
              spellCheck={false}
              className="w-52 bg-transparent text-[13px] outline-none"
              style={{ color: 'var(--ink-1)' }}
              data-testid="find-input"
            />
            <span
              className="min-w-12 text-right text-[11.5px] tabular-nums"
              style={{ color: 'var(--ink-3)' }}
              data-testid="find-matches"
            >
              {result && query ? `${result.activeMatchOrdinal} / ${result.matches}` : ''}
            </span>
            <button
              type="button"
              aria-label="Previous match"
              onClick={() => step(false)}
              className="cursor-pointer rounded p-0.5 hover:bg-(--surface-hover)"
              style={{ color: 'var(--ink-2)' }}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              aria-label="Next match"
              onClick={() => step(true)}
              className="cursor-pointer rounded p-0.5 hover:bg-(--surface-hover)"
              style={{ color: 'var(--ink-2)' }}
            >
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              aria-label="Close find bar"
              onClick={closeBar}
              className="cursor-pointer rounded p-0.5 hover:bg-(--surface-hover)"
              style={{ color: 'var(--ink-2)' }}
              data-testid="find-close"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
