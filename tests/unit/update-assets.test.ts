import { describe, expect, it } from 'vitest'
import {
  assetUrl,
  bundleIdFromPlist,
  classifyCodesign,
  macBundleFromExe,
  parseUpdateYaml,
  pickMacZip,
  releasesPageUrl,
} from '../../src/main/services/update-assets'

describe('update config', () => {
  it('parses electron-builder app-update.yml', () => {
    const cfg = parseUpdateYaml(
      'provider: github\nowner: surez0000\nrepo: Aura-Browser\nupdaterCacheDirName: aurora-updater\n',
    )
    expect(cfg).toEqual({
      provider: 'github',
      owner: 'surez0000',
      repo: 'Aura-Browser',
      url: undefined,
    })
    expect(parseUpdateYaml('nothing here')).toBeNull()
  })

  it('derives the release page and asset URLs for GitHub', () => {
    const cfg = { provider: 'github', owner: 'surez0000', repo: 'Aura-Browser' }
    expect(releasesPageUrl(cfg)).toBe('https://github.com/surez0000/Aura-Browser/releases')
    expect(assetUrl(cfg, '0.2.0', 'AuraBrowser-0.2.0-mac-arm64.zip')).toBe(
      'https://github.com/surez0000/Aura-Browser/releases/download/v0.2.0/AuraBrowser-0.2.0-mac-arm64.zip',
    )
  })

  it('treats the scaffold placeholder as unconfigured', () => {
    expect(releasesPageUrl({ provider: 'github', owner: 'CHANGE_ME', repo: 'aurora' })).toBeNull()
    expect(releasesPageUrl(null)).toBeNull()
  })

  it('supports the generic provider', () => {
    const cfg = { provider: 'generic', url: 'http://127.0.0.1:8080/' }
    expect(releasesPageUrl(cfg)).toBe('http://127.0.0.1:8080/')
    expect(assetUrl(cfg, '0.2.0', 'a b.zip')).toBe('http://127.0.0.1:8080/a%20b.zip')
  })
})

describe('asset selection', () => {
  const files = [
    { url: 'AuraBrowser-0.2.0-mac-x64.zip', sha512: 'x' },
    { url: 'AuraBrowser-0.2.0-mac-x64.dmg', sha512: 'y' },
    { url: 'AuraBrowser-0.2.0-mac-arm64.zip', sha512: 'z' },
    { url: 'AuraBrowser-0.2.0-mac-arm64.dmg', sha512: 'w' },
  ]
  it('picks the zip for the running architecture', () => {
    expect(pickMacZip(files, 'arm64')?.url).toBe('AuraBrowser-0.2.0-mac-arm64.zip')
    expect(pickMacZip(files, 'x64')?.url).toBe('AuraBrowser-0.2.0-mac-x64.zip')
  })
  it('falls back to a universal zip', () => {
    expect(pickMacZip([{ url: 'AuraBrowser-0.2.0-mac.zip', sha512: 'u' }], 'arm64')?.url).toBe(
      'AuraBrowser-0.2.0-mac.zip',
    )
    expect(pickMacZip([{ url: 'Aura Browser.dmg', sha512: 'd' }], 'arm64')).toBeNull()
  })
})

describe('macOS specifics', () => {
  it('classifies codesign output', () => {
    expect(classifyCodesign('Aura Browser.app: code object is not signed at all')).toBe('unsigned')
    expect(classifyCodesign('Identifier=dev.aurora\nSignature=adhoc\nTeamIdentifier=not set')).toBe(
      'adhoc',
    )
    expect(
      classifyCodesign('Authority=Developer ID Application: X (ABC)\nTeamIdentifier=ABC123'),
    ).toBe('developer-id')
    expect(classifyCodesign('')).toBe('unknown')
  })

  it('reads the bundle id from Info.plist', () => {
    expect(
      bundleIdFromPlist(
        '<plist><dict><key>CFBundleIdentifier</key>\n\t<string>dev.aurora.browser</string></dict></plist>',
      ),
    ).toBe('dev.aurora.browser')
    expect(bundleIdFromPlist('<plist/>')).toBeNull()
  })

  it('finds the bundle from the executable, refusing disk images', () => {
    expect(macBundleFromExe('/Applications/Aura Browser.app/Contents/MacOS/Aura Browser')).toBe(
      '/Applications/Aura Browser.app',
    )
    expect(
      macBundleFromExe('/Volumes/Aura Browser 0.1.0/Aura Browser.app/Contents/MacOS/Aura Browser'),
    ).toBeNull()
    expect(macBundleFromExe('/usr/local/bin/aurora')).toBeNull()
  })
})
