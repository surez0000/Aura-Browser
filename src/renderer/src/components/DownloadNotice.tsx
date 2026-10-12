import { CircleAlert, CircleCheck, CircleX, Download, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { DownloadBubbleState, DownloadInfo } from '@shared/models'
import { getPlatform, invoke } from '@/lib/ipc'
import { downloadFraction, downloadStatus, revealLabel } from '@/lib/downloads'
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion'

/**
 * The download popover's card: the newest download the popover is about, how
 * far it has got, and what to do with it once it lands. It is drawn by the
 * popover's own small view (main/windows/download-bubble.ts), which floats
 * beside the Downloads button above the page; this file is only the card.
 */

function StateIcon({ d }: { d: DownloadInfo }): React.JSX.Element {
  const reduce = usePrefersReducedMotion()
  if (d.state === 'completed') return <CircleCheck size={16} style={{ color: '#2fb36d' }} />
  if (d.state === 'interrupted') return <CircleAlert size={16} style={{ color: 'var(--danger)' }} />
  if (d.state === 'cancelled') return <CircleX size={16} style={{ color: 'var(--ink-3)' }} />
  return (
    <motion.span
      className="flex"
      style={{ color: 'var(--accent)' }}
      animate={reduce ? { y: 0 } : { y: [-1.5, 1.5, -1.5] }}
      transition={reduce ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
    >
      <Download size={16} />
    </motion.span>
  )
}

function ProgressBar({ d }: { d: DownloadInfo }): React.JSX.Element {
  const reduce = usePrefersReducedMotion()
  const fraction = downloadFraction(d)
  return (
    <span
      className="relative block h-1 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--surface-selected)' }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
      data-testid="download-notice-progress"
    >
      {fraction === null ? (
        // No size from the server: say it is moving, not how far.
        <motion.span
          className="absolute inset-y-0 block w-1/3 rounded-full"
          style={{ background: 'var(--accent)' }}
          animate={reduce ? { left: '33%' } : { left: ['-33%', '100%'] }}
          transition={
            reduce ? { duration: 0 } : { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      ) : (
        <span
          className="block h-full rounded-full"
          style={{
            background: 'var(--accent)',
            width: `${Math.max(2, Math.round(fraction * 100))}%`,
            transition: 'width 220ms linear',
          }}
        />
      )}
    </span>
  )
}

const link =
  'cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] font-medium transition-colors hover:bg-(--surface-hover)'

function Actions({ d, more }: { d: DownloadInfo; more: number }): React.JSX.Element | null {
  if (d.state !== 'completed' && d.state !== 'progressing' && more === 0) return null
  return (
    <div className="mt-2.5 -ml-1.5 flex flex-wrap items-center gap-1">
      {d.state === 'completed' && (
        <>
          <button
            type="button"
            onClick={() => void invoke('downloads:action', { id: d.id, action: 'open' })}
            className="ml-1.5 cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            data-testid="download-notice-open"
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => void invoke('downloads:action', { id: d.id, action: 'showInFolder' })}
            className={link}
            style={{ color: 'var(--ink-2)' }}
            data-testid="download-notice-reveal"
          >
            {revealLabel(getPlatform())}
          </button>
        </>
      )}
      {d.state === 'progressing' && (
        <button
          type="button"
          onClick={() => void invoke('downloads:action', { id: d.id, action: 'cancel' })}
          className={link}
          style={{ color: 'var(--ink-2)' }}
          data-testid="download-notice-cancel"
        >
          Cancel
        </button>
      )}
      {more > 0 && (
        <button
          type="button"
          onClick={() => void invoke('downloadBubble:showAll', {})}
          className={`${link} ml-auto`}
          style={{ color: 'var(--accent)' }}
          data-testid="download-notice-all"
        >
          All downloads
        </button>
      )}
    </div>
  )
}

export function DownloadPopover({
  state,
}: {
  state: DownloadBubbleState
}): React.JSX.Element | null {
  const lead = state.items[0]
  if (!lead) return null
  const more = state.items.length - 1
  const status = downloadStatus(lead)
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-glass)',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.28), 0 1px 4px rgba(0, 0, 0, 0.18)',
      }}
      onMouseEnter={() => void invoke('downloadBubble:hover', { inside: true })}
      onMouseLeave={() => void invoke('downloadBubble:hover', { inside: false })}
      role="status"
      aria-live="polite"
      data-testid="download-notice"
      data-placement={state.placement}
      data-state={lead.state}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">
          <StateIcon d={lead} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[13px] font-medium"
            style={{ color: 'var(--ink-1)' }}
            title={lead.filename}
            data-testid="download-notice-name"
          >
            {lead.filename}
          </div>
          <div
            className="truncate text-[11.5px]"
            style={{ color: 'var(--ink-2)' }}
            data-testid="download-notice-status"
          >
            {more > 0 ? `${status} · ${more} more` : status}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void invoke('downloadBubble:dismiss', {})}
          title="Hide (the download carries on)"
          aria-label="Hide download popover"
          className="-mt-0.5 -mr-1 shrink-0 cursor-pointer rounded p-1 transition-colors hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-3)' }}
          data-testid="download-notice-dismiss"
        >
          <X size={13} />
        </button>
      </div>
      {lead.state === 'progressing' && (
        <div className="mt-2.5">
          <ProgressBar d={lead} />
        </div>
      )}
      <Actions d={lead} more={more} />
    </div>
  )
}
