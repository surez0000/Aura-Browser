import { motion } from 'motion/react'
import { Plus, X } from 'lucide-react'
import { invoke, modKeyLabel } from '@/lib/ipc'
import { NavCluster } from '@/components/sidebar/NavCluster'
import { UrlPill } from '@/components/sidebar/UrlPill'
import { TabFavicon } from '@/components/sidebar/TabFavicon'
import { tabsOf, useTabs } from '@/state/tabs'
import { useUi } from '@/state/ui'
import type { TabInfo } from '@shared/models'
import { displayLabel } from '@/lib/url'

/**
 * The traditional layout's top chrome: a strip of tabs, the back/forward/reload
 * cluster and the address field. Spaces, favorites, downloads and settings stay
 * on the left rail, so switching Space is still one click from anywhere.
 */

function TopTab({ tab, isActive }: { tab: TabInfo; isActive: boolean }): React.JSX.Element {
  const title = tab.title || displayLabel(tab.url || tab.pendingUrl || null)
  return (
    <motion.div
      layout
      className="group relative flex h-8 shrink items-center gap-2 rounded-lg px-2.5"
      style={{
        // Matches the sidebar's own active treatment, so the two layouts read
        // as the same browser rather than two different ones.
        background: isActive ? 'var(--surface-glass-strong)' : 'transparent',
        border: `1px solid ${isActive ? 'var(--border-glass)' : 'transparent'}`,
        color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
        // Wide enough to read, narrow enough that many tabs still fit. The
        // minimum is what makes the strip scroll rather than squeeze: without
        // it every tab shrinks towards its favicon once there are enough of
        // them, and the titles disappear instead of moving off the edge.
        flexBasis: 190,
        minWidth: 112,
      }}
      data-testid="top-tab"
      data-active={isActive || undefined}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        title={title}
        onClick={() => void invoke('tabs:activate', { tabId: tab.id })}
        onAuxClick={(e) => {
          // Middle-click closes, as everywhere else with a tab strip.
          if (e.button === 1) void invoke('tabs:close', { tabId: tab.id })
        }}
        onContextMenu={() => void invoke('tabs:contextMenu', { tabId: tab.id })}
      >
        <TabFavicon tab={tab} />
        <span className="min-w-0 flex-1 truncate text-[12.5px]" data-testid="tab-title">
          {title}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Close ${title}`}
        title="Close tab"
        onClick={() => void invoke('tabs:close', { tabId: tab.id })}
        className="shrink-0 cursor-pointer rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--surface-hover)"
        data-testid="tab-close"
      >
        <X size={12} />
      </button>
    </motion.div>
  )
}

export function TopBar(): React.JSX.Element {
  const tabs = useTabs((s) => s.tabs)
  const activeSpaceId = useTabs((s) => s.activeSpaceId)
  const activeTabId = useTabs((s) => s.activeTabId)
  const openPalette = useUi((s) => s.openPalette)

  // Pinned first, then Today: the same order the sidebar lists them in.
  const pinned = tabsOf(tabs, activeSpaceId, 'pinned')
  const today = tabsOf(tabs, activeSpaceId, 'today')
  const strip = [...pinned, ...today]

  return (
    <div className="flex shrink-0 flex-col gap-1.5 pt-1.5" data-testid="top-bar">
      {/* Tab strip. The row is draggable between tabs, like a real title bar. */}
      <div className="drag flex min-w-0 items-center gap-1 pr-2">
        <div className="no-scrollbar no-drag flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {strip.map((tab) => (
            <TopTab key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
          ))}
        </div>
        <button
          type="button"
          title={`New Tab (${modKeyLabel()}T)`}
          aria-label="New Tab"
          onClick={() => openPalette('new')}
          className="no-drag flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-(--surface-hover)"
          style={{ color: 'var(--ink-2)' }}
          data-testid="new-tab-button"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Navigation and the address field. */}
      <div className="flex min-w-0 items-center gap-2 pr-2">
        <NavCluster />
        <div className="min-w-0 flex-1">
          {/* A full-width bar: show the whole address, not just the host. */}
          <UrlPill full />
        </div>
      </div>
    </div>
  )
}
