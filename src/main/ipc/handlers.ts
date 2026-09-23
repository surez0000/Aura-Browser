import type { BrowserWindow } from 'electron'
import type { AuroraSettings } from '@shared/models'
import type { TabManager } from '../tabs/tab-manager'
import type { HistoryStore } from '../services/db/history'
import type { ArchiveStore } from '../services/db/archive'
import type { DownloadsService } from '../services/downloads'
import type { PermissionService } from '../services/permissions'
import type { DisplayCaptureService } from '../services/display-capture'
import type { MiniWindowService } from '../windows/mini-window'
import type { UpdaterService } from '../services/updater'
import type { AppRegistry } from '../apps/registry'
import type { NotesStore } from '../services/db/notes'
import type { RemindersStore } from '../services/db/reminders'
import type { TimesheetStore } from '../services/db/timesheet'
import type { AppScheduler } from '../apps/scheduler'
import { startOfDay } from '@shared/schedule'
import { handleInvoke } from './router'

interface HandlerContext {
  manager: TabManager
  history: HistoryStore
  archive: ArchiveStore
  downloads: DownloadsService
  permissions: PermissionService
  displayCapture: DisplayCaptureService
  miniWindows: MiniWindowService
  updater: UpdaterService
  apps: AppRegistry
  notes: NotesStore
  notesChanged: () => void
  reminders: RemindersStore
  remindersChanged: () => void
  timesheet: TimesheetStore
  timesheetChanged: () => void
  scheduler: AppScheduler
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
  handleInvoke('history:list', (req) =>
    ctx.history.list({ query: req.query, before: req.before, limit: req.limit }),
  )
  handleInvoke('history:delete', (req) =>
    req.url ? ctx.history.deleteUrl(req.url) : ctx.history.deleteEntries(req.ids ?? []),
  )
  handleInvoke('history:clear', (req) => ctx.history.clear(req.since))

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

  handleInvoke('apps:list', () => ctx.apps.list())
  handleInvoke('apps:setEnabled', (req) => ctx.apps.setEnabled(req.id, req.enabled))
  handleInvoke('apps:setPinned', (req) => ctx.apps.setPinned(req.id, req.pinned))

  handleInvoke('notes:list', (req) => ctx.notes.list(req.limit))
  handleInvoke('notes:search', (req) => ctx.notes.search(req.query, req.limit))
  handleInvoke('notes:create', (req) => {
    const note = ctx.notes.create(req)
    ctx.notesChanged()
    return note
  })
  handleInvoke('notes:update', (req) => {
    const note = ctx.notes.update(req.id, req.body)
    ctx.notesChanged()
    return note
  })
  handleInvoke('notes:delete', (req) => {
    ctx.notes.remove(req.id)
    ctx.notesChanged()
  })
  handleInvoke('notes:setColor', (req) => {
    const note = ctx.notes.setColor(req.id, req.color)
    ctx.notesChanged()
    return note
  })
  handleInvoke('notes:setPinned', (req) => {
    const note = ctx.notes.setPinned(req.id, req.pinned)
    ctx.notesChanged()
    return note
  })

  handleInvoke('apps:getTimesheetConfig', () => ctx.apps.timesheetConfig())
  handleInvoke('apps:setTimesheetConfig', (req) => {
    const cfg = ctx.apps.setTimesheetConfig(req)
    // Every view of the schedule follows, and a changed schedule may be due already.
    ctx.timesheetChanged()
    ctx.scheduler.tick()
    return cfg
  })

  handleInvoke('reminders:list', () => ctx.reminders.list())
  handleInvoke('reminders:create', (req) => {
    const r = ctx.reminders.create(req)
    ctx.remindersChanged()
    ctx.scheduler.tick()
    return r
  })
  handleInvoke('reminders:update', (req) => {
    const r = ctx.reminders.update(req.id, req)
    ctx.remindersChanged()
    return r
  })
  handleInvoke('reminders:complete', (req) => {
    const r = ctx.reminders.complete(req.id)
    ctx.remindersChanged()
    return r
  })
  handleInvoke('reminders:snooze', (req) => {
    const r = ctx.reminders.snooze(req.id, Date.now() + req.minutes * 60_000)
    ctx.remindersChanged()
    return r
  })
  handleInvoke('reminders:delete', (req) => {
    ctx.reminders.remove(req.id)
    ctx.remindersChanged()
  })
  handleInvoke('reminders:clearDone', () => {
    const n = ctx.reminders.clearDone()
    ctx.remindersChanged()
    return n
  })

  handleInvoke('timesheet:pending', () => ({
    entry: ctx.timesheet.pending(),
    question: ctx.apps.timesheetConfig().question,
    lastAnswer: ctx.timesheet.lastAnswer(),
  }))
  handleInvoke('timesheet:answer', (req) => {
    const e = ctx.timesheet.answer(req.id, req.answer)
    ctx.timesheetChanged()
    return e
  })
  handleInvoke('timesheet:skip', (req) => {
    const e = ctx.timesheet.skip(req.id)
    ctx.timesheetChanged()
    return e
  })
  handleInvoke('timesheet:day', (req) => {
    const from = startOfDay(req.day)
    return ctx.timesheet.between(from, from + 86_400_000)
  })
  handleInvoke('timesheet:deleteEntry', (req) => {
    ctx.timesheet.remove(req.id)
    ctx.timesheetChanged()
  })

  handleInvoke('ui:setPaneBounds', (req) => manager.setPaneBounds(req.panes))
  handleInvoke('tabs:split', (req) => manager.split(req.tabId))
  handleInvoke('tabs:toggleSplit', () => manager.toggleSplit())
  handleInvoke('tabs:closePane', (req) => manager.closePane(req.tabId))
  handleInvoke('tabs:focusPane', (req) => manager.focusPane(req.tabId))
  handleInvoke('tabs:setPaneRatios', (req) => manager.setPaneRatios(req.ratios))
  handleInvoke('ui:setPeekBounds', (req) => manager.setPeekBounds(req.rect))
  handleInvoke('peek:close', () => manager.closePeek())
  handleInvoke('peek:promote', () => manager.promotePeek())

  handleInvoke('mini:setBounds', (req, event) =>
    ctx.miniWindows.forSender(event.sender)?.setBounds(req.rect),
  )
  handleInvoke(
    'mini:get',
    (_req, event) => ctx.miniWindows.forSender(event.sender)?.state() ?? null,
  )
  handleInvoke('mini:back', (_req, event) => ctx.miniWindows.forSender(event.sender)?.goBack())
  handleInvoke('mini:close', (_req, event) => ctx.miniWindows.forSender(event.sender)?.close())
  handleInvoke('mini:promote', (_req, event) => ctx.miniWindows.promote(event.sender))
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
