# Aura Browser

An Arc-inspired desktop browser with an original **Aurora Glass** look — a real
Chromium engine (Electron + `WebContentsView` per tab) under a frameless chrome
built with React, TypeScript, and design tokens.

> Phases (a)–(c) are complete and the first installable build (0.1.0) is
> packaged: shell, tab engine, sidebar, command palette, Spaces, incognito,
> Today auto-archive, find-in-page, downloads, in-chrome permission prompts,
> session restore, the Aurora Glass theme (per-Space WebGL palettes,
> light/dark/system, WCAG AA proven in CI), a Settings panel (search engine,
> sidebar always-visible / show-on-hover, appearance, auto-archive), and an
> in-app updater. See [docs/PHASES.md](docs/PHASES.md) for the roadmap,
> [docs/DESIGN-SPEC.md](docs/DESIGN-SPEC.md) for the design system, and
> [docs/RELEASING.md](docs/RELEASING.md) for versioning and releases.

## Install

Installers are attached to each [GitHub Release](https://github.com/surez0000/Aura-Browser/releases):
a DMG for macOS (Apple silicon and Intel), a one-click installer for Windows,
and an AppImage or .deb for Linux. Installed copies check for a newer release
on launch and every six hours; when one has downloaded, the sidebar offers
**Restart to update** — one click installs and relaunches on every OS.

The macOS build is not Apple-signed, so the very first launch is right-click →
**Open**. Updates after that need no prompt: Aura Browser swaps its own bundle
instead of going through Squirrel.Mac (details in
[docs/RELEASING.md](docs/RELEASING.md)). To build an installer yourself:

```bash
npm run dist
```

## Quick start

```bash
npm install        # also rebuilds better-sqlite3 for Electron's ABI
npm run dev        # hot-reloading chrome UI + Electron
```

| Script              | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Run the app with HMR for the chrome renderer       |
| `npm run build`     | Production bundles into `out/`                     |
| `npm run typecheck` | Strict TS across main, preload, renderer, tests    |
| `npm run lint`      | ESLint (typescript-eslint + react-hooks)           |
| `npm run test:unit` | Vitest: stores, IPC contract, keymap, URL, WCAG AA |
| `npm run test:e2e`  | Build, then Playwright drives the real app         |
| `npm run dist`      | Installers for this OS into `dist/` (unsigned)     |
| `npm run release`   | Same, and publish to GitHub Releases (CI uses it)  |
| `npm run icon`      | Re-render `build/icon.png` from `build/logo.png`   |

## Architecture

```
┌────────────────────────── BrowserWindow (frameless, opaque) ─────────────────────────┐
│  chrome renderer (React, sandboxed, contextIsolation)                                │
│  aurora backdrop · sidebar · URL pill · palette · page-card frame                    │
│        │ typed IPC (zod-validated, allowlisted channels)                             │
│  ══════╪═══════════════ preload bridge (window.aurora) ══════════════════════════════│
│        ▼                                                                             │
│  main process: TabManager ─ owns one WebContentsView per tab (only the active        │
│  one is attached), layout protocol (renderer measures the page card → main           │
│  positions the view), SQLite (history/session/settings), menu + keymap,              │
│  permission prompts (deny-by-default)                                                │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Key decisions (full rationale in [docs/adr/](docs/adr/)):

- **Electron over a Chromium fork** — ADR-0001.
- **Opaque window, self-painted aurora** — the theme never depends on OS
  transparency, so Windows 10 and bare Linux compositors get the identical
  look — ADR-0002.
- **Main process owns tab state; the UI is a projection** — and chrome
  overlays swap the native view for a `capturePage()` snapshot, because HTML
  cannot render above a `WebContentsView` — ADR-0003.

## Security posture

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` for every
  renderer, page and chrome alike.
- The chrome renderer can only load the bundled UI. Page renderers get no
  preload at all, unless you turn on installing extensions from the Chrome Web
  Store — that integration registers one on the session, which is why it is off
  by default and says so in the extensions manager.
- Every IPC channel is allowlisted in [src/shared/ipc-contract.ts](src/shared/ipc-contract.ts)
  and zod-validated in the main process; only the chrome window may invoke.
- Every Space is its own storage partition — cookies, logins, site data, and
  cache never cross Spaces, like Chrome profiles (ADR-0004). Incognito is
  in-memory. Deleting a Space deletes its data.
- Site permissions are deny-by-default with a per-request prompt. Adding an
  extension asks first and lists what it will be able to do; extensions run in
  every Space but their storage stays per-Space. Screen
  sharing shows a picker first: a page only ever receives the one screen or
  window chosen there.
- No telemetry. Default search is DuckDuckGo (changeable in Settings). Nothing
  leaves the machine except the update check, which fetches a version manifest
  from the release host and carries no identifiers.

## Layout of the repo

```
src/main       Electron main process (tabs, IPC, db, menu, windows)
src/preload    contextBridge — the only door between worlds
src/renderer   the chrome UI (React + Tailwind v4 over design tokens)
src/shared     types + the IPC contract, imported by all three
tests/unit     Vitest
tests/e2e      Playwright, driving the built app with local fixtures
docs           phase plan, design spec, ADRs, releasing guide
build          app icon: logo.png (source) + icon.png (rendered) for electron-builder
scripts        build helpers (icon renderer)
```

## Extensions

Chrome extensions load on Electron's own extension support: content scripts,
declarative request blocking, storage and messaging all work; toolbar popups
and the `chrome.tabs` surface do not. Open the manager from the app menu, the
command palette, or **Extensions…**, then add one from a folder, or turn on
store installs and add it from the Chrome Web Store. `AURORA_LOAD_EXTENSION`
takes comma-separated folders for a single run, like Chrome's
`--load-extension`.

## Peek and the mini window

Shift-click a link to **Peek** it: a floating preview that costs no tab, with
**Open as Tab** to keep it and Escape to dismiss. When another application
hands Aura Browser a link it opens in a **mini window** — the active Space's
storage, so you stay signed in, but no tab and no Space state until you press
**Open in Aura**.

## Keyboard shortcuts

⌘T palette · ⌘L edit address · ⌘S full sidebar ↔ compact rail · ⌘F find in page ·
⌘G / ⇧⌘G find next/previous · ⌘J downloads · ⌘Y history · ⌘\\ split view ·
⌘D toggle favorite ·
⇧⌘N incognito · ⌘W close tab · ⇧⌘T reopen closed · ⌘R / ⇧⌘R reload ·
⌘[ / ⌘] back/forward · ⌃Tab / ⌃⇧Tab next/previous tab · ⌘1–9 pick tab ·
⌃1–9 switch space · ⌘+/−/0 zoom · ⌘, settings · ⌥⌘I DevTools. (Ctrl on
Windows/Linux.)

## Constraints honored

Original visual design (no Arc assets or trademarks), privacy-respecting
defaults (zero telemetry), graceful degradation everywhere: the aurora is our
own pixels, so there is nothing to degrade.
