import { useMemo, type CSSProperties } from 'react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { PaneArea } from '@/components/PaneArea'
import { Palette } from '@/components/palette/Palette'
import { FindBar } from '@/components/FindBar'
import { PermissionBanner } from '@/components/PermissionBanner'
import { LoadingBar } from '@/components/LoadingBar'
import { PeekCard } from '@/components/PeekCard'
import { ScreenSharePicker } from '@/components/ScreenSharePicker'
import { HistoryPanel } from '@/components/HistoryPanel'
import { ExtensionsPanel } from '@/components/ExtensionsPanel'
import { AuroraBackdrop } from '@/components/AuroraBackdrop'
import { auroraPalette, hue2Of, hueOf } from '@/theme/aurora'
import { toCss } from '@/theme/contrast'
import { selectSidebarMode, useSettings } from '@/state/settings'
import { useIpcSync } from '@/state/sync'
import { useTabs, selectActiveSpace } from '@/state/tabs'
import { useUi } from '@/state/ui'

export default function App(): React.JSX.Element {
  useIpcSync()
  const theme = useUi((s) => s.themeName)
  const sidebarMode = useSettings(selectSidebarMode)
  const space = useTabs(selectActiveSpace)

  const hue = hueOf(space)
  const hue2 = hue2Of(space)
  const muted = space?.incognito ?? false
  const palette = useMemo(
    () => auroraPalette(hue, theme, { muted, hue2 }),
    [hue, hue2, theme, muted],
  )

  const style = {
    '--accent': toCss(palette.accent),
    '--accent-ink': toCss(palette.accentInk),
  } as CSSProperties

  // The compact rail is narrower than the macOS traffic lights, so the page
  // card keeps its left gap there; the full sidebar already clears them.
  const compact = sidebarMode === 'compact'

  return (
    <div
      className="app-bg isolate relative flex h-full w-full overflow-hidden"
      style={style}
      data-sidebar-mode={sidebarMode}
    >
      <AuroraBackdrop palette={palette} paletteKey={`${hue}:${hue2}:${muted}:${theme}`} hue={hue} />
      <Sidebar />
      <main
        className={`relative flex h-full min-w-0 flex-1 flex-col gap-2 p-2 ${compact ? '' : 'pl-0'}`}
      >
        {/* Sits in the gap above the page card. */}
        <LoadingBar top={3} />
        <FindBar />
        <PermissionBanner />
        <div className="min-h-0 flex-1">
          <PaneArea />
        </div>
      </main>
      <PeekCard />
      <Palette />
      <ScreenSharePicker />
      <HistoryPanel />
      <ExtensionsPanel />
    </div>
  )
}
