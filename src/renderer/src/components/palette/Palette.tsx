import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Search } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { normalizeInput } from '@/lib/url'
import { useTabs, selectActiveTab } from '@/state/tabs'
import { useUi } from '@/state/ui'

/**
 * Palette v0 — a floating URL/search input (⌘T). Phase (b) turns this into the
 * full command palette (open tabs, history, bookmarks, actions).
 *
 * While open, the main process detaches the page's native view (which would
 * otherwise composite *above* this overlay) and hands us a snapshot that
 * PageCard paints in its place.
 */
export function Palette(): React.JSX.Element {
  const open = useUi((s) => s.paletteOpen)
  const mode = useUi((s) => s.paletteMode)
  const close = useUi((s) => s.closePalette)
  const active = useTabs(selectActiveTab)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState('')

  // Seed the input when the palette transitions closed -> open (render-time
  // state adjustment; no effect needed).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setValue(mode === 'edit' ? (active?.url ?? active?.pendingUrl ?? '') : '')
  }

  useEffect(() => {
    if (!open) return
    const ui = useUi.getState()
    void invoke('ui:overlay', { shown: true }).then((r) => ui.setPageSnapshot(r.snapshotDataUrl))
    return () => {
      ui.setPageSnapshot(null)
      void invoke('ui:overlay', { shown: false })
    }
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const submit = (): void => {
    const url = normalizeInput(value)
    if (url) {
      if (mode === 'edit' && active) {
        void invoke('tabs:navigate', { tabId: active.id, url })
      } else {
        void invoke('tabs:create', { url, activate: true })
      }
    }
    close()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-start justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          data-testid="palette"
        >
          <div
            className="absolute inset-0"
            style={{ background: 'var(--scrim)' }}
            onClick={close}
          />
          <motion.div
            className="glass relative mt-[18vh] w-[min(620px,86vw)] rounded-2xl p-2 shadow-2xl"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Search size={18} style={{ color: 'var(--ink-3)' }} />
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                  else if (e.key === 'Escape') close()
                }}
                placeholder="Search or enter URL…"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="w-full bg-transparent text-[15px] outline-none"
                style={{ color: 'var(--ink-1)' }}
                data-testid="palette-input"
              />
            </div>
            <div
              className="flex items-center gap-3 border-t px-3 pt-2 pb-1 text-[11px]"
              style={{ borderColor: 'var(--border-glass)', color: 'var(--ink-3)' }}
            >
              <span>↵ {mode === 'edit' ? 'Go' : 'Open new tab'}</span>
              <span>esc Close</span>
              <span className="ml-auto">Searches DuckDuckGo</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
