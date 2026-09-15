import type { UpdateState } from '@shared/models'

/**
 * What the prominent update notice should say, if anything. Only the states a
 * person can act on or would want to glance at are surfaced: a download in
 * progress and a build that is ready to install. Checks and failures stay in
 * Settings, where they can be read without nagging.
 */
export type UpdateNotice =
  | { kind: 'preparing'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }

export function describeUpdate(
  state: UpdateState | null,
  dismissedVersion: string | null,
): UpdateNotice | null {
  if (!state?.availableVersion) return null
  const version = state.availableVersion
  if (dismissedVersion === version) return null
  switch (state.status) {
    case 'available':
      return { kind: 'preparing', version }
    case 'downloading':
      return {
        kind: 'downloading',
        version,
        percent: Math.max(0, Math.min(100, state.percent ?? 0)),
      }
    case 'ready':
      return { kind: 'ready', version }
    default:
      return null
  }
}
