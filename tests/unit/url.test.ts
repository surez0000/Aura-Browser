import { describe, expect, it } from 'vitest'
import { displayLabel, normalizeInput, searchUrl } from '@/lib/url'

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

  it('handles localhost and IPs', () => {
    expect(normalizeInput('localhost:5173')).toBe('https://localhost:5173')
    expect(normalizeInput('127.0.0.1:8080/x')).toBe('https://127.0.0.1:8080/x')
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
