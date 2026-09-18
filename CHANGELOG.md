# Changelog

All notable changes to Aura Browser. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[semver](https://semver.org). See [docs/RELEASING.md](docs/RELEASING.md) for how
a release is cut.

## [Unreleased]

### Added

- **Backdrop texture** (Settings ▸ Appearance). A fine still grain in the
  spirit of Arc, or a slowly drifting particle field. Off by default, and
  both pause when the window is not in front or reduced motion is asked for.
- **Editing a Space** now opens on the Space's own gradient. A Space made
  before gradients existed stores only one stop and its backdrop spreads the
  second from it; the editor was seeding an unrelated preset, so it showed
  colours the Space had never had and saving would have applied them.
- The full sidebar has a **collapse button**, the counterpart to the rail's
  expand. Getting back to the rail previously meant the shortcut or Settings.

### Changed

- **Settings is a full dialog**, like History: one scrolling page under
  Appearance, Sidebar, Search, Tabs and Updates headings. It closes on
  Escape, on the scrim, or on its own close button. The gear alone used to
  dismiss it.
- The window **reopens at the size, position and maximized state it was left**
  in. It always opened at a fixed size, however it had been resized. The strip
  above the page is now the title bar, so the window can be dragged from the
  top and double-clicking it zooms.

### Fixed

- **Frosted surfaces were rendering flat everywhere.** Chromium 152 dropped
  `-webkit-backdrop-filter`, and the CSS build emitted only that form, so no
  glass in the app was ever blurred. The standard property is restored, and a
  test now fails if it goes missing again.
- **A Space switch left the previous Space's colours on screen** until
  something forced a repaint, which is why clicking the Space dot a second
  time appeared to apply it. The backdrop pauses when the window loses focus,
  and activating a Space hands focus to its page, so the crossfade was being
  frozen part-way. It now settles on the palette it is actually on. The same
  fault held the old colours after a system light/dark switch.
- The Space gradient preview showed the pale accent colours rather than the
  backdrop's own, so in dark mode it promised a light Space and applied a dark
  one. The hue sliders follow the theme for the same reason.

## [1.0.1] — 2026-09-18

### Added

- **Extensions.** A manager (app menu, command palette, or Extensions…) lists
  what is installed, switches each on or off, and removes them. Add one from a
  folder, or turn on store installs and add it from the Chrome Web Store.
  Content scripts, request blocking, storage and messaging work; toolbar
  popups do not. Extensions run in every Space, while their storage stays
  per-Space. Store installs are off by default because that integration
  registers a preload script on every page in the session.
- **Peek**: shift-click a link (or "Peek Link" in the page menu) to preview it
  in a floating card without spending a tab. Escape dismisses it; **Open as
  Tab** keeps it. Scripted popups that ask for window features still get a real
  tab, so sign-in flows are unaffected.
- **Mini window**: a URL handed to Aura Browser by another application opens in
  its own small window instead of disturbing your Spaces and tabs. It browses
  in the active Space's storage, so you are signed in as usual, and **Open in
  Aura** promotes it to a real tab.
- **Split view** (⌘\\, the View menu, a palette action, or a tab's context
  menu). Two to four pages side by side, each with a header showing its
  favicon, title and a close button. Drag the divider to resize; the focused
  pane is outlined in the Space's accent and clicking a page focuses its pane.
  Choosing a tab from the sidebar while split replaces the focused pane rather
  than collapsing the split. Splits and their widths survive a restart.
- **History manager** (⌘Y, or History → Show Full History, or the command
  palette). Everything visited, newest first and grouped by day, with search,
  per-visit delete, "forget every visit to this site", and clear by range
  (last hour, 24 hours, 7 days, everything). Clicking an entry opens it.
  Incognito Spaces are never recorded, and the panel says so.
- **Editing a Space.** Right-click or double-click a Space dot (or Spaces ▸
  Edit Space…) to change its name, colour and gradient after the fact, with a
  live preview, eight presets and separate start and end hue sliders. Until
  now those were fixed when the Space was created.

### Fixed

- **Screen sharing asked for the camera and microphone first.** Electron
  reports a screen-share request as a media request that names no device, so
  the permission prompt appeared and, racing the picker, could leave sharing
  working only once that prompt had been allowed by hand. The picker is the
  consent, as in Chrome, so nothing is asked beforehand.
- The Spaces menu listed nine slots whether or not anything was in them. It
  now lists the Spaces that exist and marks the active one.
- A Space with no tabs and no favorites was dropped when the browser reopened,
  losing its name and colours. Every Space is kept.
- The mini window could sit titled "New Tab" over a page that had loaded.
- On macOS the window buttons no longer overlap the compact rail.

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
