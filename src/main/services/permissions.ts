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

// 'display-capture' is allowed here because the screen-share picker is itself
// the consent: the page only receives the surface the user chose (Chrome's
// model). Everything else stays deny-by-default.
const AUTO_ALLOW = new Set([
  'fullscreen',
  'clipboard-sanitized-write',
  'pointerLock',
  'display-capture',
])

/**
 * A camera/microphone request always names at least one device type; a screen
 * capture request names none. Anything shaped unexpectedly is treated as a
 * device request, so an unknown case still prompts rather than auto-allowing.
 */
function isDisplayCaptureRequest(details: unknown): boolean {
  if (typeof details !== 'object' || details === null || !('mediaTypes' in details)) return false
  const { mediaTypes } = details as { mediaTypes: unknown }
  return Array.isArray(mediaTypes) && mediaTypes.length === 0
}

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
      // `getDisplayMedia` reaches us as a 'media' request that names no device
      // types, because it asks for a screen rather than a camera or a
      // microphone. Chrome does not prompt for that: the screen-share picker
      // it leads to *is* the consent, and the page only ever receives the one
      // surface the user chose. Prompting anyway put a "use your camera or
      // microphone" dialog in front of screen sharing — and, racing the
      // picker, could leave sharing working only if that dialog was allowed.
      if (permission === 'media' && isDisplayCaptureRequest(details)) {
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
