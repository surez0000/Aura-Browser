# ADR-0002: Opaque window; the aurora is our own pixels

**Status:** accepted · 2026-09-11

## Decision

The shell window is frameless but **opaque**. The Aurora Glass backdrop —
gradient mesh, frosted surfaces — is painted entirely by the chrome renderer
(CSS today, a shader layer in phase c). We do not use OS window transparency
or native vibrancy.

## Context

Transparent frameless windows are fragile on Windows 10 and on many Linux
compositors, and macOS vibrancy shows the _desktop_ through the window — but
Arc-style design shows the app's own gradient, not the desktop. Since every
visual effect we want sits inside the window, `backdrop-filter` over our own
gradient delivers the full look with plain Chromium compositing, identically on
every OS.

## Consequences

- Zero degradation matrix: nothing platform-specific to feature-detect for the
  theme itself.
- The window's `backgroundColor` matches `--bg-base` to avoid flashes.
- Desktop show-through (native vibrancy) can be added later as an optional
  macOS-only setting without touching components — the tokens absorb it.
