import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { RendererCommandId } from '@shared/ipc-contract'
import { KEYMAP, type KeyCommand } from '@shared/keymap'
import type { TabManager } from './tabs/tab-manager'
import { isDev } from './env'

interface MenuContext {
  manager: TabManager
  getWindow: () => BrowserWindow | null
  sendCommand: (id: RendererCommandId) => void
  checkForUpdates: () => void
}

function mustKey(id: string): KeyCommand {
  const k = KEYMAP.find((cmd) => cmd.id === id)
  if (!k) throw new Error(`menu: unknown keymap id "${id}"`)
  return k
}

export function installMenu(ctx: MenuContext): void {
  const m = ctx.manager

  const mainItem = (id: string, click: () => void): MenuItemConstructorOptions => {
    const k = mustKey(id)
    return { label: k.label, accelerator: k.accelerator, click }
  }

  // Renderer-scope shortcuts: shown in the menu, but on Windows/Linux the
  // accelerator is not registered (registerAccelerator: false) — the chrome's
  // DOM keydown handler and the tabs' before-input-event hook own the combo.
  // On macOS AppKit dispatches menu key equivalents before any web contents
  // sees them, so there is exactly one handler on every platform.
  const rendererItem = (id: string): MenuItemConstructorOptions => {
    const k = mustKey(id)
    return {
      label: k.label,
      accelerator: k.accelerator,
      registerAccelerator: false,
      click: () => {
        if (k.rendererCommand) ctx.sendCommand(k.rendererCommand)
      },
    }
  }

  const tabPickItems: MenuItemConstructorOptions[] = []
  for (let i = 1; i <= 8; i++) {
    tabPickItems.push({
      label: `Tab ${i}`,
      accelerator: `CommandOrControl+${i}`,
      click: () => m.activateAt(i - 1),
    })
  }
  tabPickItems.push({
    label: 'Last Tab',
    accelerator: 'CommandOrControl+9',
    click: () => m.activateAt(Number.MAX_SAFE_INTEGER, true),
  })

  // One entry per Space that actually exists — the menu used to list nine
  // slots whether or not anything was in them. ⌃1…9 still reach the first nine.
  const activeSpaceId = m.activeSpace()?.id
  const spacePickItems: MenuItemConstructorOptions[] = m.spaceList().map((space, index) => ({
    label: space.name,
    type: 'checkbox' as const,
    checked: space.id === activeSpaceId,
    ...(index < 9 ? { accelerator: `Control+${index + 1}` } : {}),
    click: () => m.activateSpace(space.id),
  }))

  const checkForUpdates: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => ctx.checkForUpdates(),
  }
  const appMenu: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        checkForUpdates,
        { type: 'separator' },
        rendererItem('settings:toggle'),
        rendererItem('extensions:open'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ]
  const helpMenu: MenuItemConstructorOptions[] = [
    { label: 'Help', submenu: [checkForUpdates, { role: 'about' }] },
  ]

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? appMenu : []),
    {
      label: 'File',
      submenu: [
        rendererItem('tab:new'),
        mainItem('tab:incognito', () => {
          m.openIncognito()
          ctx.sendCommand('tab:new')
        }),
        rendererItem('url:focus'),
        { type: 'separator' },
        mainItem('favorite:toggle', () => m.toggleFavoriteForActiveTab()),
        { type: 'separator' },
        mainItem('tab:close', () => {
          if (m.closeActive() === 'empty' && m.count() === 0) ctx.getWindow()?.close()
        }),
        mainItem('tab:reopen', () => m.reopenClosed()),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        mainItem('nav:reload', () => m.getTab(undefined)?.reload()),
        mainItem('nav:hardReload', () => m.getTab(undefined)?.reload(true)),
        { type: 'separator' },
        rendererItem('find:open'),
        rendererItem('find:next'),
        rendererItem('find:prev'),
        { type: 'separator' },
        mainItem('zoom:in', () => m.zoom(undefined, 'in')),
        mainItem('zoom:out', () => m.zoom(undefined, 'out')),
        mainItem('zoom:reset', () => m.zoom(undefined, 'reset')),
        { type: 'separator' },
        rendererItem('palette:command'),
        { type: 'separator' },
        rendererItem('split:toggle'),
        { type: 'separator' },
        rendererItem('sidebar:toggle'),
        rendererItem('downloads:toggle'),
        ...(process.platform === 'darwin' ? [] : [rendererItem('settings:toggle')]),
        { type: 'separator' },
        mainItem('tab:devtools', () => m.getTab(undefined)?.openDevTools()),
        ...(isDev
          ? [
              {
                label: 'Chrome UI DevTools',
                accelerator: 'CommandOrControl+Alt+Shift+I',
                click: () => ctx.getWindow()?.webContents.openDevTools({ mode: 'detach' }),
              },
            ]
          : []),
      ],
    },
    {
      label: 'History',
      submenu: [
        mainItem('nav:back', () => m.getTab(undefined)?.goBack()),
        mainItem('nav:forward', () => m.getTab(undefined)?.goForward()),
        { type: 'separator' },
        rendererItem('history:open'),
      ],
    },
    {
      label: 'Spaces',
      submenu: [
        rendererItem('space:new'),
        rendererItem('space:edit'),
        {
          label: 'Archive Today Tabs',
          click: () => m.archiveToday({ spaceId: m.activeSpace()?.id }),
        },
        { type: 'separator' },
        ...spacePickItems,
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(process.platform === 'darwin' ? [{ role: 'zoom' as const }] : []),
        { type: 'separator' },
        mainItem('tab:next', () => m.activateRelative(1)),
        mainItem('tab:prev', () => m.activateRelative(-1)),
        { type: 'separator' },
        ...tabPickItems,
      ],
    },
    ...(process.platform === 'darwin' ? [] : helpMenu),
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
