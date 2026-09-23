import type { Session } from 'electron'

/**
 * The Chrome Web Store's pages. Aura doesn't run Chrome extensions, but the
 * store still has to be safe to visit: Chromium hands its pages a private
 * install API (`chrome.webstorePrivate`) whose calls, in Electron, reach code
 * that expects Chrome's Safe Browsing service — which Electron doesn't have —
 * and the whole browser crashes as an item page loads. So store pages open
 * read-only here: they run no scripts at all.
 */
export const WEB_STORE_PAGES = [
  'https://chromewebstore.google.com/*',
  'https://chrome.google.com/webstore*',
]

/** The store's own app code: refused too, in case a page ever gets past the CSP. */
export const WEB_STORE_SCRIPTS = ['https://www.gstatic.com/_/mss/boq-chrome-webstore/*']

const SCRIPTS_OFF = "script-src 'none'; object-src 'none'"

/**
 * Response headers with one more policy: no scripts. Policies stack — a page
 * must satisfy every one — so this wins over whatever the store sends.
 */
export function withScriptsOff(
  headers: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...headers }
  const key =
    Object.keys(next).find((k) => k.toLowerCase() === 'content-security-policy') ??
    'Content-Security-Policy'
  next[key] = [...(next[key] ?? []), SCRIPTS_OFF]
  return next
}

/**
 * Applied to every session the first time it's used, before any of its tabs
 * exist. The store's HTML is sent no-store and it has no service worker, so
 * every visit comes through here. These are the session's only
 * onHeadersReceived and onBeforeRequest listeners.
 */
export function guardWebStore(session: Session): void {
  session.webRequest.onHeadersReceived({ urls: WEB_STORE_PAGES }, (details, callback) => {
    const page = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
    callback(page ? { responseHeaders: withScriptsOff(details.responseHeaders) } : {})
  })
  session.webRequest.onBeforeRequest({ urls: WEB_STORE_SCRIPTS }, (_details, callback) =>
    callback({ cancel: true }),
  )
}
