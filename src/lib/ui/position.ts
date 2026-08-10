/**
 * Anchored positioning for popover panels — the ~10% of a floating-ui that this
 * app actually uses, at no dependency cost.
 *
 * Deliberately *not* CSS `anchor-name`/`position-anchor`: Firefox still doesn't
 * support it, so shipping it would mean shipping this JS fallback anyway.
 *
 * Panels are `position: fixed` and placed in viewport coordinates. That is what
 * frees them from the `overflow-hidden` list containers that made every cell
 * popover clip on the last row — and it is also why the native popover API is
 * a bonus here rather than a requirement: the coordinates are already right,
 * the top layer just additionally immunises them against ancestor stacking and
 * transforms.
 */

export type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export type AnchorOptions = {
  anchor: HTMLElement | undefined;
  placement?: Placement;
  /** Gap between anchor and panel, in px. */
  offset?: number;
  /** Match the panel's width to the anchor's (used by the filter chips). */
  matchWidth?: boolean;
};

const VIEWPORT_MARGIN = 8;
const MIN_PANEL_HEIGHT = 120;

function place(panel: HTMLElement, opts: AnchorOptions) {
  const anchor = opts.anchor;
  if (!anchor || !anchor.isConnected) return;

  const placement = opts.placement ?? 'bottom-start';
  const offset = opts.offset ?? 4;
  const a = anchor.getBoundingClientRect();

  if (opts.matchWidth) panel.style.minWidth = `${a.width}px`;

  // Measure unconstrained, then decide. maxHeight is cleared first so a
  // previous run's clamp doesn't feed into this one's measurement.
  panel.style.maxHeight = '';
  const p = panel.getBoundingClientRect();

  const spaceBelow = window.innerHeight - a.bottom - offset - VIEWPORT_MARGIN;
  const spaceAbove = a.top - offset - VIEWPORT_MARGIN;

  let wantsTop = placement.startsWith('top');
  // Flip only when the preferred side genuinely can't hold the panel and the
  // other side is roomier — otherwise a panel near the fold jitters between
  // sides as its content changes.
  if (!wantsTop && p.height > spaceBelow && spaceAbove > spaceBelow) wantsTop = true;
  else if (wantsTop && p.height > spaceAbove && spaceBelow > spaceAbove) wantsTop = false;

  const available = Math.max(MIN_PANEL_HEIGHT, wantsTop ? spaceAbove : spaceBelow);
  if (p.height > available) panel.style.maxHeight = `${available}px`;

  const height = Math.min(p.height, available);
  const top = wantsTop ? a.top - offset - height : a.bottom + offset;

  const alignEnd = placement.endsWith('end');
  let left = alignEnd ? a.right - p.width : a.left;
  const maxLeft = window.innerWidth - p.width - VIEWPORT_MARGIN;
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, Math.max(VIEWPORT_MARGIN, maxLeft)));

  // `inset: auto` first, and in this order: the UA stylesheet gives [popover]
  // `inset: 0; margin: auto`, and leaving `right`/`bottom` at 0 would fight the
  // left/top set below.
  panel.style.position = 'fixed';
  panel.style.inset = 'auto';
  panel.style.margin = '0';
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(Math.max(VIEWPORT_MARGIN, top))}px`;
}

/**
 * Svelte action. Positions on mount and keeps the panel glued to its anchor
 * while the page scrolls or resizes.
 */
export function anchored(panel: HTMLElement, opts: AnchorOptions) {
  let current = opts;
  const update = () => place(panel, current);

  update();
  // Two frames: the first lets the browser lay the panel out, the second
  // catches content that only measures correctly after fonts/images settle.
  requestAnimationFrame(update);

  // Capture, so scrolling inside any ancestor (the app shell's <main> has its
  // own scroll container) repositions too, not just the window.
  window.addEventListener('scroll', update, true);
  window.addEventListener('resize', update);

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
  ro?.observe(panel);

  return {
    update(next: AnchorOptions) {
      current = next;
      update();
    },
    destroy() {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    }
  };
}
