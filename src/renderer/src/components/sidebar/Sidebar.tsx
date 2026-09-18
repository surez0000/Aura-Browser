import { useEffect } from 'react'
import { motion } from 'motion/react'
import { Archive, ArrowLeft, PanelLeft, Plus, RotateCw } from 'lucide-react'
import { isMac, modKeyLabel, invoke } from '@/lib/ipc'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion'
import { selectSidebarMode, useSettings } from '@/state/settings'
import { toggleSidebarMode } from '@/state/sync'
import { useTabs, tabsOf, selectActiveTab } from '@/state/tabs'
import { useUi } from '@/state/ui'
import { NavCluster } from './NavCluster'
import { UrlPill } from './UrlPill'
import { SpaceHeader } from './SpaceHeader'
import { FavoritesGrid } from './FavoritesGrid'
import { TabSection } from './TabSection'
import { SpaceSwitcher } from './SpaceSwitcher'
import { SpaceEditor } from './SpaceEditor'
import { DownloadsButton, DownloadsFlyout } from './DownloadsFlyout'
import { SettingsButton, SettingsFlyout } from './SettingsFlyout'
import { UpdateCard, UpdateRailButton } from '@/components/UpdateNotice'
import { WindowControls } from './WindowControls'

export const SIDEBAR_WIDTH = 264
/** Compact rail: wide enough for a 36 px target plus the panel's padding. */
export const RAIL_WIDTH = 60

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

/** 36 px square icon button — the rail's only control size. */
function RailButton({
  label,
  onClick,
  disabled,
  children,
  testId,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  testId?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="no-drag flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover) disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
      style={{ color: 'var(--ink-2)' }}
      data-testid={testId}
    >
      {children}
    </button>
  )
}

/**
 * The sidebar has two modes (persisted, toggled by ⌘S), and **both sit in the
 * layout** — neither ever covers the page:
 *  - fixed:   the full panel;
 *  - compact: a 60 px rail of tab favicons in a vertical list.
 *
 * The retired show-on-hover mode slid a panel over the page and had to swap the
 * page for a snapshot every time the pointer crossed the window edge, which
 * flapped. Nothing here reacts to hover, so there are no timers and no
 * snapshots — except while a popover is deliberately opened beside the rail.
 */
export function Sidebar(): React.JSX.Element {
  const mode = useSettings(selectSidebarMode)
  const compact = mode === 'compact'
  const popoverOpen = useUi((s) => s.downloadsOpen || s.settingsOpen || s.spaceEditor.open)
  const openPalette = useUi((s) => s.openPalette)
  const activeSpaceId = useTabs((s) => s.activeSpaceId)
  const hasPinned = useTabs((s) => tabsOf(s.tabs, s.activeSpaceId, 'pinned').length > 0)
  const reduceMotion = usePrefersReducedMotion()

  // Beside the rail a popover has to open over the page; hold the snapshot for
  // exactly as long as it is up (an explicit click, never hover).
  useEffect(() => {
    if (!(compact && popoverOpen)) return
    void holdOverlay('sidebar-popover')
    return () => releaseOverlay('sidebar-popover')
  }, [compact, popoverOpen])

  const width = compact ? RAIL_WIDTH : SIDEBAR_WIDTH
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 36 }

  return (
    <motion.aside
      initial={false}
      animate={{ width }}
      transition={spring}
      className="relative h-full shrink-0"
      style={{ width }}
      data-state={compact ? 'compact' : 'fixed'}
      data-testid="sidebar"
    >
      {/* Fixed inner width so content never reflows while the width springs. */}
      <div
        className="absolute inset-y-0 left-0 flex flex-col gap-2 overflow-hidden pb-3"
        style={{ width, paddingInline: compact ? 12 : 12 }}
      >
        {compact ? (
          <CompactRail />
        ) : (
          <>
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

            <UpdateCard />

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
              <SettingsButton />
            </div>
          </>
        )}
      </div>

      {/* Popovers sit outside the clipped column so they can open beside the rail. */}
      <DownloadsFlyout />
      <SettingsFlyout />
      <SpaceEditor />
    </motion.aside>
  )
}

/** The 60 px rail: navigation, tab favicons, and the footer controls. */
function CompactRail(): React.JSX.Element {
  const openPalette = useUi((s) => s.openPalette)
  const activeSpaceId = useTabs((s) => s.activeSpaceId)
  const active = useTabs(selectActiveTab)
  const hasPinned = useTabs((s) => tabsOf(s.tabs, s.activeSpaceId, 'pinned').length > 0)

  return (
    <>
      {/* macOS keeps its traffic lights here; Windows/Linux stack their controls. */}
      <div className="drag flex shrink-0 flex-col items-center">
        {isMac() ? <div className="h-10" /> : <WindowControls vertical />}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <RailButton label="Expand sidebar" onClick={toggleSidebarMode} testId="sidebar-expand">
          <PanelLeft size={16} />
        </RailButton>
        <RailButton
          label="Back"
          disabled={!active?.canGoBack}
          onClick={() => void invoke('tabs:back', {})}
          testId="nav-back"
        >
          <ArrowLeft size={16} />
        </RailButton>
        <RailButton
          label="Reload"
          disabled={!active}
          onClick={() => void invoke('tabs:reload', {})}
          testId="nav-reload"
        >
          <RotateCw size={15} />
        </RailButton>
      </div>

      <div
        className="mx-auto h-px w-6 shrink-0"
        style={{ background: 'var(--border-glass)' }}
        aria-hidden
      />

      <motion.div
        key={activeSpaceId}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto"
      >
        {hasPinned && <TabSection kind="pinned" compact />}
        {hasPinned && (
          <div
            className="mx-auto h-px w-4 shrink-0"
            style={{ background: 'var(--border-glass)' }}
            aria-hidden
          />
        )}
        <TabSection kind="today" compact />
      </motion.div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <RailButton
          label={`New Tab (${modKeyLabel()}T)`}
          onClick={() => openPalette('new')}
          testId="new-tab-button"
        >
          <Plus size={16} />
        </RailButton>
        <UpdateRailButton />
        <SpaceSwitcher vertical />
        <div className="flex flex-col items-center">
          <DownloadsButton />
          <SettingsButton />
        </div>
      </div>
    </>
  )
}
