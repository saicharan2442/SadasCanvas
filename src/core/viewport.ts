// ─────────────────────────────────────────────────────────────────────────────
// Live viewport measurement.
//
// The store keeps a cached viewport size (updated by a ResizeObserver), but
// observers fire *after* layout — so any fit/recenter triggered in the same
// frame as a layout change (toggling a panel, switching sheets, entering
// present mode) would use a stale size and land off-centre. Measuring the
// container directly removes that whole class of bug.
// ─────────────────────────────────────────────────────────────────────────────

export const viewportBus: { el: HTMLElement | null } = { el: null };

/** Overlay scrollbar thickness; must match `BAR` in CanvasScrollbars. */
export const SCROLLBAR = 11;

export interface ViewportBox {
  w: number;      // full canvas size
  h: number;
  usableW: number; // area not covered by the overlay scrollbars
  usableH: number;
}

export function measureViewport(fallback: { w: number; h: number }): ViewportBox {
  const el = viewportBus.el;
  let w = fallback.w;
  let h = fallback.h;
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) { w = r.width; h = r.height; }
  }
  return {
    w, h,
    usableW: Math.max(40, w - SCROLLBAR),
    usableH: Math.max(40, h - SCROLLBAR),
  };
}
