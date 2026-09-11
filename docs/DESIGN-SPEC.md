# Aurora Glass — design spec (v0, phase a)

> This document is finalized in **phase (c)**, which also delivers the three
> annotated mockups (sidebar, command palette, split view). Phase (a) ships the
> token _system_ with placeholder values so components never hardcode a look.

## Tokens (current placeholder values)

Source of truth: [`src/renderer/src/theme/tokens.css`](../src/renderer/src/theme/tokens.css)
(dark default, light via `prefers-color-scheme`).

| Token                        | Role                                      | Dark            | Light              |
| ---------------------------- | ----------------------------------------- | --------------- | ------------------ |
| `--bg-base`                  | window ground under the aurora            | `#0c0e1a`       | `#e9ecf6`          |
| `--aurora-a/b/c`             | gradient mesh hues (indigo/teal/violet)   | translucent RGB | translucent RGB    |
| `--surface-glass`            | resting glass surface                     | `white 6%`      | `white 42%`        |
| `--surface-glass-strong`     | active/selected glass                     | `white 12%`     | `white 65%`        |
| `--surface-hover`            | hover wash                                | `white 9%`      | `white 55%`        |
| `--border-glass`             | 1px translucent borders                   | `white 12%`     | `ink 12%`          |
| `--ink-1/2/3`                | text: primary/secondary/tertiary          | white 92/62/40% | ink 92/62/42%      |
| `--accent`                   | interactive accent (per-Space in phase c) | `#8aa6ff`       | `#3d5ccc`          |
| `--danger`                   | destructive/insecure                      | `#ff7a7a`       | `#c94747`          |
| `--card-bg`                  | page card ground                          | `#10131f`       | `#ffffff`          |
| `--card-shadow`              | floating card elevation                   | layered rgba    | layered rgba       |
| `--scrim`                    | overlay dim                               | `5,7,14 @55%`   | `232,236,248 @55%` |
| `--radius-card/control/pill` | corner system                             | 12 / 8 / 999 px | same               |
| `--blur-glass`               | backdrop blur radius                      | 24px            | same               |
| `--font-ui`                  | system UI stack                           | —               | —                  |

Contrast: phase (c) adds automated WCAG AA checks over every ink/surface pair
and constrains aurora palettes to luminance bands (see PHASES.md).

## Component inventory (phase a)

| Component         | File                                    | Notes                                             |
| ----------------- | --------------------------------------- | ------------------------------------------------- |
| App shell         | `App.tsx`                               | aurora ground, grid: sidebar + page area          |
| Sidebar           | `components/sidebar/Sidebar.tsx`        | spring collapse (⌘S), fixed inner width           |
| NavCluster        | `components/sidebar/NavCluster.tsx`     | back / forward / reload-stop                      |
| UrlPill           | `components/sidebar/UrlPill.tsx`        | security icon, host label, ★, inline edit         |
| FavoritesGrid     | `components/sidebar/FavoritesGrid.tsx`  | 4-col glass tiles, letter fallback                |
| TabList / TabItem | `components/sidebar/TabList.tsx`        | drag reorder (motion `Reorder`), close on hover   |
| WindowControls    | `components/sidebar/WindowControls.tsx` | Windows/Linux only                                |
| PageCard          | `components/PageCard.tsx`               | measures view bounds; empty/crash/snapshot states |
| Palette v0        | `components/palette/Palette.tsx`        | scrim + glass panel; full palette in phase b      |

## Motion

Springs only (no duration curves): sidebar `stiffness 380 / damping 36`,
palette `480 / 34`. `MotionConfig reducedMotion="user"` honors
`prefers-reduced-motion` globally. Phase (c) defines the full motion table.
