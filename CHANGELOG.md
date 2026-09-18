# Changelog

All notable changes to Aura Browser. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[semver](https://semver.org). See [docs/RELEASING.md](docs/RELEASING.md) for how
a release is cut.

## [Unreleased]

### Added

- **History manager** (⌘Y, or History → Show Full History, or the command
  palette). Everything visited, newest first and grouped by day, with search,
  per-visit delete, "forget every visit to this site", and clear by range
  (last hour, 24 hours, 7 days, everything). Clicking an entry opens it.
  Incognito Spaces are never recorded, and the panel says so.

## [1.0.0] — 2026-09-18

First stable release. Everything below shipped across the 0.1.x line and is
carried forward unchanged; 1.0 marks the browser as daily-drivable rather than
adding new behaviour.

### Changed

- New brand icon.

## [0.1.4] — 2026-09-18

### Fixed

- The screen-share picker and the command palette were see-through over page
  content: they open inside a wrapper whose animated opacity starts a new
  backdrop root, so `backdrop-filter` had nothing to blur. Both now use a solid
  ground, and the scrim behind them is stronger.
- Chromium's bright system focus ring no longer appears on click. Keyboard
  focus is still shown, in the Space's accent colour.

## [0.1.3] — 2026-09-18

### Added

- **Screen sharing works.** A page calling `getDisplayMedia` now gets an
  in-app picker showing every screen and window with live thumbnails; the
  chosen surface is the only thing handed over, and Cancel denies. On macOS,
  when Screen Recording has not been granted, the dialog says so and opens the
  right System Settings pane. The capture stack is warmed at launch so the
  picker appears in about a second instead of up to twelve.
- **Per-Space gradients.** Each Space picks a two-stop gradient the way Arc
  does, and the aurora, the Space dot, and the accent all follow it.

### Changed

- **Show-on-hover sidebar replaced by a compact rail.** ⌘S now switches
  between the full sidebar and a 60 px rail listing one favicon per tab, both
  of which sit in the layout. The old mode slid a panel over the page whenever
  the pointer neared the window edge, which opened and closed unpredictably;
  nothing reacts to hover any more, so that cannot happen. Clicking a favicon
  activates the tab, middle-click closes, right-click opens the tab menu, and
  dragging still reorders or moves a tab to another Space.
- Spaces are far easier to tell apart: the aurora mesh keeps its proven
  luminance bands but is much more saturated, so hue reads clearly.

## [0.1.2] — 2026-09-15

### Added

- Update progress is prominent but never in the way: a card in the sidebar
  and a pill in the top strip when the sidebar is hidden show "Starting
  download", the percentage, and a one-click **Restart to update**; the Dock
  (macOS) or taskbar (Windows) icon shows the same progress. "Later" hides the
  notice for that version until the next launch.

## [0.1.1] — 2026-09-15

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
