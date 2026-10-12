import { useMemo } from 'react'
import { useApps } from '@/state/apps'
import { useGrammar, useGrammarOnHere } from '@/state/grammar'
import { useUi } from '@/state/ui'
import { AppIcon } from './icons'

/**
 * Pinned Aura Apps, at the foot of the right-hand bar.
 * Nothing shows until an app is both enabled and pinned, so the bar stays
 * empty for anyone who wants no apps.
 */
export function PinnedApps({
  vertical = false,
}: { vertical?: boolean } = {}): React.JSX.Element | null {
  const apps = useApps((s) => s.apps)
  const pinned = useMemo(() => apps.filter((a) => a.enabled && a.pinned), [apps])
  const openApp = useAppOpener()
  const grammarHere = useGrammarOnHere()

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
          className="no-drag flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)' }}
          data-testid="pinned-app"
          data-app={app.id}
          data-on-here={(app.id === 'grammar' && grammarHere) || undefined}
        >
          <span className="relative flex">
            <AppIcon id={app.id} size={16} />
            {/* The grammar checker is on for the page on screen. */}
            {app.id === 'grammar' && grammarHere && (
              <span
                className="absolute -top-1 -right-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--accent)' }}
                aria-hidden
              />
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Each app knows which panel it raises. */
function useAppOpener(): (id: string) => void {
  const toggleNotes = useUi((s) => s.toggleNotes)
  const toggleReminders = useUi((s) => s.toggleReminders)
  const toggleTimesheet = useUi((s) => s.toggleTimesheet)
  const toggleGrammar = useUi((s) => s.toggleGrammar)
  const openGrammarSetup = useUi((s) => s.openGrammarSetup)
  return (id: string) => {
    if (id === 'notes') toggleNotes()
    else if (id === 'reminders') toggleReminders()
    else if (id === 'timesheet') toggleTimesheet()
    // Before setup there is nothing to switch, so setup is what opens.
    else if (id === 'grammar') {
      if (useGrammar.getState().info?.ready) toggleGrammar()
      else openGrammarSetup()
    }
  }
}
