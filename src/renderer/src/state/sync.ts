import { useEffect } from 'react'
import type { RendererCommandId } from '@shared/ipc-contract'
import { matchCombo } from '@shared/keymap'
import type { SidebarMode } from '@shared/models'
import { invoke, on, isMac } from '@/lib/ipc'
import { useSettings } from './settings'
import { useTabs } from './tabs'
import { useUi } from './ui'

/**
 * ⌘S / "Toggle Sidebar": flips the persisted sidebar mode. Hover mode starts
 * hidden (the shortcut means "get it out of the way"); the settings panel
 * passes `revealed: true` because the pointer is inside the panel.
 */
export function setSidebarMode(mode: SidebarMode, opts: { revealed?: boolean } = {}): void {
  const ui = useUi.getState()
  const keepUp = mode === 'hover' && (opts.revealed ?? false)
  ui.setSidebarRevealed(keepUp)
  ui.setSidebarHoldLayout(keepUp)
  void useSettings.getState().update({ sidebarMode: mode })
}

function typingInSidebar(): boolean {
  const el = document.activeElement
  const typing =
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  return typing && !!el.closest('[data-testid="sidebar"]')
}

/**
 * Hover mode: a panel revealed by the keyboard (⌘L, ⌘J, ⌘,) has no pointer
 * inside it to leave, so it would stay up forever. Call this when such an
 * interaction ends (URL submitted or cancelled, popover closed): if nothing
 * else keeps the panel — pointer, popover, typing — let it go.
 */
export function releaseSidebarIfIdle(): void {
  const ui = useUi.getState()
  if (useSettings.getState().settings.sidebarMode !== 'hover' || !ui.sidebarRevealed) return
  if (ui.sidebarPointerInside || ui.downloadsOpen || ui.settingsOpen || ui.spaceEditor.open) return
  if (typingInSidebar()) return
  ui.setSidebarRevealed(false)
}

export function toggleSidebarMode(): void {
  const current = useSettings.getState().settings.sidebarMode
  setSidebarMode(current === 'fixed' ? 'hover' : 'fixed')
}

export function runRendererCommand(id: RendererCommandId): void {
  const ui = useUi.getState()
  switch (id) {
    case 'tab:new':
      ui.openPalette('new')
      break
    case 'url:focus':
      ui.requestUrlEdit()
      break
    case 'sidebar:toggle':
      toggleSidebarMode()
      break
    case 'find:open':
      ui.openFind()
      break
    case 'find:next':
    case 'find:prev':
      if (ui.findOpen && ui.findQuery) {
        void invoke('find:start', {
          text: ui.findQuery,
          findNext: true,
          forward: id === 'find:next',
        })
      }
      break
    case 'downloads:toggle':
      ui.toggleDownloads()
      break
    case 'space:new':
      ui.openSpaceEditor(null)
      break
    case 'settings:toggle':
      ui.toggleSettings()
      break
  }
}

/**
 * One mount-scoped subscription to everything the main process pushes, plus a
 * DOM fallback for renderer-scope shortcuts while the chrome itself has focus
 * (macOS handles these via the system menu; see main/menu.ts for the split).
 */
export function useIpcSync(): void {
  useEffect(() => {
    const { applySnapshot } = useTabs.getState()
    const ui = useUi.getState()
    const settings = useSettings.getState()

    void invoke('state:get', {}).then(applySnapshot)
    void invoke('downloads:list', {}).then(ui.setDownloads)
    void invoke('settings:get', {}).then(settings.apply)
    void invoke('updates:get', {}).then(ui.setUpdateState)

    const offs = [
      on('tabs:state', (snapshot) => {
        const before = useTabs.getState()
        applySnapshot(snapshot)
        // Hover sidebar: picking another tab means "show me that page" — let
        // the panel slide away so the live view returns. Closing a tab keeps
        // the panel (its neighbour activates) but drops the stale snapshot.
        const u = useUi.getState()
        const hoverUp = u.sidebarRevealed && useSettings.getState().settings.sidebarMode === 'hover'
        if (hoverUp && snapshot.activeTabId !== before.activeTabId) {
          const previousStillOpen = before.activeTabId
            ? snapshot.tabs.some((t) => t.id === before.activeTabId)
            : true
          if (previousStillOpen) u.setSidebarRevealed(false)
          else u.setPageSnapshot(null)
        } else if (hoverUp && snapshot.activeTabId) {
          // Same tab started navigating under the panel: the snapshot is now
          // a stale page. Drop it; and if nothing holds the panel, let it go so
          // the live page shows.
          const prevTab = before.tabs.find((t) => t.id === snapshot.activeTabId)
          const nextTab = snapshot.tabs.find((t) => t.id === snapshot.activeTabId)
          const navigated =
            !!prevTab &&
            !!nextTab &&
            (prevTab.url !== nextTab.url || (!prevTab.isLoading && nextTab.isLoading))
          if (navigated) {
            if (u.pageSnapshot) u.setPageSnapshot(null)
            releaseSidebarIfIdle()
          }
        }
      }),
      on('ui:command', ({ id }) => runRendererCommand(id)),
      on('find:result', (result) => useUi.getState().setFindResult(result)),
      on('permissions:request', (request) => useUi.getState().pushPermission(request)),
      on('downloads:changed', (list) => useUi.getState().setDownloads(list)),
      on('settings:changed', (next) => useSettings.getState().apply(next)),
      on('updates:state', (state) => useUi.getState().setUpdateState(state)),
    ]

    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = isMac() ? e.metaKey : e.ctrlKey
      if (!mod || e.altKey) return
      const command = matchCombo(e.key.toLowerCase(), e.shiftKey)
      if (command) {
        e.preventDefault()
        runRendererCommand(command)
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
