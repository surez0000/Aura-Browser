import { buildSearchUrl, DEFAULT_SEARCH_ENGINE, type SearchEngineId } from '@shared/search'

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const DOMAIN_RE = /^[^\s/]+\.[^\s]{2,}(\/\S*)?$/
const LOCALHOST_RE = /^localhost(:\d+)?(\/\S*)?$/i
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/\S*)?$/
/** IPv6 in the form a URL takes: [::1], [fe80::1]:8080/status */
const IPV6_BRACKET_RE = /^\[[0-9a-fA-F:.]+\](:\d+)?(\/\S*)?$/
/**
 * IPv6 as people type it — ::1, fe80::1 — which still needs bracketing.
 * A plain "hex digits and colons" test is not enough: "10:30:45" is all of
 * those and is a timestamp, so require the "::" of the compressed form or all
 * eight groups written out.
 */
function isBareIpv6(input: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(input) || !input.includes(':')) return false
  return input.includes('::') || input.split(':').length === 8
}
/**
 * A machine name carrying a port: myserver:8080, build-box:3000/status.
 * The lookahead requires a letter in the name, so "10:30" stays a search — a
 * purely numeric label is a time or a score, never a host someone types.
 */
const HOST_PORT_RE =
  /^(?=[a-zA-Z0-9.-]*[a-zA-Z])[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9-]+)*:\d{1,5}(\/\S*)?$/
/** A machine name carrying a path or a trailing slash: nas/, intranet/docs.
 *  Same letter requirement, so "24/7" and "1/2" stay searches. */
const HOST_PATH_RE = /^(?=[a-zA-Z0-9-]*[a-zA-Z])[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\/\S*$/
/** Suffixes the standards reserve for names that only resolve on this network. */
const LOCAL_TLD_RE = /\.(local|lan|internal|intranet|home|corp|localdomain)$/i

export function searchUrl(query: string, engine: SearchEngineId = DEFAULT_SEARCH_ENGINE): string {
  return buildSearchUrl(query, engine)
}

/**
 * Is this host a machine on this network rather than a site on the internet?
 * Local machines almost never carry a certificate, so forcing https on them
 * only produces a connection error; public names get https as before.
 */
function isLocalTarget(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  // Any IPv6 literal typed by hand is a machine here, not a public site.
  if (host.includes(':')) return true
  // A single label — "nas", "printer", "build-box" — is an intranet name.
  if (!host.includes('.')) return true
  if (LOCAL_TLD_RE.test(host)) return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    return (
      a === 0 || // this host
      a === 127 || // loopback
      a === 10 || // private
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 169 && b === 254) // link-local
    )
  }
  return false
}

/** Strip any path and port, leaving the bare host. */
function hostOf(input: string): string {
  const authority = input.split('/')[0] ?? ''
  if (authority.startsWith('[')) return authority.slice(0, authority.indexOf(']') + 1)
  return authority.replace(/:\d+$/, '')
}

function navigable(input: string, host = hostOf(input)): string {
  return `${isLocalTarget(host) ? 'http' : 'https'}://${input}`
}

/**
 * Turn palette/pill input into a navigable URL.
 * Anything not obviously an address becomes a web search with the chosen
 * provider (DuckDuckGo by default). Only http(s)/about:blank ever come back —
 * other schemes are searched, not run.
 *
 * Addresses on this network are recognised the way a browser's address bar
 * recognises them, which a plain "has a dot in it" rule misses: a machine name
 * with a trailing slash or a path (`nas/`, `intranet/docs`), a machine name
 * with a port (`myserver:8080`, which otherwise parses as scheme "myserver"),
 * and IPv6 literals. They also get http rather than https, because a machine
 * on the LAN rarely carries a certificate and https would only fail to connect.
 */
export function normalizeInput(
  raw: string,
  engine: SearchEngineId = DEFAULT_SEARCH_ENGINE,
): string | null {
  const input = raw.trim()
  if (!input) return null

  // Before the scheme check: "fe80::1" and "myserver:8080" both look like a
  // scheme to the naked regex, and "localhost:5173" is the classic case.
  if (isBareIpv6(input)) return `http://[${input}]`
  if (IPV6_BRACKET_RE.test(input)) return navigable(input)
  if (LOCALHOST_RE.test(input) || IPV4_RE.test(input) || HOST_PORT_RE.test(input)) {
    return navigable(input)
  }
  // A trailing slash or a path is the user saying "this is a machine, go".
  if (HOST_PATH_RE.test(input)) return navigable(input)

  if (SCHEME_RE.test(input)) {
    if (/^https?:\/\//i.test(input)) return input
    if (input === 'about:blank') return input
    return searchUrl(input, engine)
  }

  if (DOMAIN_RE.test(input)) return navigable(input)

  return searchUrl(input, engine)
}

/** Compact label for the URL pill. */
export function displayLabel(url: string | null | undefined): string {
  if (!url) return 'New Tab'
  if (url === 'about:blank') return 'Blank'
  if (url.startsWith('data:')) return 'Aura Browser'
  try {
    const parsed = new URL(url)
    const host = parsed.host.replace(/^www\./, '')
    return host || url
  } catch {
    return url
  }
}

/**
 * Full address for a wide address bar. Shows the whole URL — path, query and
 * all — dropping only a redundant `https://` and a lone trailing slash, the
 * way every address bar does. `http://` stays visible: on a wide bar it is
 * worth seeing, and it pairs with the security icon beside it.
 */
export function fullLabel(url: string | null | undefined): string {
  if (!url) return ''
  if (url === 'about:blank' || url.startsWith('data:')) return displayLabel(url)
  const trimmed = url.replace(/^https:\/\//i, '')
  // A lone trailing slash carries nothing; anything deeper is kept as typed.
  return trimmed.replace(/^([^/]*\/\/)?([^/]+)\/$/, '$1$2')
}
