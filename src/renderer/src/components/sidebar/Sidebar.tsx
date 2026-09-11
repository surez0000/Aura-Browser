import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { isMac, modKeyLabel } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import { NavCluster } from './NavCluster'
import { UrlPill } from './UrlPill'
import { FavoritesGrid } from './FavoritesGrid'
import { TabList } from './TabList'
import { WindowControls } from './WindowControls'

export const SIDEBAR_WIDTH = 264

export function Sidebar(): React.JSX.Element {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const openPalette = useUi((s) => s.openPalette)

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : SIDEBAR_WIDTH, opacity: collapsed ? 0 : 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="relative h-full shrink-0 overflow-hidden"
      data-testid="sidebar"
      aria-hidden={collapsed}
    >
      {/* Fixed inner width so content doesn't reflow while the spring runs. */}
      <div
        className="absolute inset-y-0 left-0 flex h-full flex-col gap-2 px-3 pb-3"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="drag flex h-10 shrink-0 items-center">
          {isMac() ? <div className="w-16" /> : null}
          <div className="flex-1" />
          {!isMac() && <WindowControls />}
        </div>

        <NavCluster />
        <UrlPill />
        <FavoritesGrid />

        <div
          className="mx-1 mt-1 flex items-center justify-between text-[11px] font-medium tracking-wide uppercase"
          style={{ color: 'var(--ink-3)' }}
        >
          <span>Today</span>
        </div>

        <TabList />

        <button
          type="button"
          onClick={() => openPalette('new')}
          className="no-drag flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-colors hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)' }}
          data-testid="new-tab-button"
        >
          <Plus size={15} />
          <span>New Tab</span>
          <span className="ml-auto text-[11px]" style={{ color: 'var(--ink-3)' }}>
            {modKeyLabel()}T
          </span>
        </button>
      </div>
    </motion.aside>
  )
}
