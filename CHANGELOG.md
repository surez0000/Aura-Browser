# Changelog

All notable changes to Aura Browser. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[semver](https://semver.org). See [docs/RELEASING.md](docs/RELEASING.md) for how
a release is cut.

## [Unreleased]

### Changed

- **Spaces are isolated like Chrome profiles.** Each Space has its own cookies,
  logins, site data, and cache; nothing crosses between them (ADR-0004). On
  upgrade the first Space keeps your existing logins; other Spaces start
  fresh. Moving a tab to another Space reopens it there. Deleting a Space
  deletes its data.

### Added

- Page-load progress bar above the page card and a spinner in the address
  pill, so a navigation is visible even with the sidebar hidden.

### Fixed

- Show-on-hover sidebar: a panel revealed with ⌘L (no pointer inside) stayed up
  with a stale snapshot of the previous page after submitting an address; it
  now hides once the interaction ends and the live page returns.
- Show-on-hover sidebar: switching from Always visible while the panel is in
  use kept the panel over a snapshot that stretched as the layout animated.
  The panel now keeps its slot until it first hides, then the page grows once.
- Favorites: very long titles or `data:` favicons made the add request fail
  silently; values are now trimmed to the IPC schema and failures are logged.

## [0.1.0] — 2026-09-14

The first installable build: phases (a)–(c) of the roadmap plus settings and
an in-app updater.

### Added

- **Shell + tabs + sidebar** — frameless window, one Chromium view per tab,
  Spaces with per-Space favorites, pinned and Today sections, session restore.
- **Command palette** (⌘T / ⌘L) — fuzzy search across open tabs, history,
  favorites, archived tabs, and actions; URL and web-search fallbacks.
- **Incognito Space**, Today auto-archive, find-in-page, downloads panel,
  in-chrome permission prompts (deny by default).
- **Aurora Glass theme** — per-Space WebGL aurora palettes derived from one hue
  and clamped to luminance bands; light / dark / system; WCAG AA proven in CI;
  spring motion with a reduced-motion audit.
- **Settings panel** (⌘, or the gear) — appearance, sidebar mode, search
  engine, auto-archive window, and update status.
- **Search engine setting** — DuckDuckGo (default), Google, Bing, Brave
  Search, Startpage, Ecosia; the palette and address pill follow it.
- **Sidebar modes** — _Always visible_ or _Show on hover_ (⌘S toggles):
  in hover mode the page takes the full width and the sidebar floats in from
  the left edge over a snapshot of the page.
- **Auto-update** — installed builds check GitHub Releases on launch and every
  six hours; one click restarts into the new version. On macOS, where the app
  is not Apple-signed, Aura Browser swaps its own bundle (checksum-verified) instead
  of relying on Squirrel.Mac.
- **Packaging** — DMG + zip (macOS), one-click NSIS (Windows), AppImage + deb
  (Linux) via electron-builder; release workflow on `v*` tags.
