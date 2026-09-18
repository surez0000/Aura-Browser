import { AnimatePresence, motion } from 'motion/react'
import { Download, RefreshCw, X } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { describeUpdate } from '@/lib/update-notice'
import { useUi } from '@/state/ui'

/**
 * Prominent, non-blocking update progress (ADR-0003 keeps it out of the page
 * area: chrome cannot paint over the native view, so it lives in the sidebar
 * and, when the sidebar is hidden, in the top strip). Nothing here interrupts
 * browsing: the page keeps its size, and "Later" hides the notice for this
 * version until the next launch. The Dock icon carries the same progress.
 */
function useUpdateNotice() {
  const state = useUi((s) => s.updateState)
  const dismissed = useUi((s) => s.updateNoticeDismissed)
  return describeUpdate(state, dismissed)
}

const install = (): void => void invoke('updates:install', {})

/** Sidebar card, above the New Tab button. */
export function UpdateCard(): React.JSX.Element {
  const notice = useUpdateNotice()
  const dismiss = useUi((s) => s.dismissUpdateNotice)
  return (
    <AnimatePresence initial={false}>
      {notice && (
        <motion.div
          key={notice.version}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          className="popover no-drag shrink-0 rounded-xl p-2.5"
          data-testid="update-card"
          data-kind={notice.kind}
          role="status"
        >
          <div className="flex items-center gap-2">
            {notice.kind === 'ready' ? (
              <RefreshCw size={14} style={{ color: 'var(--accent)' }} />
            ) : (
              <Download size={14} style={{ color: 'var(--accent)' }} />
            )}
            <div
              className="min-w-0 flex-1 text-[12px] leading-tight"
              style={{ color: 'var(--ink-1)' }}
            >
              <div className="font-medium">Aura Browser {notice.version}</div>
              <div style={{ color: 'var(--ink-2)' }}>
                {notice.kind === 'preparing' && 'Preparing download…'}
                {notice.kind === 'downloading' &&
                  (notice.percent === 0 ? 'Starting download…' : `Downloading… ${notice.percent}%`)}
                {notice.kind === 'ready' && 'Downloaded and ready to install'}
              </div>
            </div>
            <button
              type="button"
              title="Hide until next launch"
              aria-label="Hide update notice until next launch"
              onClick={() => dismiss(notice.version)}
              className="cursor-pointer rounded p-0.5 transition-colors hover:bg-(--surface-hover)"
              style={{ color: 'var(--ink-3)' }}
              data-testid="update-card-dismiss"
            >
              <X size={13} />
            </button>
          </div>
          {notice.kind !== 'ready' ? (
            <div
              className="mt-2 h-1 overflow-hidden rounded-full"
              style={{ background: 'var(--surface-glass-strong)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'var(--accent)' }}
                animate={{ width: `${notice.kind === 'downloading' ? notice.percent : 3}%` }}
                transition={{ type: 'tween', ease: 'easeOut', duration: 0.4 }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={install}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              data-testid="update-ready"
            >
              <RefreshCw size={13} />
              Restart to update
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Compact rail variant: one 36 px button carrying the same information — a
 * progress ring while downloading, an accent restart button once ready.
 */
export function UpdateRailButton(): React.JSX.Element | null {
  const notice = useUpdateNotice()
  if (!notice) return null

  const ready = notice.kind === 'ready'
  const percent = notice.kind === 'downloading' ? notice.percent : 0
  const label = ready
    ? `Restart to update to ${notice.version}`
    : notice.kind === 'downloading'
      ? `Downloading ${notice.version}… ${percent}%`
      : `Preparing ${notice.version}…`

  return (
    <motion.button
      type="button"
      title={label}
      aria-label={label}
      onClick={ready ? install : undefined}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="no-drag relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg"
      style={
        ready
          ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
          : { color: 'var(--accent)' }
      }
      data-testid="update-rail-button"
      data-kind={notice.kind}
      role={ready ? undefined : 'status'}
    >
      {ready ? <RefreshCw size={16} /> : <Download size={16} />}
      {!ready && (
        <span
          className="absolute inset-x-1.5 bottom-1 h-[3px] overflow-hidden rounded-full"
          style={{ background: 'var(--surface-glass-strong)' }}
        >
          <motion.span
            className="block h-full rounded-full"
            style={{ background: 'var(--accent)' }}
            animate={{ width: `${Math.max(percent, 4)}%` }}
            transition={{ type: 'tween', ease: 'easeOut', duration: 0.4 }}
          />
        </span>
      )}
    </motion.button>
  )
}
