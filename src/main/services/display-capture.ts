import { randomUUID } from 'node:crypto'
import { desktopCapturer, shell, systemPreferences, type Session } from 'electron'
import type { DisplayCaptureRequestInfo, DisplayCaptureSource } from '@shared/models'

/** Thumbnails shown in the picker; small enough to send many over IPC. */
const THUMBNAIL_SIZE = { width: 320, height: 200 }
/** macOS Screen Recording settings pane. */
const MAC_SCREEN_SETTINGS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

/**
 * Screen sharing (`navigator.mediaDevices.getDisplayMedia`). Chromium hands the
 * choice of screen or window to the embedder: without a display-media handler
 * Electron rejects every request, which is why sharing did not work at all.
 *
 * The picker *is* the consent, exactly as in Chrome — the page only ever
 * receives the one surface the user picked. Sources are enumerated in the main
 * process and shown by the chrome renderer over a snapshot of the page
 * (ADR-0003), because chrome HTML cannot paint above a native view.
 */
export class DisplayCaptureService {
  /** The launch-time warm-up, so a request never enumerates alongside it. */
  private warming: Promise<void> | null = null
  private pending: {
    id: string
    respond: (choice: { sourceId: string; withAudio: boolean } | null) => void
  } | null = null

  constructor(
    private readonly push: (request: DisplayCaptureRequestInfo) => void,
    private readonly close: (id: string) => void,
  ) {}

  attach(session: Session): void {
    session.setDisplayMediaRequestHandler(async (request, callback) => {
      // Electron's contract: an empty object denies the request.
      const deny = (): void => callback({})

      if (!request.videoRequested) {
        deny()
        return
      }
      if (this.pending) {
        // One picker at a time; a second request would fight for the overlay.
        deny()
        return
      }

      const id = randomUUID()
      let host = request.securityOrigin
      try {
        host = new URL(request.securityOrigin).host || request.securityOrigin
      } catch {
        /* keep the raw origin */
      }

      // macOS gates screen capture behind a TCC grant that only the user can
      // give; asking Chromium first would fail with an opaque error.
      if (
        process.platform === 'darwin' &&
        systemPreferences.getMediaAccessStatus('screen') !== 'granted'
      ) {
        this.pending = {
          id,
          respond: () => {
            this.pending = null
            deny()
          },
        }
        this.push({
          id,
          host,
          sources: [],
          loading: false,
          systemPermission: 'denied',
          canShareAudio: false,
        })
        return
      }

      // System audio capture is a Windows-only loopback in Chromium.
      const canShareAudio = process.platform === 'win32' && request.audioRequested
      const base = { id, host, systemPermission: 'granted' as const, canShareAudio }

      const chosen = await new Promise<{ sourceId: string; withAudio: boolean } | null>(
        (resolve) => {
          this.pending = { id, respond: resolve }
          // Show the dialog straight away, then fill in the thumbnails.
          this.push({ ...base, sources: [], loading: true })
          void this.listSources().then(
            (sources) => {
              if (this.pending?.id !== id) return
              // Nothing to offer is still an answer: leave the dialog up with
              // an explanation rather than closing it and denying silently.
              this.push({ ...base, sources, loading: false })
            },
            () => {
              if (this.pending?.id !== id) return
              this.pending = null
              resolve(null)
            },
          )
        },
      )
      this.pending = null
      if (!chosen) {
        deny()
        return
      }

      // Re-enumerate: the picked window may have closed while the picker was up.
      const live = await desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 1, height: 1 } })
        .catch(() => [])
      const source = live.find((s) => s.id === chosen.sourceId)
      if (!source) {
        deny()
        return
      }
      callback({
        video: source,
        ...(chosen.withAudio && process.platform === 'win32' ? { audio: 'loopback' as const } : {}),
      })
    })
  }

  /**
   * Chromium starts its screen-capture stack (and asks macOS for the TCC
   * grant) on the first request, which cost ~4 s — long enough to look like
   * nothing happened when a page asks to share. Pay it once at launch, with
   * one-pixel thumbnails so it stays cheap.
   */
  warmUp(): void {
    this.warming ??= desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
      .then(() => undefined)
      .catch(() => undefined)
  }

  /** The chrome renderer answering the picker. */
  respond(id: string, sourceId: string | null, withAudio: boolean): void {
    if (this.pending?.id !== id) return
    const { respond } = this.pending
    respond(sourceId ? { sourceId, withAudio } : null)
  }

  /** Cancel an open picker (the requesting tab navigated away or closed). */
  cancelPending(): void {
    if (!this.pending) return
    const { id, respond } = this.pending
    this.close(id)
    respond(null)
  }

  openSystemSettings(): void {
    if (process.platform === 'darwin') void shell.openExternal(MAC_SCREEN_SETTINGS)
  }

  private async listSources(): Promise<DisplayCaptureSource[]> {
    // Two concurrent enumerations serialise inside Chromium, which is what
    // made an early request take tens of seconds instead of one.
    await this.warming
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: THUMBNAIL_SIZE,
      fetchWindowIcons: true,
    })
    return sources
      .filter((source) => !source.thumbnail.isEmpty())
      .map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
        thumbnailDataUrl: source.thumbnail.toDataURL(),
        appIconDataUrl:
          source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
      }))
  }
}
