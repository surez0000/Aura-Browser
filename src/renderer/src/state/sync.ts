import { useEffect } from 'react'
import { invoke, on, isMac } from '@/lib/ipc'
import { useTabs } from './tabs'
import { useUi } from './ui'

/**
 * One mount-scoped subscription to everything the main process pushes, plus a
 * DOM fallback for renderer-scope shortcuts while the chrome itself has focus
 * (macOS handles these via the system menu; see main/menu.ts for the split).
 */
export function useIpcSync(): void {
  useEffect(() => {
    const { applySnapshot, setFavorites } = useTabs.getState()

    void invoke('state:get', {}).then(applySnapshot)
    void invoke('favorites:list', {}).then(setFavorites)

    const offs = [
      on('tabs:state', applySnapshot),
      on('favorites:changed', setFavorites),
      on('ui:command', ({ id }) => {
        const ui = useUi.getState()
        if (id === 'tab:new') ui.openPalette('new')
        else if (id === 'url:focus') ui.requestUrlEdit()
        else if (id === 'sidebar:toggle') ui.toggleSidebar()
      }),
    ]

    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = isMac() ? e.metaKey : e.ctrlKey
      if (!mod || e.altKey || e.shiftKey) return
      const ui = useUi.getState()
      const key = e.key.toLowerCase()
      if (key === 't') {
        e.preventDefault()
        ui.openPalette('new')
      } else if (key === 'l') {
        e.preventDefault()
        ui.requestUrlEdit()
      } else if (key === 's') {
        e.preventDefault()
        ui.toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
