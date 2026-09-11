import type { CSSProperties } from 'react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { PageCard } from '@/components/PageCard'
import { Palette } from '@/components/palette/Palette'
import { FindBar } from '@/components/FindBar'
import { PermissionBanner } from '@/components/PermissionBanner'
import { spaceColor } from '@/components/sidebar/SpaceSwitcher'
import { useIpcSync } from '@/state/sync'
import { useTabs, selectActiveSpace } from '@/state/tabs'
import { useUi } from '@/state/ui'

export default function App(): React.JSX.Element {
  useIpcSync()
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const space = useTabs(selectActiveSpace)

  // Phase (b): the space accent tints interactive highlights; phase (c) will
  // drive the full aurora palette from it.
  const style = space ? ({ '--accent': spaceColor(space) } as CSSProperties) : undefined

  return (
    <div className="app-bg flex h-full w-full overflow-hidden" style={style}>
      <Sidebar />
      <main
        className={`flex h-full min-w-0 flex-1 flex-col gap-2 p-2 ${collapsed ? 'pl-2' : 'pl-0'}`}
      >
        <FindBar />
        <PermissionBanner />
        <div className="min-h-0 flex-1">
          <PageCard />
        </div>
      </main>
      <Palette />
    </div>
  )
}
