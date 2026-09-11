import { useState } from 'react'
import { Reorder } from 'motion/react'
import { Globe, Loader2, X } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { displayLabel } from '@/lib/url'
import { useTabs } from '@/state/tabs'
import type { TabInfo } from '@shared/models'

function TabFavicon({ tab }: { tab: TabInfo }): React.JSX.Element {
  const [imgFailed, setImgFailed] = useState(false)
  if (tab.isLoading) {
    return <Loader2 size={14} className="shrink-0 animate-spin" style={{ color: 'var(--ink-3)' }} />
  }
  if (tab.faviconUrl && !imgFailed) {
    return (
      <img
        src={tab.faviconUrl}
        alt=""
        className="h-3.5 w-3.5 shrink-0"
        onError={() => setImgFailed(true)}
      />
    )
  }
  return <Globe size={14} className="shrink-0" style={{ color: 'var(--ink-3)' }} />
}

function TabItem({ tab, isActive }: { tab: TabInfo; isActive: boolean }): React.JSX.Element {
  const label = tab.title || displayLabel(tab.url || tab.pendingUrl || null)
  return (
    <Reorder.Item
      value={tab}
      id={tab.id}
      className="group no-drag relative flex h-8 cursor-default items-center gap-2 rounded-lg px-2 select-none"
      style={{
        background: isActive ? 'var(--surface-glass-strong)' : 'transparent',
        border: `1px solid ${isActive ? 'var(--border-glass)' : 'transparent'}`,
        color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
      }}
      whileHover={{ backgroundColor: isActive ? undefined : 'var(--surface-hover)' }}
      onClick={() => void invoke('tabs:activate', { tabId: tab.id })}
      data-testid="tab-item"
      data-tab-id={tab.id}
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

export function TabList(): React.JSX.Element {
  const tabs = useTabs((s) => s.tabs)
  const activeTabId = useTabs((s) => s.activeTabId)
  const setLocalOrder = useTabs((s) => s.setLocalOrder)

  return (
    <Reorder.Group
      axis="y"
      values={tabs}
      onReorder={(next: TabInfo[]) => {
        setLocalOrder(next)
        void invoke('tabs:reorder', { orderedIds: next.map((t) => t.id) })
      }}
      className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1"
      data-testid="tab-list"
    >
      {tabs.map((tab) => (
        <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
      ))}
    </Reorder.Group>
  )
}
