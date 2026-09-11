import type { BrowserWindow } from 'electron'
import type { TabManager } from '../tabs/tab-manager'
import type { FavoritesService } from '../services/favorites'
import { handleInvoke } from './router'

interface HandlerContext {
  manager: TabManager
  favorites: FavoritesService
  win: BrowserWindow
}

export function registerIpcHandlers({ manager, favorites, win }: HandlerContext): void {
  handleInvoke('tabs:create', (req) => ({
    id: manager.create({ url: req.url, activate: req.activate }).id,
  }))
  handleInvoke('tabs:close', (req) => manager.close(req.tabId))
  handleInvoke('tabs:activate', (req) => manager.setActive(req.tabId))
  handleInvoke('tabs:reorder', (req) => manager.reorder(req.orderedIds))
  handleInvoke('tabs:navigate', (req) => manager.navigate(req.tabId, req.url))
  handleInvoke('tabs:back', (req) => manager.get(req.tabId)?.goBack())
  handleInvoke('tabs:forward', (req) => manager.get(req.tabId)?.goForward())
  handleInvoke('tabs:reload', (req) => manager.get(req.tabId)?.reload(req.hard ?? false))
  handleInvoke('tabs:stop', (req) => manager.get(req.tabId)?.stop())
  handleInvoke('tabs:reopenClosed', () => manager.reopenClosed())
  handleInvoke('tabs:zoom', (req) => manager.zoom(req.tabId, req.direction))
  handleInvoke('tabs:openDevTools', (req) => manager.get(req.tabId)?.openDevTools())

  handleInvoke('ui:setPageBounds', (req) => manager.setPageBounds(req))
  handleInvoke('ui:overlay', (req) => manager.setOverlayShown(req.shown))

  handleInvoke('window:control', (req) => {
    switch (req.action) {
      case 'minimize':
        win.minimize()
        break
      case 'maximize':
        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
        break
      case 'close':
        win.close()
        break
    }
  })

  handleInvoke('state:get', () => manager.snapshot())

  handleInvoke('favorites:list', () => favorites.list())
  handleInvoke('favorites:add', (req) => favorites.add(req))
  handleInvoke('favorites:remove', (req) => favorites.remove(req.url))
}
