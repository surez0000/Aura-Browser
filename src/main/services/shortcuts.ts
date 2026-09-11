import type { RendererCommandId } from '@shared/ipc-contract'

/**
 * Single source of truth for the keymap (Arc-style defaults). Pure data — no
 * Electron imports — so unit tests can verify it in plain Node.
 *
 * scope 'main'     — handled in the main process (menu accelerator).
 * scope 'renderer' — handled by the chrome renderer. The menu shows the
 *                    shortcut but does not register it on Windows/Linux
 *                    (registerAccelerator: false); a DOM keydown handler covers
 *                    chrome focus and a before-input-event hook on each tab
 *                    covers page focus, so the combo works everywhere without
 *                    double-firing.
 */
export interface KeyCommand {
  id: string
  label: string
  accelerator: string
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

/** Keys (lowercase) the renderer scope claims when pressed with the platform modifier. */
export const RENDERER_COMBO_KEYS: Readonly<Record<string, RendererCommandId>> = {
  t: 'tab:new',
  l: 'url:focus',
  s: 'sidebar:toggle',
}
