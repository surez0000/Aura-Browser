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
import { SettingsPanel } from '@/components/sidebar/SettingsFlyout'
import { DownloadsPanel } from '@/components/sidebar/DownloadsFlyout'
import { AppStorePanel } from '@/apps/AppStorePanel'
import { NotesPanel } from '@/apps/notes/NotesPanel'
import { AuroraBackdrop } from '@/components/AuroraBackdrop'
import { BackdropTexture } from '@/components/BackdropTexture'
import { auroraPalette, hue2Of, hueOf } from '@/theme/aurora'
import { toCss } from '@/theme/contrast'
import { TopBar } from '@/components/TopBar'
import {
  selectBackdropTexture,
  selectSidebarMode,
  selectTabBar,
  useSettings,
} from '@/state/settings'
import { useIpcSync } from '@/state/sync'
import { useTabs, selectActiveSpace } from '@/state/tabs'
import { useUi } from '@/state/ui'

export default function App(): React.JSX.Element {
  useIpcSync()
  const theme = useUi((s) => s.themeName)
  const sidebarMode = useSettings(selectSidebarMode)
  const texture = useSettings(selectBackdropTexture)
  const topTabs = useSettings(selectTabBar) === 'top'
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
      data-sidebar-mode={topTabs ? 'compact' : sidebarMode}
      data-tab-bar={topTabs ? 'top' : 'side'}
    >
      <AuroraBackdrop palette={palette} paletteKey={`${hue}:${hue2}:${muted}:${theme}`} hue={hue} />
      {/* Sits over the gradient, under every piece of chrome. */}
      <BackdropTexture texture={texture} theme={theme} />
      <Sidebar />
      <main
        className={`relative flex h-full min-w-0 flex-1 flex-col gap-2 p-2 ${topTabs ? 'pt-0' : 'pt-3'} ${compact ? '' : 'pl-0'}`}
      >
        {/* Tabs, navigation and the address field, when they live on top. */}
        {topTabs && <TopBar />}
        {/*
         * The strip above the page card is the window's title bar: the only
         * chrome pixels across the top, since the page itself is a native view
         * that never sees a click. Marking it draggable is what lets the
         * window be moved from the top and, on macOS and Windows alike, gives
         * the double-click-to-zoom gesture something to land on.
         */}
        {!topTabs && <div className="drag absolute inset-x-0 top-0 h-3" aria-hidden />}
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
      <SettingsPanel />
      <DownloadsPanel />
      <AppStorePanel />
      <NotesPanel />
    </div>
  )
}
