import { EyeOff, Plus } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { spaceGradientCss } from '@/theme/aurora'
import { useTabs } from '@/state/tabs'
import { useUi } from '@/state/ui'

/**
 * The dot rail at the sidebar's foot: click to switch, drop a dragged tab on a
 * dot to move it to that space, "+" to create a space. Across the full sidebar
 * it is a row of its own and wraps rather than overflowing, however many
 * Spaces there are.
 */
export function SpaceSwitcher({
  vertical = false,
}: { vertical?: boolean } = {}): React.JSX.Element {
  const spaces = useTabs((s) => s.spaces)
  const activeSpaceId = useTabs((s) => s.activeSpaceId)
  const theme = useUi((s) => s.themeName)
  const openSpaceEditor = useUi((s) => s.openSpaceEditor)

  return (
    <div
      className={`no-drag flex min-w-0 shrink-0 items-center justify-center gap-2 ${
        vertical ? 'flex-col py-1' : 'flex-wrap'
      }`}
      data-testid="space-switcher"
    >
      {spaces.map((space) => {
        const isActive = space.id === activeSpaceId
        return (
          <button
            key={space.id}
            type="button"
            title={`${space.name} — double-click or right-click to edit`}
            aria-label={`Switch to ${space.name}`}
            onClick={() => void invoke('spaces:activate', { spaceId: space.id })}
            onContextMenu={(e) => {
              e.preventDefault()
              openSpaceEditor(space.id)
            }}
            onDoubleClick={() => openSpaceEditor(space.id)}
            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
            style={{
              background: space.incognito
                ? 'var(--surface-glass-strong)'
                : spaceGradientCss(space, theme),
              boxShadow: isActive ? '0 0 0 2px var(--ink-2)' : '0 0 0 1px var(--border-glass)',
            }}
            data-space-dot={space.id}
            data-testid="space-dot"
            data-active={isActive || undefined}
          >
            {space.incognito && <EyeOff size={10} color="rgba(255,255,255,.9)" />}
          </button>
        )
      })}
      <button
        type="button"
        title="New Space"
        aria-label="New Space"
        onClick={() => openSpaceEditor(null)}
        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-(--surface-hover)"
        style={{ color: 'var(--ink-3)', border: '1px dashed var(--border-glass)' }}
        data-testid="space-add"
      >
        <Plus size={11} />
      </button>
    </div>
  )
}
