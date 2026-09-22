import { useUi } from '@/state/ui'
import { AppsIcon } from './icons'

/**
 * The way in to Aura Apps, in the sidebar above Settings.
 *
 * It was reachable only from a menu and the command palette, which made the
 * whole feature invisible: pinned apps appear once something is switched on, so
 * there was nothing on screen to suggest apps existed at all.
 */
export function AppsButton(): React.JSX.Element {
  const toggle = useUi((s) => s.toggleAppStore)
  const open = useUi((s) => s.appStoreOpen)

  return (
    <button
      type="button"
      title="Aura Apps"
      aria-label="Aura Apps"
      onClick={toggle}
      className="no-drag flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
      style={{ color: open ? 'var(--accent)' : 'var(--ink-2)' }}
      data-testid="apps-button"
    >
      <AppsIcon size={15} />
    </button>
  )
}
