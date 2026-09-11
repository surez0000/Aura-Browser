import { Menu, type BrowserWindow, type MenuItemConstructorOptions, type Rectangle } from 'electron'
import { Tab, isAllowedPageUrl, type TabHost } from './tab'
import type { SessionSnapshot, TabsSnapshot } from '@shared/models'
import type { HistoryStore } from '../services/db/history'

interface TabManagerDeps {
  history: HistoryStore
  saveSession: (snapshot: SessionSnapshot) => void
}

const PAGE_CORNER_RADIUS = 11

/**
 * Owns every tab's WebContentsView and is the single source of truth for tab
 * state. Only the active tab's view is attached to the window; the chrome
 * renderer mirrors state from `tabs:state` pushes.
 */
export class TabManager {
  private tabs: Tab[] = []
  private activeTabId: string | null = null
  private attachedTabId: string | null = null
  private bounds: Rectangle | null = null
  private overlayShown = false
  private readonly closedStack: string[] = []
  private emitScheduled = false

  private readonly host: TabHost = {
    changed: (tab) => this.onTabChanged(tab),
    openUrl: (url, activate) => {
      this.create({ url, activate })
    },
    recordVisit: (url) => this.deps.history.recordVisit(url),
    updateTitle: (url, title) => this.deps.history.updateTitle(url, title),
    popupMenu: (template: MenuItemConstructorOptions[]) => {
      if (!this.win.isDestroyed()) Menu.buildFromTemplate(template).popup({ window: this.win })
    },
  }

  constructor(
    private readonly win: BrowserWindow,
    private readonly deps: TabManagerDeps,
  ) {}

  // ---- queries ---------------------------------------------------------

  get(tabId: string | undefined): Tab | null {
    if (tabId === undefined) return this.active()
    return this.tabs.find((t) => t.id === tabId) ?? null
  }

  active(): Tab | null {
    return this.activeTabId ? (this.tabs.find((t) => t.id === this.activeTabId) ?? null) : null
  }

  count(): number {
    return this.tabs.length
  }

  snapshot(): TabsSnapshot {
    return { tabs: this.tabs.map((t) => t.info()), activeTabId: this.activeTabId }
  }

  sessionSnapshot(): SessionSnapshot {
    const tabs = this.tabs
      .map((t) => ({ url: t.url || t.pendingUrl || '', title: t.title, faviconUrl: t.faviconUrl }))
      .filter((t) => isAllowedPageUrl(t.url) && !t.url.startsWith('data:'))
    const activeIndex = Math.max(
      0,
      this.tabs.findIndex((t) => t.id === this.activeTabId),
    )
    return { tabs, activeIndex: Math.min(activeIndex, Math.max(0, tabs.length - 1)) }
  }

  // ---- mutations -------------------------------------------------------

  create(opts: {
    url?: string
    activate?: boolean
    lazy?: boolean
    title?: string
    faviconUrl?: string | null
  }): Tab {
    if (opts.url && !isAllowedPageUrl(opts.url)) {
      opts = { ...opts, url: undefined }
    }
    const tab = new Tab(this.host, opts)
    this.tabs.push(tab)
    if (opts.activate !== false) {
      this.setActive(tab.id)
    } else {
      this.scheduleEmit()
    }
    return tab
  }

  close(tabId: string): void {
    const index = this.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return
    const tab = this.tabs[index]
    if (!tab) return

    const rememberUrl = tab.url || tab.pendingUrl
    if (rememberUrl && isAllowedPageUrl(rememberUrl) && !rememberUrl.startsWith('data:')) {
      this.closedStack.push(rememberUrl)
    }

    if (this.attachedTabId === tab.id) this.detach()
    this.tabs.splice(index, 1)
    tab.destroy()

    if (this.activeTabId === tab.id) {
      const neighbor = this.tabs[index] ?? this.tabs[index - 1]
      this.activeTabId = null
      if (neighbor) {
        this.setActive(neighbor.id)
        return
      }
    }
    this.scheduleEmit()
  }

  closeActive(): 'closed' | 'empty' {
    const tab = this.active()
    if (!tab) return 'empty'
    this.close(tab.id)
    return 'closed'
  }

  setActive(tabId: string): void {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (!tab) return
    this.activeTabId = tab.id
    if (this.attachedTabId !== tab.id) this.detach()
    tab.ensureLoaded()
    this.attachActiveIfPossible()
    this.scheduleEmit()
  }

  reorder(orderedIds: string[]): void {
    const rank = new Map(orderedIds.map((id, i) => [id, i]))
    this.tabs = [...this.tabs].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
    this.scheduleEmit()
  }

  activateRelative(delta: number): void {
    if (this.tabs.length === 0) return
    const current = this.tabs.findIndex((t) => t.id === this.activeTabId)
    const next = ((current === -1 ? 0 : current) + delta + this.tabs.length) % this.tabs.length
    const tab = this.tabs[next]
    if (tab) this.setActive(tab.id)
  }

  /** Cmd+1..8 pick that tab; Cmd+9 picks the last one (browser convention). */
  activateAt(index: number, lastWhenOverflow = false): void {
    if (this.tabs.length === 0) return
    const clamped =
      lastWhenOverflow || index >= this.tabs.length ? this.tabs.length - 1 : Math.max(0, index)
    const tab = this.tabs[clamped]
    if (tab) this.setActive(tab.id)
  }

  reopenClosed(): void {
    const url = this.closedStack.pop()
    if (url) this.create({ url, activate: true })
  }

  zoom(tabId: string | undefined, direction: 'in' | 'out' | 'reset'): number {
    const tab = this.get(tabId)
    if (!tab) return 100
    const percent = tab.zoom(direction)
    this.scheduleEmit()
    return percent
  }

  navigate(tabId: string | undefined, url: string): void {
    if (!isAllowedPageUrl(url) || url.startsWith('data:')) return
    const tab = this.get(tabId)
    if (tab) {
      tab.navigate(url)
    } else {
      this.create({ url, activate: true })
    }
  }

  // ---- layout & overlay ------------------------------------------------

  setPageBounds(rect: Rectangle): void {
    this.bounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height)),
    }
    const attached = this.attachedTab()
    if (attached) {
      attached.view.setBounds(this.bounds)
    } else {
      this.attachActiveIfPossible()
    }
  }

  /**
   * Chrome overlays render below native views, so while one is open the active
   * view is swapped out for a snapshot the renderer paints in its place.
   */
  async setOverlayShown(shown: boolean): Promise<{ snapshotDataUrl: string | null }> {
    this.overlayShown = shown
    if (shown) {
      const attached = this.attachedTab()
      let snapshotDataUrl: string | null = null
      if (attached && !attached.crashed) {
        try {
          const image = await attached.wc.capturePage()
          snapshotDataUrl = image.isEmpty() ? null : image.toDataURL()
        } catch {
          snapshotDataUrl = null
        }
      }
      this.detach()
      return { snapshotDataUrl }
    }
    this.attachActiveIfPossible()
    return { snapshotDataUrl: null }
  }

  focusActive(): void {
    const attached = this.attachedTab()
    if (attached) attached.wc.focus()
  }

  private attachedTab(): Tab | null {
    return this.attachedTabId ? (this.tabs.find((t) => t.id === this.attachedTabId) ?? null) : null
  }

  private attachActiveIfPossible(): void {
    if (this.overlayShown || this.win.isDestroyed()) return
    const tab = this.active()
    if (!tab || tab.crashed || !this.bounds || this.attachedTabId === tab.id) return
    this.win.contentView.addChildView(tab.view)
    tab.view.setBounds(this.bounds)
    const view = tab.view as unknown as { setBorderRadius?: (radius: number) => void }
    view.setBorderRadius?.(PAGE_CORNER_RADIUS)
    this.attachedTabId = tab.id
    tab.wc.focus()
  }

  private detach(): void {
    const tab = this.attachedTab()
    if (tab && !this.win.isDestroyed()) {
      this.win.contentView.removeChildView(tab.view)
    }
    this.attachedTabId = null
  }

  private onTabChanged(tab: Tab): void {
    if (tab.crashed && this.attachedTabId === tab.id) this.detach()
    if (tab.id === this.activeTabId && !tab.crashed) this.attachActiveIfPossible()
    this.scheduleEmit()
  }

  // ---- state fan-out ---------------------------------------------------

  private scheduleEmit(): void {
    if (this.emitScheduled) return
    this.emitScheduled = true
    setImmediate(() => {
      this.emitScheduled = false
      if (!this.win.isDestroyed()) {
        this.win.webContents.send('tabs:state', this.snapshot())
      }
      // Synchronous per-batch save: SQLite absorbs this easily and no quit
      // path (including abrupt harness kills) can lose more than one batch.
      this.deps.saveSession(this.sessionSnapshot())
    })
  }

  saveSessionNow(): void {
    this.deps.saveSession(this.sessionSnapshot())
  }
}
