# Aurora

An Arc-inspired desktop browser with an original **Aurora Glass** look — a real
Chromium engine (Electron + `WebContentsView` per tab) under a frameless chrome
built with React, TypeScript, and design tokens.

> Phases (a)–(c) are complete: shell, tab engine, sidebar, command palette
> (tabs/history/favorites/actions), Spaces with per-space favorites + pinned +
> Today, incognito Space, Today auto-archive, find-in-page, downloads panel,
> in-chrome permission prompts, session restore, a 3-OS test rig, and the
> Aurora Glass theme — per-Space WebGL aurora palettes, light/dark/system,
> WCAG AA proven in CI, spring motion with a reduced-motion audit.
> See [docs/PHASES.md](docs/PHASES.md) for the roadmap and
> [docs/DESIGN-SPEC.md](docs/DESIGN-SPEC.md) for the design system.

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
- The chrome renderer can only load the bundled UI; page renderers get no
  preload at all.
- Every IPC channel is allowlisted in [src/shared/ipc-contract.ts](src/shared/ipc-contract.ts)
  and zod-validated in the main process; only the chrome window may invoke.
- Site permissions are deny-by-default with a per-request prompt.
- No telemetry. Default search is DuckDuckGo. Nothing leaves the machine.

## Layout of the repo

```
src/main       Electron main process (tabs, IPC, db, menu, windows)
src/preload    contextBridge — the only door between worlds
src/renderer   the chrome UI (React + Tailwind v4 over design tokens)
src/shared     types + the IPC contract, imported by all three
tests/unit     Vitest
tests/e2e      Playwright, driving the built app with local fixtures
docs           phase plan, design spec, ADRs
```

## Keyboard shortcuts

⌘T palette · ⌘L edit address · ⌘S toggle sidebar · ⌘F find in page ·
⌘G / ⇧⌘G find next/previous · ⌘J downloads · ⌘D toggle favorite ·
⇧⌘N incognito · ⌘W close tab · ⇧⌘T reopen closed · ⌘R / ⇧⌘R reload ·
⌘[ / ⌘] back/forward · ⌃Tab / ⌃⇧Tab next/previous tab · ⌘1–9 pick tab ·
⌃1–9 switch space · ⌘+/−/0 zoom · ⌥⌘I DevTools. (Ctrl on Windows/Linux.)

## Constraints honored

Original visual design (no Arc assets or trademarks), privacy-respecting
defaults (zero telemetry), graceful degradation everywhere: the aurora is our
own pixels, so there is nothing to degrade.
