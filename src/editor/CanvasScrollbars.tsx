// ─────────────────────────────────────────────────────────────────────────────
// CanvasScrollbars — slim horizontal (bottom) and vertical (right) scrollbars
// overlaid on the canvas. They scroll the whole workspace: the sheet, its
// objects and the background grid all move together, because the bars simply
// drive the shared camera used by panning and the wheel.
//
// The scrollable range is the union of the sheet, all objects and the current
// viewport (plus padding), so there is always somewhere to scroll to without
// the thumb jumping when content is added.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../core/store";
import { isInfinite, sheetSize, type Camera, type Page } from "../core/types";

const BAR = 11;          // bar thickness in px
const MIN_THUMB = 32;    // smallest usable thumb in px
const PAD = 300;         // slack around content, in canvas units

interface Props {
  page: Page | null;
  camera: Camera;
  size: { w: number; h: number };
}

interface Range { start: number; end: number; }

interface DragState {
  axis: "x" | "y";
  pointerStart: number;
  viewStart: number;
  total: number;
  track: number;
}

export default function CanvasScrollbars({ page, camera, size }: Props) {
  const setCamera = useStore((s) => s.setCamera);
  const [dragging, setDragging] = useState<"x" | "y" | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const zoom = camera.zoom || 1;

  // Visible region in canvas units.
  const view = useMemo(() => ({
    x: { start: -camera.x / zoom, end: -camera.x / zoom + size.w / zoom } as Range,
    y: { start: -camera.y / zoom, end: -camera.y / zoom + size.h / zoom } as Range,
  }), [camera.x, camera.y, zoom, size.w, size.h]);

  // Content region: sheet ∪ objects.
  const content = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (page && !isInfinite(page.sheet)) {
      const { w, h } = sheetSize(page.sheet);
      minX = 0; minY = 0; maxX = w; maxY = h;
    }
    for (const o of page?.objects ?? []) {
      if (!o.visible) continue;
      minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + o.width); maxY = Math.max(maxY, o.y + o.height);
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
    return { minX, minY, maxX, maxY };
  }, [page]);

  // Scrollable range = content (+padding) ∪ viewport.
  const range = useMemo(() => ({
    x: {
      start: Math.min(content.minX - PAD, view.x.start),
      end: Math.max(content.maxX + PAD, view.x.end),
    } as Range,
    y: {
      start: Math.min(content.minY - PAD, view.y.start),
      end: Math.max(content.maxY + PAD, view.y.end),
    } as Range,
  }), [content, view]);

  const metrics = useCallback((axis: "x" | "y") => {
    const r = range[axis];
    const v = view[axis];
    const track = axis === "x" ? size.w - BAR : size.h - BAR;
    const total = Math.max(1e-6, r.end - r.start);
    const visible = Math.max(1e-6, v.end - v.start);
    const thumb = Math.max(MIN_THUMB, Math.min(track, (visible / total) * track));
    const maxOffset = Math.max(0, track - thumb);
    const scrollable = Math.max(1e-6, total - visible);
    const progress = Math.min(1, Math.max(0, (v.start - r.start) / scrollable));
    return { track, total, visible, thumb, offset: progress * maxOffset, maxOffset, scrollable };
  }, [range, view, size.w, size.h]);

  const mx = metrics("x");
  const my = metrics("y");

  const scrollTo = useCallback((axis: "x" | "y", viewStart: number) => {
    setCamera(axis === "x" ? { x: -viewStart * zoom } : { y: -viewStart * zoom });
  }, [setCamera, zoom]);

  // ── thumb dragging ─────────────────────────────────────────────────────────
  const startDrag = (axis: "x" | "y") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const m = axis === "x" ? mx : my;
    dragRef.current = {
      axis,
      pointerStart: axis === "x" ? e.clientX : e.clientY,
      viewStart: view[axis].start,
      total: m.total,
      track: m.track,
    };
    setDragging(axis);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pointer = d.axis === "x" ? e.clientX : e.clientY;
      // Convert pixels travelled along the track into canvas units.
      const canvasDelta = ((pointer - d.pointerStart) / Math.max(1, d.track)) * d.total;
      scrollTo(d.axis, d.viewStart + canvasDelta);
    };
    const onUp = () => { dragRef.current = null; setDragging(null); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, scrollTo]);

  // ── click on the track pages towards the pointer ──────────────────────────
  const pageJump = (axis: "x" | "y") => (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const m = axis === "x" ? mx : my;
    const pos = axis === "x" ? e.clientX - rect.left : e.clientY - rect.top;
    const dir = pos > m.offset + m.thumb / 2 ? 1 : -1;
    scrollTo(axis, view[axis].start + dir * m.visible * 0.9);
  };

  if (size.w < 80 || size.h < 80) return null;

  const hHidden = mx.scrollable <= 1;
  const vHidden = my.scrollable <= 1;

  return (
    <>
      <div
        className={"cv-scrollbar horizontal" + (dragging === "x" ? " dragging" : "")}
        style={{ right: BAR, height: BAR, opacity: hHidden ? 0.45 : 1 }}
        onMouseDown={pageJump("x")}
        title="Scroll left / right (Shift + wheel)"
      >
        <div
          className="cv-thumb"
          style={{ left: mx.offset, width: mx.thumb }}
          onMouseDown={startDrag("x")}
        />
      </div>

      <div
        className={"cv-scrollbar vertical" + (dragging === "y" ? " dragging" : "")}
        style={{ bottom: BAR, width: BAR, opacity: vHidden ? 0.45 : 1 }}
        onMouseDown={pageJump("y")}
        title="Scroll up / down (wheel)"
      >
        <div
          className="cv-thumb"
          style={{ top: my.offset, height: my.thumb }}
          onMouseDown={startDrag("y")}
        />
      </div>

      <div className="cv-scroll-corner" style={{ width: BAR, height: BAR }} />
    </>
  );
}
