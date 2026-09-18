import { Reorder } from 'motion/react'
import { invoke } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { TabFavicon } from './TabFavicon'
import type { TabInfo } from '@shared/models'

/**
 * One tab in the compact rail: favicon only, with the title as a tooltip.
 * Click activates, middle-click closes, right-click opens the native menu,
 * and the item still drags — to reorder, or onto a space dot to move Spaces.
 */
export function TabRailItem({
  tab,
  isActive,
  onDragEnd,
}: {
  tab: TabInfo
  isActive: boolean
  onDragEnd: (point: { x: number; y: number }) => void
}): React.JSX.Element {
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
      title={label}
      aria-label={label}
      className="no-drag relative flex h-9 w-9 cursor-default items-center justify-center rounded-lg select-none"
      style={{
        background: isActive ? 'var(--surface-glass-strong)' : 'transparent',
        border: `1px solid ${isActive ? 'var(--border-glass)' : 'transparent'}`,
      }}
      whileHover={{ backgroundColor: isActive ? undefined : 'var(--surface-hover)' }}
      onClick={() => void invoke('tabs:activate', { tabId: tab.id })}
      onAuxClick={(e: React.MouseEvent) => {
        if (e.button === 1) {
          e.preventDefault()
          void invoke('tabs:close', { tabId: tab.id })
        }
      }}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault()
        void invoke('tabs:contextMenu', { tabId: tab.id })
      }}
      onDragEnd={(_event, info) => onDragEnd(info.point)}
      data-testid="tab-item"
      data-tab-id={tab.id}
      data-kind={tab.kind}
      data-active={isActive || undefined}
    >
      {isActive && (
        <span
          className="absolute top-1/2 -left-1.5 h-4 w-0.5 -translate-y-1/2 rounded-full"
          style={{ background: 'var(--accent)' }}
          aria-hidden
        />
      )}
      <TabFavicon tab={tab} size={18} />
      {/* The title is present but visually hidden so tab-title assertions and
          screen readers work identically in both sidebar modes. */}
      <span className="sr-only" data-testid="tab-title">
        {label}
      </span>
    </Reorder.Item>
  )
}
