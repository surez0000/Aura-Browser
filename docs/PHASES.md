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

- Split view 2–4 panes: the (a) layout protocol generalizes to N rects; drag
  dividers; keyboard management.
- Peek: link preview in a floating card, promote-to-tab.
- Mini window (Little-Arc-style) for links opened while Aura Browser is the default
  browser.
- MV3 extensions via `electron-chrome-extensions` (+ web store companion):
  documented supported-API subset, tested against a named list (uBlock Origin
  Lite, Dark Reader class).

**Exit:** the named extensions work; split/Peek stable under e2e.

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
