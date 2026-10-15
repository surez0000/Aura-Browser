import { useEffect, useState } from 'react'
import {
  Ban,
  CloudOff,
  Globe,
  RotateCw,
  ShieldAlert,
  ShieldX,
  TriangleAlert,
  WifiOff,
} from 'lucide-react'
import { describeLoadError, hostOf, type LoadError } from '@shared/net-errors'

const ICONS = {
  certificate: ShieldAlert,
  secure: ShieldX,
  offline: WifiOff,
  unreachable: Globe,
  broken: TriangleAlert,
  notFound: CloudOff,
  blocked: Ban,
} as const

/** Puts the site's name in bold wherever the text says `{host}`. */
function withHost(text: string, host: string): React.ReactNode {
  const parts = text.split('{host}')
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && (
        <strong className="font-semibold" style={{ color: 'var(--ink-1)' }}>
          {host}
        </strong>
      )}
    </span>
  ))
}

/**
 * The page that did not load, explained the way Chrome explains it — drawn by
 * the chrome in place of the page's view, so it wears Aura's theme and only
 * the chrome can choose to go past a certificate warning.
 *
 * A certificate error is Chrome's interstitial: "Back to safety" first, the
 * way through hidden under "Advanced". Everything else is the "Try:" page
 * with Reload; with no internet, it reloads by itself once the connection is
 * back.
 */
export function LoadErrorPage({
  error,
  onReload,
  onBack,
  onProceed,
  compact = false,
}: {
  error: LoadError
  onReload: () => void
  /** "Back to safety": back if there is somewhere to go, otherwise away. */
  onBack: () => void
  onProceed: () => void
  compact?: boolean
}): React.JSX.Element {
  const [advanced, setAdvanced] = useState(false)
  const text = describeLoadError(error)
  const host = hostOf(error.url) || error.url
  const certificate = error.kind === 'certificate'
  const Icon = ICONS[error.kind]

  // The page you were trying to reach comes back by itself with the connection.
  useEffect(() => {
    if (error.kind !== 'offline') return undefined
    window.addEventListener('online', onReload)
    return () => window.removeEventListener('online', onReload)
  }, [error.kind, onReload])

  return (
    <div
      className={`absolute inset-0 overflow-y-auto ${compact ? 'px-8 pt-10' : 'px-10 pt-[14vh]'}`}
      data-testid="load-error"
      data-kind={error.kind}
    >
      <div className="mx-auto max-w-[560px] pb-12">
        <span style={{ color: certificate ? 'var(--danger)' : 'var(--ink-3)' }}>
          <Icon size={compact ? 36 : 48} strokeWidth={1.6} />
        </span>
        <h1
          className="mt-5 text-[22px] leading-tight font-semibold tracking-tight"
          style={{ color: 'var(--ink-1)' }}
          data-testid="load-error-title"
        >
          {withHost(text.title, host)}
        </h1>
        <p
          className="mt-3 text-[14px] leading-relaxed"
          style={{ color: 'var(--ink-2)' }}
          data-testid="load-error-summary"
        >
          {withHost(text.summary, host)}
        </p>

        {text.tips.length > 0 && (
          <div className="mt-4 text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
            Try:
            <ul className="mt-1.5 list-disc space-y-1 pl-6">
              {text.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        )}

        <p
          className="mt-4 font-mono text-[11.5px] tracking-wide"
          style={{ color: 'var(--ink-3)' }}
          data-testid="load-error-code"
        >
          {certificate ? `NET::${error.name}` : error.name}
        </p>

        {certificate ? (
          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              aria-expanded={advanced}
              className="cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium transition-colors hover:bg-(--surface-hover)"
              style={{ color: 'var(--ink-2)', border: '1px solid var(--border-glass)' }}
              data-testid="load-error-advanced"
            >
              {advanced ? 'Hide advanced' : 'Advanced'}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              data-testid="load-error-back"
            >
              Back to safety
            </button>
          </div>
        ) : (
          <div className="mt-8">
            <button
              type="button"
              onClick={onReload}
              className="flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              data-testid="load-error-reload"
            >
              <RotateCw size={13} /> Reload
            </button>
          </div>
        )}

        {certificate && advanced && text.advanced && (
          <div className="mt-6 text-[13.5px] leading-relaxed" data-testid="load-error-details">
            <p style={{ color: 'var(--ink-2)' }}>{withHost(text.advanced, host)}</p>
            {error.canProceed && (
              <button
                type="button"
                onClick={onProceed}
                className="mt-4 cursor-pointer text-left underline underline-offset-2"
                style={{ color: 'var(--danger)' }}
                data-testid="load-error-proceed"
              >
                Proceed to {host} (unsafe)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
