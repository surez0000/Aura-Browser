# Aurora Glass — design spec (v1, phase c)

Aurora Glass is a self-painted aurora mesh under frosted-glass chrome. Every
Space owns one hue; the mesh, the accent, and the ink that sits on the accent
all derive from it, clamped into luminance bands so contrast is provable rather
than tuned. Nothing depends on OS transparency (ADR-0002).

## Tokens

Source of truth: [`src/renderer/src/theme/tokens.ts`](../src/renderer/src/theme/tokens.ts).
The same TypeScript values feed the runtime (injected as CSS custom properties
by [`theme/apply.ts`](../src/renderer/src/theme/apply.ts) before first paint)
and the WCAG sweep in CI ([`tests/unit/aurora-aa.test.ts`](../tests/unit/aurora-aa.test.ts)).
There is no CSS token file to drift.

| Token                        | Role                                 | Dark                    | Light                     |
| ---------------------------- | ------------------------------------ | ----------------------- | ------------------------- |
| `--bg-base`                  | window ground under the aurora       | `#0c0e1a`               | `#e9ecf6`                 |
| `--card-bg`                  | page card ground                     | `#10131f`               | `#ffffff`                 |
| `--ink-1`                    | primary text                         | white 92%               | `rgb(18 21 38)` 92%       |
| `--ink-2`                    | secondary text                       | white 74%               | `rgb(18 21 38)` 72%       |
| `--ink-3`                    | tertiary text, hints                 | white 54%               | `rgb(18 21 38)` 55%       |
| `--surface-glass`            | resting glass                        | white 6%                | white 42%                 |
| `--surface-glass-strong`     | active / selected glass              | white 12%               | white 72%                 |
| `--surface-hover`            | hover wash                           | white 9%                | white 58%                 |
| `--border-glass`             | 1px translucent borders              | white 12%               | `rgb(20 24 46)` 12%       |
| `--danger`                   | destructive / insecure               | `#ff8585`               | `#a52f2f`                 |
| `--scrim`                    | overlay dim                          | `rgb(5 7 14)` 55%       | `rgb(232 236 248)` 55%    |
| `--card-shadow`              | floating card elevation              | black 45% / 35% layered | `rgb(24 30 60)` 18% / 10% |
| `--accent`                   | **derived per Space** (see below)    | vivid, lum 0.25–0.55    | deep, lum 0.06–0.16       |
| `--accent-ink`               | **derived**: ink drawn on `--accent` | near-black or white     | near-black or white       |
| `--radius-card/control/pill` | corner system                        | 12 / 8 / 999 px         | same                      |
| `--blur-glass`               | backdrop blur radius                 | 24px                    | same                      |
| `--font-ui`                  | system UI stack                      | —                       | —                         |

### Theme modes

The `theme` setting (`system` · `light` · `dark`, default `system`) is applied
in the main process as `nativeTheme.themeSource`, which drives
`prefers-color-scheme` in every renderer. `apply.ts` listens to that media
query and re-injects the token set; the main process repaints the window's
`backgroundColor` from `WINDOW_BG` so there is never a flash. The palette
exposes the three modes as actions (`Theme: Sync with System / Light / Dark`).

## Per-Space aurora palettes

[`theme/aurora.ts`](../src/renderer/src/theme/aurora.ts) derives everything
from a Space's `accentHue`:

| Derived value | Hue                         | Saturation (dark / light) | Relative-luminance band (dark / light)               |
| ------------- | --------------------------- | ------------------------- | ---------------------------------------------------- |
| mesh base     | hue                         | 0.42 / 0.50               | 0.010–0.030 / 0.78–0.88                              |
| mesh blobs ×4 | hue +0°, +34°, +300°, +168° | 0.52 / 0.50               | 0.030–0.080 / 0.52–0.72                              |
| accent        | hue                         | 0.85 / 0.62               | 0.25–0.55 / 0.06–0.16, nudged to ≥ 3:1 on the ground |
| accent ink    | —                           | —                         | whichever of `rgb(10 12 20)` / white contrasts more  |

Bands are **relative luminance**, not HSL lightness, so perceptually bright
hues (greens, yellows) are clamped as hard as blues. Incognito Spaces use the
same pipeline with saturation scaled to 0.25 (accent 0.3), reading as muted
graphite.

The shader only mixes between the base and the four blob colors, so every
pixel the mesh can produce is a convex combination of five band-clamped
colors, and the contrast proof below needs to check only those five extremes.

## Contrast contract (WCAG 2.1 AA, enforced in CI)

| Pair                              | Minimum   | Where it applies                                                     |
| --------------------------------- | --------- | -------------------------------------------------------------------- |
| `--ink-1` on any surface          | 4.5 : 1   | bare aurora, glass, strong glass, hover                              |
| `--ink-2` on bare / glass / hover | 4.5 : 1   | **never on strong glass** — active rows and filled buttons use ink-1 |
| `--ink-3` anywhere                | 3.0 : 1   | hints, section labels, shortcuts (non-essential or large)            |
| `--accent-ink` on `--accent`      | 4.5 : 1   | badges, filled accent buttons                                        |
| `--accent` on `--bg-base`         | 3.0 : 1   | non-text UI: dots, highlights, focus rings                           |
| `--danger` on card / on glass     | 4.5 / 3.0 | insecure indicator, destructive actions                              |

`aurora-aa.test.ts` sweeps 24 hues × 2 themes × {normal, incognito} ×
{base, 4 blobs} × 4 surfaces, compositing translucent inks and surfaces before
measuring. Adding a token or changing a band without keeping AA fails CI.

## Component inventory

| Component              | File                                                                                               | Notes                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| App shell              | `App.tsx`                                                                                          | derives the palette from the active Space; sets `--accent`/`--accent-ink` |
| AuroraBackdrop         | `components/AuroraBackdrop.tsx`                                                                    | WebGL mesh; CSS radial-gradient fallback; see Motion                      |
| Sidebar                | `components/sidebar/Sidebar.tsx`                                                                   | spring collapse (⌘S), Space column slide, sections, footer rail           |
| NavCluster             | `components/sidebar/NavCluster.tsx`                                                                | back / forward / reload-stop                                              |
| UrlPill                | `components/sidebar/UrlPill.tsx`                                                                   | security icon, host label, ★, inline edit                                 |
| SpaceHeader            | `components/sidebar/SpaceHeader.tsx`                                                               | accent dot, name, edit affordance, incognito badge                        |
| FavoritesGrid          | `components/sidebar/FavoritesGrid.tsx`                                                             | per-Space 4-col glass tiles, letter fallback                              |
| TabSection / TabItem   | `components/sidebar/TabSection.tsx`                                                                | pinned + Today; enter/exit springs, reorder, drag-to-dot, context menu    |
| SpaceSwitcher          | `components/sidebar/SpaceSwitcher.tsx`                                                             | dot rail: accent-colored dots, switch, drop target, add                   |
| SpaceEditor            | `components/sidebar/SpaceEditor.tsx`                                                               | create/edit popover; hue swatches rendered through the accent pipeline    |
| DownloadsButton/Flyout | `components/sidebar/DownloadsFlyout.tsx`                                                           | accent badge with `--accent-ink`, progress rows                           |
| WindowControls         | `components/sidebar/WindowControls.tsx`                                                            | Windows/Linux only                                                        |
| PageCard               | `components/PageCard.tsx`                                                                          | measures view bounds; per-Space empty state; crash + snapshot states      |
| FindBar                | `components/FindBar.tsx`                                                                           | above the card (view shrinks); spring in/out                              |
| PermissionBanner       | `components/PermissionBanner.tsx`                                                                  | queued, remember checkbox; spring in/out                                  |
| Palette                | `components/palette/Palette.tsx`                                                                   | scrim + glass card over a page snapshot; theme actions                    |
| Theme modules          | `theme/tokens.ts` · `theme/aurora.ts` · `theme/contrast.ts` · `theme/apply.ts` · `shared/theme.ts` | tokens, palette derivation, WCAG math, runtime injection, window ground   |

## Motion

Springs only — no duration curves except the palette scrim and the shader
cross-fade. `MotionConfig reducedMotion="user"` is global.

| Element                        | Animates                                              | Spring (stiffness / damping)                  |
| ------------------------------ | ----------------------------------------------------- | --------------------------------------------- |
| Sidebar collapse (⌘S)          | width 264→0, opacity                                  | 380 / 36 · `duration: 0` under reduced motion |
| Space column on Space switch   | opacity, x 12→0                                       | 420 / 36                                      |
| Palette                        | scrim opacity 150 ms; card opacity, y −14, scale 0.98 | 480 / 34                                      |
| Find bar, permission banner    | opacity, y −8 in / −6 out                             | 500 / 34                                      |
| Tab items                      | y −6 in, x −14 out, layout on reorder                 | 500 / 34                                      |
| Downloads flyout, Space editor | opacity, y 10, scale 0.98                             | 460 / 32                                      |
| Aurora palette change          | shader mix prev→cur                                   | 650 ms ease-in-out cubic                      |

### Aurora backdrop runtime

- WebGL 1 fragment shader, `powerPreference: 'low-power'`, backing store
  capped at 960 px wide, redraw capped near 30 fps (the drift is slow; a
  cross-fade temporarily runs every frame). Pauses when the window is hidden
  or unfocused. Falls back to layered CSS radial gradients when GL is missing.
- 1-LSB dither against banding.

### Reduced motion

- Motion: transforms and layout animations are instant (library default under
  `reducedMotion="user"`); the sidebar's width spring is gated with
  `useReducedMotion` because width is neither.
- CSS: a global `prefers-reduced-motion` rule collapses transitions and
  animations to a single frame.
- Aurora: the render loop is off; one deterministic still frame per palette.
- Audit: `tests/e2e/motion.spec.ts` (sidebar collapse completes within a
  frame) and `tests/e2e/theme.spec.ts` (backdrop reports `data-animating=false`).

## Mockups (annotated)

- [Sidebar](mockups/sidebar.svg) — dark theme, Space hue 226.
- [Command palette](mockups/command-palette.svg) — scrim + glass over a page snapshot.
- [Split view + Peek](mockups/split-view.svg) — phase (d) target, green Space (hue 152).
