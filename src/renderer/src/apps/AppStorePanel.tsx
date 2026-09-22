import { useMemo } from 'react'
import { AnimatePresence } from 'motion/react'
import { Pin, PinOff } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { Panel } from '@/components/Panel'
import { Switch } from '@/components/Switch'
import { useApps } from '@/state/apps'
import { useUi } from '@/state/ui'
import { AppIcon, AppsIcon } from './icons'

/**
 * The App Store: what Aura can do beyond browsing, and which of it is on.
 *
 * The catalogue is first-party, so this is a list of switches rather than a
 * download page — an app runs inside the browser chrome, which is privileged,
 * and third-party code belongs in extensions where the page sandbox holds.
 * Apps still being built are listed but cannot be switched on, so the shape of
 * what is coming is visible without pretending it is here.
 */
export function AppStorePanel(): React.JSX.Element {
  const open = useUi((s) => s.appStoreOpen)
  return <AnimatePresence>{open && <AppStoreDialog />}</AnimatePresence>
}

function AppStoreDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeAppStore)
  const apps = useApps((s) => s.apps)
  const [available, upcoming] = useMemo(
    () => [apps.filter((a) => a.available), apps.filter((a) => !a.available)],
    [apps],
  )

  return (
    <Panel
      overlayKey="app-store"
      icon={<AppsIcon size={17} />}
      title="Aura Apps"
      onClose={close}
      testId="app-store"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" data-testid="app-store-list">
        {available.map((app) => (
          <div
            key={app.id}
            className="flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-(--surface-hover)"
            data-testid="app-row"
            data-app={app.id}
            data-enabled={app.enabled || undefined}
          >
            <span className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }}>
              <AppIcon id={app.id} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium" style={{ color: 'var(--ink-1)' }}>
                {app.name}
              </div>
              <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                {app.tagline}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                {app.description}
              </p>
            </div>
            {app.enabled && (
              <button
                type="button"
                onClick={() => void invoke('apps:setPinned', { id: app.id, pinned: !app.pinned })}
                title={app.pinned ? 'Unpin from the sidebar' : 'Pin to the sidebar'}
                aria-label={app.pinned ? `Unpin ${app.name}` : `Pin ${app.name}`}
                className="shrink-0 cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-(--surface-hover)"
                style={{ color: app.pinned ? 'var(--accent)' : 'var(--ink-3)' }}
                data-testid="app-pin"
                data-pinned={app.pinned || undefined}
              >
                {app.pinned ? <Pin size={14} /> : <PinOff size={14} />}
              </button>
            )}
            <Switch
              on={app.enabled}
              label={app.enabled ? `Turn off ${app.name}` : `Turn on ${app.name}`}
              onChange={(enabled) => void invoke('apps:setEnabled', { id: app.id, enabled })}
              testId="app-toggle"
            />
          </div>
        ))}

        {upcoming.length > 0 && (
          <>
            <div
              className="mx-3 mt-3 mb-1 text-[11px] font-medium tracking-wide uppercase"
              style={{ color: 'var(--ink-3)' }}
            >
              Coming next
            </div>
            {upcoming.map((app) => (
              <div
                key={app.id}
                className="flex items-start gap-3 rounded-xl px-3 py-3 opacity-60"
                data-testid="app-row-upcoming"
                data-app={app.id}
              >
                <span className="mt-0.5 shrink-0" style={{ color: 'var(--ink-3)' }}>
                  <AppIcon id={app.id} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium" style={{ color: 'var(--ink-2)' }}>
                    {app.name}
                  </div>
                  <p
                    className="mt-0.5 text-[12px] leading-relaxed"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    {app.description}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Panel>
  )
}
