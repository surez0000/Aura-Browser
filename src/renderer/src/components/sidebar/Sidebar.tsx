import { motion, useReducedMotion } from 'motion/react'
import { Archive, Plus } from 'lucide-react'
import { isMac, modKeyLabel, invoke } from '@/lib/ipc'
import { useTabs, tabsOf } from '@/state/tabs'
import { useUi } from '@/state/ui'
import { NavCluster } from './NavCluster'
import { UrlPill } from './UrlPill'
import { SpaceHeader } from './SpaceHeader'
import { FavoritesGrid } from './FavoritesGrid'
import { TabSection } from './TabSection'
import { SpaceSwitcher } from './SpaceSwitcher'
import { SpaceEditor } from './SpaceEditor'
import { DownloadsButton, DownloadsFlyout } from './DownloadsFlyout'
import { WindowControls } from './WindowControls'

export const SIDEBAR_WIDTH = 264

function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className="mx-1 flex items-center justify-between text-[11px] font-medium tracking-wide uppercase"
      style={{ color: 'var(--ink-3)' }}
    >
      <span>{children}</span>
      {action}
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  // `width` is neither a transform nor a layout animation, so MotionConfig's
  // reducedMotion="user" would still spring it — gate it explicitly.
  const reduceMotion = useReducedMotion()
  const openPalette = useUi((s) => s.openPalette)
  const activeSpaceId = useTabs((s) => s.activeSpaceId)
  const hasPinned = useTabs((s) => tabsOf(s.tabs, s.activeSpaceId, 'pinned').length > 0)

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : SIDEBAR_WIDTH, opacity: collapsed ? 0 : 1 }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36 }}
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

        {/* Space-scoped content slides in on space switches. */}
        <motion.div
          key={activeSpaceId}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className="flex min-h-0 flex-1 flex-col gap-2"
        >
          <SpaceHeader />
          <FavoritesGrid />

          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pt-1">
            {hasPinned && (
              <>
                <SectionLabel>Pinned</SectionLabel>
                <TabSection kind="pinned" />
              </>
            )}
            <SectionLabel
              action={
                <button
                  type="button"
                  title="Archive Today tabs"
                  aria-label="Archive Today tabs"
                  onClick={() => void invoke('tabs:archiveToday', {})}
                  className="no-drag cursor-pointer rounded p-0.5 transition-colors hover:bg-(--surface-hover)"
                  data-testid="archive-today"
                >
                  <Archive size={11} />
                </button>
              }
            >
              Today
            </SectionLabel>
            <TabSection kind="today" />
          </div>
        </motion.div>

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

        <div className="flex h-8 shrink-0 items-center gap-2">
          <DownloadsButton />
          <SpaceSwitcher />
          <div className="w-7 shrink-0" />
        </div>

        <DownloadsFlyout />
        <SpaceEditor />
      </div>
    </motion.aside>
  )
}
