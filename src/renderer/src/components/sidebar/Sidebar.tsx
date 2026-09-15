import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { Archive, Plus } from 'lucide-react'
import { isMac, modKeyLabel, invoke } from '@/lib/ipc'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion'
import { selectSidebarMode, useSettings } from '@/state/settings'
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
import { SettingsButton, SettingsFlyout } from './SettingsFlyout'
import { UpdateCard } from '@/components/UpdateNotice'
import { WindowControls } from './WindowControls'

export const SIDEBAR_WIDTH = 264
/** Gap around the floating panel in show-on-hover mode. */
const FLOAT_INSET = 8
/** Pointer must rest on the left edge this long before the panel reveals. */
const REVEAL_DWELL_MS = 90
/** Grace period after the pointer leaves before the panel hides. */
const HIDE_DELAY_MS = 260

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

/**
 * The sidebar has two modes (a persisted setting, toggled by ⌘S):
 *  - fixed: part of the layout — a spacer reserves its width and the panel
 *    sits over the aurora;
 *  - hover: the spacer collapses, the page takes the full width, and the panel
 *    floats in over the page when the pointer touches the left edge. Because
 *    chrome HTML renders under the page's native view (ADR-0003), a revealed
 *    panel holds the page overlay: the view is swapped for a snapshot for as
 *    long as the panel is up.
 */
export function Sidebar(): React.JSX.Element {
  const mode = useSettings(selectSidebarMode)
  const revealed = useUi((s) => s.sidebarRevealed)
  const setRevealed = useUi((s) => s.setSidebarRevealed)
  const setPointerInside = useUi((s) => s.setSidebarPointerInside)
  const holdLayout = useUi((s) => s.sidebarHoldLayout)
  const popoverOpen = useUi((s) => s.downloadsOpen || s.settingsOpen || s.spaceEditor.open)
  const openPalette = useUi((s) => s.openPalette)
  const activeSpaceId = useTabs((s) => s.activeSpaceId)
  const hasPinned = useTabs((s) => tabsOf(s.tabs, s.activeSpaceId, 'pinned').length > 0)
  const reduceMotion = usePrefersReducedMotion()

  const asideRef = useRef<HTMLElement | null>(null)
  const hovering = useRef(false)
  const hideTimer = useRef(0)
  const revealTimer = useRef(0)

  const floating = mode === 'hover'
  const visible = !floating || revealed
  const state = !floating ? 'fixed' : revealed ? 'revealed' : 'hidden'
  // Right after fixed → hover the panel keeps its slot until it hides once
  // (see sidebarHoldLayout); only a panel over the page looks and acts floating.
  const reservesSpace = !floating || holdLayout
  const overlapsPage = floating && !holdLayout

  // A panel over the page holds the overlay (snapshot swap) while it is up.
  useEffect(() => {
    if (!(overlapsPage && revealed)) return
    void holdOverlay('sidebar')
    return () => releaseOverlay('sidebar')
  }, [overlapsPage, revealed])

  const scheduleHide = (): void => {
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      if (hovering.current) return
      const ui = useUi.getState()
      if (ui.downloadsOpen || ui.settingsOpen || ui.spaceEditor.open) return
      // Keep the panel while someone is typing in it (URL pill, Space name);
      // a focused button after a click is not a reason to stay.
      const focused = document.activeElement
      const typing =
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement ||
        (focused instanceof HTMLElement && focused.isContentEditable)
      if (typing && asideRef.current?.contains(focused)) return
      if (focused instanceof HTMLElement && asideRef.current?.contains(focused)) focused.blur()
      ui.setSidebarRevealed(false)
    }, HIDE_DELAY_MS)
  }

  // A popover closing while the pointer is elsewhere lets the panel go.
  useEffect(() => {
    if (floating && revealed && !popoverOpen && !hovering.current) scheduleHide()
  }, [floating, revealed, popoverOpen])

  useEffect(
    () => () => {
      window.clearTimeout(hideTimer.current)
      window.clearTimeout(revealTimer.current)
    },
    [],
  )

  const onHotZoneEnter = (): void => {
    window.clearTimeout(revealTimer.current)
    revealTimer.current = window.setTimeout(() => {
      // Snapshot first, so the panel never slides in *under* the live view.
      void holdOverlay('sidebar').then(() => setRevealed(true))
    }, REVEAL_DWELL_MS)
  }
  const onHotZoneLeave = (): void => window.clearTimeout(revealTimer.current)

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 36 }

  return (
    <>
      {/* Layout spacer: reserves the panel's width in fixed mode only. */}
      <motion.div
        aria-hidden
        initial={false}
        animate={{ width: reservesSpace ? SIDEBAR_WIDTH : 0 }}
        transition={spring}
        className="h-full shrink-0"
        data-testid="sidebar-spacer"
      />

      {floating && !revealed && (
        <div
          className="absolute inset-y-0 left-0 z-30 w-1.5"
          onMouseEnter={onHotZoneEnter}
          onMouseLeave={onHotZoneLeave}
          data-testid="sidebar-hotzone"
        />
      )}

      <motion.aside
        ref={asideRef}
        initial={false}
        animate={{
          x: visible ? 0 : -(SIDEBAR_WIDTH + FLOAT_INSET * 2),
          opacity: visible ? 1 : 0,
        }}
        transition={spring}
        onMouseEnter={() => {
          hovering.current = true
          setPointerInside(true)
          window.clearTimeout(hideTimer.current)
        }}
        onMouseLeave={() => {
          hovering.current = false
          setPointerInside(false)
          if (floating) scheduleHide()
        }}
        onBlur={(e) => {
          // Keyboard-driven use (⌘L) ends with focus leaving the panel while the
          // pointer was never inside — that is the moment to let it go.
          if (floating && revealed && !hovering.current) {
            const next = e.relatedTarget
            if (!(next instanceof Node) || !asideRef.current?.contains(next)) scheduleHide()
          }
        }}
        className={
          overlapsPage
            ? 'floating-panel absolute top-2 bottom-2 left-2 z-40 flex flex-col gap-2 rounded-2xl px-3 pb-3 shadow-2xl'
            : 'absolute inset-y-0 left-0 z-40 flex flex-col gap-2 px-3 pb-3'
        }
        style={{ width: SIDEBAR_WIDTH }}
        aria-hidden={!visible}
        inert={!visible}
        data-state={state}
        data-testid="sidebar"
      >
        <div className="drag flex h-10 shrink-0 items-center">
          {isMac() ? <div className="w-16" /> : null}
          <div className="flex-1" />
          {!isMac() && !overlapsPage && <WindowControls />}
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

        <DownloadsFlyout />
        <SettingsFlyout />
        <SpaceEditor />
      </motion.aside>
    </>
  )
}
