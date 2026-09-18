import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AppWindow, ExternalLink, Monitor, ScreenShare } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'
import { useUi } from '@/state/ui'
import type { DisplayCaptureSource } from '@shared/models'

/**
 * The screen-share picker (`getDisplayMedia`). Chromium asks the embedder which
 * surface to hand over, and this dialog *is* the consent: the page receives
 * only the screen or window chosen here, and nothing at all on Cancel.
 *
 * Like the palette it renders over a snapshot of the page (ADR-0003), because
 * chrome HTML cannot paint above a native view.
 */
export function ScreenSharePicker(): React.JSX.Element {
  const request = useUi((s) => s.displayCapture)
  const open = !!request

  useEffect(() => {
    if (!open) return
    void holdOverlay('screen-share')
    return () => releaseOverlay('screen-share')
  }, [open])

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          className="absolute inset-0 z-50 flex items-start justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          data-testid="screen-share-picker"
        >
          <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} />
          <motion.div
            className="glass relative mt-[10vh] flex max-h-[76vh] w-[min(720px,90vw)] flex-col rounded-2xl p-4 shadow-2xl"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
          >
            {request.systemPermission === 'denied' ? (
              <SystemPermissionNeeded id={request.id} />
            ) : request.loading ? (
              <LookingForSources id={request.id} host={request.host} />
            ) : (
              <SourceChooser
                id={request.id}
                host={request.host}
                sources={request.sources}
                canShareAudio={request.canShareAudio}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const decline = (id: string): void => {
  useUi.getState().setDisplayCapture(null)
  void invoke('displayCapture:respond', { id, sourceId: null })
}

function LookingForSources({ id, host }: { id: string; host: string }): React.JSX.Element {
  return (
    <div data-testid="screen-share-loading">
      <div className="flex items-center gap-2 pb-2">
        <ScreenShare size={18} style={{ color: 'var(--accent)' }} />
        <div className="text-[14px] font-medium" style={{ color: 'var(--ink-1)' }}>
          Share your screen with <span data-testid="screen-share-host">{host}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pb-4" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg"
            style={{ background: 'var(--surface-glass)' }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
          Looking for screens and windows…
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => decline(id)}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-[12px] transition-colors hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)' }}
          data-testid="screen-share-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function SourceChooser({
  id,
  host,
  sources,
  canShareAudio,
}: {
  id: string
  host: string
  sources: DisplayCaptureSource[]
  canShareAudio: boolean
}): React.JSX.Element {
  const screens = sources.filter((s) => s.kind === 'screen')
  const windows = sources.filter((s) => s.kind === 'window')
  const [kind, setKind] = useState<'screen' | 'window'>(screens.length > 0 ? 'screen' : 'window')
  const [selected, setSelected] = useState<string | null>(sources[0]?.id ?? null)
  const [withAudio, setWithAudio] = useState(false)
  const shown = kind === 'screen' ? screens : windows

  const share = (): void => {
    if (!selected) return
    useUi.getState().setDisplayCapture(null)
    void invoke('displayCapture:respond', { id, sourceId: selected, withAudio })
  }

  return (
    <>
      <div className="flex items-center gap-2 px-1 pb-3">
        <ScreenShare size={18} style={{ color: 'var(--accent)' }} />
        <div className="text-[14px] font-medium" style={{ color: 'var(--ink-1)' }}>
          Share your screen with <span data-testid="screen-share-host">{host}</span>
        </div>
      </div>

      <div className="glass mb-3 flex w-fit rounded-lg p-0.5" role="radiogroup">
        {(
          [
            ['screen', 'Entire screen', screens.length],
            ['window', 'Window', windows.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            disabled={count === 0}
            onClick={() => {
              setKind(value)
              setSelected((value === 'screen' ? screens : windows)[0]?.id ?? null)
            }}
            className="cursor-pointer rounded-md px-3 py-1 text-[12px] disabled:cursor-default disabled:opacity-40"
            style={{
              background: kind === value ? 'var(--surface-glass-strong)' : 'transparent',
              color: kind === value ? 'var(--ink-1)' : 'var(--ink-2)',
            }}
            data-testid={`screen-share-tab-${value}`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto pb-1">
        {shown.map((source) => {
          const isSelected = source.id === selected
          return (
            <button
              key={source.id}
              type="button"
              onClick={() => setSelected(source.id)}
              onDoubleClick={share}
              className="flex cursor-pointer flex-col gap-1.5 rounded-xl p-2 text-left transition-colors"
              style={{
                background: isSelected ? 'var(--surface-glass-strong)' : 'transparent',
                outline: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-glass)',
              }}
              data-testid="screen-share-source"
              data-selected={isSelected || undefined}
            >
              <img
                src={source.thumbnailDataUrl}
                alt=""
                className="h-24 w-full rounded-lg object-contain"
                style={{ background: 'var(--surface-glass)' }}
              />
              <div className="flex min-w-0 items-center gap-1.5">
                {source.appIconDataUrl ? (
                  <img src={source.appIconDataUrl} alt="" className="h-3.5 w-3.5 shrink-0" />
                ) : source.kind === 'screen' ? (
                  <Monitor size={13} style={{ color: 'var(--ink-3)' }} />
                ) : (
                  <AppWindow size={13} style={{ color: 'var(--ink-3)' }} />
                )}
                <span
                  className="min-w-0 flex-1 truncate text-[12px]"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {source.name}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div
        className="mt-3 flex items-center gap-3 border-t pt-3"
        style={{ borderColor: 'var(--border-glass)' }}
      >
        {canShareAudio && (
          <label
            className="flex cursor-pointer items-center gap-1.5 text-[12px]"
            style={{ color: 'var(--ink-2)' }}
          >
            <input
              type="checkbox"
              checked={withAudio}
              onChange={(e) => setWithAudio(e.target.checked)}
              data-testid="screen-share-audio"
            />
            Share system audio
          </label>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => decline(id)}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-[12px] transition-colors hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)' }}
          data-testid="screen-share-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={share}
          disabled={!selected}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-medium disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          data-testid="screen-share-confirm"
        >
          Share
        </button>
      </div>
    </>
  )
}

/** macOS refuses screen capture until the app is allowed in System Settings. */
function SystemPermissionNeeded({ id }: { id: string }): React.JSX.Element {
  return (
    <div data-testid="screen-share-system-permission">
      <div className="flex items-center gap-2 pb-2">
        <ScreenShare size={18} style={{ color: 'var(--accent)' }} />
        <div className="text-[14px] font-medium" style={{ color: 'var(--ink-1)' }}>
          macOS needs to allow screen recording
        </div>
      </div>
      <p className="pb-4 text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        Aura Browser is not yet allowed to record the screen. Turn it on under Privacy &amp;
        Security → Screen &amp; System Audio Recording, then quit and reopen the browser and try
        sharing again.
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => decline(id)}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-[12px] transition-colors hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)' }}
          data-testid="screen-share-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void invoke('displayCapture:openSystemSettings', {})}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          data-testid="screen-share-open-settings"
        >
          <ExternalLink size={13} />
          Open System Settings
        </button>
      </div>
    </div>
  )
}
