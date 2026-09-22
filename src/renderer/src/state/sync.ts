import { useEffect } from 'react'
import type { RendererCommandId } from '@shared/ipc-contract'
import { matchCombo } from '@shared/keymap'
import type { SidebarMode } from '@shared/models'
import { invoke, on, isMac } from '@/lib/ipc'
import { useApps, isAppEnabled } from './apps'
import { useReminders } from './reminders'
import { useTimesheet } from './timesheet'
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

/**
 * Start a note about whatever is on screen. Nothing is written yet: the note
 * reaches the database on the first keystroke, so pressing ⌘E and changing
 * your mind leaves nothing behind.
 */
export function captureNoteForActiveTab(): void {
  const { tabs, activeTabId } = useTabs.getState()
  const active = tabs.find((t) => t.id === activeTabId)
  useUi.getState().composeNote({
    url: active?.url || null,
    pageTitle: active?.title || null,
  })
}

/** Open Reminders with the page on screen already attached. */
export function remindAboutActiveTab(): void {
  const { tabs, activeTabId } = useTabs.getState()
  const active = tabs.find((t) => t.id === activeTabId)
  useUi.getState().composeReminder({
    url: active?.url || null,
    pageTitle: active?.title || null,
  })
}

export function runRendererCommand(id: RendererCommandId): void {
  const ui = useUi.getState()
  switch (id) {
    case 'tab:new':
      ui.openPalette('new')
      break
    case 'palette:command':
      ui.openPalette('command')
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
    case 'space:edit':
      ui.openSpaceEditor(useTabs.getState().activeSpaceId || null)
      break
    case 'settings:toggle':
      ui.toggleSettings()
      break
    case 'history:open':
      ui.toggleHistory()
      break
    case 'split:toggle':
      void invoke('tabs:toggleSplit', {})
      break
    case 'extensions:open':
      ui.toggleExtensions()
      break
    case 'apps:store':
      ui.toggleAppStore()
      break
    case 'notes:open':
      // A shortcut for an app that is off should do nothing rather than open
      // an empty panel: the Store is where an app gets turned on.
      if (isAppEnabled(useApps.getState().apps, 'notes')) ui.toggleNotes()
      break
    case 'notes:new':
      if (isAppEnabled(useApps.getState().apps, 'notes')) captureNoteForActiveTab()
      break
    case 'reminders:open':
      if (isAppEnabled(useApps.getState().apps, 'reminders')) ui.toggleReminders()
      break
    case 'reminders:new':
      if (isAppEnabled(useApps.getState().apps, 'reminders')) remindAboutActiveTab()
      break
    case 'timesheet:open':
      if (isAppEnabled(useApps.getState().apps, 'timesheet')) ui.toggleTimesheet()
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
    void invoke('apps:list', {}).then(useApps.getState().setApps)
    void invoke('reminders:list', {}).then(useReminders.getState().setReminders)
    void invoke('apps:getTimesheetConfig', {}).then(useTimesheet.getState().setConfig)
    // A question asked before this window was ready is still waiting.
    void invoke('timesheet:pending', {}).then(({ entry, question, lastAnswer }) => {
      if (entry) useTimesheet.getState().setPrompt({ entry, question, lastAnswer })
    })

    const offs = [
      on('tabs:state', applySnapshot),
      on('ui:command', ({ id }) => runRendererCommand(id)),
      on('find:result', (result) => useUi.getState().setFindResult(result)),
      on('permissions:request', (request) => useUi.getState().pushPermission(request)),
      on('downloads:changed', (list) => useUi.getState().setDownloads(list)),
      on('settings:changed', (next) => useSettings.getState().apply(next)),
      on('updates:state', (state) => useUi.getState().setUpdateState(state)),
      on('apps:changed', (apps) => useApps.getState().setApps(apps)),
      on('reminders:changed', (list) => useReminders.getState().setReminders(list)),
      on('reminders:due', (reminder) => useReminders.getState().raise(reminder)),
      on('timesheet:prompt', (prompt) => useTimesheet.getState().setPrompt(prompt)),
      on('timesheet:changed', () => {
        useTimesheet.getState().bump()
        // The schedule may be what changed.
        void invoke('apps:getTimesheetConfig', {}).then(useTimesheet.getState().setConfig)
      }),
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
