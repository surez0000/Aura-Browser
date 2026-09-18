import {
  Menu,
  clipboard,
  type BrowserWindow,
  type MenuItemConstructorOptions,
  type Rectangle,
  session,
  type Session,
} from 'electron'
import { randomUUID } from 'node:crypto'
import { Tab, isAllowedPageUrl, type TabHost } from './tab'
import { INCOGNITO_PARTITION, isIsolatedSpacePartition, spacePartition } from './partition-names'
import {
  MAX_PANES,
  type FavoriteEntry,
  type FindResult,
  type SessionSnapshotV3,
  type SpaceInfo,
  type TabKind,
  type TabsSnapshot,
} from '@shared/models'
import type { HistoryStore } from '../services/db/history'
import type { ArchiveStore } from '../services/db/archive'

interface TabManagerDeps {
  history: HistoryStore
  archive: ArchiveStore
  saveSession: (snapshot: SessionSnapshotV3) => void
  /** Ask the chrome to put the caret in the address field (a blank pane opened). */
  requestUrlEdit: () => void
  /** Wire per-session services (downloads, permissions) — once per partition. */
  attachSession: (ses: Session, opts: { persist: boolean }) => void
  pushFindResult: (result: FindResult) => void
}

interface SpaceRecord {
  id: string
  name: string
  accentHue: number
  /** Second gradient stop; null means derive one from accentHue. */
  accentHue2: number | null
  incognito: boolean
  /** Storage partition (ADR-0004): '' default session, persist:space:<id>, or in-memory incognito. */
  partition: string
  favorites: FavoriteEntry[]
  /** Focused pane's tab. Always one of `panes` while the space has tabs. */
  activeTabId: string | null
  /** Tabs on screen, left to right: one entry normally, 2–4 when split. */
  panes: string[]
  /** Pane widths as fractions of the page area; same length as `panes`. */
  paneRatios: number[]
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
  private attachedTabIds: string[] = []
  private paneBounds = new Map<string, Rectangle>()
  /** The open Peek's tab; deliberately outside `tabs`, so it takes no tab slot. */
  private peekTab: Tab | null = null
  private peekBounds: Rectangle | null = null
  private peekAttached = false
  private overlayShown = false
  private readonly closedStack: Array<{ url: string; spaceId: string; kind: TabKind }> = []
  private emitScheduled = false
  private readonly preparedPartitions = new Set<string>()
  private readonly sessions = new Map<string, Session>()
  private readonly cookieFlushTimers = new Map<string, NodeJS.Timeout>()
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
    peek: (opener, url) => this.openPeek(opener, url),
    focused: (tab) => {
      if (this.activeSpace()?.panes.includes(tab.id)) this.focusPane(tab.id)
    },
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
    accentHue2?: number | null
    incognito?: boolean
    activate?: boolean
    id?: string
    /** Restored Spaces bring their partition; new ones get their own. */
    partition?: string
  }): SpaceRecord {
    const id = opts.id ?? randomUUID()
    const incognito = opts.incognito ?? false
    const space: SpaceRecord = {
      id,
      name: opts.name?.trim() || `Space ${this.spaces.filter((s) => !s.incognito).length + 1}`,
      accentHue: opts.accentHue ?? (this.spaces.length * 47 + DEFAULT_SPACE_HUE) % 360,
      accentHue2: opts.accentHue2 ?? null,
      incognito,
      partition: opts.partition ?? (incognito ? INCOGNITO_PARTITION : spacePartition(id)),
      favorites: [],
      activeTabId: null,
      panes: [],
      paneRatios: [],
    }
    this.spaces.push(space)
    this.prepareSession(space.partition, !incognito)
    if (opts.activate !== false) this.activateSpace(space.id)
    else this.scheduleEmit()
    return space
  }

  /**
   * Attach per-session services to a partition the first time it is used.
   * Also called at boot for the default session (the chrome's own).
   */
  prepareSession(partition: string, persist: boolean): void {
    if (this.preparedPartitions.has(partition)) return
    this.preparedPartitions.add(partition)
    const ses = partition ? session.fromPartition(partition) : session.defaultSession
    this.sessions.set(partition, ses)
    this.deps.attachSession(ses, { persist })
    if (persist) {
      // Chromium batches cookie writes for up to ~30 s and relies on a graceful
      // shutdown to commit them; a login made just before quitting (or a crash)
      // could vanish. Commit shortly after every change instead.
      ses.cookies.on('changed', () => {
        clearTimeout(this.cookieFlushTimers.get(partition))
        this.cookieFlushTimers.set(
          partition,
          setTimeout(() => void ses.cookies.flushStore().catch(() => undefined), 1_000),
        )
      })
    }
  }

  /** Commit cookies and DOM storage of every Space to disk (called on quit). */
  async flushSessions(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map(async (ses) => {
        try {
          ses.flushStorageData()
          await ses.cookies.flushStore()
        } catch {
          // best effort
        }
      }),
    )
  }

  renameSpace(spaceId: string, name: string): void {
    const space = this.getSpace(spaceId)
    if (space && name.trim()) {
      space.name = name.trim().slice(0, 40)
      this.scheduleEmit()
    }
  }

  setSpaceAccent(spaceId: string, accentHue: number, accentHue2?: number | null): void {
    const space = this.getSpace(spaceId)
    if (space) {
      space.accentHue = ((accentHue % 360) + 360) % 360
      if (accentHue2 !== undefined) {
        space.accentHue2 = accentHue2 === null ? null : ((accentHue2 % 360) + 360) % 360
      }
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
    if (isIsolatedSpacePartition(space.partition)) {
      // A Space's logins, cookies, and site data leave with it (Chrome profile semantics).
      const ses = session.fromPartition(space.partition)
      void ses.clearStorageData()
      void ses.clearCache()
    }
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
      this.normalisePanes(space)
      this.syncAttachments()
      this.scheduleEmit()
      return
    }
    this.stopActiveFind()
    this.closePeek({ silent: true })
    this.activeSpaceId = spaceId
    this.detach()
    let tab = space.activeTabId ? this.getTab(space.activeTabId) : null
    if (!tab) {
      tab = this.tabsOfSpace(spaceId)[0] ?? null
      space.activeTabId = tab?.id ?? null
    }
    this.normalisePanes(space)
    if (tab) {
      tab.lastActiveAt = Date.now()
      // Every pane of the space being entered loads, not just the focused one.
      for (const id of space.panes) this.getTab(id)?.ensureLoaded()
    }
    this.syncAttachments()
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
    if (tabId === this.peekTab?.id) return this.peekTab
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
      partition: space.partition,
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

    this.detachOne(tab)
    this.tabs = this.tabs.filter((t) => t.id !== tab.id)
    if (space) {
      space.panes = space.panes.filter((id) => id !== tab.id)
      space.paneRatios = space.panes.map(() => 1 / Math.max(space.panes.length, 1))
    }
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
    const alreadyOnScreen = space.panes.includes(tab.id)
    const previousFocus = space.activeTabId
    space.activeTabId = tab.id
    tab.lastActiveAt = Date.now()
    // Already on screen: just move focus. Otherwise the tab takes the place of
    // the focused pane, so choosing a tab from the sidebar never destroys a
    // split you set up — collapse it with ⌘\\ instead.
    if (!alreadyOnScreen) {
      const at = space.panes.indexOf(previousFocus ?? '')
      if (space.panes.length > 1 && at >= 0) space.panes[at] = tab.id
      else {
        space.panes = [tab.id]
        space.paneRatios = [1]
      }
    }
    this.normalisePanes(space)
    tab.ensureLoaded()
    this.syncAttachments()
    if (alreadyOnScreen && !this.overlayShown) tab.wc.focus()
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
    }
    if (source) {
      source.panes = source.panes.filter((id) => id !== tab.id)
      source.paneRatios = source.panes.map(() => 1 / Math.max(source.panes.length, 1))
    }
    this.detachOne(tab)

    let moved: Tab
    if (tab.partition === target.partition) {
      this.tabs = this.tabs.filter((t) => t.id !== tab.id)
      tab.spaceId = spaceId
      this.tabs.push(tab)
      moved = tab
    } else {
      // Spaces are separate storage partitions and a WebContents cannot change
      // partition, so the tab is recreated in the target and loads there on its
      // first activation — as Chrome's "open in profile" does.
      moved = new Tab(this.host, {
        spaceId: target.id,
        kind: tab.kind,
        incognito: target.incognito,
        partition: target.partition,
        url: tab.url || tab.pendingUrl || undefined,
        lazy: true,
        title: tab.title,
        faviconUrl: tab.faviconUrl,
      })
      this.tabs = this.tabs.filter((t) => t.id !== tab.id)
      this.tabs.push(moved)
      if (this.lastFindTabId === tab.id) this.lastFindTabId = null
      tab.destroy()
    }

    if (this.activeSpaceId === target.id && !target.activeTabId) {
      this.setActiveTab(moved.id)
      return
    }
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
    this.detachOne(tab)
    space.panes = space.panes.filter((id) => id !== tab.id)
    space.paneRatios = space.panes.map(() => 1 / Math.max(space.panes.length, 1))
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
    const space = this.getSpace(tab.spaceId)
    const onScreen = space?.panes.includes(tab.id) ?? false
    const template: MenuItemConstructorOptions[] = [
      {
        label: onScreen ? 'Close Pane' : 'Open in Split View',
        enabled:
          tab.spaceId === this.activeSpaceId &&
          (onScreen ? (space?.panes.length ?? 0) > 1 : (space?.panes.length ?? 0) < MAX_PANES),
        click: () => (onScreen ? this.closePane(tab.id) : this.split(tab.id)),
      },
      { type: 'separator' },
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

  // ---- peek ----------------------------------------------------------------

  /**
   * Preview a link in a floating card. The Peek is a real page with its own
   * view — same Space, same storage partition — but it is not in the tab list,
   * so it costs no tab and vanishes when dismissed. Promote it to keep it.
   */
  openPeek(opener: Tab, url: string): void {
    if (!isAllowedPageUrl(url)) return
    this.closePeek({ silent: true })
    const space = this.getSpace(opener.spaceId) ?? this.activeSpace()
    if (!space) return
    this.peekTab = new Tab(this.host, {
      spaceId: space.id,
      kind: 'today',
      incognito: space.incognito,
      partition: space.partition,
      url,
    })
    this.scheduleEmit()
  }

  closePeek(opts: { silent?: boolean } = {}): void {
    const tab = this.peekTab
    if (!tab) return
    if (this.peekAttached && !this.win.isDestroyed()) {
      this.win.contentView.removeChildView(tab.view)
    }
    this.peekAttached = false
    this.peekBounds = null
    this.peekTab = null
    tab.destroy()
    if (!opts.silent) {
      this.syncAttachments()
      this.scheduleEmit()
    }
  }

  /** Keep the previewed page: open it as a tab and dismiss the card. */
  promotePeek(): void {
    const tab = this.peekTab
    if (!tab) return
    const url = tab.url || tab.pendingUrl
    const spaceId = tab.spaceId
    const title = tab.title
    const faviconUrl = tab.faviconUrl
    this.closePeek({ silent: true })
    if (url) this.create({ url, activate: true, spaceId, kind: 'today', title, faviconUrl })
    else this.scheduleEmit()
  }

  setPeekBounds(rect: Rectangle | null): void {
    this.peekBounds = rect
      ? {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.max(0, Math.round(rect.width)),
          height: Math.max(0, Math.round(rect.height)),
        }
      : null
    this.syncAttachments()
  }

  /**
   * The Peek always sits above the panes, so it is attached last and re-raised
   * whenever a pane attaches after it.
   */
  private syncPeek(): void {
    const tab = this.peekTab
    const wanted = !!tab && !!this.peekBounds && !this.overlayShown && !tab.crashed
    if (!tab || this.win.isDestroyed()) return
    if (!wanted) {
      if (this.peekAttached) this.win.contentView.removeChildView(tab.view)
      this.peekAttached = false
      return
    }
    if (this.peekAttached) this.win.contentView.removeChildView(tab.view)
    this.win.contentView.addChildView(tab.view)
    const view = tab.view as unknown as { setBorderRadius?: (radius: number) => void }
    view.setBorderRadius?.(PAGE_CORNER_RADIUS)
    if (this.peekBounds) tab.view.setBounds(this.peekBounds)
    if (!this.peekAttached) tab.wc.focus()
    this.peekAttached = true
  }

  // ---- split view ----------------------------------------------------------

  /**
   * Keep a space's pane list honest: drop tabs that have closed or moved away,
   * make sure the focused tab is on screen, fall back to a single pane, and
   * keep the ratios the same length and summing to 1.
   */
  private normalisePanes(space: SpaceRecord): void {
    const live = space.panes.filter((id) => this.getTab(id)?.spaceId === space.id)
    const deduped = [...new Set(live)].slice(0, MAX_PANES)

    if (space.activeTabId && !deduped.includes(space.activeTabId)) {
      const focused = this.getTab(space.activeTabId)
      if (focused) deduped.unshift(space.activeTabId)
    }
    if (deduped.length === 0) {
      const fallback = space.activeTabId ?? this.tabsOfSpace(space.id)[0]?.id ?? null
      space.panes = fallback ? [fallback] : []
    } else {
      space.panes = deduped.slice(0, MAX_PANES)
    }
    if (space.panes.length > 0 && !space.panes.includes(space.activeTabId ?? '')) {
      space.activeTabId = space.panes[0] ?? null
    }

    const count = space.panes.length
    const ratios = space.paneRatios.slice(0, count)
    while (ratios.length < count) ratios.push(1 / Math.max(count, 1))
    const total = ratios.reduce((sum, r) => sum + (r > 0 ? r : 0), 0)
    space.paneRatios =
      total > 0 ? ratios.map((r) => (r > 0 ? r : 0.05) / total) : ratios.map(() => 1 / count)
  }

  /** Show `tabId` beside the focused pane; without one, open a fresh tab. */
  split(tabId?: string): void {
    const space = this.activeSpace()
    if (!space || space.panes.length >= MAX_PANES) return

    let tab = tabId ? this.getTab(tabId) : null
    if (tab && tab.spaceId !== space.id) return
    const opened = !tab
    if (!tab) {
      tab = this.create({ activate: false, spaceId: space.id, kind: 'today' })
    }
    if (space.panes.includes(tab.id)) {
      this.focusPane(tab.id)
      return
    }

    const at = Math.max(0, space.panes.indexOf(space.activeTabId ?? '')) + 1
    space.panes.splice(at, 0, tab.id)
    // Even split: a fresh pane should not squeeze the others unpredictably.
    space.paneRatios = space.panes.map(() => 1 / space.panes.length)
    space.activeTabId = tab.id
    tab.lastActiveAt = Date.now()
    tab.ensureLoaded()
    this.normalisePanes(space)
    this.syncAttachments()
    this.scheduleEmit()
    // A pane we just created is blank: offer the address field for it.
    if (opened) this.deps.requestUrlEdit()
  }

  /** Leave the split for this pane; the tab itself stays open in the sidebar. */
  closePane(tabId: string): void {
    const space = this.activeSpace()
    if (!space || space.panes.length <= 1 || !space.panes.includes(tabId)) return
    const index = space.panes.indexOf(tabId)
    space.panes.splice(index, 1)
    space.paneRatios = space.panes.map(() => 1 / space.panes.length)
    if (space.activeTabId === tabId) {
      space.activeTabId = space.panes[Math.max(0, index - 1)] ?? space.panes[0] ?? null
    }
    this.normalisePanes(space)
    this.syncAttachments()
    this.scheduleEmit()
  }

  /** Collapse a split back to the focused pane, or split if there is only one. */
  toggleSplit(): void {
    const space = this.activeSpace()
    if (!space) return
    if (space.panes.length > 1) {
      const keep = space.activeTabId ?? space.panes[0]
      if (!keep) return
      space.panes = [keep]
      space.paneRatios = [1]
      this.normalisePanes(space)
      this.syncAttachments()
      this.scheduleEmit()
      return
    }
    this.split()
  }

  focusPane(tabId: string): void {
    const space = this.activeSpace()
    if (!space || !space.panes.includes(tabId) || space.activeTabId === tabId) return
    this.stopActiveFind()
    space.activeTabId = tabId
    const tab = this.getTab(tabId)
    if (tab) {
      tab.lastActiveAt = Date.now()
      tab.ensureLoaded()
      if (!this.overlayShown) tab.wc.focus()
    }
    this.scheduleEmit()
  }

  setPaneRatios(ratios: number[]): void {
    const space = this.activeSpace()
    if (!space || ratios.length !== space.panes.length) return
    space.paneRatios = ratios
    this.normalisePanes(space)
    this.scheduleEmit()
  }

  /** The renderer measured each pane; position the matching views. */
  setPaneBounds(panes: ReadonlyArray<{ tabId: string } & Rectangle>): void {
    this.paneBounds = new Map(
      panes.map((pane) => [
        pane.tabId,
        {
          x: Math.round(pane.x),
          y: Math.round(pane.y),
          width: Math.max(0, Math.round(pane.width)),
          height: Math.max(0, Math.round(pane.height)),
        },
      ]),
    )
    this.syncAttachments()
  }

  async setOverlayShown(
    shown: boolean,
    phase?: 'capture' | 'detach',
  ): Promise<{ snapshots: Array<{ tabId: string; dataUrl: string }> }> {
    if (!shown) {
      this.overlayShown = false
      this.syncAttachments()
      return { snapshots: [] }
    }
    if (phase === 'detach') {
      // Second step of a two-phase swap; ignored if released in between.
      if (this.overlayShown) this.detach()
      return { snapshots: [] }
    }
    this.overlayShown = true
    // Every visible pane is captured, so a split looks continuous under an
    // overlay just as a single page does.
    const capturing = [
      ...this.attachedTabIds,
      ...(this.peekAttached && this.peekTab ? [this.peekTab.id] : []),
    ]
    const captured = await Promise.all(
      capturing.map(async (tabId) => {
        const tab = this.getTab(tabId)
        if (!tab || tab.crashed) return null
        try {
          const image = await tab.wc.capturePage()
          return image.isEmpty() ? null : { tabId, dataUrl: image.toDataURL() }
        } catch {
          return null
        }
      }),
    )
    // Released while capturing (fast open/close): main already reattached.
    if (!this.overlayShown) return { snapshots: [] }
    // 'capture' leaves the views attached until the chrome has painted the
    // snapshots, so the page never blinks to its ground color.
    if (phase !== 'capture') this.detach()
    return {
      snapshots: captured.filter((s): s is { tabId: string; dataUrl: string } => s !== null),
    }
  }

  focusActive(): void {
    const tab = this.active()
    if (tab && this.attachedTabIds.includes(tab.id)) tab.wc.focus()
  }

  /**
   * Bring the window's child views in line with the active space's panes:
   * attach what should be on screen at its measured rect, remove the rest.
   */
  private syncAttachments(): void {
    if (this.win.isDestroyed()) return
    const space = this.activeSpace()
    const wanted =
      this.overlayShown || !space
        ? []
        : space.panes.filter((id) => {
            const tab = this.getTab(id)
            return !!tab && !tab.crashed && this.paneBounds.has(id)
          })

    for (const id of this.attachedTabIds) {
      if (wanted.includes(id)) continue
      const tab = this.getTab(id)
      if (tab) this.win.contentView.removeChildView(tab.view)
    }

    for (const id of wanted) {
      const tab = this.getTab(id)
      const bounds = this.paneBounds.get(id)
      if (!tab || !bounds) continue
      if (!this.attachedTabIds.includes(id)) {
        this.win.contentView.addChildView(tab.view)
        const view = tab.view as unknown as { setBorderRadius?: (radius: number) => void }
        view.setBorderRadius?.(PAGE_CORNER_RADIUS)
      }
      tab.view.setBounds(bounds)
    }

    const gainedFocus = wanted.filter((id) => !this.attachedTabIds.includes(id))
    this.attachedTabIds = wanted
    const focused = space?.activeTabId
    if (focused && gainedFocus.includes(focused) && !this.peekTab) {
      this.getTab(focused)?.wc.focus()
    }
    this.syncPeek()
  }

  /** Remove a single view from the window (a pane closing, crashing, moving). */
  private detachOne(tab: Tab): void {
    if (!this.attachedTabIds.includes(tab.id)) return
    if (!this.win.isDestroyed()) this.win.contentView.removeChildView(tab.view)
    this.attachedTabIds = this.attachedTabIds.filter((id) => id !== tab.id)
  }

  private detach(): void {
    if (!this.win.isDestroyed()) {
      for (const id of this.attachedTabIds) {
        const tab = this.getTab(id)
        if (tab) this.win.contentView.removeChildView(tab.view)
      }
      if (this.peekAttached && this.peekTab) {
        this.win.contentView.removeChildView(this.peekTab.view)
      }
    }
    this.attachedTabIds = []
    this.peekAttached = false
  }

  private onTabChanged(tab: Tab): void {
    // A crash removes just that pane's view; the rest of the split stays.
    if (tab.crashed) this.detachOne(tab)
    else if (this.activeSpace()?.panes.includes(tab.id)) this.syncAttachments()
    this.scheduleEmit()
  }

  // ---- snapshots -----------------------------------------------------------

  snapshot(): TabsSnapshot {
    const spaces: SpaceInfo[] = this.spaces.map((s) => ({
      id: s.id,
      name: s.name,
      accentHue: s.accentHue,
      accentHue2: s.accentHue2,
      incognito: s.incognito,
      favorites: [...s.favorites],
    }))
    return {
      spaces,
      activeSpaceId: this.activeSpaceId,
      tabs: this.tabs.map((t) => t.info()),
      activeTabId: this.activeSpace()?.activeTabId ?? null,
      panes: [...(this.activeSpace()?.panes ?? [])],
      paneRatios: [...(this.activeSpace()?.paneRatios ?? [])],
      peek: this.peekTab
        ? {
            tabId: this.peekTab.id,
            url: this.peekTab.url || this.peekTab.pendingUrl || '',
            title: this.peekTab.title,
            isLoading: this.peekTab.isLoading,
          }
        : null,
    }
  }

  sessionSnapshot(): SessionSnapshotV3 {
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
        // Panes are stored as indices into the persisted tab list, which is
        // already filtered, so a pane whose URL cannot be restored drops out.
        const paneIndices = space.panes
          .map((paneId) => tabs.findIndex((t) => t.id === paneId))
          .filter((index) => index >= 0)
        return {
          id: space.id,
          partition: space.partition,
          name: space.name,
          accentHue: space.accentHue,
          accentHue2: space.accentHue2,
          favorites: [...space.favorites],
          activeIndex,
          ...(paneIndices.length > 1
            ? { paneIndices, paneRatios: [...space.paneRatios].slice(0, paneIndices.length) }
            : {}),
          tabs: tabs.map(({ url, title, faviconUrl, kind }) => ({ url, title, faviconUrl, kind })),
        }
      })
    const activeSpaceId = this.spaces.find((s) => s.id === this.activeSpaceId && !s.incognito)
      ? this.activeSpaceId
      : (spaces[0]?.id ?? '')
    return { version: 3, activeSpaceId, spaces }
  }

  restore(snapshot: SessionSnapshotV3): void {
    for (const s of snapshot.spaces) {
      const space = this.createSpace({
        id: s.id,
        name: s.name,
        accentHue: s.accentHue,
        accentHue2: s.accentHue2,
        partition: s.partition,
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
      const panes = (s.paneIndices ?? [])
        .map((index) => created[index]?.id)
        .filter((id): id is string => !!id)
      if (panes.length > 1) {
        space.panes = panes.slice(0, MAX_PANES)
        space.paneRatios = (s.paneRatios ?? []).slice(0, space.panes.length)
      }
      this.normalisePanes(space)
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
