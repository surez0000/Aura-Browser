import { randomUUID } from 'node:crypto'
import type { Session } from 'electron'
import type { PermissionRequestInfo } from '@shared/models'
import type { KvStore } from './db/kv'

const KV_KEY = 'permissions'

const DESCRIPTIONS: Record<string, string> = {
  notifications: 'show notifications',
  geolocation: 'know your location',
  media: 'use your camera or microphone',
  'clipboard-read': 'read your clipboard',
  midi: 'use MIDI devices',
  midiSysex: 'use MIDI devices',
}

const AUTO_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock'])

/**
 * Deny-by-default permission broker with in-chrome prompts: each request is
 * pushed to the renderer as a banner; the decision can be remembered per
 * (origin, permission) in kv. Incognito sessions never persist decisions.
 */
export class PermissionService {
  private readonly responders = new Map<string, (allow: boolean, remember: boolean) => void>()
  private stored: Record<string, boolean>

  constructor(
    private readonly kv: KvStore,
    private readonly push: (request: PermissionRequestInfo) => void,
  ) {
    this.stored = kv.get<Record<string, boolean>>(KV_KEY) ?? {}
  }

  attach(session: Session, opts: { persistDecisions: boolean }): void {
    session.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (AUTO_ALLOW.has(permission)) {
        callback(true)
        return
      }
      const description = DESCRIPTIONS[permission]
      if (!description) {
        callback(false)
        return
      }

      const requestingUrl =
        'requestingUrl' in details && typeof details.requestingUrl === 'string'
          ? details.requestingUrl
          : wc.getURL()
      let origin = requestingUrl
      let host = requestingUrl
      try {
        const parsed = new URL(requestingUrl)
        origin = parsed.origin
        host = parsed.host
      } catch {
        /* keep raw string */
      }

      const key = `${origin}|${permission}`
      if (opts.persistDecisions && key in this.stored) {
        callback(this.stored[key] ?? false)
        return
      }

      const id = randomUUID()
      let settled = false
      const done = (allow: boolean, remember: boolean): void => {
        if (settled) return
        settled = true
        this.responders.delete(id)
        if (remember && opts.persistDecisions) {
          this.stored[key] = allow
          this.kv.set(KV_KEY, this.stored)
        }
        callback(allow)
      }
      this.responders.set(id, done)
      // A closing page must not leave the request dangling.
      wc.once('destroyed', () => done(false, false))

      this.push({ id, host: host || 'this site', permission, description })
    })
  }

  respond(id: string, allow: boolean, remember: boolean): void {
    this.responders.get(id)?.(allow, remember)
  }

  clearStored(): void {
    this.stored = {}
    this.kv.set(KV_KEY, this.stored)
  }
}
