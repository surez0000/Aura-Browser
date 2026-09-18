import type { RendererCommandId } from './ipc-contract'

/**
 * Single source of truth for the keymap (Arc-style defaults). Pure data — no
 * Electron imports — shared by the main-process menu, the chrome renderer's
 * DOM fallback, and unit tests.
 *
 * scope 'main'     — handled in the main process (menu accelerator).
 * scope 'renderer' — handled by the chrome renderer. The menu shows the
 *                    shortcut but does not register it on Windows/Linux
 *                    (registerAccelerator: false); a DOM keydown handler covers
 *                    chrome focus and a before-input-event hook on each tab
 *                    covers page focus, so the combo works everywhere without
 *                    double-firing (macOS dispatches menu key equivalents
 *                    before any web contents sees them).
 */
export interface KeyCommand {
  id: string
  label: string
  /** Electron accelerator; omitted = menu item without a shortcut. */
  accelerator?: string
  scope: 'main' | 'renderer'
  /** Only present for renderer-scope commands. */
  rendererCommand?: RendererCommandId
}

export const KEYMAP: readonly KeyCommand[] = [
  {
    id: 'tab:new',
    label: 'New Tab…',
    accelerator: 'CommandOrControl+T',
    scope: 'renderer',
    rendererCommand: 'tab:new',
  },
  {
    id: 'url:focus',
    label: 'Focus Address',
    accelerator: 'CommandOrControl+L',
    scope: 'renderer',
    rendererCommand: 'url:focus',
  },
  {
    id: 'sidebar:toggle',
    label: 'Toggle Sidebar',
    accelerator: 'CommandOrControl+S',
    scope: 'renderer',
    rendererCommand: 'sidebar:toggle',
  },
  {
    id: 'find:open',
    label: 'Find in Page…',
    accelerator: 'CommandOrControl+F',
    scope: 'renderer',
    rendererCommand: 'find:open',
  },
  {
    id: 'find:next',
    label: 'Find Next',
    accelerator: 'CommandOrControl+G',
    scope: 'renderer',
    rendererCommand: 'find:next',
  },
  {
    id: 'find:prev',
    label: 'Find Previous',
    accelerator: 'Shift+CommandOrControl+G',
    scope: 'renderer',
    rendererCommand: 'find:prev',
  },
  {
    id: 'downloads:toggle',
    label: 'Downloads',
    accelerator: 'CommandOrControl+J',
    scope: 'renderer',
    rendererCommand: 'downloads:toggle',
  },
  {
    id: 'space:new',
    label: 'New Space…',
    scope: 'renderer',
    rendererCommand: 'space:new',
  },
  {
    id: 'split:toggle',
    label: 'Split View',
    accelerator: 'CommandOrControl+\\',
    scope: 'renderer',
    rendererCommand: 'split:toggle',
  },
  {
    id: 'palette:command',
    label: 'Command Palette…',
    accelerator: 'CommandOrControl+Shift+P',
    scope: 'renderer',
    rendererCommand: 'palette:command',
  },
  {
    id: 'history:open',
    label: 'Show Full History',
    accelerator: 'CommandOrControl+Y',
    scope: 'renderer',
    rendererCommand: 'history:open',
  },
  {
    id: 'space:edit',
    label: 'Edit Space…',
    scope: 'renderer',
    rendererCommand: 'space:edit',
  },
  {
    id: 'extensions:open',
    label: 'Extensions…',
    scope: 'renderer',
    rendererCommand: 'extensions:open',
  },
  {
    id: 'settings:toggle',
    label: 'Settings…',
    accelerator: 'CommandOrControl+,',
    scope: 'renderer',
    rendererCommand: 'settings:toggle',
  },
  {
    id: 'tab:incognito',
    label: 'New Incognito Tab',
    accelerator: 'Shift+CommandOrControl+N',
    scope: 'main',
  },
  {
    id: 'favorite:toggle',
    label: 'Toggle Favorite',
    accelerator: 'CommandOrControl+D',
    scope: 'main',
  },
  { id: 'tab:close', label: 'Close Tab', accelerator: 'CommandOrControl+W', scope: 'main' },
  {
    id: 'tab:reopen',
    label: 'Reopen Closed Tab',
    accelerator: 'Shift+CommandOrControl+T',
    scope: 'main',
  },
  { id: 'nav:reload', label: 'Reload', accelerator: 'CommandOrControl+R', scope: 'main' },
  {
    id: 'nav:hardReload',
    label: 'Hard Reload',
    accelerator: 'Shift+CommandOrControl+R',
    scope: 'main',
  },
  { id: 'nav:back', label: 'Back', accelerator: 'CommandOrControl+[', scope: 'main' },
  { id: 'nav:forward', label: 'Forward', accelerator: 'CommandOrControl+]', scope: 'main' },
  { id: 'tab:next', label: 'Next Tab', accelerator: 'Control+Tab', scope: 'main' },
  { id: 'tab:prev', label: 'Previous Tab', accelerator: 'Control+Shift+Tab', scope: 'main' },
  { id: 'zoom:in', label: 'Zoom In', accelerator: 'CommandOrControl+=', scope: 'main' },
  { id: 'zoom:out', label: 'Zoom Out', accelerator: 'CommandOrControl+-', scope: 'main' },
  { id: 'zoom:reset', label: 'Actual Size', accelerator: 'CommandOrControl+0', scope: 'main' },
  {
    id: 'tab:devtools',
    label: 'Developer Tools',
    accelerator: 'CommandOrControl+Alt+I',
    scope: 'main',
  },
] as const

/**
 * Renderer-scope combos claimed when pressed with the platform modifier
 * (⌘ / Ctrl). Used by both the tabs' before-input-event hook (page focus) and
 * the chrome's DOM keydown handler (chrome focus).
 */
export interface ComboEntry {
  key: string
  shift?: boolean
  command: RendererCommandId
}

export const RENDERER_COMBOS: readonly ComboEntry[] = [
  { key: 't', command: 'tab:new' },
  { key: 'l', command: 'url:focus' },
  { key: 's', command: 'sidebar:toggle' },
  { key: 'f', command: 'find:open' },
  { key: 'j', command: 'downloads:toggle' },
  { key: 'g', command: 'find:next' },
  { key: 'g', shift: true, command: 'find:prev' },
  { key: ',', command: 'settings:toggle' },
  { key: 'y', command: 'history:open' },
  { key: '\\', command: 'split:toggle' },
  { key: 'p', shift: true, command: 'palette:command' },
] as const

export function matchCombo(key: string, shift: boolean): RendererCommandId | null {
  const entry = RENDERER_COMBOS.find((c) => c.key === key && (c.shift ?? false) === shift)
  return entry?.command ?? null
}
