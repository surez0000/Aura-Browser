# ADR-0004: Every Space is its own storage partition

**Status:** accepted · 2026-09-15

## Decision

Each Space owns a persistent Electron session partition, `persist:space:<id>`:
cookies, logins, local storage, IndexedDB, service workers, and cache are
isolated per Space, the way Chrome isolates profiles. Incognito keeps its
in-memory partition. Deleting a Space clears its partition.

Profiles created before this change shared Electron's default session. On
upgrade the **first** Space keeps that default session, so existing logins
survive; every other Space becomes its own partition and needs a fresh login —
which is the isolation being asked for.

## Context

Spaces were designed as workspaces (favorites, pinned, Today) over one shared
session, so a login in one Space was visible in all of them. The owner uses
Spaces as Chrome-style profiles — separate accounts for the same sites — and
shared credentials defeat that. Electron sessions are exactly the right
boundary: a `WebContentsView` is bound to one partition for life, and
`session.fromPartition('persist:…')` persists to disk under userData.

## Consequences

- **Moving a tab between Spaces recreates it.** A WebContents cannot change
  partition, so the tab is rebuilt in the target Space with the same URL,
  title, and favicon, loading lazily on first activation — the same behaviour
  as opening a link in another Chrome profile. In-page state and back/forward
  history do not travel.
- **Per-session services attach lazily.** Download tracking and the
  deny-by-default permission handler are wired the first time a partition is
  used (`TabManager.prepareSession`); the chrome renderer's default session is
  prepared at boot.
- **Permission decisions stay global** for now (keyed by origin + permission,
  not by Space). Making them per Space is a small follow-up if wanted.
- **History, archive, and downloads remain shared** across Spaces: they are
  the browser's memory, not credentials. Favorites were already per Space.
- Session schema moves to v3 (`partition` per Space); v1/v2 upgrade in place.
