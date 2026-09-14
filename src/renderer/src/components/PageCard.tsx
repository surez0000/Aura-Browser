import { useLayoutEffect, useRef } from 'react'
import { RotateCw } from 'lucide-react'
import { invoke, modKeyLabel } from '@/lib/ipc'
import { useTabs, selectActiveTab } from '@/state/tabs'
import { useUi } from '@/state/ui'

/**
 * The rounded, floating frame the page lives in. The actual page is a native
 * WebContentsView positioned by the main process; this component measures the
 * inner region and reports it (the same protocol later drives split view).
 */
export function PageCard(): React.JSX.Element {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const active = useTabs(selectActiveTab)
  // Per-Space: a Space with no tabs shows the empty state even while other
  // Spaces still hold tabs (the main process detaches the view in that case).
  const hasTabs = useTabs((s) => s.tabs.some((t) => t.spaceId === s.activeSpaceId))
  const snapshot = useUi((s) => s.pageSnapshot)

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return

    let frame = 0
    const send = (): void => {
      const rect = el.getBoundingClientRect()
      void invoke('ui:setPageBounds', {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(send)
    }

    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    window.addEventListener('resize', schedule)
    send()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="card relative h-full w-full" data-testid="page-card">
      <div ref={innerRef} className="absolute inset-px overflow-hidden rounded-[11px]">
        {snapshot && (
          <img
            src={snapshot}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-left-top"
          />
        )}
        {!hasTabs && !snapshot && <EmptyState />}
        {active?.crashed && <CrashState tabId={active.id} />}
      </div>
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  const openPalette = useUi((s) => s.openPalette)
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4"
      data-testid="empty-state"
    >
      <div className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--ink-1)' }}>
        Aura Browser
      </div>
      <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
        Press{' '}
        <kbd
          className="rounded px-1.5 py-0.5 text-xs"
          style={{ background: 'var(--surface-glass-strong)', color: 'var(--ink-1)' }}
        >
          {modKeyLabel()}T
        </kbd>{' '}
        to search or enter a URL
      </p>
      <button
        type="button"
        onClick={() => openPalette('new')}
        className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        style={{ background: 'var(--surface-glass-strong)', color: 'var(--ink-1)' }}
        data-testid="empty-new-tab"
      >
        New Tab
      </button>
    </div>
  )
}

function CrashState({ tabId }: { tabId: string }): React.JSX.Element {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4"
      data-testid="crash-state"
    >
      <div className="text-lg font-semibold">This tab crashed</div>
      <button
        type="button"
        onClick={() => void invoke('tabs:reload', { tabId })}
        className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
        style={{ background: 'var(--surface-glass-strong)', color: 'var(--ink-1)' }}
      >
        <RotateCw size={14} /> Reload
      </button>
    </div>
  )
}
