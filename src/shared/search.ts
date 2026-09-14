/**
 * Search providers. DuckDuckGo stays the default (privacy default); the user
 * can pick another in Settings. Templates use %s for the encoded query.
 */
export const SEARCH_ENGINE_IDS = [
  'duckduckgo',
  'google',
  'bing',
  'brave',
  'startpage',
  'ecosia',
] as const
export type SearchEngineId = (typeof SEARCH_ENGINE_IDS)[number]

export interface SearchEngine {
  id: SearchEngineId
  name: string
  template: string
}

export const SEARCH_ENGINES: Record<SearchEngineId, SearchEngine> = {
  duckduckgo: { id: 'duckduckgo', name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  google: { id: 'google', name: 'Google', template: 'https://www.google.com/search?q=%s' },
  bing: { id: 'bing', name: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  brave: { id: 'brave', name: 'Brave Search', template: 'https://search.brave.com/search?q=%s' },
  startpage: {
    id: 'startpage',
    name: 'Startpage',
    template: 'https://www.startpage.com/sp/search?query=%s',
  },
  ecosia: { id: 'ecosia', name: 'Ecosia', template: 'https://www.ecosia.org/search?q=%s' },
}

export const DEFAULT_SEARCH_ENGINE: SearchEngineId = 'duckduckgo'

/** Resolve an id defensively (settings persisted by an older build may be stale). */
export function searchEngine(id: string | null | undefined): SearchEngine {
  return (
    (id ? (SEARCH_ENGINES as Record<string, SearchEngine | undefined>)[id] : undefined) ??
    SEARCH_ENGINES[DEFAULT_SEARCH_ENGINE]
  )
}

export function buildSearchUrl(query: string, id: SearchEngineId = DEFAULT_SEARCH_ENGINE): string {
  return searchEngine(id).template.replace('%s', encodeURIComponent(query))
}
