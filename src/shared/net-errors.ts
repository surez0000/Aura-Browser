/**
 * Pages that did not load, sorted and worded the way Chrome does it. Pure
 * data: the main process classifies a failure, the chrome draws it, and the
 * tests read both without a browser.
 */

export type LoadErrorKind =
  /** "Your connection is not private": a certificate Aura could not trust. */
  | 'certificate'
  /** "This site can’t provide a secure connection": TLS itself failed. */
  | 'secure'
  /** "No internet". */
  | 'offline'
  /** "This site can’t be reached": DNS, refused, timed out, reset. */
  | 'unreachable'
  /** "This page isn’t working": the server answered, badly. */
  | 'broken'
  /** "This page can’t be found": an empty 404. */
  | 'notFound'
  /** "This page has been blocked". */
  | 'blocked'

export interface LoadError {
  /** The page that was asked for; the address bar keeps showing it. */
  url: string
  /** Chromium's net error (negative), or the HTTP status of an empty error response. */
  code: number
  /** As Chrome prints it: ERR_CERT_AUTHORITY_INVALID, HTTP ERROR 404. */
  name: string
  kind: LoadErrorKind
  /** A certificate problem you may accept for this site, as Chrome allows. */
  canProceed: boolean
}

export interface LoadErrorText {
  title: string
  /** One sentence; `{host}` marks where the site's name goes, so it can be set in bold. */
  summary: string
  /** Chrome's "Try:" list. */
  tips: string[]
  /** Behind "Advanced" on a certificate page. */
  advanced: string | null
}

/** Certificate errors Chrome never lets you click through. */
const NOT_OVERRIDABLE = new Set([
  'ERR_CERT_REVOKED',
  'ERR_CERT_INVALID',
  'ERR_CERT_KNOWN_INTERCEPTION_BLOCKED',
  'ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN',
])

const OFFLINE = new Set(['ERR_INTERNET_DISCONNECTED', 'ERR_NETWORK_IO_SUSPENDED'])

const BROKEN = new Set([
  'ERR_TOO_MANY_REDIRECTS',
  'ERR_EMPTY_RESPONSE',
  'ERR_INVALID_RESPONSE',
  'ERR_INVALID_HTTP_RESPONSE',
  'ERR_INVALID_REDIRECT',
  'ERR_UNSAFE_REDIRECT',
  'ERR_CONTENT_DECODING_FAILED',
  'ERR_CONTENT_LENGTH_MISMATCH',
  'ERR_INCOMPLETE_CHUNKED_ENCODING',
  'ERR_HTTP2_PROTOCOL_ERROR',
  'ERR_QUIC_PROTOCOL_ERROR',
  'ERR_HTTP_RESPONSE_CODE_FAILURE',
  'ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH',
  'ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION',
  'ERR_RESPONSE_HEADERS_MULTIPLE_LOCATION',
  'ERR_RESPONSE_HEADERS_TOO_BIG',
])

const BLOCKED = new Set([
  'ERR_BLOCKED_BY_CLIENT',
  'ERR_BLOCKED_BY_ADMINISTRATOR',
  'ERR_BLOCKED_BY_RESPONSE',
  'ERR_BLOCKED_BY_CSP',
  'ERR_BLOCKED_BY_ORB',
  'ERR_UNSAFE_PORT',
])

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** A failed load as Electron reports it: `did-fail-load`'s code and description. */
export function classifyLoadError(code: number, description: string, url: string): LoadError {
  const name = description.replace(/^net::/, '') || `ERR_FAILED (${code})`
  const base = { url, code, name, canProceed: false }
  if (name.startsWith('ERR_CERT_') || name === 'ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN') {
    return { ...base, kind: 'certificate', canProceed: !NOT_OVERRIDABLE.has(name) }
  }
  if (name.startsWith('ERR_SSL_') || name === 'ERR_BAD_SSL_CLIENT_AUTH_CERT') {
    return { ...base, kind: 'secure' }
  }
  if (OFFLINE.has(name)) return { ...base, kind: 'offline' }
  if (BROKEN.has(name)) return { ...base, kind: 'broken' }
  if (BLOCKED.has(name)) return { ...base, kind: 'blocked' }
  return { ...base, kind: 'unreachable' }
}

/**
 * An HTTP error that came back with nothing to show. A server's own error page
 * is left alone, as in Chrome; only an empty one is replaced.
 */
export function httpLoadError(status: number, url: string): LoadError {
  return {
    url,
    code: status,
    name: `HTTP ERROR ${status}`,
    kind: status === 404 || status === 410 ? 'notFound' : 'broken',
    canProceed: false,
  }
}

const TRY_ADDRESS = 'Checking the address for typos'
const TRY_CONNECTION = 'Checking your connection, proxy and firewall'
const TRY_LATER = 'Reloading in a little while'
const TRY_OWNER = 'Contacting the site owner if it keeps happening'

function certificateDetail(name: string): string {
  const intro = 'This server could not prove that it is {host}; '
  switch (name) {
    case 'ERR_CERT_AUTHORITY_INVALID':
      return `${intro}its security certificate is not trusted by your computer’s operating system. This may be caused by a misconfiguration or an attacker intercepting your connection.`
    case 'ERR_CERT_COMMON_NAME_INVALID':
      return `${intro}its security certificate is for a different address. This may be caused by a misconfiguration or an attacker intercepting your connection.`
    case 'ERR_CERT_DATE_INVALID':
      return `${intro}its security certificate has expired or is not valid yet. This may be caused by a misconfiguration, an attacker intercepting your connection, or your computer’s clock being wrong.`
    case 'ERR_CERT_REVOKED':
      return `${intro}its security certificate has been revoked by the authority that issued it. You can’t visit {host} right now.`
    case 'ERR_CERT_WEAK_SIGNATURE_ALGORITHM':
    case 'ERR_CERT_WEAK_KEY':
      return `${intro}its security certificate uses weak security that can be forged.`
    case 'ERR_CERT_KNOWN_INTERCEPTION_BLOCKED':
      return 'Something on your computer or network is intercepting secure connections to {host}. You can’t visit it right now.'
    default:
      return `${intro}there is a problem with its security certificate. This may be caused by a misconfiguration or an attacker intercepting your connection.`
  }
}

export function describeLoadError(error: LoadError): LoadErrorText {
  const { name } = error
  const text = (title: string, summary: string, tips: string[] = []): LoadErrorText => ({
    title,
    summary,
    tips,
    advanced: null,
  })

  switch (error.kind) {
    case 'certificate':
      return {
        title: 'Your connection is not private',
        summary:
          'Attackers might be trying to steal your information from {host} (for example, passwords, messages or credit cards).',
        tips: [],
        advanced: certificateDetail(name),
      }
    case 'secure':
      if (
        name === 'ERR_SSL_VERSION_OR_CIPHER_MISMATCH' ||
        name === 'ERR_SSL_OBSOLETE_VERSION_OR_CIPHER'
      )
        return text(
          'This site can’t provide a secure connection',
          '{host} uses an unsupported security protocol.',
          [TRY_OWNER],
        )
      if (name === 'ERR_SSL_CLIENT_AUTH_CERT_NEEDED' || name === 'ERR_BAD_SSL_CLIENT_AUTH_CERT')
        return text(
          'This site can’t provide a secure connection',
          '{host} didn’t accept your login certificate, or one wasn’t provided.',
          ['Contacting your system administrator'],
        )
      return text(
        'This site can’t provide a secure connection',
        '{host} sent an invalid response.',
        [TRY_OWNER],
      )
    case 'offline':
      return text(
        'No internet',
        'You’re not connected to the internet. The page will try again once you are.',
        ['Checking the network cables, modem and router', 'Reconnecting to Wi-Fi'],
      )
    case 'broken':
      if (name === 'ERR_TOO_MANY_REDIRECTS')
        return text('This page isn’t working', '{host} redirected you too many times.', [
          'Clearing this site’s cookies, which can cause redirect loops',
        ])
      if (name === 'ERR_EMPTY_RESPONSE')
        return text('This page isn’t working', '{host} didn’t send any data.', [TRY_LATER])
      if (name.startsWith('HTTP ERROR ')) {
        if (error.code === 401 || error.code === 403)
          return text(
            `Access to {host} was denied`,
            'You don’t have authorization to view this page.',
            [TRY_OWNER],
          )
        if (error.code >= 500)
          return text(
            'This page isn’t working',
            '{host} is currently unable to handle this request.',
            [TRY_LATER],
          )
        return text('This page isn’t working', '{host} can’t handle this request right now.', [
          TRY_LATER,
        ])
      }
      return text('This page isn’t working', '{host} sent an invalid response.', [TRY_LATER])
    case 'notFound':
      return text('This page can’t be found', 'No webpage was found at this address on {host}.', [
        TRY_ADDRESS,
      ])
    case 'blocked':
      if (name === 'ERR_BLOCKED_BY_ADMINISTRATOR')
        return text(
          'This page has been blocked',
          'Your organization doesn’t allow you to view {host}.',
        )
      if (name === 'ERR_UNSAFE_PORT')
        return text(
          'This site can’t be reached',
          'The address for {host} uses a port that is blocked for safety.',
          [TRY_ADDRESS],
        )
      return text('This page has been blocked', '{host} is blocked.')
    case 'unreachable':
      switch (name) {
        case 'ERR_NAME_NOT_RESOLVED':
        case 'ERR_NAME_RESOLUTION_FAILED':
          return text(
            'This site can’t be reached',
            '{host}’s server IP address could not be found.',
            [TRY_ADDRESS, TRY_CONNECTION],
          )
        case 'ERR_CONNECTION_REFUSED':
          return text('This site can’t be reached', '{host} refused to connect.', [
            TRY_ADDRESS,
            TRY_CONNECTION,
          ])
        case 'ERR_CONNECTION_TIMED_OUT':
        case 'ERR_TIMED_OUT':
          return text('This site can’t be reached', '{host} took too long to respond.', [
            TRY_CONNECTION,
            TRY_LATER,
          ])
        case 'ERR_CONNECTION_RESET':
          return text('This site can’t be reached', 'The connection was reset.', [TRY_CONNECTION])
        case 'ERR_CONNECTION_CLOSED':
          return text('This site can’t be reached', '{host} unexpectedly closed the connection.', [
            TRY_CONNECTION,
          ])
        case 'ERR_NETWORK_CHANGED':
          return text('Your connection was interrupted', 'A network change was detected.', [
            TRY_CONNECTION,
          ])
        case 'ERR_TUNNEL_CONNECTION_FAILED':
          // The proxy answered, but would not reach the site: on a network
          // behind a proxy this is what a mistyped or vanished address looks
          // like, so it is not "No internet".
          return text(
            'This site can’t be reached',
            '{host} couldn’t be reached through your network’s proxy.',
            [TRY_ADDRESS, 'Checking whether the site is up'],
          )
        case 'ERR_PROXY_CONNECTION_FAILED':
        case 'ERR_PROXY_CERTIFICATE_INVALID':
          return text(
            'No internet',
            'Something is wrong with the proxy server, or its address is incorrect.',
            ['Checking the proxy address', 'Contacting your system administrator'],
          )
        default:
          return text('This site can’t be reached', '{host} can’t be reached right now.', [
            TRY_CONNECTION,
          ])
      }
  }
}
