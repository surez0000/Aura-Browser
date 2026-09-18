# Aura Browser — phase plan

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

## (b) Command palette + Spaces — ✅ complete

- Command palette (⌘T / ⌘L): dependency-free fuzzy scoring across open tabs
  (all spaces), per-space favorites, SQLite history (visit-count + recency
  ranked), archived tabs, an action registry (with dynamic switch-/move-to-
  space entries), plus URL and DuckDuckGo fallbacks; keyboard-first with
  ranked, deduped results.
- Spaces: create/rename/accent (editor popover), dot-rail switching (click,
  ⌃1…9, or menu), per-space favorites + pinned + Today sections, drag a tab
  onto a space dot to move it, native tab context menu (pin/unpin, move,
  copy URL, close).
- Incognito Space: separate in-memory session partition; no history writes, no
  session persistence, no stored permission decisions; gone after restart.
- 2026-09-15: every Space became its own **persistent** storage partition —
  Chrome-profile-style isolation of cookies/logins (ADR-0004); tabs moved
  across Spaces are recreated in the target partition.
- Today auto-archive: configurable hours (settings kv + palette actions,
  default 12 h, sweep every 5 min), manual "Archive Today", archived tabs are
  searchable/reopenable from the palette (SQLite `archive` table).
- Find-in-page (⌘F/⌘G/⇧⌘G): implemented via main-process script injection with
  the CSS Custom Highlight API — Electron 44's `webContents.findInPage` never
  emits `found-in-page` (verified with a minimal repro). The bar sits above the
  page card, so the native view shrinks instead of being overdrawn.
  Limitation: same-document text only (cross-origin iframes are not searched).
- Downloads (⌘J): tracked across both sessions, persisted to SQLite, sidebar
  panel with progress/open/show-in-folder/cancel.
- In-chrome permission banners replace the native-dialog stopgap:
  deny-by-default, optional per-(origin, permission) remembering, queued,
  auto-denied if the requesting page closes.
- Session schema v2 (spaces, kinds, per-space favorites + active tab) with
  automatic upgrade from phase-(a) snapshots and legacy favorites merge.

**Exit met:** daily-drivable. 47 unit + 17 e2e tests green.

## (c) Aurora Glass theming + motion — ✅ complete

- Tokens finalized as a TypeScript source (`theme/tokens.ts`), injected as CSS
  custom properties before first paint; light / dark / system through
  `nativeTheme.themeSource` → `prefers-color-scheme` (one pipe), switchable
  from palette actions; the window ground color follows.
- Per-Space aurora palettes derived from one hue (`theme/aurora.ts`): mesh base
  - 4 blobs, accent, accent ink — all clamped into relative-luminance bands;
    incognito is the muted variant.
- Animated aurora mesh (`AuroraBackdrop`): WebGL fragment shader, low-power
  context, ≤ 960 px backing store, ~30 fps redraw cap (every frame during a
  cross-fade), 650 ms cross-fade on Space/theme change, paused when hidden or
  unfocused, one still frame under `prefers-reduced-motion`, CSS
  radial-gradient fallback when GL is unavailable.
- Contrast: WCAG AA sweep in CI (`aurora-aa.test.ts`) over 24 hues × 2 themes ×
  normal/incognito × 5 mesh extremes × 4 surfaces, plus accent and danger
  pairs. The planned "runtime ink-swap with hysteresis" was **superseded**:
  the palette is band-clamped ahead of time, so the ink choice is static and
  proven; a runtime swap has nothing to correct.
- Spring motion pass: sidebar collapse, Space column slide, palette, find bar,
  permission banner, downloads flyout, Space editor, tab enter/exit/reorder.
  Reduced motion: Motion's `reducedMotion="user"`, an explicit gate on the
  sidebar width spring, and a global CSS rule for transitions/animations.
- Design spec v1 (`docs/DESIGN-SPEC.md`): token table, palette derivation,
  contrast contract, component inventory, motion table; 3 annotated mockups in
  `docs/mockups/` (sidebar, command palette, split view + Peek).
- Fixed in passing: the page-card empty state was global; it is now per Space.

**Exit met:** AA verified in CI; reduced-motion audit clean (`motion.spec.ts`,
`theme.spec.ts`); frame-time probe on reference hardware (Apple M5 Pro, 120 Hz
display): 288 frames sampled across a sidebar spring and a Space switch,
median 8.3 ms, p95 8.6 ms, max 9.2 ms — no long frames. The aurora itself is
deliberately capped near 30 fps; UI springs run at display rate. 60 unit + 22
e2e tests green.

## (d) Split view, Peek, mini window, extensions

- ✅ Split view 2–4 panes (2026-09-18): the (a) layout protocol generalized to
  N rects exactly as ADR-0003 predicted — the renderer measures each pane, the
  main process positions one `WebContentsView` per pane. ⌘\\ splits and
  collapses; dividers drag; a pane header carries the title and close because
  chrome cannot paint over a native view; panes and ratios persist in the
  session; clicking a page focuses its pane (`webContents` 'focus').
- ✅ Peek (2026-09-18): shift-clicking a link asks Chromium for a new window
  carrying no window features, which is the gesture — a scripted `window.open`
  _with_ features stays a real tab so sign-in popups keep working. The preview
  is a Tab deliberately outside the tab list, attached above the panes and
  re-raised whenever a pane attaches after it.
- ✅ Mini window (2026-09-18): `open-url` (macOS) and an http(s) argument
  (Windows, Linux, and handy for tests) open a small window that loads the same
  renderer with a `#mini` hash. The IPC router now trusts a set of chrome
  renderers rather than exactly one, and mini channels resolve their window
  from the sender.
- ✅ Extensions (2026-09-18), but **not** via `electron-chrome-extensions`:
  that package is dual-licensed (GPL-3.0 or commercial) and Aura Browser is
  MIT, so adopting it is a licensing decision for the owner rather than an
  implementation detail. Extensions therefore run on Electron's own support
  (`session.extensions`), with the MIT `electron-chrome-web-store` for
  installing and updating from the store.
  - Supported: content scripts, `declarativeNetRequest` blocking, storage,
    messaging, devtools pages — Chromium implements these itself.
  - Not supported: browser-action popups and the `chrome.tabs` surface. Those
    need `electron-chrome-extensions`; revisit if the owner accepts GPL-3.0 or
    buys a licence.
  - Installed once, loaded into every Space; storage stays per-Space, so an
    extension's settings never cross Spaces.
  - Store installs are **opt-in**: that integration registers a preload script
    on the session, which would otherwise reach every page.
  - Adding one shows a native confirmation listing its permissions.

**Exit:** split, Peek, the mini window and extensions all covered by e2e.

## (e) Packaging, onboarding, auto-update — ◐ in progress

Pulled forward ahead of (d) on 2026-09-14 at the owner's request, together
with two settings they asked for first.

- ✅ Settings panel (⌘, / the gear): appearance, sidebar mode, search engine,
  auto-archive window, update status. Palette actions mirror every setting.
- ✅ Search engine setting — DuckDuckGo (default), Google, Bing, Brave Search,
  Startpage, Ecosia; the palette fallback and the address pill follow it.
- ✅ Sidebar modes — _Always visible_ / _Show on hover_ (⌘S toggles, persisted).
  Hover mode collapses the layout spacer, floats the panel in from the left
  edge over a page snapshot through the ref-counted overlay (ADR-0003), and
  adds a slim top strip for the traffic lights / window controls.
- ✅ electron-builder targets: DMG + zip (macOS), one-click NSIS (Windows),
  AppImage + deb (Linux); app icon rendered from the brand mark `build/logo.png`;
  `npm run dist` locally; `.github/workflows/release.yml` builds on `v*` tags
  and publishes to GitHub Releases.
- ✅ electron-updater: checks 15 s after launch and every 6 h; background
  download; one-click **Restart to update**. Honest states for dev builds, an
  unconfigured publish target, and unsigned macOS builds (links to the release
  page instead of failing silently).
- ✅ Versioning: semver in `package.json`, `npm version` + `v*` tags,
  `CHANGELOG.md` — see `docs/RELEASING.md`.
- ✅ `build.publish` points at `surez0000/Aura-Browser`; CI builds macOS for
  Apple silicon and Intel.
- ✅ macOS updates **without** an Apple Developer ID: the app downloads the
  release zip, verifies SHA-512, checks the bundle id, swaps `Aura Browser.app` in
  place, relaunches (`scripts/verify-mac-update.mjs` proves it). Signing stays
  optional — a real signature flips the app to Squirrel.Mac automatically.
- ☐ First-run onboarding: import bookmarks from Chrome/Edge (`Bookmarks` JSON)
  and Firefox (`places.sqlite`); default-browser registration.
- Telemetry stays at zero (the update check carries no identifiers).

**Exit:** clean install → auto-update on all three OSes.
