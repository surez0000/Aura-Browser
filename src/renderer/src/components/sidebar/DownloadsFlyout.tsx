import { AnimatePresence, motion } from 'motion/react'
import { Download, FolderOpen, X } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import type { DownloadInfo } from '@shared/models'

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

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

/** Sidebar footer button with a live badge. */
export function DownloadsButton(): React.JSX.Element {
  const downloads = useUi((s) => s.downloads)
  const toggle = useUi((s) => s.toggleDownloads)
  const activeCount = downloads.filter((d) => d.state === 'progressing').length

  return (
    <button
      type="button"
      title="Downloads (⌘J)"
      aria-label="Downloads"
      onClick={toggle}
      className="no-drag relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
      style={{ color: 'var(--ink-2)' }}
      data-testid="downloads-button"
    >
      <Download size={15} />
      {activeCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {activeCount}
        </span>
      )}
    </button>
  )
}

/** The downloads panel, anchored inside the sidebar (never over the page view). */
export function DownloadsFlyout(): React.JSX.Element {
  const open = useUi((s) => s.downloadsOpen)
  const downloads = useUi((s) => s.downloads)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          className="popover absolute right-3 bottom-12 left-3 z-20 max-h-72 overflow-y-auto rounded-xl p-2 shadow-2xl"
          data-testid="downloads-flyout"
        >
          <div
            className="px-2 pt-1 pb-2 text-[11px] font-medium tracking-wide uppercase"
            style={{ color: 'var(--ink-3)' }}
          >
            Downloads
          </div>
          {downloads.length === 0 && (
            <p className="px-2 pb-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
              Nothing downloaded yet.
            </p>
          )}
          <ul className="space-y-0.5">
            {downloads.map((d) => (
              <li
                key={d.id}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-(--surface-hover)"
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
                  <span className="block truncate text-[12.5px]" style={{ color: 'var(--ink-1)' }}>
                    {d.filename}
                  </span>
                  <span
                    className="block truncate text-[11px]"
                    style={{ color: 'var(--ink-3)' }}
                    data-testid="download-state"
                    data-state={d.state}
                  >
                    {stateLabel(d)}
                  </span>
                  {d.state === 'progressing' && d.totalBytes > 0 && (
                    <span
                      className="mt-1 block h-0.5 overflow-hidden rounded-full"
                      style={{ background: 'var(--surface-glass-strong)' }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          background: 'var(--accent)',
                          width: `${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`,
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
                    className="cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--surface-hover)"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    <FolderOpen size={13} />
                  </button>
                )}
                {d.state === 'progressing' && (
                  <button
                    type="button"
                    title="Cancel download"
                    aria-label="Cancel download"
                    onClick={() => void invoke('downloads:action', { id: d.id, action: 'cancel' })}
                    className="cursor-pointer rounded p-1 hover:bg-(--surface-hover)"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
