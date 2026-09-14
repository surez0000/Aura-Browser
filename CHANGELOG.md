# Changelog

All notable changes to Aurora. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[semver](https://semver.org). See [docs/RELEASING.md](docs/RELEASING.md) for how
a release is cut.

## [Unreleased]

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
  is not Apple-signed, Aurora swaps its own bundle (checksum-verified) instead
  of relying on Squirrel.Mac.
- **Packaging** — DMG + zip (macOS), one-click NSIS (Windows), AppImage + deb
  (Linux) via electron-builder; release workflow on `v*` tags.
