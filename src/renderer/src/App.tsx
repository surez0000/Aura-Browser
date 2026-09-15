import { useMemo, type CSSProperties } from 'react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { WindowControls } from '@/components/sidebar/WindowControls'
import { PageCard } from '@/components/PageCard'
import { Palette } from '@/components/palette/Palette'
import { FindBar } from '@/components/FindBar'
import { PermissionBanner } from '@/components/PermissionBanner'
import { LoadingBar } from '@/components/LoadingBar'
import { AuroraBackdrop } from '@/components/AuroraBackdrop'
import { isMac } from '@/lib/ipc'
import { auroraPalette, hueOf } from '@/theme/aurora'
import { toCss } from '@/theme/contrast'
import { selectSidebarMode, useSettings } from '@/state/settings'
import { useIpcSync } from '@/state/sync'
import { useTabs, selectActiveSpace } from '@/state/tabs'
import { useUi } from '@/state/ui'

/**
 * With the sidebar in show-on-hover mode nothing else hosts the window
 * controls or clears the macOS traffic lights, so a slim drag strip does.
 */
function TopStrip(): React.JSX.Element {
  return (
    <div
      className="drag absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-end px-2"
      data-testid="top-strip"
    >
      {!isMac() && <WindowControls />}
    </div>
  )
}

export default function App(): React.JSX.Element {
  useIpcSync()
  const theme = useUi((s) => s.themeName)
  const sidebarMode = useSettings(selectSidebarMode)
  const space = useTabs(selectActiveSpace)

  const hue = hueOf(space)
  const muted = space?.incognito ?? false
  const palette = useMemo(() => auroraPalette(hue, theme, { muted }), [hue, theme, muted])

  const style = {
    '--accent': toCss(palette.accent),
    '--accent-ink': toCss(palette.accentInk),
  } as CSSProperties

  const floating = sidebarMode === 'hover'

  return (
    <div
      className="app-bg isolate relative flex h-full w-full overflow-hidden"
      style={style}
      data-sidebar-mode={sidebarMode}
    >
      <AuroraBackdrop palette={palette} paletteKey={`${hue}:${muted}:${theme}`} hue={hue} />
      <Sidebar />
      {floating && <TopStrip />}
      <main
        className={`relative flex h-full min-w-0 flex-1 flex-col gap-2 p-2 ${floating ? 'pt-9' : 'pl-0'}`}
      >
        {/* Sits in the gap above the card: 8 px in fixed mode, under the strip in hover mode. */}
        <LoadingBar top={floating ? 31 : 3} />
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
