// ─────────────────────────────────────────────────────────────────────────────
// Object-alignment snapping: edges & centers of the dragged box snap to edges
// & centers of nearby objects, producing magenta guide lines.
// ─────────────────────────────────────────────────────────────────────────────

import type { Bounds } from "../core/types";

export interface Guide {
  axis: "x" | "y"; // axis the guide runs along
  pos: number;     // coordinate of the guide
  start: number;
  end: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

export function computeSnap(moving: Bounds, others: Bounds[], tol: number): SnapResult {
  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];

  let bestX: { delta: number; line: Bounds } | null = null;
  let bestY: { delta: number; line: Bounds } | null = null;

  for (const o of others) {
    const ox = [o.x, o.x + o.w / 2, o.x + o.w];
    const oy = [o.y, o.y + o.h / 2, o.y + o.h];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const dx = ox[i] - mx[j];
        if (Math.abs(dx) <= tol && (!bestX || Math.abs(dx) < Math.abs(bestX.delta))) {
          bestX = { delta: dx, line: o };
        }
        const dy = oy[i] - my[j];
        if (Math.abs(dy) <= tol && (!bestY || Math.abs(dy) < Math.abs(bestY.delta))) {
          bestY = { delta: dy, line: o };
        }
      }
    }
  }

  const guides: Guide[] = [];
  let dx = 0, dy = 0;
  if (bestX) {
    dx = bestX.delta;
    const x = moving.x + dx; // snapped left edge x of moving box (guide at matched coordinate)
    void x;
    const top = Math.min(moving.y, bestX.line.y) - 12;
    const bottom = Math.max(moving.y + moving.h, bestX.line.y + bestX.line.h) + 12;
    // guide position: the matched coordinate on the other box
    guides.push({ axis: "y", pos: snapLinePosX(moving, dx, bestX.line), start: top, end: bottom });
  }
  if (bestY) {
    dy = bestY.delta;
    const left = Math.min(moving.x, bestY.line.x) - 12;
    const right = Math.max(moving.x + moving.w, bestY.line.x + bestY.line.w) + 12;
    guides.push({ axis: "x", pos: snapLinePosY(moving, dy, bestY.line), start: left, end: right });
  }
  return { dx, dy, guides };
}

function snapLinePosX(moving: Bounds, dx: number, other: Bounds): number {
  // choose the matched coordinate: after applying dx one of moving's
  // left/center/right coincides with one of other's — use the other's nearest.
  const cands = [other.x, other.x + other.w / 2, other.x + other.w];
  const moved = [moving.x + dx, moving.x + dx + moving.w / 2, moving.x + dx + moving.w];
  let best = cands[0], bestErr = Infinity;
  for (const c of cands) for (const m of moved) {
    const e = Math.abs(c - m);
    if (e < bestErr) { bestErr = e; best = c; }
  }
  return best;
}

function snapLinePosY(moving: Bounds, dy: number, other: Bounds): number {
  const cands = [other.y, other.y + other.h / 2, other.y + other.h];
  const moved = [moving.y + dy, moving.y + dy + moving.h / 2, moving.y + dy + moving.h];
  let best = cands[0], bestErr = Infinity;
  for (const c of cands) for (const m of moved) {
    const e = Math.abs(c - m);
    if (e < bestErr) { bestErr = e; best = c; }
  }
  return best;
}
