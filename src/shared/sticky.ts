/**
 * Sticky note colours, named. Shared because the main process validates
 * against this list at the IPC boundary and the renderer draws from it; the
 * actual colour maths lives in the renderer's theme module, where the contrast
 * machinery is.
 */
export const STICKY_COLORS = ['default', 'amber', 'rose', 'violet', 'sky', 'mint', 'clay'] as const

export type StickyColor = (typeof STICKY_COLORS)[number]
