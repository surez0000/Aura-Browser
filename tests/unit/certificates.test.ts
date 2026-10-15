import { describe, expect, it } from 'vitest'
import type { Session, WebContents } from 'electron'
import { CertificateDecisions } from '../../src/main/services/certificates'

/** Just enough of a page: its own identity, and the Space (session) it lives in. */
const page = (session: object): WebContents => ({ session }) as unknown as WebContents
const cert = (fingerprint: string): { fingerprint: string } => ({ fingerprint })

describe('certificate decisions', () => {
  it('refuses an untrusted certificate until you choose to proceed, then accepts it', () => {
    const d = new CertificateDecisions()
    const space = {}
    const tab = page(space)
    expect(d.decide(tab, 'https://dev.test/a', cert('sha256/A'), true)).toBe(false)
    expect(d.isAccepted(space as Session, 'https://dev.test/')).toBe(false)

    expect(d.accept(tab, 'https://dev.test/a')).toBe(true)
    expect(d.decide(tab, 'https://dev.test/other', cert('sha256/A'), true)).toBe(true)
    // Its images and scripts too: same site, same certificate.
    expect(d.decide(tab, 'https://dev.test/app.js', cert('sha256/A'), false)).toBe(true)
    expect(d.isAccepted(space as Session, 'https://dev.test/')).toBe(true)
  })

  it('accepts only that certificate: a different one on the same site is refused again', () => {
    const d = new CertificateDecisions()
    const tab = page({})
    d.decide(tab, 'https://dev.test/', cert('sha256/A'), true)
    d.accept(tab, 'https://dev.test/')
    expect(d.decide(tab, 'https://dev.test/', cert('sha256/B'), true)).toBe(false)
  })

  it('keeps the decision to its Space', () => {
    const d = new CertificateDecisions()
    const tab = page({})
    d.decide(tab, 'https://dev.test/', cert('sha256/A'), true)
    d.accept(tab, 'https://dev.test/')
    const elsewhere = page({})
    expect(d.decide(elsewhere, 'https://dev.test/', cert('sha256/A'), true)).toBe(false)
  })

  it('will not accept for a site the page was not refused on, or with nothing refused', () => {
    const d = new CertificateDecisions()
    const tab = page({})
    expect(d.accept(tab, 'https://dev.test/')).toBe(false)
    d.decide(tab, 'https://dev.test/', cert('sha256/A'), true)
    expect(d.accept(tab, 'https://bank.test/')).toBe(false)
    // A refused subresource is not a page you were shown a warning for.
    const other = page({})
    d.decide(other, 'https://cdn.test/x.js', cert('sha256/C'), false)
    expect(d.accept(other, 'https://cdn.test/')).toBe(false)
  })
})
