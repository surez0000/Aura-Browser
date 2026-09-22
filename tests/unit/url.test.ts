import { describe, expect, it } from 'vitest'
import { displayLabel, fullLabel, normalizeInput, searchUrl } from '@/lib/url'

describe('normalizeInput', () => {
  it('returns null for empty input', () => {
    expect(normalizeInput('')).toBeNull()
    expect(normalizeInput('   ')).toBeNull()
  })

  it('passes through http(s) URLs', () => {
    expect(normalizeInput('https://example.com/a?b=c')).toBe('https://example.com/a?b=c')
    expect(normalizeInput('http://example.com')).toBe('http://example.com')
  })

  it('allows about:blank', () => {
    expect(normalizeInput('about:blank')).toBe('about:blank')
  })

  it('upgrades bare domains to https', () => {
    expect(normalizeInput('example.com')).toBe('https://example.com')
    expect(normalizeInput('news.ycombinator.com/item?id=1')).toBe(
      'https://news.ycombinator.com/item?id=1',
    )
  })

  it('sends machines on this network to http, not https', () => {
    // A LAN machine rarely carries a certificate, so https only fails to connect.
    expect(normalizeInput('localhost:5173')).toBe('http://localhost:5173')
    expect(normalizeInput('127.0.0.1:8080/x')).toBe('http://127.0.0.1:8080/x')
    expect(normalizeInput('192.168.1.5')).toBe('http://192.168.1.5')
    expect(normalizeInput('10.0.0.5/setup')).toBe('http://10.0.0.5/setup')
    expect(normalizeInput('172.16.0.9')).toBe('http://172.16.0.9')
    expect(normalizeInput('mymachine.local')).toBe('http://mymachine.local')
    expect(normalizeInput('printer.lan')).toBe('http://printer.lan')
    // A public address still gets https.
    expect(normalizeInput('93.184.216.34')).toBe('https://93.184.216.34')
  })

  it('treats a trailing slash or a path as "this is a machine, go"', () => {
    expect(normalizeInput('localmachine/')).toBe('http://localmachine/')
    expect(normalizeInput('nas/')).toBe('http://nas/')
    expect(normalizeInput('intranet/docs')).toBe('http://intranet/docs')
    expect(normalizeInput('build-box/status?full=1')).toBe('http://build-box/status?full=1')
  })

  it('navigates to a machine name carrying a port', () => {
    // These parse as scheme "myserver:" to a naive reader, and used to search.
    expect(normalizeInput('myserver:8080')).toBe('http://myserver:8080')
    expect(normalizeInput('devbox:3000/app')).toBe('http://devbox:3000/app')
  })

  it('handles IPv6 literals, bracketing them as a URL needs', () => {
    expect(normalizeInput('::1')).toBe('http://[::1]')
    expect(normalizeInput('fe80::1')).toBe('http://[fe80::1]')
    expect(normalizeInput('[::1]:8080/x')).toBe('http://[::1]:8080/x')
  })

  it('keeps numeric shorthand a search, not a host', () => {
    // "10:30" is a time and "24/7" is a phrase; neither is a machine.
    expect(normalizeInput('10:30')).toBe(searchUrl('10:30'))
    expect(normalizeInput('24/7')).toBe(searchUrl('24/7'))
    // All hex digits and colons, but a timestamp rather than an IPv6 address.
    expect(normalizeInput('10:30:45')).toBe(searchUrl('10:30:45'))
    expect(normalizeInput('1/2')).toBe(searchUrl('1/2'))
  })

  it('still searches a bare word with nothing to mark it as an address', () => {
    // "localmachine" alone is indistinguishable from a search term, as in every
    // other browser; "localmachine/" is the user saying it is a host.
    expect(normalizeInput('localmachine')).toBe(searchUrl('localmachine'))
    expect(normalizeInput('recipes')).toBe(searchUrl('recipes'))
  })

  it('searches for plain text', () => {
    expect(normalizeInput('aurora borealis forecast')).toBe(searchUrl('aurora borealis forecast'))
  })

  it('never returns a non-web scheme — dangerous schemes become searches', () => {
    for (const input of ['javascript:alert(1)', 'file:///etc/passwd', 'chrome://settings']) {
      const out = normalizeInput(input)
      expect(out).toBe(searchUrl(input))
    }
  })
})

describe('displayLabel', () => {
  it('labels empty as New Tab', () => {
    expect(displayLabel(null)).toBe('New Tab')
    expect(displayLabel('')).toBe('New Tab')
  })

  it('shows the host without www', () => {
    expect(displayLabel('https://www.example.com/path')).toBe('example.com')
    expect(displayLabel('http://localhost:5173/x')).toBe('localhost:5173')
  })

  it('labels internal pages', () => {
    expect(displayLabel('about:blank')).toBe('Blank')
    expect(displayLabel('data:text/html,hello')).toBe('Aura Browser')
  })
})

describe('fullLabel', () => {
  it('shows the whole address for a wide address bar', () => {
    expect(fullLabel('https://example.com/a/b?c=d#e')).toBe('example.com/a/b?c=d#e')
    expect(fullLabel('http://192.168.1.5:8080/admin')).toBe('http://192.168.1.5:8080/admin')
  })

  it('drops a redundant https:// and a lone trailing slash', () => {
    expect(fullLabel('https://example.com/')).toBe('example.com')
    expect(fullLabel('https://example.com')).toBe('example.com')
    expect(fullLabel('http://nas/')).toBe('http://nas')
    // Anything deeper than the root is kept exactly as it is.
    expect(fullLabel('http://nas/photos/')).toBe('http://nas/photos/')
  })

  it('keeps internal pages readable and empty input empty', () => {
    expect(fullLabel('about:blank')).toBe('Blank')
    expect(fullLabel(null)).toBe('')
  })
})
