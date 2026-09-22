import { useMemo } from 'react'
import { useApps } from '@/state/apps'
import { useUi } from '@/state/ui'
import { AppIcon } from './icons'

/**
 * Pinned Aura Apps in the sidebar, beside Downloads and Settings — the two
 * things that were already there, so an app you switched on lands where the
 * rest of the browser's own tools live. Nothing shows until an app is both
 * enabled and pinned, so the rail stays empty for anyone who wants no apps.
 */
export function PinnedApps({
  vertical = false,
}: { vertical?: boolean } = {}): React.JSX.Element | null {
  const apps = useApps((s) => s.apps)
  const pinned = useMemo(() => apps.filter((a) => a.enabled && a.pinned), [apps])
  const openApp = useAppOpener()

  if (pinned.length === 0) return null

  return (
    <div
      className={`flex items-center gap-1 ${vertical ? 'flex-col' : ''}`}
      data-testid="pinned-apps"
    >
      {pinned.map((app) => (
        <button
          key={app.id}
          type="button"
          title={`${app.name} — ${app.tagline}`}
          aria-label={app.name}
          onClick={() => openApp(app.id)}
          className="no-drag flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)' }}
          data-testid="pinned-app"
          data-app={app.id}
        >
          <AppIcon id={app.id} size={15} />
        </button>
      ))}
    </div>
  )
}

/** Each app knows which panel it raises; reminders and timesheet join later. */
function useAppOpener(): (id: string) => void {
  const toggleNotes = useUi((s) => s.toggleNotes)
  return (id: string) => {
    if (id === 'notes') toggleNotes()
  }
}
