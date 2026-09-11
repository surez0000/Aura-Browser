import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { RendererCommandId } from '@shared/ipc-contract'
import { KEYMAP, type KeyCommand } from './services/shortcuts'
import type { TabManager } from './tabs/tab-manager'
import { isDev } from './env'

interface MenuContext {
  manager: TabManager
  getWindow: () => BrowserWindow | null
  sendCommand: (id: RendererCommandId) => void
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

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        rendererItem('tab:new'),
        rendererItem('url:focus'),
        { type: 'separator' },
        mainItem('tab:close', () => {
          if (m.closeActive() === 'empty') ctx.getWindow()?.close()
        }),
        mainItem('tab:reopen', () => m.reopenClosed()),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        mainItem('nav:reload', () => m.get(undefined)?.reload()),
        mainItem('nav:hardReload', () => m.get(undefined)?.reload(true)),
        { type: 'separator' },
        mainItem('zoom:in', () => m.zoom(undefined, 'in')),
        mainItem('zoom:out', () => m.zoom(undefined, 'out')),
        mainItem('zoom:reset', () => m.zoom(undefined, 'reset')),
        { type: 'separator' },
        rendererItem('sidebar:toggle'),
        { type: 'separator' },
        mainItem('tab:devtools', () => m.get(undefined)?.openDevTools()),
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
        mainItem('nav:back', () => m.get(undefined)?.goBack()),
        mainItem('nav:forward', () => m.get(undefined)?.goForward()),
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
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
