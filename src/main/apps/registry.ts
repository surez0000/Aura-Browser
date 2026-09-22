import { AURA_APPS, DEFAULT_APP_STATE, type AppState, type AuraAppId } from '@shared/apps'
import type { AppInfo } from '@shared/models'
import type { KvStore } from '../services/db/kv'

const KV_KEY = 'apps'

/**
 * Which Aura Apps are switched on, and which are pinned to the rail.
 *
 * The catalogue itself is static and shared; this owns only the two switches
 * per app and the pushes that keep the chrome in step. Apps are off until
 * asked for — an app nobody opened should cost nothing, including the
 * scheduler work the later ones bring.
 */
export class AppRegistry {
  private state: Partial<Record<AuraAppId, AppState>>

  constructor(
    private readonly kv: KvStore,
    private readonly notify: (apps: AppInfo[]) => void,
  ) {
    this.state = kv.get<Partial<Record<AuraAppId, AppState>>>(KV_KEY) ?? {}
  }

  list(): AppInfo[] {
    return AURA_APPS.map((meta) => {
      const state = this.stateOf(meta.id)
      return {
        ...meta,
        // An app that is not built yet can never read as switched on.
        enabled: meta.available && state.enabled,
        pinned: state.pinned,
      }
    })
  }

  isEnabled(id: AuraAppId): boolean {
    return this.list().find((a) => a.id === id)?.enabled ?? false
  }

  setEnabled(id: AuraAppId, enabled: boolean): void {
    const meta = AURA_APPS.find((a) => a.id === id)
    if (!meta?.available) return
    this.write(id, { enabled })
  }

  setPinned(id: AuraAppId, pinned: boolean): void {
    this.write(id, { pinned })
  }

  private stateOf(id: AuraAppId): AppState {
    return { ...DEFAULT_APP_STATE, ...this.state[id] }
  }

  private write(id: AuraAppId, patch: Partial<AppState>): void {
    this.state = { ...this.state, [id]: { ...this.stateOf(id), ...patch } }
    this.kv.set(KV_KEY, this.state)
    this.notify(this.list())
  }
}
