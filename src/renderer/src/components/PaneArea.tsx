import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RotateCw, X } from 'lucide-react'
import { invoke, modKeyLabel } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { TabFavicon } from '@/components/sidebar/TabFavicon'
import { useTabs } from '@/state/tabs'
import { useUi } from '@/state/ui'
import type { TabInfo } from '@shared/models'

/** Gap between panes; also the grab area of the divider between them. */
const GAP = 8
/** A pane never shrinks below this fraction of the page area. */
const MIN_RATIO = 0.15

/**
 * The page area: one card normally, or two to four side by side in a split.
 *
 * Pages are native views the main process positions, so this component's job
 * is to measure each pane and report the rectangles (ADR-0003 — the layout
 * protocol was built for exactly this). Chrome cannot draw over a native view,
 * so a split pane's title and close button live in a header strip *above* the
 * measured region rather than floating on the page.
 */
export function PaneArea(): React.JSX.Element {
  const panes = useTabs((s) => s.panes)
  const ratios = useTabs((s) => s.paneRatios)
  const tabs = useTabs((s) => s.tabs)
  const activeTabId = useTabs((s) => s.activeTabId)
  const hasTabs = useTabs((s) => s.tabs.some((t) => t.spaceId === s.activeSpaceId))

  const containerRef = useRef<HTMLDivElement | null>(null)
  const elements = useRef(new Map<string, HTMLDivElement>())
  const frame = useRef(0)
  // While a divider is dragged the ratios are local, so the page follows the
  // pointer without a round trip through the main process.
  const [dragRatios, setDragRatios] = useState<number[] | null>(null)

  const effectiveRatios = dragRatios ?? ratios
  const split = panes.length > 1

  const report = useCallback(() => {
    const measured = panes
      .map((tabId) => {
        const el = elements.current.get(tabId)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return {
          tabId,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })
      .filter((pane): pane is NonNullable<typeof pane> => pane !== null)
    void invoke('ui:setPaneBounds', { panes: measured })
  }, [panes])

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(report)
  }, [report])

  const registerPane = useCallback(
    (tabId: string, el: HTMLDivElement | null) => {
      if (el) elements.current.set(tabId, el)
      else elements.current.delete(tabId)
      schedule()
    },
    [schedule],
  )

  useLayoutEffect(() => {
    const observer = new ResizeObserver(schedule)
    const container = containerRef.current
    if (container) observer.observe(container)
    for (const el of elements.current.values()) observer.observe(el)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame.current)
    }
    // Re-observe whenever the set of panes or their widths change.
  }, [schedule, panes, effectiveRatios])

  const startDrag = (index: number, startX: number): void => {
    const container = containerRef.current
    if (!container) return
    const total = container.getBoundingClientRect().width - GAP * (panes.length - 1)
    if (total <= 0) return
    // Derive from the panes, not the ratios array: a split that has just opened
    // may still be carrying the previous view's ratios, and one missing entry
    // would make the whole drag NaN.
    const base = panes.map((_, i) => {
      const r = effectiveRatios[i]
      return typeof r === 'number' && r > 0 && Number.isFinite(r) ? r : 1 / panes.length
    })
    const sum = base.reduce((a, b) => a + b, 0)
    for (let i = 0; i < base.length; i++) base[i] = (base[i] ?? 0) / sum

    const onMove = (event: PointerEvent): void => {
      const delta = (event.clientX - startX) / total
      const left = (base[index] ?? 0) + delta
      const right = (base[index + 1] ?? 0) - delta
      if (left < MIN_RATIO || right < MIN_RATIO) return
      const next = [...base]
      next[index] = left
      next[index + 1] = right
      setDragRatios(next)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragRatios((current) => {
        // Never send a ratio the main process would reject; a rejected write
        // would leave the panes snapping back on the next state push.
        if (
          current &&
          current.length === panes.length &&
          current.every((r) => r > 0 && Number.isFinite(r))
        ) {
          void invoke('tabs:setPaneRatios', { ratios: current })
        }
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  if (panes.length === 0) {
    return (
      <div className="card relative h-full w-full" data-testid="page-card">
        <div className="absolute inset-px overflow-hidden rounded-[11px]">
          {!hasTabs && <EmptyState />}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full"
      style={{ gap: GAP }}
      data-testid="pane-area"
      data-panes={panes.length}
    >
      {panes.map((tabId, index) => {
        const tab = tabs.find((t) => t.id === tabId) ?? null
        return (
          <div key={tabId} className="contents">
            <Pane
              tabId={tabId}
              tab={tab}
              split={split}
              focused={tabId === activeTabId}
              ratio={effectiveRatios[index] ?? 1 / panes.length}
              register={registerPane}
            />
            {index < panes.length - 1 && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panes"
                onPointerDown={(e) => {
                  e.preventDefault()
                  startDrag(index, e.clientX)
                }}
                className="group relative z-10 shrink-0 cursor-col-resize"
                style={{ width: GAP }}
                data-testid="pane-divider"
              >
                <span
                  className="absolute inset-y-4 left-1/2 w-0.5 -translate-x-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: 'var(--accent)' }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Pane({
  tabId,
  tab,
  split,
  focused,
  ratio,
  register,
}: {
  tabId: string
  tab: TabInfo | null
  split: boolean
  focused: boolean
  ratio: number
  register: (tabId: string, el: HTMLDivElement | null) => void
}): React.JSX.Element {
  const snapshot = useUi((s) => s.paneSnapshots[tabId])
  const innerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    register(tabId, innerRef.current)
    return () => register(tabId, null)
  }, [register, tabId])

  const label = tab?.title || displayLabel(tab?.url || tab?.pendingUrl || null)

  return (
    <div
      className="card relative flex h-full min-w-0 flex-col"
      style={{
        flex: `${ratio} 1 0%`,
        // The focused pane of a split is outlined so it is obvious which one
        // the shortcuts and the address pill act on.
        borderColor: split && focused ? 'var(--accent)' : undefined,
      }}
      onMouseDown={() => {
        if (split && !focused) void invoke('tabs:focusPane', { tabId })
      }}
      data-testid="page-card"
      data-pane-id={tabId}
      data-focused={focused || undefined}
    >
      {split && (
        <div
          className="flex h-7 shrink-0 items-center gap-2 px-2.5"
          data-testid="pane-header"
          title={label}
        >
          {tab && <TabFavicon tab={tab} size={13} />}
          <span
            className="min-w-0 flex-1 truncate text-[12px]"
            style={{ color: focused ? 'var(--ink-1)' : 'var(--ink-3)' }}
            data-testid="pane-title"
          >
            {label}
          </span>
          <button
            type="button"
            title="Close this pane"
            aria-label={`Close pane ${label}`}
            onClick={(e) => {
              e.stopPropagation()
              void invoke('tabs:closePane', { tabId })
            }}
            className="cursor-pointer rounded p-0.5 transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-3)' }}
            data-testid="pane-close"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div
        ref={innerRef}
        className={`relative min-h-0 flex-1 overflow-hidden ${split ? 'mx-px mb-px rounded-b-[11px]' : 'm-px rounded-[11px]'}`}
      >
        {snapshot && (
          <img
            src={snapshot}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-left-top"
          />
        )}
        {tab?.crashed && <CrashState tabId={tabId} />}
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
