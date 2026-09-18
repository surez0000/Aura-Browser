import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ExternalLink, Loader2, X } from 'lucide-react'
import type { MiniWindowInfo } from '@shared/models'
import { invoke, isMac, on } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { WindowControls } from '@/components/sidebar/WindowControls'
import { auroraPalette } from '@/theme/aurora'
import { toCss } from '@/theme/contrast'
import { useUi } from '@/state/ui'

/**
 * The mini window: one link in its own small window, opened when another
 * application hands Aura Browser a URL. It borrows the active Space's storage,
 * so you are signed in as usual, but it takes no tab and holds no Space state —
 * promote it and it becomes a real tab in the main window.
 */
export default function MiniApp(): React.JSX.Element {
  const theme = useUi((s) => s.themeName)
  const [state, setState] = useState<MiniWindowInfo | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const frame = useRef(0)

  useEffect(() => on('mini:state', setState), [])

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const send = (): void => {
      const rect = el.getBoundingClientRect()
      void invoke('mini:setBounds', {
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
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void invoke('mini:close', {})
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // No Space here, so the window wears Aura Browser's default gradient.
  const palette = useMemo(() => auroraPalette(226, theme), [theme])
  const style = {
    '--accent': toCss(palette.accent),
    '--accent-ink': toCss(palette.accentInk),
  } as CSSProperties

  const label = state?.title || displayLabel(state?.url || null)

  return (
    <div
      className="app-bg flex h-full w-full flex-col overflow-hidden"
      style={style}
      data-testid="mini-window"
    >
      <div className="drag flex h-11 shrink-0 items-center gap-2 px-2.5">
        {isMac() && <div className="w-14" />}
        <button
          type="button"
          title="Back"
          aria-label="Back"
          disabled={!state?.canGoBack}
          onClick={() => void invoke('mini:back', {})}
          className="no-drag flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover) disabled:cursor-default disabled:opacity-35"
          style={{ color: 'var(--ink-2)' }}
          data-testid="mini-back"
        >
          <ArrowLeft size={15} />
        </button>
        {state?.isLoading && (
          <Loader2 size={13} className="animate-spin" style={{ color: 'var(--ink-3)' }} />
        )}
        <span
          className="min-w-0 flex-1 truncate text-[12px]"
          style={{ color: 'var(--ink-2)' }}
          title={state?.url}
          data-testid="mini-title"
        >
          {label}
        </span>
        <button
          type="button"
          onClick={() => void invoke('mini:promote', {})}
          className="no-drag flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          data-testid="mini-promote"
        >
          <ExternalLink size={12} />
          Open in Aura
        </button>
        {isMac() ? (
          <button
            type="button"
            title="Close"
            aria-label="Close"
            onClick={() => void invoke('mini:close', {})}
            className="no-drag flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-3)' }}
            data-testid="mini-close"
          >
            <X size={15} />
          </button>
        ) : (
          <WindowControls />
        )}
      </div>
      <div ref={bodyRef} className="card mx-2 mb-2 min-h-0 flex-1" data-testid="mini-page" />
    </div>
  )
}
