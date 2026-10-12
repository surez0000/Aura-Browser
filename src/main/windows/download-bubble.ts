import { WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import { join } from 'node:path'
import type { DownloadAnchor, DownloadBubbleState, DownloadInfo } from '@shared/models'
import { isDev } from '../env'

/** How long a finished download stays on screen before the popover goes. */
const LINGER_MS = 8000
/** Transparent room around the card for its shadow. */
const MARGIN = 14
const GAP = 6
/** Card widths: the sidebar's own width above the button, wider beside the rail. */
const WIDTH = { above: 240, beside: 320 } as const

interface BubbleDeps {
  win: BrowserWindow
  /** Downloads already known at launch: history, which never pops up. */
  initial: DownloadInfo[]
  trust: (wc: WebContents) => void
  push: (wc: WebContents, state: DownloadBubbleState) => void
  space: () => { accentHue: number; accentHue2: number | null; incognito: boolean } | null
  openDownloads: () => void
  /** Give the keyboard back to the page once the popover is done with. */
  refocus: () => void
}

/**
 * The popover beside the Downloads button.
 *
 * A download starts in the background, so this is how you see it start, run
 * and land. Chrome HTML is painted underneath the page's native view
 * (ADR-0003), and a passive notice must never freeze the page the way an
 * overlay snapshot does — so the popover is a small view of its own, layered
 * above the page, sized to its card, transparent around it. The page beside
 * it stays live.
 *
 * It owns the whole lifecycle: which downloads it is about, when it shows,
 * how long it lingers, and keeping itself on top. While a dialog holds the
 * page overlay it steps aside, since a native view would cover the dialog.
 */
export class DownloadBubble {
  private view: WebContentsView | null = null
  /** The popover's renderer has drawn and measured its card at least once. */
  private ready = false
  private attached = false
  private ids: string[] = []
  private readonly seen = new Set<string>()
  private downloads: DownloadInfo[]
  private anchor: DownloadAnchor | null = null
  private height = 96
  private hovered = false
  private overlay = false
  private linger: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: BubbleDeps) {
    this.downloads = deps.initial
    for (const d of deps.initial) this.seen.add(d.id)
    deps.win.on('closed', () => {
      this.view = null
      this.attached = false
    })
  }

  // ---- inputs ------------------------------------------------------------------

  downloadsChanged(list: DownloadInfo[]): void {
    this.downloads = list
    const started = list.filter((d) => !this.seen.has(d.id) && d.state === 'progressing')
    for (const d of list) this.seen.add(d.id)
    const present = new Set(list.map((d) => d.id))
    this.ids = [...started.map((d) => d.id), ...this.ids.filter((id) => present.has(id))]
    this.scheduleLinger()
    this.sync()
  }

  setAnchor(anchor: DownloadAnchor | null): void {
    this.anchor = anchor
    this.sync()
  }

  /** A dialog took over the page area (or gave it back). */
  setOverlay(shown: boolean): void {
    if (this.overlay === shown) return
    this.overlay = shown
    this.sync()
  }

  /** Page views were attached: get back on top of them. */
  raise(): void {
    if (!this.attached || !this.view || this.deps.win.isDestroyed()) return
    // Adding a view that is already a child moves it to the top.
    this.deps.win.contentView.addChildView(this.view)
  }

  /** Something the popover shows changed (the Space's colour). */
  refresh(): void {
    if (this.attached) this.pushState()
  }

  resize(height: number): void {
    this.height = Math.max(1, Math.ceil(height))
    this.ready = true
    this.sync()
  }

  hover(inside: boolean): void {
    this.hovered = inside
    this.scheduleLinger()
  }

  dismiss(): void {
    // Only a popover that took the keyboard (a click on it) hands it back; a
    // quiet timeout must not pull the caret out of the address field.
    const hadFocus = this.attached && !!this.view?.webContents.isFocused()
    this.ids = []
    this.sync()
    if (hadFocus) this.deps.refocus()
  }

  showAll(): void {
    this.dismiss()
    this.deps.openDownloads()
  }

  state(): DownloadBubbleState | null {
    if (this.ids.length === 0) return null
    return {
      items: this.items(),
      placement: this.anchor?.placement ?? 'above',
      space: this.deps.space(),
    }
  }

  // ---- workings ------------------------------------------------------------------

  private items(): DownloadInfo[] {
    return this.ids
      .map((id) => this.downloads.find((d) => d.id === id))
      .filter((d): d is DownloadInfo => !!d)
  }

  /** Finished ones linger, then go; a failure stays; the pointer holds it up. */
  private scheduleLinger(): void {
    if (this.linger) clearTimeout(this.linger)
    this.linger = null
    const items = this.items()
    const settled =
      items.length > 0 && items.every((d) => d.state === 'completed' || d.state === 'cancelled')
    if (!settled || this.hovered) return
    this.linger = setTimeout(() => {
      this.linger = null
      this.dismiss()
    }, LINGER_MS)
  }

  private wanted(): boolean {
    return this.items().length > 0 && !!this.anchor && !this.overlay && !this.deps.win.isDestroyed()
  }

  private sync(): void {
    if (!this.wanted()) {
      this.detach()
      if (this.items().length === 0) {
        this.hovered = false
        // Clear the card, and wait for a fresh one before showing again, so
        // the next download never flashes the last one's card.
        this.ready = false
        if (this.view && !this.view.webContents.isDestroyed()) {
          this.deps.push(this.view.webContents, {
            items: [],
            placement: this.anchor?.placement ?? 'above',
            space: this.deps.space(),
          })
        }
      }
      return
    }
    const view = this.ensureView()
    this.pushState()
    // Shown only once its renderer has drawn the card, so it never flashes empty.
    if (!this.ready) return
    this.place(view)
    if (!this.attached) {
      this.deps.win.contentView.addChildView(view)
      this.attached = true
    }
  }

  private detach(): void {
    if (!this.attached || !this.view) return
    if (!this.deps.win.isDestroyed()) this.deps.win.contentView.removeChildView(this.view)
    this.attached = false
  }

  private place(view: WebContentsView): void {
    const anchor = this.anchor
    if (!anchor) return
    const width = WIDTH[anchor.placement] + MARGIN * 2
    const height = this.height + MARGIN * 2
    // The card's top-left is where the arithmetic aims; the margin hangs around it.
    let left: number
    let top: number
    if (anchor.placement === 'above') {
      left = anchor.x
      top = anchor.y - GAP - this.height
    } else {
      left = anchor.x + anchor.width + GAP
      top = anchor.y + anchor.height - this.height
    }
    const area = this.deps.win.getContentBounds()
    const x = Math.max(0, Math.min(left - MARGIN, area.width - width))
    const y = Math.max(0, Math.min(top - MARGIN, area.height - height))
    view.setBounds({ x: Math.round(x), y: Math.round(y), width, height })
  }

  private pushState(): void {
    const state = this.state()
    if (state && this.view && !this.view.webContents.isDestroyed()) {
      this.deps.push(this.view.webContents, state)
    }
  }

  private ensureView(): WebContentsView {
    if (this.view) return this.view
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    view.setBackgroundColor('#00000000')
    const wc = view.webContents
    this.deps.trust(wc)
    // It only ever shows the bundled UI.
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
    wc.on('will-navigate', (event) => event.preventDefault())
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (isDev && devUrl) void wc.loadURL(`${devUrl}#download-bubble`)
    else void wc.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'download-bubble' })
    this.view = view
    return view
  }
}
