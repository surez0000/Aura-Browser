/**
 * Where a sidebar popover (downloads, settings, space editor) sits.
 *
 * In the full sidebar it fills the panel's width, over chrome only. Beside the
 * compact rail there is no room, so it opens to the right of the rail and
 * therefore over the page — which is why an open popover holds the page
 * overlay (ADR-0003) while it is up. That only ever happens on an explicit
 * click, never on hover.
 */
export function popoverAnchorClass(compact: boolean): string {
  return compact
    ? 'popover-over-page absolute bottom-12 left-2 z-40 w-[320px]'
    : 'absolute right-3 bottom-12 left-3 z-30'
}
