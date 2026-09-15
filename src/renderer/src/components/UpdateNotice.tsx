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

/** Compact pill for the top strip (show-on-hover mode, sidebar hidden). */
export function UpdatePill(): React.JSX.Element {
  const notice = useUpdateNotice()
  const dismiss = useUi((s) => s.dismissUpdateNotice)
  return (
    <AnimatePresence initial={false}>
      {notice && (
        <motion.div
          key={notice.version}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          className="popover no-drag relative flex h-7 items-center gap-2 overflow-hidden rounded-full pr-1 pl-3 text-[12px]"
          style={{ color: 'var(--ink-1)' }}
          data-testid="update-pill"
          data-kind={notice.kind}
          role="status"
        >
          {notice.kind === 'ready' ? (
            <>
              <span>Aura Browser {notice.version} is ready</span>
              <button
                type="button"
                onClick={install}
                className="cursor-pointer rounded-full px-2.5 py-0.5 font-medium"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                data-testid="update-ready"
              >
                Restart to update
              </button>
            </>
          ) : (
            <>
              <Download size={13} style={{ color: 'var(--accent)' }} />
              <span>
                Aura Browser {notice.version} ·{' '}
                {notice.kind === 'downloading'
                  ? notice.percent === 0
                    ? 'starting…'
                    : `${notice.percent}%`
                  : 'preparing…'}
              </span>
              <span
                className="absolute inset-x-0 bottom-0 h-[2px]"
                style={{
                  background: 'var(--accent)',
                  width: `${notice.kind === 'downloading' ? notice.percent : 3}%`,
                  transition: 'width 0.4s ease-out',
                }}
              />
            </>
          )}
          <button
            type="button"
            title="Hide until next launch"
            aria-label="Hide update notice until next launch"
            onClick={() => dismiss(notice.version)}
            className="cursor-pointer rounded-full p-1 transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-3)' }}
          >
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
