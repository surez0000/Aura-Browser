# Aurora — phase plan

Each phase ends with a user-visible, tested build. A phase starts only after
explicit confirmation.

## (a) Shell + tabs + sidebar — ✅ complete

- Frameless opaque window: inset traffic lights (macOS), custom controls
  (Windows/Linux), min sizes.
- Tab engine in main: one `WebContentsView` per tab; create / close / activate /
  reorder; `window.open` → new tab; crashed-tab recovery; per-tab zoom &
  DevTools; internal error pages; context menus.
- Page-card layout protocol: renderer measures, main positions (powers split
  view later); rounded corners via `setBorderRadius` where available.
- Sidebar v1: nav cluster, URL pill (HTTPS indicator, inline edit, ★ favorite),
  favorites grid (global v1), Today tab list with drag reorder, collapse (⌘S).
- Palette v0 (⌘T): URL or DuckDuckGo search; overlay-over-page via snapshot
  swap.
- SQLite (better-sqlite3 + migrations): history visits recorded from day one,
  session snapshot per change batch, restored lazily on launch (only the active
  tab loads eagerly).
- Keymap registry + native menus; security posture (see README).
- Tests: 22 unit + 7 Playwright e2e (launch, tabs, navigation/history, session
  restore, sidebar, palette); CI matrix macOS/Windows/Linux.

**Exit criteria met:** browse real sites in multiple tabs; restart restores the
session; shortcuts work; suites green.

## (b) Command palette + Spaces

- Real palette: fuzzy match across URLs, web search, open tabs, history,
  bookmarks, and actions (the keymap registry doubles as the action source).
- Spaces: create/rename/color accent; per-Space favorites, pinned tabs, Today;
  drag tabs between Spaces; ⌃1…n switching.
- Incognito Space on an ephemeral session partition.
- Today auto-archive (configurable, default 12 h) + archive browser.
- Find-in-page, downloads panel, in-chrome permission prompts (replacing the
  native-dialog stopgap), full Arc-mirror keymap.

**Exit:** daily-drivable.

## (c) Aurora Glass theming + motion

- Finalize tokens (light/dark/OS-sync); every Space gets an aurora palette.
- Animated aurora mesh: WebGL shader layer, cross-fades on Space switch,
  paused when unfocused, static gradient under `prefers-reduced-motion` or
  low-power.
- Adaptive contrast: palettes constrained to luminance bands, WCAG AA checks in
  CI over every token pair, runtime ink-swap with hysteresis.
- Spring motion pass (sidebar, palette, reorder, Space switch), 60 fps traces.
- **Design spec deliverable:** token table, component inventory, 3 annotated
  mockups (sidebar, palette, split view).

**Exit:** AA verified in CI; reduced-motion audit clean; 60 fps on reference
hardware.

## (d) Split view, Peek, mini window, extensions

- Split view 2–4 panes: the (a) layout protocol generalizes to N rects; drag
  dividers; keyboard management.
- Peek: link preview in a floating card, promote-to-tab.
- Mini window (Little-Arc-style) for links opened while Aurora is the default
  browser.
- MV3 extensions via `electron-chrome-extensions` (+ web store companion):
  documented supported-API subset, tested against a named list (uBlock Origin
  Lite, Dark Reader class).

**Exit:** the named extensions work; split/Peek stable under e2e.

## (e) Packaging, onboarding, auto-update

- electron-builder targets: signed/notarized DMG, NSIS, AppImage + deb;
  electron-updater.
- First-run onboarding: import bookmarks from Chrome/Edge (`Bookmarks` JSON)
  and Firefox (`places.sqlite`); default-browser registration.
- Telemetry stays at zero.

**Exit:** clean install → auto-update on all three OSes.
