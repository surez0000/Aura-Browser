import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AppWindow, Archive, Clock3, Globe, Search, Star, Zap } from 'lucide-react'
import type { ArchivedTabRow, HistorySearchRow } from '@shared/models'
import { searchEngine, type SearchEngineId } from '@shared/search'
import type { SidebarMode } from '@shared/models'
import { invoke } from '@/lib/ipc'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'
import { selectSearchEngine, useSettings } from '@/state/settings'
import { setSidebarMode, toggleSidebarMode } from '@/state/sync'
import { buildActions, composePalette, type PaletteItem, type PaletteItemType } from '@/lib/palette'
import { useTabs, selectActiveTab } from '@/state/tabs'
import { useUi } from '@/state/ui'

const TYPE_ICONS: Record<PaletteItemType, React.ComponentType<{ size?: number | string }>> = {
  tab: AppWindow,
  favorite: Star,
  history: Clock3,
  archived: Archive,
  action: Zap,
  url: Globe,
  search: Search,
}

/**
 * The command palette (⌘T / ⌘L): fuzzy search across open tabs, favorites,
 * history, archived tabs, actions, plus URL/web-search fallbacks.
 *
 * While open, the main process detaches the page's native view (which would
 * otherwise composite *above* this overlay) and hands us a snapshot that
 * PageCard paints in its place.
 */
export function Palette(): React.JSX.Element {
  const open = useUi((s) => s.paletteOpen)
  const mode = useUi((s) => s.paletteMode)
  const close = useUi((s) => s.closePalette)
  const active = useTabs(selectActiveTab)
  const tabs = useTabs((s) => s.tabs)
  const spaces = useTabs((s) => s.spaces)
  const activeSpaceId = useTabs((s) => s.activeSpaceId)
  const engine = useSettings(selectSearchEngine)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState('')
  const [selected, setSelected] = useState(0)
  const [history, setHistory] = useState<HistorySearchRow[]>([])
  const [archived, setArchived] = useState<ArchivedTabRow[]>([])

  // Seed the input when the palette transitions closed -> open (render-time
  // state adjustment; no effect needed).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValue(mode === 'edit' ? (active?.url ?? active?.pendingUrl ?? '') : '')
      setSelected(0)
    }
  }

  // Reset the selection whenever the query changes.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setSelected(0)
  }

  useEffect(() => {
    if (!open) return
    void holdOverlay('palette')
    return () => releaseOverlay('palette')
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Async sources (SQLite) — debounced, ignoring stale responses.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(() => {
      void invoke('history:search', { query: value, limit: 8 }).then((rows) => {
        if (!cancelled) setHistory(rows)
      })
      void invoke('archive:search', { query: value, limit: 6 }).then((rows) => {
        if (!cancelled) setArchived(value.trim() ? rows : [])
      })
    }, 80)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, value])

  const items = composePalette({
    query: value,
    mode,
    tabs,
    spaces,
    activeSpaceId,
    history,
    archived,
    actions: buildActions({ spaces, activeSpaceId, activeTab: active }),
    searchEngine: engine,
  })
  const selectedIndex = Math.min(selected, Math.max(0, items.length - 1))

  const openUrl = (url: string): void => {
    if (mode === 'edit' && active) {
      void invoke('tabs:navigate', { tabId: active.id, url })
    } else {
      void invoke('tabs:create', { url, activate: true })
    }
  }

  const runAction = (actionId: string): void => {
    const ui = useUi.getState()
    if (actionId.startsWith('space:switch:')) {
      void invoke('spaces:activate', { spaceId: actionId.slice('space:switch:'.length) })
      return
    }
    if (actionId.startsWith('tab:move:')) {
      if (active) {
        void invoke('tabs:moveToSpace', {
          tabId: active.id,
          spaceId: actionId.slice('tab:move:'.length),
        })
      }
      return
    }
    if (actionId.startsWith('archive:set:')) {
      void invoke('settings:set', {
        todayArchiveHours: Number(actionId.slice('archive:set:'.length)),
      })
      return
    }
    if (actionId.startsWith('search:set:')) {
      void useSettings
        .getState()
        .update({ searchEngine: actionId.slice('search:set:'.length) as SearchEngineId })
      return
    }
    if (actionId.startsWith('sidebar:set:')) {
      setSidebarMode(actionId.slice('sidebar:set:'.length) as SidebarMode)
      return
    }
    if (actionId.startsWith('theme:set:')) {
      void invoke('settings:set', {
        theme: actionId.slice('theme:set:'.length) as 'system' | 'light' | 'dark',
      })
      return
    }
    switch (actionId) {
      case 'space:new':
        ui.openSpaceEditor(null)
        break
      case 'settings:open':
        ui.toggleSettings()
        break
      case 'updates:check':
        void invoke('updates:check', {})
        break
      case 'incognito':
        void invoke('spaces:openIncognito', {}).then(() => ui.openPalette('new'))
        break
      case 'sidebar:toggle':
        toggleSidebarMode()
        break
      case 'find:open':
        ui.openFind()
        break
      case 'downloads:toggle':
        ui.toggleDownloads()
        break
      case 'tab:reopen':
        void invoke('tabs:reopenClosed', {})
        break
      case 'today:archive':
        void invoke('tabs:archiveToday', {})
        break
      case 'permissions:clear':
        void invoke('permissions:clearStored', {})
        break
      case 'zoom:in':
      case 'zoom:out':
        void invoke('tabs:zoom', { direction: actionId === 'zoom:in' ? 'in' : 'out' })
        break
      case 'zoom:reset':
        void invoke('tabs:zoom', { direction: 'reset' })
        break
      case 'devtools':
        void invoke('tabs:openDevTools', {})
        break
      case 'tab:togglePin':
        if (active) {
          void invoke('tabs:setKind', {
            tabId: active.id,
            kind: active.kind === 'pinned' ? 'today' : 'pinned',
          })
        }
        break
      case 'url:copy':
        if (active) void navigator.clipboard.writeText(active.url || active.pendingUrl || '')
        break
    }
  }

  const run = (item: PaletteItem | undefined): void => {
    close()
    if (!item) return
    if (item.type === 'tab' && item.payload.tabId) {
      void invoke('tabs:activate', { tabId: item.payload.tabId })
    } else if (item.type === 'action' && item.payload.actionId) {
      runAction(item.payload.actionId)
    } else if (item.payload.url) {
      openUrl(item.payload.url)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-start justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          data-testid="palette"
        >
          <div
            className="absolute inset-0"
            style={{ background: 'var(--scrim)' }}
            onClick={close}
          />
          <motion.div
            className="dialog relative mt-[14vh] w-[min(640px,88vw)] rounded-2xl p-2 shadow-2xl"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Search size={18} style={{ color: 'var(--ink-3)' }} />
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    run(items[selectedIndex])
                  } else if (e.key === 'Escape') {
                    close()
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelected((i) => (items.length ? (i + 1) % items.length : 0))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelected((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
                  }
                }}
                placeholder="Search tabs, history, actions — or enter a URL…"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="w-full bg-transparent text-[15px] outline-none"
                style={{ color: 'var(--ink-1)' }}
                data-testid="palette-input"
              />
            </div>

            {items.length > 0 && (
              <ul
                className="max-h-[46vh] overflow-y-auto border-t px-1 py-1"
                style={{ borderColor: 'var(--border-glass)' }}
                data-testid="palette-results"
              >
                {items.map((item, index) => {
                  const Icon = TYPE_ICONS[item.type]
                  const isSelected = index === selectedIndex
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left"
                        style={{
                          background: isSelected ? 'var(--surface-glass-strong)' : 'transparent',
                          color: 'var(--ink-1)',
                        }}
                        onMouseEnter={() => setSelected(index)}
                        onClick={() => run(item)}
                        data-testid="palette-result"
                        data-type={item.type}
                        aria-selected={isSelected}
                      >
                        <Icon size={15} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px]">{item.title}</span>
                          {item.subtitle && (
                            <span
                              className="block truncate text-[11.5px]"
                              style={{ color: 'var(--ink-3)' }}
                            >
                              {item.subtitle}
                            </span>
                          )}
                        </span>
                        {item.hint && (
                          <span className="shrink-0 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                            {item.hint}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div
              className="flex items-center gap-3 border-t px-3 pt-2 pb-1 text-[11px]"
              style={{ borderColor: 'var(--border-glass)', color: 'var(--ink-3)' }}
            >
              <span>↑↓ Navigate</span>
              <span>↵ Open</span>
              <span>esc Close</span>
              <span className="ml-auto">Searches {searchEngine(engine).name}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
