import { Clock, LayoutGrid, NotebookPen, Timer } from 'lucide-react'
import type { AuraAppId } from '@shared/apps'

/** One icon per app — the rail button, the Store row and the panel header. */
export function AppIcon({ id, size = 16 }: { id: AuraAppId; size?: number }): React.JSX.Element {
  if (id === 'notes') return <NotebookPen size={size} />
  if (id === 'reminders') return <Clock size={size} />
  return <Timer size={size} />
}

export function AppsIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return <LayoutGrid size={size} />
}
