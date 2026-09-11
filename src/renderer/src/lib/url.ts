const SEARCH_URL = 'https://duckduckgo.com/?q='

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const DOMAIN_RE = /^[^\s/]+\.[^\s]{2,}(\/\S*)?$/
const LOCALHOST_RE = /^localhost(:\d+)?(\/\S*)?$/
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/\S*)?$/

export function searchUrl(query: string): string {
  return `${SEARCH_URL}${encodeURIComponent(query)}`
}

/**
 * Turn palette/pill input into a navigable URL.
 * Anything not obviously a URL becomes a DuckDuckGo search (privacy default).
 * Only http(s)/about:blank ever come back — other schemes are searched, not run.
 */
export function normalizeInput(raw: string): string | null {
  const input = raw.trim()
  if (!input) return null

  // "localhost:5173" would otherwise parse as scheme "localhost".
  if (LOCALHOST_RE.test(input) || IPV4_RE.test(input)) {
    return `https://${input}`
  }

  if (SCHEME_RE.test(input)) {
    if (/^https?:\/\//i.test(input)) return input
    if (input === 'about:blank') return input
    return searchUrl(input)
  }

  if (DOMAIN_RE.test(input)) {
    return `https://${input}`
  }
  return searchUrl(input)
}

/** Compact label for the URL pill. */
export function displayLabel(url: string | null | undefined): string {
  if (!url) return 'New Tab'
  if (url === 'about:blank') return 'Blank'
  if (url.startsWith('data:')) return 'Aurora'
  try {
    const parsed = new URL(url)
    const host = parsed.host.replace(/^www\./, '')
    return host || url
  } catch {
    return url
  }
}
