import { useEffect, useLayoutEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { useTabs } from '@/state/tabs'

/**
 * Peek: a link previewed in a floating card, without spending a tab.
 * Shift-clicking a link (or "Peek Link" in the page menu) opens one.
 *
 * The preview is a real page — a native view the main process positions — so
 * the card's chrome sits *around* the measured region rather than over it, and
 * the scrim behind is ordinary chrome that the view simply covers.
 */
export function PeekCard(): React.JSX.Element {
  const peek = useTabs((s) => s.peek)
  return <AnimatePresence>{peek && <PeekFrame />}</AnimatePresence>
}

const close = (): void => void invoke('peek:close', {})

function PeekFrame(): React.JSX.Element {
  const peek = useTabs((s) => s.peek)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const frame = useRef(0)

  // Report the page region, and clear it when the card goes away.
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const send = (): void => {
      const rect = el.getBoundingClientRect()
      void invoke('ui:setPeekBounds', {
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      })
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(send)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame.current)
      void invoke('ui:setPeekBounds', { rect: null })
    }
  }, [])

  // Escape dismisses, wherever focus happens to be in the chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const label = peek?.title || displayLabel(peek?.url || null)

  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      data-testid="peek"
    >
      <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={close} />
      <motion.div
        className="dialog relative flex h-[82%] w-[min(1000px,86%)] flex-col overflow-hidden rounded-2xl shadow-2xl"
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 px-3">
          {peek?.isLoading ? (
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--ink-3)' }} />
          ) : (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--accent)' }}
              aria-hidden
            />
          )}
          <span
            className="min-w-0 flex-1 truncate text-[13px]"
            style={{ color: 'var(--ink-1)' }}
            data-testid="peek-title"
            title={peek?.url}
          >
            {label}
          </span>
          <span className="shrink-0 text-[11px]" style={{ color: 'var(--ink-3)' }}>
            Peek · esc to close
          </span>
          <button
            type="button"
            onClick={() => void invoke('peek:promote', {})}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            data-testid="peek-promote"
          >
            <ExternalLink size={12} />
            Open as Tab
          </button>
          <button
            type="button"
            onClick={close}
            title="Close preview"
            aria-label="Close preview"
            className="cursor-pointer rounded-lg p-1 transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-3)' }}
            data-testid="peek-close"
          >
            <X size={15} />
          </button>
        </div>
        <div ref={bodyRef} className="mx-px mb-px min-h-0 flex-1 rounded-b-[11px]" />
      </motion.div>
    </motion.div>
  )
}
