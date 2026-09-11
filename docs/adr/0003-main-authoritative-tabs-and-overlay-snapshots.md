# ADR-0003: Main process owns tab state; overlays swap the view for a snapshot

**Status:** accepted · 2026-09-11

## Decision

1. The main process (`TabManager`) is the single source of truth for tabs,
   navigation, and layout. The chrome renderer is a projection fed by
   `tabs:state` pushes; user intent flows back over allowlisted, zod-validated
   IPC.
2. The renderer measures the page-card region and sends the rect; main
   positions the active `WebContentsView` (only the active tab is attached).
3. While a chrome overlay (palette, dialogs) is open, main detaches the active
   view and returns a `capturePage()` snapshot, which the chrome paints in the
   card. Closing the overlay reattaches the live view.

## Context

`WebContentsView`s composite **above** the window's own web contents, so chrome
HTML can never draw over — or `backdrop-filter` — live page pixels. Moving tab
ownership into main is forced anyway (views live there); the snapshot swap
makes overlays look continuous while keeping a single chrome renderer instead
of a second transparent overlay view with its own process and focus problems.

## Consequences

- The bounds protocol generalizes to N rects → split view (phase d) needs no
  new machinery.
- Overlay glass blurs a _snapshot_, not live video — imperceptible for a modal
  moment; revisit in phase (c) polish.
- Session restore creates views lazily (pending URL) — restored tabs cost
  nothing until activated, and restore waits for the chrome's first paint
  before creating any view (also keeps automation attach sequences clean).
