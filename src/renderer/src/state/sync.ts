import { useEffect } from 'react'
import type { RendererCommandId } from '@shared/ipc-contract'
import { matchCombo } from '@shared/keymap'
import { invoke, on, isMac } from '@/lib/ipc'
import { useTabs } from './tabs'
import { useUi } from './ui'

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
      ui.toggleSidebar()
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

    void invoke('state:get', {}).then(applySnapshot)
    void invoke('downloads:list', {}).then(ui.setDownloads)

    const offs = [
      on('tabs:state', applySnapshot),
      on('ui:command', ({ id }) => runRendererCommand(id)),
      on('find:result', (result) => useUi.getState().setFindResult(result)),
      on('permissions:request', (request) => useUi.getState().pushPermission(request)),
      on('downloads:changed', (list) => useUi.getState().setDownloads(list)),
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
