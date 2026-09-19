import { BrowserWindow, Menu, type WebContents } from 'electron'
import { join } from 'node:path'
import { WINDOW_BG } from '@shared/theme'
import type { MiniWindowInfo } from '@shared/models'
import { Tab, isAllowedPageUrl, type TabHost } from '../tabs/tab'
import { isDev } from '../env'

/**
 * The mini window: one link, one small window. It is what opens when another
 * app hands Aura Browser a URL — a quick read that never disturbs the Spaces
 * and tabs in the main window, and can be promoted into a real tab.
 *
 * It loads the same chrome renderer with a `#mini` hash, so it inherits the
 * theme, tokens and IPC bridge; the page itself is a `WebContentsView` the
 * main process positions, exactly as in the main window (ADR-0003).
 */
export class MiniWindow {
  readonly win: BrowserWindow
  private readonly tab: Tab
  private bounds: { x: number; y: number; width: number; height: number } | null = null
  private attached = false

  constructor(
    url: string,
    host: TabHost,
    private readonly opts: {
      partition: string
      incognito: boolean
      spaceId: string
      onState: (wc: WebContents, info: MiniWindowInfo) => void
    },
  ) {
    this.win = new BrowserWindow({
      width: 520,
      height: 720,
      minWidth: 380,
      minHeight: 360,
      show: false,
      backgroundColor: WINDOW_BG.dark,
      ...(process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 12 } }
        : { frame: false as const }),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    this.tab = new Tab(host, {
      spaceId: opts.spaceId,
      kind: 'today',
      incognito: opts.incognito,
      partition: opts.partition,
      url: isAllowedPageUrl(url) ? url : undefined,
    })

    this.win.once('ready-to-show', () => this.win.show())
    this.win.on('closed', () => this.tab.destroy())

    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (isDev && devUrl) void this.win.loadURL(`${devUrl}#mini`)
    else void this.win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'mini' })
  }

  get webContents(): WebContents {
    return this.win.webContents
  }

  owns(tab: Tab): boolean {
    return tab.id === this.tab.id
  }

  /** Current page, for promoting into the main window. */
  page(): { url: string; title: string; faviconUrl: string | null } {
    return {
      url: this.tab.url || this.tab.pendingUrl || '',
      title: this.tab.title,
      faviconUrl: this.tab.faviconUrl,
    }
  }

  /** What the window's chrome shows. Pushed on change, and fetched on mount. */
  state(): MiniWindowInfo {
    return {
      url: this.tab.url || this.tab.pendingUrl || '',
      title: this.tab.title,
      isLoading: this.tab.isLoading,
      canGoBack: this.tab.info().canGoBack,
    }
  }

  emitState(): void {
    if (this.win.isDestroyed()) return
    this.opts.onState(this.webContents, this.state())
  }

  setBounds(rect: { x: number; y: number; width: number; height: number } | null): void {
    this.bounds = rect
    this.sync()
  }

  goBack(): void {
    this.tab.goBack()
  }

  close(): void {
    if (!this.win.isDestroyed()) this.win.close()
  }

  private sync(): void {
    if (this.win.isDestroyed()) return
    if (!this.bounds) {
      if (this.attached) this.win.contentView.removeChildView(this.tab.view)
      this.attached = false
      return
    }
    if (!this.attached) {
      this.win.contentView.addChildView(this.tab.view)
      this.attached = true
      this.tab.wc.focus()
    }
    this.tab.view.setBounds(this.bounds)
  }
}

/** Owns every open mini window and routes their IPC by sender. */
export class MiniWindowService {
  private readonly windows = new Set<MiniWindow>()

  constructor(
    private readonly deps: {
      /** Where a mini window's page goes when promoted, and where links land. */
      openInMain: (url: string, opts: { title?: string; faviconUrl?: string | null }) => void
      /** Partition/Space a mini window should browse in (the active Space). */
      context: () => { partition: string; incognito: boolean; spaceId: string } | null
      recordVisit: (url: string) => void
      updateTitle: (url: string, title: string) => void
      pushState: (wc: WebContents, info: MiniWindowInfo) => void
      trust: (wc: WebContents) => void
    },
  ) {}

  /** Open a URL handed to us by another application. */
  open(url: string): MiniWindow | null {
    const context = this.deps.context()
    if (!context || !isAllowedPageUrl(url)) return null

    const host: TabHost = {
      changed: (tab) => this.find((w) => w.owns(tab))?.emitState(),
      // Following a link out of a quick read means you want it properly.
      openUrl: (_opener, linkUrl) => this.deps.openInMain(linkUrl, {}),
      peek: (_opener, linkUrl) => this.deps.openInMain(linkUrl, {}),
      recordVisit: (tab, visited) => {
        if (!tab.incognito) this.deps.recordVisit(visited)
      },
      updateTitle: (tab, visited, title) => {
        if (!tab.incognito) this.deps.updateTitle(visited, title)
      },
      popupMenu: (template) => {
        Menu.buildFromTemplate(template).popup()
      },
      // A mini window borrows the active Space and has no switcher of its own.
      otherSpaces: () => [],
      openInSpace: (linkUrl) => this.deps.openInMain(linkUrl, {}),
      focused: () => undefined,
    }

    const mini = new MiniWindow(url, host, {
      ...context,
      onState: this.deps.pushState,
    })
    this.windows.add(mini)
    this.deps.trust(mini.webContents)
    mini.win.on('closed', () => this.windows.delete(mini))
    mini.webContents.once('did-finish-load', () => mini.emitState())
    return mini
  }

  forSender(wc: WebContents): MiniWindow | null {
    return this.find((w) => !w.win.isDestroyed() && w.webContents === wc)
  }

  promote(wc: WebContents): void {
    const mini = this.forSender(wc)
    if (!mini) return
    const page = mini.page()
    mini.close()
    if (page.url) this.deps.openInMain(page.url, { title: page.title, faviconUrl: page.faviconUrl })
  }

  private find(predicate: (w: MiniWindow) => boolean): MiniWindow | null {
    for (const w of this.windows) if (predicate(w)) return w
    return null
  }
}
