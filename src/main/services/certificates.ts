import type { App, Certificate, Session, WebContents } from 'electron'
import { hostOf } from '@shared/net-errors'

interface Refusal {
  host: string
  fingerprint: string
}

/**
 * Certificate errors, decided as Chrome decides them. A certificate the system
 * does not trust is refused, so the page fails with ERR_CERT_… and the tab
 * explains why. Choosing "Proceed" there accepts *that* certificate for *that*
 * site, in that Space only, until Aura quits; a different certificate on the
 * same site is refused again. Pages loaded that way show as not secure.
 */
export class CertificateDecisions {
  /** Per storage partition: `host|fingerprint` pairs you chose to accept. */
  private readonly accepted = new WeakMap<Session, Set<string>>()
  /** The certificate each page was last refused, waiting for a "Proceed". */
  private readonly refused = new WeakMap<WebContents, Refusal>()

  install(app: App): void {
    app.on('certificate-error', (event, wc, url, _error, certificate, callback, isMainFrame) => {
      if (this.decide(wc, url, certificate, isMainFrame)) {
        event.preventDefault()
        callback(true)
      }
      // Otherwise Electron refuses it, which is the answer.
    })
  }

  /** True when the certificate was accepted earlier; a refusal is remembered for "Proceed". */
  decide(
    wc: WebContents,
    url: string,
    certificate: Pick<Certificate, 'fingerprint'>,
    isMainFrame: boolean,
  ): boolean {
    const host = hostOf(url)
    if (this.accepted.get(wc.session)?.has(`${host}|${certificate.fingerprint}`)) return true
    if (isMainFrame) this.refused.set(wc, { host, fingerprint: certificate.fingerprint })
    return false
  }

  /**
   * "Proceed to host (unsafe)": accept the certificate this page was just
   * refused. Only that one, and only when it was refused for this very site.
   */
  accept(wc: WebContents, url: string): boolean {
    const refusal = this.refused.get(wc)
    if (!refusal || refusal.host !== hostOf(url)) return false
    let set = this.accepted.get(wc.session)
    if (!set) {
      set = new Set()
      this.accepted.set(wc.session, set)
    }
    set.add(`${refusal.host}|${refusal.fingerprint}`)
    this.refused.delete(wc)
    return true
  }

  /** The site loads only because a certificate was accepted for it by hand. */
  isAccepted(session: Session, url: string): boolean {
    const host = hostOf(url)
    if (!host) return false
    for (const key of this.accepted.get(session) ?? []) if (key.startsWith(`${host}|`)) return true
    return false
  }
}

export const certificates = new CertificateDecisions()
