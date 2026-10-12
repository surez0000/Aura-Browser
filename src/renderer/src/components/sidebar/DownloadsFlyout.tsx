import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Download, FolderOpen, X } from 'lucide-react'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'
import { invoke } from '@/lib/ipc'
import { formatBytes, overallProgress } from '@/lib/downloads'
import { useUi } from '@/state/ui'
import type { DownloadInfo } from '@shared/models'

function stateLabel(d: DownloadInfo): string {
  switch (d.state) {
    case 'progressing':
      return d.totalBytes > 0
        ? `${Math.round((d.receivedBytes / d.totalBytes) * 100)}% of ${formatBytes(d.totalBytes)}`
        : `${formatBytes(d.receivedBytes)}…`
    case 'completed':
      return `Completed · ${formatBytes(d.receivedBytes)}`
    case 'cancelled':
      return 'Cancelled'
    case 'interrupted':
      return 'Failed'
  }
}

const RING = 2 * Math.PI * 11

/**
 * Sidebar footer button. While something is downloading it wears a ring that
 * fills as the bytes arrive, and it gives one pulse when a download lands —
 * the count badge alone gave no sense that anything was happening.
 */
export function DownloadsButton({
  popover,
}: {
  /** Which way the download popover opens from this button. */
  popover: 'above' | 'beside'
}): React.JSX.Element {
  const downloads = useUi((s) => s.downloads)
  const toggle = useUi((s) => s.toggleDownloads)
  const progress = overallProgress(downloads)
  const completed = downloads.filter((d) => d.state === 'completed').length
  const pulse = useUi((s) => s.downloadPulse)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // The download popover is a native view placed by main beside this button,
  // so main needs to know where the button is, now and after every resize.
  useLayoutEffect(() => {
    const el = buttonRef.current
    if (!el) return
    let frame = 0
    const send = (): void => {
      frame = 0
      const r = el.getBoundingClientRect()
      void invoke('ui:setDownloadAnchor', {
        anchor: { x: r.x, y: r.y, width: r.width, height: r.height, placement: popover },
      })
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(send)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    observer.observe(document.body)
    window.addEventListener('resize', schedule)
    send()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
      void invoke('ui:setDownloadAnchor', { anchor: null })
    }
  }, [popover])

  // Pulse on the transition into "one more finished", not on every render.
  const [justFinished, setJustFinished] = useState(false)
  const seen = useRef(completed)
  useEffect(() => {
    if (completed > seen.current) {
      setJustFinished(true)
      const timer = setTimeout(() => setJustFinished(false), 900)
      seen.current = completed
      return () => clearTimeout(timer)
    }
    seen.current = completed
    return undefined
  }, [completed])

  // A drop into the tray when a download starts: the page that asked for it
  // stays on screen, so this is the moment the eye needs pulling here.
  const [justStarted, setJustStarted] = useState(false)
  const lastPulse = useRef(pulse)
  useEffect(() => {
    if (pulse === lastPulse.current) return undefined
    lastPulse.current = pulse
    setJustStarted(true)
    const timer = setTimeout(() => setJustStarted(false), 900)
    return () => clearTimeout(timer)
  }, [pulse])

  return (
    <button
      ref={buttonRef}
      type="button"
      title="Downloads (⌘J)"
      aria-label={progress === null ? 'Downloads' : `Downloads, ${Math.round(progress * 100)}%`}
      onClick={toggle}
      className="no-drag relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
      style={{ color: progress === null ? 'var(--ink-2)' : 'var(--accent)' }}
      data-testid="downloads-button"
      data-downloading={progress === null ? undefined : true}
    >
      {progress !== null && (
        <svg
          className="absolute inset-0 h-full w-full -rotate-90"
          viewBox="0 0 28 28"
          aria-hidden
          data-testid="downloads-ring"
        >
          <circle cx="14" cy="14" r="11" fill="none" strokeWidth="2" stroke="var(--border-glass)" />
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            strokeWidth="2"
            stroke="var(--accent)"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 220ms linear' }}
          />
        </svg>
      )}
      {justStarted && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-lg"
          style={{ boxShadow: '0 0 0 2px var(--accent)' }}
          initial={{ opacity: 0.9, scale: 0.8 }}
          animate={{ opacity: 0, scale: 1.6 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          aria-hidden
          data-testid="downloads-started"
        />
      )}
      <motion.span
        className="relative flex items-center justify-center"
        animate={
          justStarted
            ? { y: [-9, 2, -1, 0], opacity: [0, 1, 1, 1], scale: [0.8, 1.12, 0.96, 1] }
            : justFinished
              ? { y: [0, 3, -2, 0], scale: [1, 0.9, 1.08, 1] }
              : progress !== null
                ? { y: [0, 1.5, 0] }
                : { y: 0, scale: 1 }
        }
        transition={
          justStarted
            ? { duration: 0.6, ease: 'easeOut' }
            : justFinished
              ? { duration: 0.5 }
              : progress !== null
                ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.2 }
        }
      >
        <Download size={15} />
      </motion.span>
    </button>
  )
}

/** Downloads (⌘J). Mounted fresh on every open, like History and Settings. */
export function DownloadsPanel(): React.JSX.Element {
  const open = useUi((s) => s.downloadsOpen)
  return <AnimatePresence>{open && <DownloadsDialog />}</AnimatePresence>
}

/**
 * Everything downloaded, newest first, over a snapshot of the page (ADR-0003).
 * This was a small popover pinned inside the sidebar; it is a full section now,
 * so long filenames and a long history have somewhere to go.
 */
function DownloadsDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeDownloads)
  const downloads = useUi((s) => s.downloads)

  useEffect(() => {
    void holdOverlay('downloads')
    // The full list is open: the popover has nothing left to say.
    void invoke('downloadBubble:dismiss', {})
    return () => releaseOverlay('downloads')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-start justify-center"
      data-testid="downloads-flyout"
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: 'var(--scrim)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={close}
      />
      <motion.div
        className="dialog relative mt-[8vh] flex max-h-[80vh] w-[min(700px,92vw)] flex-col rounded-2xl shadow-2xl"
        initial={{ y: -14, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 480, damping: 34 }}
      >
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border-glass)' }}
        >
          <Download size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="flex-1 text-[14px] font-medium" style={{ color: 'var(--ink-1)' }}>
            Downloads
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close downloads"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-2)' }}
            data-testid="downloads-close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {downloads.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
              Nothing downloaded yet.
            </p>
          )}
          <ul className="space-y-0.5">
            {downloads.map((d) => (
              <li
                key={d.id}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-(--surface-hover)"
                data-testid="download-item"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  title={d.state === 'completed' ? 'Open file' : d.filename}
                  onClick={() => {
                    if (d.state === 'completed')
                      void invoke('downloads:action', { id: d.id, action: 'open' })
                  }}
                >
                  <span className="block truncate text-[13px]" style={{ color: 'var(--ink-1)' }}>
                    {d.filename}
                  </span>
                  <span
                    className="block truncate text-[11.5px]"
                    style={{ color: 'var(--ink-3)' }}
                    data-testid="download-state"
                    data-state={d.state}
                  >
                    {stateLabel(d)}
                  </span>
                  {d.state === 'progressing' && d.totalBytes > 0 && (
                    <span
                      className="mt-1.5 block h-1 overflow-hidden rounded-full"
                      style={{ background: 'var(--surface-selected)' }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          background: 'var(--accent)',
                          width: `${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`,
                          transition: 'width 220ms linear',
                        }}
                      />
                    </span>
                  )}
                </button>
                {d.state === 'completed' && (
                  <button
                    type="button"
                    title="Show in folder"
                    aria-label="Show in folder"
                    onClick={() =>
                      void invoke('downloads:action', { id: d.id, action: 'showInFolder' })
                    }
                    className="cursor-pointer rounded p-1.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--surface-hover)"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    <FolderOpen size={14} />
                  </button>
                )}
                {d.state === 'progressing' && (
                  <button
                    type="button"
                    title="Cancel download"
                    aria-label="Cancel download"
                    onClick={() => void invoke('downloads:action', { id: d.id, action: 'cancel' })}
                    className="cursor-pointer rounded p-1.5 hover:bg-(--surface-hover)"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </motion.div>
  )
}
