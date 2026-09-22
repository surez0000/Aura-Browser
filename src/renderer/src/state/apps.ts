import { create } from 'zustand'
import type { AuraAppId } from '@shared/apps'
import type { AppInfo } from '@shared/models'

/**
 * Mirror of the App Store's switches. Main owns them; this is a projection,
 * the same way tabs are.
 *
 * Selectors here return stable references only — deriving a filtered array
 * inside a selector mints a new array on every call and spins
 * useSyncExternalStore forever, which is a mistake this codebase has made once
 * already. Components filter with useMemo instead.
 */
export interface AppsState {
  apps: AppInfo[]
  setApps(apps: AppInfo[]): void
}

export const useApps = create<AppsState>()((set) => ({
  apps: [],
  setApps: (apps) => set({ apps }),
}))

export function appById(apps: AppInfo[], id: AuraAppId): AppInfo | null {
  return apps.find((a) => a.id === id) ?? null
}

export function isAppEnabled(apps: AppInfo[], id: AuraAppId): boolean {
  return appById(apps, id)?.enabled ?? false
}
