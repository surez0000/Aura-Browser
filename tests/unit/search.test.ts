import { describe, expect, it } from 'vitest'
import { buildSearchUrl, SEARCH_ENGINE_IDS, SEARCH_ENGINES, searchEngine } from '@shared/search'
import { composePalette } from '@/lib/palette'
import { normalizeInput } from '@/lib/url'

describe('search engines', () => {
  it('every engine yields an https URL with the query encoded once', () => {
    for (const id of SEARCH_ENGINE_IDS) {
      expect(SEARCH_ENGINES[id].template.split('%s')).toHaveLength(2)
      const url = new URL(buildSearchUrl('a b&c', id))
      expect(url.protocol).toBe('https:')
      expect(url.search).toContain('a%20b%26c')
    }
  })

  it('defaults to DuckDuckGo and falls back for unknown ids', () => {
    expect(buildSearchUrl('cats')).toBe('https://duckduckgo.com/?q=cats')
    expect(searchEngine('altavista').id).toBe('duckduckgo')
    expect(searchEngine(undefined).id).toBe('duckduckgo')
  })

  it('normalizeInput searches with the chosen engine', () => {
    expect(normalizeInput('cats', 'bing')).toBe('https://www.bing.com/search?q=cats')
    expect(normalizeInput('example.com', 'bing')).toBe('https://example.com')
  })

  it('the palette fallback names the engine and uses it', () => {
    const items = composePalette({
      query: 'cats',
      mode: 'new',
      tabs: [],
      spaces: [],
      activeSpaceId: 's1',
      history: [],
      archived: [],
      actions: [],
      searchEngine: 'ecosia',
    })
    const search = items.find((i) => i.type === 'search')
    expect(search?.title).toBe('Search Ecosia for “cats”')
    expect(search?.payload.url).toBe('https://www.ecosia.org/search?q=cats')
    // Plain text must not also appear as an "Open …" URL item.
    expect(items.some((i) => i.type === 'url')).toBe(false)
  })
})
