/**
 * Pure helpers for the updater (no Electron imports, so they unit-test in
 * Node): reading the publish config electron-builder embeds, choosing the
 * right release asset, classifying macOS code signatures.
 */

export interface UpdateConfig {
  provider: 'github' | 'generic' | string
  owner?: string
  repo?: string
  /** Generic provider base URL. */
  url?: string
}

export interface ReleaseFile {
  url: string
  sha512: string
  size?: number
}

/** Minimal parser for electron-builder's flat `app-update.yml` (key: value lines). */
export function parseUpdateYaml(text: string): UpdateConfig | null {
  const out: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (key && value) out[key] = value
  }
  if (!out.provider) return null
  return { provider: out.provider, owner: out.owner, repo: out.repo, url: out.url }
}

/** Where a person reads release notes / downloads by hand. */
export function releasesPageUrl(config: UpdateConfig | null): string | null {
  if (!config) return null
  if (config.provider === 'github') {
    if (!config.owner || !config.repo || config.owner === 'CHANGE_ME') return null
    return `https://github.com/${config.owner}/${config.repo}/releases`
  }
  return config.url ?? null
}

/** Direct download URL of one release asset for a given version. */
export function assetUrl(config: UpdateConfig, version: string, file: string): string | null {
  if (config.provider === 'github') {
    if (!config.owner || !config.repo) return null
    return `https://github.com/${config.owner}/${config.repo}/releases/download/v${version}/${encodeURIComponent(file)}`
  }
  if (config.url) return `${config.url.replace(/\/$/, '')}/${encodeURIComponent(file)}`
  return null
}

/**
 * Pick the macOS zip for this CPU architecture. electron-builder names assets
 * `AuraBrowser-1.2.3-mac-arm64.zip`; a universal build carries no arch suffix.
 */
export function pickMacZip(files: ReleaseFile[], arch: string): ReleaseFile | null {
  const zips = files.filter((f) => f.url.toLowerCase().endsWith('.zip'))
  const suffix = arch === 'arm64' ? 'arm64' : 'x64'
  const other = arch === 'arm64' ? 'x64' : 'arm64'
  return (
    zips.find((f) => f.url.includes(suffix)) ??
    zips.find((f) => !f.url.includes(other)) ??
    zips[0] ??
    null
  )
}

export type MacSignature = 'developer-id' | 'adhoc' | 'unsigned' | 'unknown'

/** Classify `codesign -dv` output (it reports on stderr). */
export function classifyCodesign(output: string): MacSignature {
  if (/not signed at all/i.test(output)) return 'unsigned'
  if (/Signature=adhoc/i.test(output)) return 'adhoc'
  if (/^Authority=/m.test(output) || /TeamIdentifier=(?!not set)\S+/m.test(output)) {
    return 'developer-id'
  }
  return 'unknown'
}

/** CFBundleIdentifier from an XML Info.plist (what electron-builder writes). */
export function bundleIdFromPlist(xml: string): string | null {
  const match = /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/.exec(xml)
  return match?.[1]?.trim() ?? null
}

/**
 * Can this running copy replace itself? It must be a `.app` bundle that is not
 * on a mounted disk image; the caller checks the parent directory is writable.
 */
export function macBundleFromExe(exePath: string): string | null {
  const match = /^(.*\.app)\/Contents\/MacOS\/[^/]+$/.exec(exePath)
  if (!match?.[1]) return null
  if (match[1].startsWith('/Volumes/')) return null
  return match[1]
}
