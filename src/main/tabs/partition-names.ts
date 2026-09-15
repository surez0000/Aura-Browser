/**
 * Storage partitions (ADR-0004). Pure names — no Electron import — so the
 * session upgrade logic and its unit tests can use them.
 *
 *  - ''                      Electron's default session. Only the first Space
 *                            of a pre-isolation profile keeps it, so logins
 *                            made before the change survive the upgrade.
 *  - persist:space:<id>      One on-disk partition per Space: cookies, logins,
 *                            local storage, IndexedDB, cache — like a Chrome
 *                            profile. Deleted with the Space.
 *  - aurora-incognito        In-memory (no "persist:" prefix); gone on quit.
 */
export const DEFAULT_PARTITION = ''
export const INCOGNITO_PARTITION = 'aurora-incognito'

const SPACE_PREFIX = 'persist:space:'

export function spacePartition(spaceId: string): string {
  return `${SPACE_PREFIX}${spaceId}`
}

export function isIsolatedSpacePartition(partition: string): boolean {
  return partition.startsWith(SPACE_PREFIX)
}
