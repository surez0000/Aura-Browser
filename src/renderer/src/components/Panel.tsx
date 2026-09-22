import { useEffect, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'

/**
 * The shell every full panel shares: a scrim over the page, a dialog card, and
 * the overlay hold that swaps the live page for a snapshot while it is up
 * (ADR-0003). History, Extensions, the App Store and each app's panel differ
 * only in their header and body, so the shell lives here rather than four
 * times over.
 *
 * Closing is deliberately three ways — Escape, the scrim, the close button —
 * because a dialog over a page has no other way out.
 */
export function Panel({
  overlayKey,
  icon,
  title,
  header,
  footer,
  onClose,
  testId,
  width = 760,
  children,
}: {
  /** Distinguishes this holder from any other overlay that is up. */
  overlayKey: string
  icon: ReactNode
  title: string
  /** Optional controls beside the title (a search field, say). */
  header?: ReactNode
  footer?: ReactNode
  onClose: () => void
  testId: string
  width?: number
  children: ReactNode
}): React.JSX.Element {
  useEffect(() => {
    void holdOverlay(overlayKey)
    return () => releaseOverlay(overlayKey)
  }, [overlayKey])

  // Escape works wherever focus is, including before anything inside is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-start justify-center"
      data-testid={testId}
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: 'var(--scrim)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />
      <motion.div
        className="dialog relative mt-[8vh] flex max-h-[80vh] flex-col rounded-2xl shadow-2xl"
        style={{ width: `min(${width}px, 92vw)` }}
        initial={{ y: -14, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 480, damping: 34 }}
      >
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border-glass)' }}
        >
          <span style={{ color: 'var(--accent)' }}>{icon}</span>
          <span className="text-[14px] font-medium" style={{ color: 'var(--ink-1)' }}>
            {title}
          </span>
          {header}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label={`Close ${title}`}
            className="ml-auto cursor-pointer rounded-lg p-1 transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-3)' }}
            data-testid={`${testId}-close`}
          >
            <X size={16} />
          </button>
        </div>
        {children}
        {footer}
      </motion.div>
    </motion.div>
  )
}
