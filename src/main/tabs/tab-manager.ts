import {
  Menu,
  clipboard,
  type BrowserWindow,
  type MenuItemConstructorOptions,
  type Rectangle,
} from 'electron'
import { randomUUID } from 'node:crypto'
import { Tab, isAllowedPageUrl, type TabHost } from './tab'
import type {
  FavoriteEntry,
  FindResult,
  SessionSnapshotV2,
  SpaceInfo,
  TabKind,
  TabsSnapshot,
} from '@shared/models'
import type { HistoryStore } from '../services/db/history'
import type { ArchiveStore } from '../services/db/archive'

interface TabManagerDeps {
  history: HistoryStore
  archive: ArchiveStore
  saveSession: (snapshot: SessionSnapshotV2) => void
  pushFindResult: (result: FindResult) => void
}

interface SpaceRecord {
  id: string
  name: string
  accentHue: number
  incognito: boolean
  favorites: FavoriteEntry[]
  activeTabId: string | null
}

const PAGE_CORNER_RADIUS = 11
const MAX_FAVORITES = 12
export const DEFAULT_SPACE_NAME = 'Personal'
export const DEFAULT_SPACE_HUE = 226
export const INCOGNITO_HUE = 275

function isPersistableUrl(url: string): boolean {
  return isAllowedPageUrl(url) && !url.startsWith('data:')
}

/**
 * Owns spaces and every tab's WebContentsView; the single source of truth for
 * tab/space state. Only the active space's active tab is attached to the
 * window; the chrome renderer mirrors state from `tabs:state` pushes.
 */
export class TabManager {
  private spaces: SpaceRecord[] = []
  private activeSpaceId = ''
  private tabs: Tab[] = []
  private attachedTabId: string | null = null
  private bounds: Rectangle | null = null
  private overlayShown = false
  private readonly closedStack: Array<{ url: string; spaceId: string; kind: TabKind }> = []
  private emitScheduled = false
  private lastFindTabId: string | null = null

  private readonly host: TabHost = {
    changed: (tab) => this.onTabChanged(tab),
    openUrl: (opener, url, activate) => {
      this.create({ url, activate, spaceId: opener.spaceId, kind: 'today' })
    },
    recordVisit: (tab, url) => {
      if (!tab.incognito) this.deps.history.recordVisit(url)
    },
    updateTitle: (tab, url, title) => {
      if (!tab.incognito) this.deps.history.updateTitle(url, title)
    },
    popupMenu: (template) => this.popupMenu(template),
  }

  constructor(
    private readonly win: BrowserWindow,
    private readonly deps: TabManagerDeps,
  ) {}

  // ---- spaces ------------------------------------------------------------

  ensureDefaultSpace(): void {
    if (this.spaces.some((s) => !s.incognito)) return
    this.createSpace({ name: DEFAULT_SPACE_NAME, accentHue: DEFAULT_SPACE_HUE, activate: true })
  }

  spaceList(): SpaceRecord[] {
    return this.spaces
  }

  activeSpace(): SpaceRecord | null {
    return this.spaces.find((s) => s.id === this.activeSpaceId) ?? null
  }

  getSpace(spaceId: string): SpaceRecord | null {
    return this.spaces.find((s) => s.id === spaceId) ?? null
  }

  createSpace(opts: {
    name?: string
    accentHue?: number
    incognito?: boolean
    activate?: boolean
    id?: string
  }): SpaceRecord {
    const space: SpaceRecord = {
      id: opts.id ?? randomUUID(),
      name: opts.name?.trim() || `Space ${this.spaces.filter((s) => !s.incognito).length + 1}`,
      accentHue: opts.accentHue ?? (this.spaces.length * 47 + DEFAULT_SPACE_HUE) % 360,
      incognito: opts.incognito ?? false,
      favorites: [],
      activeTabId: null,
    }
    this.spaces.push(space)
    if (opts.activate !== false) this.activateSpace(space.id)
    else this.scheduleEmit()
    return space
  }

  renameSpace(spaceId: string, name: string): void {
    const space = this.getSpace(spaceId)
    if (space && name.trim()) {
      space.name = name.trim().slice(0, 40)
      this.scheduleEmit()
    }
  }

  setSpaceAccent(spaceId: string, accentHue: number): void {
    const space = this.getSpace(spaceId)
    if (space) {
      space.accentHue = ((accentHue % 360) + 360) % 360
      this.scheduleEmit()
    }
  }

  /** Removing a space archives its tabs. The last normal space stays. */
  removeSpace(spaceId: string): void {
    const index = this.spaces.findIndex((s) => s.id === spaceId)
    const space = this.spaces[index]
    if (!space) return
    if (!space.incognito && this.spaces.filter((s) => !s.incognito).length <= 1) return

    for (const tab of this.tabs.filter((t) => t.spaceId === spaceId)) {
      this.archiveTab(tab, space)
    }
    this.spaces.splice(index, 1)
    if (this.activeSpaceId === spaceId) {
      const next = this.spaces[Math.max(0, index - 1)]
      if (next) this.activateSpace(next.id)
    }
    this.scheduleEmit()
  }

  activateSpace(spaceId: string): void {
    const space = this.getSpace(spaceId)
    if (!space) return
    if (this.activeSpaceId === spaceId) {
      this.attachActiveIfPossible()
      this.scheduleEmit()
      return
    }
    this.stopActiveFind()
    this.activeSpaceId = spaceId
    this.detach()
    let tab = space.activeTabId ? this.getTab(space.activeTabId) : null
    if (!tab) {
      tab = this.tabsOfSpace(spaceId)[0] ?? null
      space.activeTabId = tab?.id ?? null
    }
    if (tab) {
      tab.lastActiveAt = Date.now()
      tab.ensureLoaded()
      this.attachActiveIfPossible()
    }
    this.scheduleEmit()
  }

  activateSpaceAt(index: number): void {
    const space = this.spaces[index]
    if (space) this.activateSpace(space.id)
  }

  openIncognito(): SpaceRecord {
    const existing = this.spaces.find((s) => s.incognito)
    if (existing) {
      this.activateSpace(existing.id)
      return existing
    }
    return this.createSpace({ name: 'Incognito', accentHue: INCOGNITO_HUE, incognito: true })
  }

  // ---- tab queries --------------------------------------------------------

  getTab(tabId: string | undefined): Tab | null {
    if (tabId === undefined) return this.active()
    return this.tabs.find((t) => t.id === tabId) ?? null
  }

  active(): Tab | null {
    const space = this.activeSpace()
    return space?.activeTabId ? (this.getTab(space.activeTabId) ?? null) : null
  }

  count(): number {
    return this.tabs.length
  }

  /** Tabs of a space in sidebar order: pinned section first, then Today. */
  tabsOfSpace(spaceId: string): Tab[] {
    const of = (kind: TabKind): Tab[] =>
      this.tabs.filter((t) => t.spaceId === spaceId && t.kind === kind)
    return [...of('pinned'), ...of('today')]
  }

  // ---- tab mutations -------------------------------------------------------

  create(opts: {
    url?: string
    activate?: boolean
    spaceId?: string
    kind?: TabKind
    lazy?: boolean
    title?: string
    faviconUrl?: string | null
  }): Tab {
    this.ensureDefaultSpace()
    const space = (opts.spaceId ? this.getSpace(opts.spaceId) : null) ?? this.activeSpace()!
    const url = opts.url && isAllowedPageUrl(opts.url) ? opts.url : undefined
    const tab = new Tab(this.host, {
      spaceId: space.id,
      kind: opts.kind ?? 'today',
      incognito: space.incognito,
      url,
      lazy: opts.lazy,
      title: opts.title,
      faviconUrl: opts.faviconUrl,
    })
    this.tabs.push(tab)
    if (opts.activate !== false) {
      this.setActiveTab(tab.id)
    } else {
      this.scheduleEmit()
    }
    return tab
  }

  close(tabId: string): void {
    const tab = this.getTab(tabId)
    if (!tab) return
    const space = this.getSpace(tab.spaceId)

    const rememberUrl = tab.url || tab.pendingUrl
    if (rememberUrl && isPersistableUrl(rememberUrl) && !tab.incognito) {
      this.closedStack.push({ url: rememberUrl, spaceId: tab.spaceId, kind: tab.kind })
    }

    const siblings = this.tabsOfSpace(tab.spaceId)
    const siblingIndex = siblings.findIndex((t) => t.id === tab.id)

    if (this.attachedTabId === tab.id) this.detach()
    this.tabs = this.tabs.filter((t) => t.id !== tab.id)
    tab.destroy()

    if (space && space.activeTabId === tab.id) {
      const remaining = this.tabsOfSpace(tab.spaceId)
      const neighbor = remaining[Math.min(siblingIndex, remaining.length - 1)] ?? null
      space.activeTabId = neighbor?.id ?? null
      if (neighbor && space.id === this.activeSpaceId) {
        this.setActiveTab(neighbor.id)
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

  setActiveTab(tabId: string): void {
    const tab = this.getTab(tabId)
    if (!tab) return
    if (tab.spaceId !== this.activeSpaceId) {
      this.stopActiveFind()
      this.activeSpaceId = tab.spaceId
    }
    const space = this.getSpace(tab.spaceId)
    if (!space) return
    if (space.activeTabId !== tab.id) this.stopActiveFind()
    space.activeTabId = tab.id
    tab.lastActiveAt = Date.now()
    if (this.attachedTabId !== tab.id) this.detach()
    tab.ensureLoaded()
    this.attachActiveIfPossible()
    this.scheduleEmit()
  }

  setKind(tabId: string, kind: TabKind): void {
    const tab = this.getTab(tabId)
    if (!tab || tab.kind === kind) return
    // Move to the end of the target section: remove and re-append globally.
    this.tabs = this.tabs.filter((t) => t.id !== tab.id)
    tab.kind = kind
    this.tabs.push(tab)
    this.scheduleEmit()
  }

  /** Incognito is a partition boundary: tabs never cross it. */
  moveToSpace(tabId: string, spaceId: string): void {
    const tab = this.getTab(tabId)
    const target = this.getSpace(spaceId)
    if (!tab || !target || tab.spaceId === spaceId) return
    if (tab.incognito !== target.incognito) return

    const source = this.getSpace(tab.spaceId)
    if (source && source.activeTabId === tab.id) {
      const siblings = this.tabsOfSpace(source.id).filter((t) => t.id !== tab.id)
      source.activeTabId = siblings[0]?.id ?? null
      if (this.attachedTabId === tab.id) this.detach()
    }
    this.tabs = this.tabs.filter((t) => t.id !== tab.id)
    tab.spaceId = spaceId
    this.tabs.push(tab)
    if (source && this.activeSpaceId === source.id && source.activeTabId) {
      this.setActiveTab(source.activeTabId)
      return
    }
    this.scheduleEmit()
  }

  /** Reorder within one (space, kind) group, inferred from the given ids. */
  reorder(orderedIds: string[]): void {
    const first = orderedIds.map((id) => this.getTab(id)).find((t): t is Tab => t !== null)
    if (!first) return
    const inGroup = (t: Tab): boolean => t.spaceId === first.spaceId && t.kind === first.kind
    const queue = orderedIds
      .map((id) => this.getTab(id))
      .filter((t): t is Tab => t !== null && inGroup(t))
    const remaining = [...queue]
    this.tabs = this.tabs.map((t) => (inGroup(t) ? (remaining.shift() ?? t) : t))
    this.scheduleEmit()
  }

  activateRelative(delta: number): void {
    const list = this.tabsOfSpace(this.activeSpaceId)
    if (list.length === 0) return
    const current = list.findIndex((t) => t.id === this.activeSpace()?.activeTabId)
    const next = ((current === -1 ? 0 : current) + delta + list.length) % list.length
    const tab = list[next]
    if (tab) this.setActiveTab(tab.id)
  }

  /** Cmd+1..8 pick that tab in the active space; Cmd+9 picks the last one. */
  activateAt(index: number, lastWhenOverflow = false): void {
    const list = this.tabsOfSpace(this.activeSpaceId)
    if (list.length === 0) return
    const clamped = lastWhenOverflow || index >= list.length ? list.length - 1 : Math.max(0, index)
    const tab = list[clamped]
    if (tab) this.setActiveTab(tab.id)
  }

  reopenClosed(): void {
    const entry = this.closedStack.pop()
    if (!entry) return
    const space = this.getSpace(entry.spaceId)
    this.create({
      url: entry.url,
      activate: true,
      spaceId: space && !space.incognito ? space.id : undefined,
      kind: entry.kind,
    })
  }

  navigate(tabId: string | undefined, url: string): void {
    if (!isPersistableUrl(url)) return
    const tab = this.getTab(tabId)
    if (tab) {
      tab.navigate(url)
    } else {
      this.create({ url, activate: true })
    }
  }

  zoom(tabId: string | undefined, direction: 'in' | 'out' | 'reset'): number {
    const tab = this.getTab(tabId)
    if (!tab) return 100
    const percent = tab.zoom(direction)
    this.scheduleEmit()
    return percent
  }

  // ---- favorites (per space) ----------------------------------------------

  addFavorite(entry: FavoriteEntry): void {
    const space = this.activeSpace()
    if (!space || (!entry.url.startsWith('https://') && !entry.url.startsWith('http://'))) return
    const rest = space.favorites.filter((f) => f.url !== entry.url)
    space.favorites = [entry, ...rest].slice(0, MAX_FAVORITES)
    this.scheduleEmit()
  }

  removeFavorite(url: string): void {
    const space = this.activeSpace()
    if (!space) return
    space.favorites = space.favorites.filter((f) => f.url !== url)
    this.scheduleEmit()
  }

  toggleFavoriteForActiveTab(): void {
    const tab = this.active()
    const space = this.activeSpace()
    if (!tab || !space) return
    const url = tab.url || tab.pendingUrl || ''
    if (!url.startsWith('http')) return
    if (space.favorites.some((f) => f.url === url)) {
      this.removeFavorite(url)
    } else {
      this.addFavorite({ url, title: tab.title || url, faviconUrl: tab.faviconUrl })
    }
  }

  // ---- archive --------------------------------------------------------------

  private archiveTab(tab: Tab, space: SpaceRecord): void {
    const url = tab.url || tab.pendingUrl
    if (url && isPersistableUrl(url) && !tab.incognito) {
      this.deps.archive.record({
        url,
        title: tab.title || url,
        faviconUrl: tab.faviconUrl,
        spaceName: space.name,
      })
    }
    if (this.attachedTabId === tab.id) this.detach()
    if (space.activeTabId === tab.id) space.activeTabId = null
    this.tabs = this.tabs.filter((t) => t.id !== tab.id)
    tab.destroy()
  }

  /**
   * Archive Today tabs (never the space's active tab, never incognito).
   * olderThanMs = 0 archives everything eligible right now.
   */
  archiveToday(opts: { spaceId?: string; olderThanMs?: number }): number {
    const cutoff = Date.now() - (opts.olderThanMs ?? 0)
    let archived = 0
    for (const space of this.spaces) {
      if (space.incognito) continue
      if (opts.spaceId && space.id !== opts.spaceId) continue
      const candidates = this.tabs.filter(
        (t) =>
          t.spaceId === space.id &&
          t.kind === 'today' &&
          t.id !== space.activeTabId &&
          t.lastActiveAt <= cutoff,
      )
      for (const tab of candidates) {
        this.archiveTab(tab, space)
        archived++
      }
      if (!space.activeTabId) {
        space.activeTabId = this.tabsOfSpace(space.id)[0]?.id ?? null
      }
    }
    if (archived > 0) this.scheduleEmit()
    return archived
  }

  autoArchive(hours: number): number {
    if (hours <= 0) return 0
    return this.archiveToday({ olderThanMs: hours * 3_600_000 })
  }

  // ---- find in page ---------------------------------------------------------

  async findStart(text: string, opts: { forward?: boolean; findNext?: boolean }): Promise<void> {
    const tab = this.active()
    if (!tab || tab.crashed) return
    this.lastFindTabId = tab.id
    const result = await tab.findInPage(text, {
      forward: opts.forward ?? true,
      findNext: opts.findNext ?? false,
    })
    // Only report if this tab is still the active one by the time we're done.
    if (tab.id === this.activeSpace()?.activeTabId) this.deps.pushFindResult(result)
  }

  findStop(): void {
    const tab = this.lastFindTabId ? this.getTab(this.lastFindTabId) : null
    tab?.stopFind()
    this.lastFindTabId = null
  }

  private stopActiveFind(): void {
    if (this.lastFindTabId) this.findStop()
  }

  // ---- native menus ----------------------------------------------------------

  private popupMenu(template: MenuItemConstructorOptions[]): void {
    if (!this.win.isDestroyed()) Menu.buildFromTemplate(template).popup({ window: this.win })
  }

  showTabContextMenu(tabId: string): void {
    const tab = this.getTab(tabId)
    if (!tab) return
    const moveTargets = this.spaces.filter(
      (s) => s.id !== tab.spaceId && s.incognito === tab.incognito,
    )
    const template: MenuItemConstructorOptions[] = [
      {
        label: tab.kind === 'pinned' ? 'Unpin Tab' : 'Pin Tab',
        click: () => this.setKind(tab.id, tab.kind === 'pinned' ? 'today' : 'pinned'),
      },
      {
        label: 'Move to Space',
        enabled: moveTargets.length > 0,
        submenu: moveTargets.map((s) => ({
          label: s.name,
          click: () => this.moveToSpace(tab.id, s.id),
        })),
      },
      { type: 'separator' },
      {
        label: 'Copy URL',
        enabled: !!(tab.url || tab.pendingUrl),
        click: () => clipboard.writeText(tab.url || tab.pendingUrl || ''),
      },
      { label: 'Reload', click: () => tab.reload() },
      { type: 'separator' },
      { label: 'Close Tab', click: () => this.close(tab.id) },
    ]
    this.popupMenu(template)
  }

  // ---- layout & overlay -------------------------------------------------------

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
      // Released while capturing (fast open/close): main already reattached.
      if (!this.overlayShown) return { snapshotDataUrl: null }
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
    return this.attachedTabId ? (this.getTab(this.attachedTabId) ?? null) : null
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
    if (tab.id === this.activeSpace()?.activeTabId && !tab.crashed) this.attachActiveIfPossible()
    this.scheduleEmit()
  }

  // ---- snapshots -----------------------------------------------------------

  snapshot(): TabsSnapshot {
    const spaces: SpaceInfo[] = this.spaces.map((s) => ({
      id: s.id,
      name: s.name,
      accentHue: s.accentHue,
      incognito: s.incognito,
      favorites: [...s.favorites],
    }))
    return {
      spaces,
      activeSpaceId: this.activeSpaceId,
      tabs: this.tabs.map((t) => t.info()),
      activeTabId: this.activeSpace()?.activeTabId ?? null,
    }
  }

  sessionSnapshot(): SessionSnapshotV2 {
    const spaces = this.spaces
      .filter((s) => !s.incognito)
      .map((space) => {
        const tabs = this.tabsOfSpace(space.id)
          .map((t) => ({
            url: t.url || t.pendingUrl || '',
            title: t.title,
            faviconUrl: t.faviconUrl,
            kind: t.kind,
            id: t.id,
          }))
          .filter((t) => isPersistableUrl(t.url))
        const activeIndex = Math.max(
          0,
          tabs.findIndex((t) => t.id === space.activeTabId),
        )
        return {
          id: space.id,
          name: space.name,
          accentHue: space.accentHue,
          favorites: [...space.favorites],
          activeIndex,
          tabs: tabs.map(({ url, title, faviconUrl, kind }) => ({ url, title, faviconUrl, kind })),
        }
      })
    const activeSpaceId = this.spaces.find((s) => s.id === this.activeSpaceId && !s.incognito)
      ? this.activeSpaceId
      : (spaces[0]?.id ?? '')
    return { version: 2, activeSpaceId, spaces }
  }

  restore(snapshot: SessionSnapshotV2): void {
    for (const s of snapshot.spaces) {
      const space = this.createSpace({
        id: s.id,
        name: s.name,
        accentHue: s.accentHue,
        activate: false,
      })
      space.favorites = (s.favorites ?? []).slice(0, MAX_FAVORITES)
      const created: Tab[] = []
      for (const t of s.tabs) {
        created.push(
          this.create({
            url: t.url,
            lazy: true,
            activate: false,
            spaceId: space.id,
            kind: t.kind,
            title: t.title,
            faviconUrl: t.faviconUrl,
          }),
        )
      }
      const activeTab = created[Math.min(Math.max(0, s.activeIndex), created.length - 1)]
      space.activeTabId = activeTab?.id ?? null
    }
    this.ensureDefaultSpace()
    const target = this.getSpace(snapshot.activeSpaceId) ?? this.spaces[0]
    if (target) {
      // Force activation logic even though activeSpaceId may already match.
      this.activeSpaceId = ''
      this.activateSpace(target.id)
    }
  }

  // ---- state fan-out ---------------------------------------------------------

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
