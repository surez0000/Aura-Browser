import type {
  SessionSnapshotV1,
  SessionSnapshotV2,
  SessionSnapshotV3,
  SessionSpaceV2,
  SessionSpaceV3,
  TabKind,
} from '@shared/models'
import { DEFAULT_PARTITION, spacePartition } from '../tabs/partition-names'

const VALID_KINDS: readonly TabKind[] = ['pinned', 'today']

function isV3(raw: unknown): raw is SessionSnapshotV3 {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { version?: unknown }).version === 3 &&
    Array.isArray((raw as { spaces?: unknown }).spaces)
  )
}

function isV2(raw: unknown): raw is SessionSnapshotV2 {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { version?: unknown }).version === 2 &&
    Array.isArray((raw as { spaces?: unknown }).spaces)
  )
}

function isV1(raw: unknown): raw is SessionSnapshotV1 {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { tabs?: unknown }).tabs) &&
    typeof (raw as { activeIndex?: unknown }).activeIndex === 'number' &&
    !('version' in (raw as object))
  )
}

function sanitizeSpace(
  raw: SessionSpaceV2 & {
    partition?: unknown
    accentHue2?: unknown
    paneIndices?: unknown
    paneRatios?: unknown
  },
  index: number,
  /** Partition to assign when the stored space has none (pre-v3). */
  fallbackPartition: (id: string, index: number) => string,
): SessionSpaceV3 {
  const id = typeof raw.id === 'string' && raw.id ? raw.id : `space-${index}`
  return {
    id,
    partition: typeof raw.partition === 'string' ? raw.partition : fallbackPartition(id, index),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : `Space ${index + 1}`,
    accentHue: Number.isFinite(raw.accentHue) ? ((raw.accentHue % 360) + 360) % 360 : 226,
    accentHue2:
      typeof raw.accentHue2 === 'number' && Number.isFinite(raw.accentHue2)
        ? ((raw.accentHue2 % 360) + 360) % 360
        : null,
    ...(Array.isArray(raw.paneIndices) && raw.paneIndices.length > 1
      ? {
          paneIndices: raw.paneIndices.filter(
            (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0,
          ),
          paneRatios: Array.isArray(raw.paneRatios)
            ? raw.paneRatios.filter((n): n is number => typeof n === 'number' && n > 0)
            : [],
        }
      : {}),
    favorites: Array.isArray(raw.favorites)
      ? raw.favorites.filter((f) => typeof f?.url === 'string')
      : [],
    activeIndex: Number.isFinite(raw.activeIndex) ? Math.max(0, raw.activeIndex) : 0,
    tabs: Array.isArray(raw.tabs)
      ? raw.tabs
          .filter((t) => typeof t?.url === 'string' && t.url)
          .map((t) => ({
            url: t.url,
            title: typeof t.title === 'string' ? t.title : '',
            faviconUrl: typeof t.faviconUrl === 'string' ? t.faviconUrl : null,
            kind: VALID_KINDS.includes(t.kind) ? t.kind : 'today',
          }))
      : [],
  }
}

/** A brand-new Space gets its own on-disk partition. */
const isolated = (id: string): string => spacePartition(id)

/**
 * Pre-isolation profiles (v2) shared one session. The first Space keeps that
 * default session so existing logins survive; every other Space becomes its
 * own partition (and needs a fresh login — exactly the isolation asked for).
 */
const legacy = (id: string, index: number): string =>
  index === 0 ? DEFAULT_PARTITION : spacePartition(id)

/**
 * Parse whatever is stored under kv "session" into the current schema (v3).
 * Phase (a) snapshots ({tabs, activeIndex}) are wrapped into a default space;
 * phase (b) snapshots (v2) gain per-Space partitions (ADR-0004).
 * Returns null when there is nothing usable to restore.
 */
export function upgradeSession(raw: unknown): SessionSnapshotV3 | null {
  if (isV3(raw) || isV2(raw)) {
    const assign = isV3(raw) ? isolated : legacy
    // Every stored Space is kept. Spaces carry a name, a gradient and their own
    // storage, so an empty one is still something the user made — dropping it
    // used to lose it (and its colours) on the next launch.
    const spaces = raw.spaces.map((space, index) => sanitizeSpace(space, index, assign))
    if (spaces.length === 0) return null
    const activeSpaceId = spaces.some((s) => s.id === raw.activeSpaceId)
      ? raw.activeSpaceId
      : (spaces[0]?.id ?? '')
    return { version: 3, activeSpaceId, spaces }
  }
  if (isV1(raw)) {
    const tabs = raw.tabs
      .filter((t) => typeof t?.url === 'string' && t.url)
      .map((t) => ({
        url: t.url,
        title: typeof t.title === 'string' ? t.title : '',
        faviconUrl: typeof t.faviconUrl === 'string' ? t.faviconUrl : null,
        kind: 'today' as TabKind,
      }))
    if (tabs.length === 0) return null
    return {
      version: 3,
      activeSpaceId: 'v1-default',
      spaces: [
        {
          id: 'v1-default',
          partition: DEFAULT_PARTITION,
          name: 'Personal',
          accentHue: 226,
          favorites: [],
          activeIndex: Math.min(Math.max(0, raw.activeIndex), tabs.length - 1),
          tabs,
        },
      ],
    }
  }
  return null
}

/** Fold the phase-(a) global favorites (kv "favorites") into the first space. */
export function mergeLegacyFavorites(
  snapshot: SessionSnapshotV3,
  legacyFavorites: unknown,
): SessionSnapshotV3 {
  if (!Array.isArray(legacyFavorites) || legacyFavorites.length === 0) return snapshot
  const first = snapshot.spaces[0]
  if (!first) return snapshot
  const valid = legacyFavorites.filter(
    (f): f is { url: string; title: string; faviconUrl: string | null } =>
      typeof f === 'object' && f !== null && typeof (f as { url?: unknown }).url === 'string',
  )
  const existing = new Set(first.favorites.map((f) => f.url))
  first.favorites = [
    ...first.favorites,
    ...valid
      .filter((f) => !existing.has(f.url))
      .map((f) => ({
        url: f.url,
        title: typeof f.title === 'string' ? f.title : f.url,
        faviconUrl: typeof f.faviconUrl === 'string' ? f.faviconUrl : null,
      })),
  ].slice(0, 12)
  return snapshot
}
