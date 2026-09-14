import { useMemo, type CSSProperties } from 'react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { PageCard } from '@/components/PageCard'
import { Palette } from '@/components/palette/Palette'
import { FindBar } from '@/components/FindBar'
import { PermissionBanner } from '@/components/PermissionBanner'
import { AuroraBackdrop } from '@/components/AuroraBackdrop'
import { auroraPalette, hueOf } from '@/theme/aurora'
import { toCss } from '@/theme/contrast'
import { useIpcSync } from '@/state/sync'
import { useTabs, selectActiveSpace } from '@/state/tabs'
import { useUi } from '@/state/ui'

export default function App(): React.JSX.Element {
  useIpcSync()
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const theme = useUi((s) => s.themeName)
  const space = useTabs(selectActiveSpace)

  const hue = hueOf(space)
  const muted = space?.incognito ?? false
  const palette = useMemo(() => auroraPalette(hue, theme, { muted }), [hue, theme, muted])

  const style = {
    '--accent': toCss(palette.accent),
    '--accent-ink': toCss(palette.accentInk),
  } as CSSProperties

  return (
    <div className="app-bg isolate relative flex h-full w-full overflow-hidden" style={style}>
      <AuroraBackdrop palette={palette} paletteKey={`${hue}:${muted}:${theme}`} hue={hue} />
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
