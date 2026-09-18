import { useEffect } from 'react'
import type { RendererCommandId } from '@shared/ipc-contract'
import { matchCombo } from '@shared/keymap'
import type { SidebarMode } from '@shared/models'
import { invoke, on, isMac } from '@/lib/ipc'
import { useSettings } from './settings'
import { useTabs } from './tabs'
import { useUi } from './ui'

/** ⌘S / "Toggle Sidebar": flips the persisted mode between full and compact. */
export function setSidebarMode(mode: SidebarMode): void {
  void useSettings.getState().update({ sidebarMode: mode })
}

export function toggleSidebarMode(): void {
  setSidebarMode(useSettings.getState().settings.sidebarMode === 'fixed' ? 'compact' : 'fixed')
}

export function runRendererCommand(id: RendererCommandId): void {
  const ui = useUi.getState()
  switch (id) {
    case 'tab:new':
      ui.openPalette('new')
      break
    case 'url:focus':
      // The compact rail has no address pill; the palette edits the URL there.
      if (useSettings.getState().settings.sidebarMode === 'compact') ui.openPalette('edit')
      else ui.requestUrlEdit()
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
    case 'history:open':
      ui.toggleHistory()
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
      on('tabs:state', applySnapshot),
      on('ui:command', ({ id }) => runRendererCommand(id)),
      on('find:result', (result) => useUi.getState().setFindResult(result)),
      on('permissions:request', (request) => useUi.getState().pushPermission(request)),
      on('downloads:changed', (list) => useUi.getState().setDownloads(list)),
      on('settings:changed', (next) => useSettings.getState().apply(next)),
      on('updates:state', (state) => useUi.getState().setUpdateState(state)),
      on('displayCapture:request', (request) => useUi.getState().setDisplayCapture(request)),
      on('displayCapture:close', ({ id }) => {
        if (useUi.getState().displayCapture?.id === id) useUi.getState().setDisplayCapture(null)
      }),
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
