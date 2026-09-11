/** True while running against the electron-vite dev server. */
export const isDev = !!process.env.ELECTRON_RENDERER_URL

/** Set by the e2e harness: suppresses dialogs and other nondeterminism. */
export const isE2E = process.env.AURORA_E2E === '1'
