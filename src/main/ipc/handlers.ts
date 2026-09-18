import type { BrowserWindow } from 'electron'
import type { AuroraSettings } from '@shared/models'
import type { TabManager } from '../tabs/tab-manager'
import type { HistoryStore } from '../services/db/history'
import type { ArchiveStore } from '../services/db/archive'
import type { DownloadsService } from '../services/downloads'
import type { PermissionService } from '../services/permissions'
import type { DisplayCaptureService } from '../services/display-capture'
import type { UpdaterService } from '../services/updater'
import { handleInvoke } from './router'

interface HandlerContext {
  manager: TabManager
  history: HistoryStore
  archive: ArchiveStore
  downloads: DownloadsService
  permissions: PermissionService
  displayCapture: DisplayCaptureService
  updater: UpdaterService
  getSettings: () => AuroraSettings
  setSettings: (patch: Partial<AuroraSettings>) => AuroraSettings
  win: BrowserWindow
}

export function registerIpcHandlers(ctx: HandlerContext): void {
  const { manager, win } = ctx

  handleInvoke('tabs:create', (req) => ({
    id: manager.create({
      url: req.url,
      activate: req.activate,
      spaceId: req.spaceId,
      kind: req.kind,
    }).id,
  }))
  handleInvoke('tabs:close', (req) => manager.close(req.tabId))
  handleInvoke('tabs:activate', (req) => manager.setActiveTab(req.tabId))
  handleInvoke('tabs:reorder', (req) => manager.reorder(req.orderedIds))
  handleInvoke('tabs:navigate', (req) => manager.navigate(req.tabId, req.url))
  handleInvoke('tabs:back', (req) => manager.getTab(req.tabId)?.goBack())
  handleInvoke('tabs:forward', (req) => manager.getTab(req.tabId)?.goForward())
  handleInvoke('tabs:reload', (req) => manager.getTab(req.tabId)?.reload(req.hard ?? false))
  handleInvoke('tabs:stop', (req) => manager.getTab(req.tabId)?.stop())
  handleInvoke('tabs:reopenClosed', () => manager.reopenClosed())
  handleInvoke('tabs:zoom', (req) => manager.zoom(req.tabId, req.direction))
  handleInvoke('tabs:openDevTools', (req) => manager.getTab(req.tabId)?.openDevTools())
  handleInvoke('tabs:setKind', (req) => manager.setKind(req.tabId, req.kind))
  handleInvoke('tabs:moveToSpace', (req) => manager.moveToSpace(req.tabId, req.spaceId))
  handleInvoke('tabs:archiveToday', () =>
    manager.archiveToday({ spaceId: manager.activeSpace()?.id }),
  )
  handleInvoke('tabs:contextMenu', (req) => manager.showTabContextMenu(req.tabId))

  handleInvoke('spaces:create', (req) => ({
    id: manager.createSpace({
      name: req.name,
      accentHue: req.accentHue,
      accentHue2: req.accentHue2,
      activate: req.activate,
    }).id,
  }))
  handleInvoke('spaces:rename', (req) => manager.renameSpace(req.spaceId, req.name))
  handleInvoke('spaces:setAccent', (req) =>
    manager.setSpaceAccent(req.spaceId, req.accentHue, req.accentHue2),
  )
  handleInvoke('spaces:remove', (req) => manager.removeSpace(req.spaceId))
  handleInvoke('spaces:activate', (req) => manager.activateSpace(req.spaceId))
  handleInvoke('spaces:openIncognito', () => ({ id: manager.openIncognito().id }))

  handleInvoke('favorites:add', (req) => manager.addFavorite(req))
  handleInvoke('favorites:remove', (req) => manager.removeFavorite(req.url))

  handleInvoke('history:search', (req) => ctx.history.search(req.query, req.limit ?? 8))
  handleInvoke('archive:search', (req) => ctx.archive.search(req.query, req.limit ?? 10))

  handleInvoke('find:start', (req) =>
    manager.findStart(req.text, { forward: req.forward, findNext: req.findNext }),
  )
  handleInvoke('find:stop', () => manager.findStop())

  handleInvoke('permissions:respond', (req) =>
    ctx.permissions.respond(req.id, req.allow, req.remember),
  )
  handleInvoke('permissions:clearStored', () => ctx.permissions.clearStored())

  handleInvoke('displayCapture:respond', (req) =>
    ctx.displayCapture.respond(req.id, req.sourceId, req.withAudio ?? false),
  )
  handleInvoke('displayCapture:openSystemSettings', () => ctx.displayCapture.openSystemSettings())

  handleInvoke('downloads:list', () => ctx.downloads.list())
  handleInvoke('downloads:action', (req) => ctx.downloads.action(req.id, req.action))

  handleInvoke('settings:get', () => ctx.getSettings())
  handleInvoke('settings:set', (req) => ctx.setSettings(req))

  handleInvoke('updates:get', () => ctx.updater.get())
  handleInvoke('updates:check', () => ctx.updater.check())
  handleInvoke('updates:install', () => ctx.updater.install())
  handleInvoke('updates:openReleases', () => ctx.updater.openReleases())

  handleInvoke('ui:setPageBounds', (req) => manager.setPageBounds(req))
  handleInvoke('ui:overlay', (req) => manager.setOverlayShown(req.shown, req.phase))

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
}
