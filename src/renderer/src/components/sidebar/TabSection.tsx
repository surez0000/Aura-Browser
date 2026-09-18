import { AnimatePresence, Reorder } from 'motion/react'
import { X } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { useTabs, tabsOf } from '@/state/tabs'
import { TabFavicon } from './TabFavicon'
import { TabRailItem } from './TabRailItem'
import type { TabInfo, TabKind } from '@shared/models'

/**
 * Dropping a tab onto a space dot moves it there. elementsFromPoint (plural):
 * the dragged item itself sits under the pointer, so scan the whole stack.
 */
function dropOnSpaceDot(tab: TabInfo, point: { x: number; y: number }): void {
  const stack = document.elementsFromPoint(point.x, point.y)
  const dot = stack.map((el) => el.closest('[data-space-dot]')).find((el): el is Element => !!el)
  const targetSpaceId = dot?.getAttribute('data-space-dot')
  if (targetSpaceId && targetSpaceId !== tab.spaceId) {
    void invoke('tabs:moveToSpace', { tabId: tab.id, spaceId: targetSpaceId })
  }
}

function TabItem({ tab, isActive }: { tab: TabInfo; isActive: boolean }): React.JSX.Element {
  const label = tab.title || displayLabel(tab.url || tab.pendingUrl || null)
  return (
    <Reorder.Item
      value={tab}
      id={tab.id}
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -14 }}
      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
      className="group no-drag relative flex h-8 cursor-default items-center gap-2 rounded-lg px-2 select-none"
      style={{
        background: isActive ? 'var(--surface-glass-strong)' : 'transparent',
        border: `1px solid ${isActive ? 'var(--border-glass)' : 'transparent'}`,
        color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
      }}
      whileHover={{ backgroundColor: isActive ? undefined : 'var(--surface-hover)' }}
      onClick={() => void invoke('tabs:activate', { tabId: tab.id })}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault()
        void invoke('tabs:contextMenu', { tabId: tab.id })
      }}
      onDragEnd={(_event, info) => dropOnSpaceDot(tab, info.point)}
      data-testid="tab-item"
      data-tab-id={tab.id}
      data-kind={tab.kind}
      data-active={isActive || undefined}
    >
      <TabFavicon tab={tab} />
      <span className="min-w-0 flex-1 truncate text-[13px]" data-testid="tab-title">
        {label}
      </span>
      <button
        type="button"
        title="Close tab"
        aria-label={`Close ${label}`}
        onClick={(e) => {
          e.stopPropagation()
          void invoke('tabs:close', { tabId: tab.id })
        }}
        className="cursor-pointer rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--surface-hover)"
        style={{ color: 'var(--ink-3)' }}
        data-testid="tab-close"
      >
        <X size={13} />
      </button>
    </Reorder.Item>
  )
}

/**
 * One reorderable sidebar section (pinned or Today) of the active space.
 * `compact` renders the rail variant: favicons only, in a vertical column.
 */
export function TabSection({
  kind,
  compact = false,
}: {
  kind: TabKind
  compact?: boolean
}): React.JSX.Element {
  const tabs = useTabs((s) => s.tabs)
  const activeSpaceId = useTabs((s) => s.activeSpaceId)
  const activeTabId = useTabs((s) => s.activeTabId)
  const applyGroupOrder = useTabs((s) => s.applyGroupOrder)

  const sectionTabs = tabsOf(tabs, activeSpaceId, kind)

  return (
    <Reorder.Group
      axis="y"
      values={sectionTabs}
      onReorder={(next: TabInfo[]) => {
        const orderedIds = next.map((t) => t.id)
        applyGroupOrder(orderedIds)
        void invoke('tabs:reorder', { orderedIds })
      }}
      className={compact ? 'flex flex-col items-center gap-1' : 'space-y-0.5'}
      data-testid={`section-${kind}`}
    >
      <AnimatePresence initial={false}>
        {sectionTabs.map((tab) =>
          compact ? (
            <TabRailItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onDragEnd={(point) => dropOnSpaceDot(tab, point)}
            />
          ) : (
            <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
          ),
        )}
      </AnimatePresence>
    </Reorder.Group>
  )
}
