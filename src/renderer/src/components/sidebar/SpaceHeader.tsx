import { EyeOff, Pencil } from 'lucide-react'
import { useTabs, selectActiveSpace } from '@/state/tabs'
import { useUi } from '@/state/ui'

/** Active space name; click to edit (rename, accent, delete). */
export function SpaceHeader(): React.JSX.Element | null {
  const space = useTabs(selectActiveSpace)
  const openSpaceEditor = useUi((s) => s.openSpaceEditor)
  if (!space) return null

  return (
    <div className="flex h-6 shrink-0 items-center gap-2 px-1" data-testid="space-header">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />
      <button
        type="button"
        onClick={() => openSpaceEditor(space.id)}
        title="Edit space"
        className="group no-drag flex min-w-0 cursor-pointer items-center gap-1.5"
      >
        <span
          className="truncate text-[12px] font-semibold tracking-wide"
          style={{ color: 'var(--ink-2)' }}
          data-testid="space-name"
        >
          {space.name}
        </span>
        <Pencil
          size={10}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: 'var(--ink-3)' }}
        />
      </button>
      {space.incognito && (
        <span
          className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: 'var(--surface-glass-strong)', color: 'var(--ink-2)' }}
          data-testid="incognito-badge"
        >
          <EyeOff size={10} /> Incognito
        </span>
      )}
    </div>
  )
}
