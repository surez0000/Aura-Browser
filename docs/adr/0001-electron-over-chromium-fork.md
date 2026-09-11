# ADR-0001: Electron with WebContentsView, not a Chromium fork

**Status:** accepted · 2026-09-11

## Decision

Build Aurora on the latest stable Electron, one `WebContentsView` per tab,
with the browser chrome as a frameless `BrowserWindow` rendering our own
HTML/TS UI.

## Context

A true Chromium fork (custom `src/`, Views-based UI) buys three real things:
native effects (blur) over page pixels, the production omnibox/extension/
profile internals, and no Electron abstraction. Its costs: a ~100 GB checkout
with hours-long builds per platform, a security-patch treadmill (Chromium ships
fixes every few weeks — falling behind means shipping known CVEs), bespoke
signing/update infrastructure, and months of C++ Views work before feature
parity with what Electron provides on day one. Brave and Vivaldi staff whole
teams for exactly this.

## Consequences

- Fast iteration on chrome UX in web tech; Chromium security updates arrive by
  bumping one dependency.
- Chrome HTML cannot composite above or blur live page pixels → overlay
  strategy in ADR-0003.
- Extension support is a documented subset via `electron-chrome-extensions`
  (phase d), not the full `chrome.*` surface.
- Revisit only if Aurora outgrows these constraints.
