import { PinnedApps } from '@/apps/PinnedApps'
import { AppsButton } from '@/apps/AppsButton'

export const RIGHT_BAR_WIDTH = 48

/**
 * The bar down the right of the window, the same in every layout: Aura's own
 * apps, from the bottom, with the App Store under them.
 */
export function RightBar(): React.JSX.Element {
  return (
    <aside
      className="drag relative flex h-full shrink-0 flex-col items-center justify-end gap-1 pt-3 pb-3"
      style={{ width: RIGHT_BAR_WIDTH }}
      data-testid="right-bar"
    >
      <div className="flex shrink-0 flex-col items-center gap-1" data-testid="bar-apps">
        <PinnedApps vertical />
        <AppsButton />
      </div>
    </aside>
  )
}
