import type { ArchivedTabRow, HistorySearchRow, SpaceInfo, TabInfo } from '@shared/models'
import { fuzzyBest, fuzzyScore } from './fuzzy'
import {
  DEFAULT_SEARCH_ENGINE,
  SEARCH_ENGINES,
  searchEngine,
  type SearchEngineId,
} from '@shared/search'
import { displayLabel, normalizeInput, searchUrl } from './url'

export type PaletteItemType =
  'tab' | 'favorite' | 'history' | 'archived' | 'action' | 'url' | 'search'

export interface PaletteItem {
  key: string
  type: PaletteItemType
  title: string
  subtitle?: string
  hint?: string
  payload: { tabId?: string; url?: string; actionId?: string }
  score: number
}

export interface ActionDef {
  id: string
  title: string
  /** Extra match terms beyond the title. */
  keywords?: string
  hint?: string
}

export interface PaletteContext {
  query: string
  mode: 'new' | 'edit'
  tabs: TabInfo[]
  spaces: SpaceInfo[]
  activeSpaceId: string
  history: HistorySearchRow[]
  archived: ArchivedTabRow[]
  actions: ActionDef[]
  /** Provider for the web-search fallback (settings). */
  searchEngine?: SearchEngineId
  limit?: number
}

const DEFAULT_LIMIT = 9

/** The palette's action source; dynamic entries depend on current state. */
export function buildActions(ctx: {
  spaces: SpaceInfo[]
  activeSpaceId: string
  activeTab: TabInfo | null
}): ActionDef[] {
  const actions: ActionDef[] = [
    { id: 'space:new', title: 'New Space…', keywords: 'create workspace' },
    {
      id: 'incognito',
      title: 'New Incognito Tab',
      keywords: 'private browsing',
      hint: '⇧⌘N',
    },
    { id: 'sidebar:toggle', title: 'Toggle Sidebar', hint: '⌘S' },
    {
      id: 'sidebar:set:fixed',
      title: 'Sidebar: Always Visible',
      keywords: 'settings pin fixed tabs bar show',
    },
    {
      id: 'sidebar:set:hover',
      title: 'Sidebar: Show on Hover',
      keywords: 'settings hide auto collapse tabs bar edge',
    },
    { id: 'settings:open', title: 'Settings…', keywords: 'preferences options', hint: '⌘,' },
    {
      id: 'history:open',
      title: 'Show Full History',
      keywords: 'browsing visited clear delete',
      hint: '⌘Y',
    },
    { id: 'updates:check', title: 'Check for Updates…', keywords: 'version upgrade release new' },
    ...Object.values(SEARCH_ENGINES).map((e) => ({
      id: `search:set:${e.id}`,
      title: `Search Engine: ${e.name}`,
      keywords: 'settings default search provider',
    })),
    { id: 'find:open', title: 'Find in Page', keywords: 'search text', hint: '⌘F' },
    { id: 'downloads:toggle', title: 'Show Downloads', hint: '⌘J' },
    { id: 'tab:reopen', title: 'Reopen Closed Tab', keywords: 'restore undo', hint: '⇧⌘T' },
    { id: 'today:archive', title: 'Archive Today Tabs', keywords: 'clear clean tidy' },
    { id: 'permissions:clear', title: 'Clear Stored Site Permissions', keywords: 'reset privacy' },
    { id: 'zoom:in', title: 'Zoom In', hint: '⌘+' },
    { id: 'zoom:out', title: 'Zoom Out', hint: '⌘−' },
    { id: 'zoom:reset', title: 'Reset Zoom', keywords: 'actual size', hint: '⌘0' },
    { id: 'devtools', title: 'Open Developer Tools', keywords: 'inspect console', hint: '⌥⌘I' },
    { id: 'archive:set:0', title: 'Auto-archive Today: Off', keywords: 'settings archive never' },
    { id: 'archive:set:12', title: 'Auto-archive Today: 12 hours', keywords: 'settings archive' },
    { id: 'archive:set:24', title: 'Auto-archive Today: 24 hours', keywords: 'settings archive' },
    {
      id: 'theme:set:system',
      title: 'Theme: Sync with System',
      keywords: 'appearance auto os color scheme',
    },
    { id: 'theme:set:light', title: 'Theme: Light', keywords: 'appearance color scheme day' },
    { id: 'theme:set:dark', title: 'Theme: Dark', keywords: 'appearance color scheme night' },
  ]

  if (ctx.activeTab) {
    actions.push(
      {
        id: 'tab:togglePin',
        title: ctx.activeTab.kind === 'pinned' ? 'Unpin Current Tab' : 'Pin Current Tab',
        keywords: 'pin pinned tab',
      },
      { id: 'url:copy', title: 'Copy Current URL', keywords: 'address link' },
    )
  }

  const activeSpace = ctx.spaces.find((s) => s.id === ctx.activeSpaceId)
  for (const space of ctx.spaces) {
    if (space.id === ctx.activeSpaceId) continue
    actions.push({
      id: `space:switch:${space.id}`,
      title: `Switch to Space: ${space.name}`,
      keywords: 'go workspace',
    })
    if (ctx.activeTab && activeSpace && space.incognito === activeSpace.incognito) {
      actions.push({
        id: `tab:move:${space.id}`,
        title: `Move Tab to: ${space.name}`,
        keywords: 'send workspace',
      })
    }
  }
  return actions
}

/** Pure ranking over every source; execution is mapped by the Palette UI. */
export function composePalette(ctx: PaletteContext): PaletteItem[] {
  const query = ctx.query.trim()
  const limit = ctx.limit ?? DEFAULT_LIMIT
  const spaceName = (id: string): string => ctx.spaces.find((s) => s.id === id)?.name ?? ''

  if (!query) {
    const items: PaletteItem[] = ctx.tabs
      .filter((t) => t.spaceId === ctx.activeSpaceId)
      .slice(0, 5)
      .map((t) => ({
        key: `tab:${t.id}`,
        type: 'tab' as const,
        title: t.title || displayLabel(t.url || t.pendingUrl || null),
        subtitle: displayLabel(t.url || t.pendingUrl || null),
        hint: 'Switch to tab',
        payload: { tabId: t.id },
        score: 1,
      }))
    for (const row of ctx.history.slice(0, Math.max(0, limit - items.length))) {
      items.push({
        key: `history:${row.url}`,
        type: 'history',
        title: row.title || displayLabel(row.url),
        subtitle: displayLabel(row.url),
        hint: 'Recent',
        payload: { url: row.url },
        score: 0.5,
      })
    }
    return items.slice(0, limit)
  }

  const items: PaletteItem[] = []
  const engine = ctx.searchEngine ?? DEFAULT_SEARCH_ENGINE
  const direct = normalizeInput(query, engine)
  const directIsSearch = !!direct && direct === searchUrl(query, engine)

  if (direct && !directIsSearch) {
    const explicit = /^https?:\/\//i.test(query) || query === 'about:blank'
    items.push({
      key: `url:${direct}`,
      type: 'url',
      title: `Open ${displayLabel(direct)}`,
      subtitle: direct,
      hint: ctx.mode === 'edit' ? 'Go' : 'New tab',
      payload: { url: direct },
      score: explicit ? 100 : 6.5,
    })
  }

  for (const t of ctx.tabs) {
    const score = fuzzyBest(query, [t.title, t.url || t.pendingUrl])
    if (score <= 0) continue
    const sameSpace = t.spaceId === ctx.activeSpaceId
    items.push({
      key: `tab:${t.id}`,
      type: 'tab',
      title: t.title || displayLabel(t.url || t.pendingUrl || null),
      subtitle: sameSpace
        ? displayLabel(t.url || t.pendingUrl || null)
        : `${displayLabel(t.url || t.pendingUrl || null)} — ${spaceName(t.spaceId)}`,
      hint: 'Switch to tab',
      payload: { tabId: t.id },
      score: score * 2 + (sameSpace ? 0.4 : 0),
    })
  }

  for (const space of ctx.spaces) {
    for (const f of space.favorites) {
      const score = fuzzyBest(query, [f.title, f.url])
      if (score <= 0) continue
      items.push({
        key: `favorite:${space.id}:${f.url}`,
        type: 'favorite',
        title: f.title || displayLabel(f.url),
        subtitle: `${displayLabel(f.url)} — ${space.name}`,
        hint: 'Favorite',
        payload: { url: f.url },
        score: score * 1.6,
      })
    }
  }

  for (const action of ctx.actions) {
    const score = Math.max(
      fuzzyScore(query, action.title),
      action.keywords ? fuzzyScore(query, action.keywords) * 0.9 : 0,
    )
    if (score <= 0) continue
    items.push({
      key: `action:${action.id}`,
      type: 'action',
      title: action.title,
      hint: action.hint ?? 'Action',
      payload: { actionId: action.id },
      score: score * 1.5,
    })
  }

  for (const row of ctx.history) {
    const score = fuzzyBest(query, [row.title, row.url])
    if (score <= 0) continue
    items.push({
      key: `history:${row.url}`,
      type: 'history',
      title: row.title || displayLabel(row.url),
      subtitle: displayLabel(row.url),
      hint: 'History',
      payload: { url: row.url },
      score: score * 1.1 + Math.min(row.visits, 5) * 0.05,
    })
  }

  for (const row of ctx.archived) {
    const score = fuzzyBest(query, [row.title, row.url])
    if (score <= 0) continue
    items.push({
      key: `archived:${row.id}`,
      type: 'archived',
      title: row.title || displayLabel(row.url),
      subtitle: `${displayLabel(row.url)} — archived from ${row.spaceName}`,
      hint: 'Archived',
      payload: { url: row.url },
      score: score * 1.0,
    })
  }

  items.push({
    key: 'search',
    type: 'search',
    title: `Search ${searchEngine(engine).name} for “${query}”`,
    hint: ctx.mode === 'edit' ? 'Go' : 'New tab',
    payload: { url: searchUrl(query, engine) },
    score: 0.45,
  })

  const seen = new Set<string>()
  return items
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const dedupe = item.payload.url
        ? `${item.type === 'tab' ? 'tab' : 'url'}:${item.payload.url}`
        : item.key
      if (seen.has(dedupe)) return false
      seen.add(dedupe)
      return true
    })
    .slice(0, limit)
}
