import { describe, expect, it } from 'vitest'
import { classifyLoadError, describeLoadError, hostOf, httpLoadError } from '@shared/net-errors'

const URL_ = 'https://zcaldev.example.test/calendar-components/'

describe('load errors', () => {
  it('turns an untrusted certificate into Chrome’s interstitial, with a way through', () => {
    const e = classifyLoadError(-202, 'ERR_CERT_AUTHORITY_INVALID', URL_)
    expect(e).toEqual({
      url: URL_,
      code: -202,
      name: 'ERR_CERT_AUTHORITY_INVALID',
      kind: 'certificate',
      canProceed: true,
    })
    const text = describeLoadError(e)
    expect(text.title).toBe('Your connection is not private')
    expect(text.summary).toContain('{host}')
    expect(text.advanced).toMatch(/not trusted by your computer’s operating system/)
  })

  it('never offers a way past a revoked or invalid certificate', () => {
    for (const name of [
      'ERR_CERT_REVOKED',
      'ERR_CERT_INVALID',
      'ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN',
    ]) {
      const e = classifyLoadError(-206, name, URL_)
      expect(e.kind, name).toBe('certificate')
      expect(e.canProceed, name).toBe(false)
    }
  })

  it('sorts network failures the way Chrome titles them', () => {
    const title = (code: number, name: string): string =>
      describeLoadError(classifyLoadError(code, name, URL_)).title
    expect(title(-105, 'ERR_NAME_NOT_RESOLVED')).toBe('This site can’t be reached')
    expect(title(-102, 'ERR_CONNECTION_REFUSED')).toBe('This site can’t be reached')
    expect(title(-118, 'ERR_CONNECTION_TIMED_OUT')).toBe('This site can’t be reached')
    expect(title(-106, 'ERR_INTERNET_DISCONNECTED')).toBe('No internet')
    expect(title(-21, 'ERR_NETWORK_CHANGED')).toBe('Your connection was interrupted')
    // Behind a proxy, an unknown address comes back as a failed tunnel: the
    // internet is fine, the site is not there. Only an unreachable proxy is "No internet".
    expect(title(-111, 'ERR_TUNNEL_CONNECTION_FAILED')).toBe('This site can’t be reached')
    expect(title(-130, 'ERR_PROXY_CONNECTION_FAILED')).toBe('No internet')
    expect(title(-310, 'ERR_TOO_MANY_REDIRECTS')).toBe('This page isn’t working')
    expect(title(-324, 'ERR_EMPTY_RESPONSE')).toBe('This page isn’t working')
    expect(title(-107, 'ERR_SSL_PROTOCOL_ERROR')).toBe(
      'This site can’t provide a secure connection',
    )
    expect(title(-20, 'ERR_BLOCKED_BY_CLIENT')).toBe('This page has been blocked')
    expect(title(-999, 'ERR_SOMETHING_NEW')).toBe('This site can’t be reached')
  })

  it('names the site in what it says, and gives Chrome’s “Try:” list', () => {
    const text = describeLoadError(classifyLoadError(-105, 'ERR_NAME_NOT_RESOLVED', URL_))
    expect(text.summary).toBe('{host}’s server IP address could not be found.')
    expect(text.tips.length).toBeGreaterThan(0)
    expect(text.advanced).toBeNull()
  })

  it('keeps a name even when Electron gives none, and drops the net:: prefix', () => {
    expect(classifyLoadError(-2, '', URL_).name).toBe('ERR_FAILED (-2)')
    expect(classifyLoadError(-202, 'net::ERR_CERT_AUTHORITY_INVALID', URL_).name).toBe(
      'ERR_CERT_AUTHORITY_INVALID',
    )
  })

  it('describes an empty HTTP error response by its status', () => {
    expect(httpLoadError(404, URL_)).toMatchObject({ kind: 'notFound', name: 'HTTP ERROR 404' })
    expect(describeLoadError(httpLoadError(404, URL_)).title).toBe('This page can’t be found')
    expect(describeLoadError(httpLoadError(503, URL_)).summary).toBe(
      '{host} is currently unable to handle this request.',
    )
    expect(describeLoadError(httpLoadError(403, URL_)).title).toBe('Access to {host} was denied')
  })

  it('reads the host, port included, and nothing from a non-URL', () => {
    expect(hostOf('https://127.0.0.1:8443/x')).toBe('127.0.0.1:8443')
    expect(hostOf('not a url')).toBe('')
  })
})
