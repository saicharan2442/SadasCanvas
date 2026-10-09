// ─────────────────────────────────────────────────────────────────────────────
// CanvasStage — the Konva workbench. Sheet (A4/Letter/…) or infinite canvas,
// pan/zoom, adaptive grid, marquee + multi-selection, drawing tools with
// pressure-free smoothing, snapping guides, culling and inline text editing.
//
// Pointer handling is unified (mouse + touch + stylus) through begin/move/end
// so freehand tools work with a trackpad, finger or pen.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import Konva from "konva";
import { Stage, Layer, Rect, Line, Shape, Transformer } from "react-konva";
import { useStore, activeDoc, activePage, canvasTokens } from "../core/store";
import { stageBus, openDocumentFile, DOC_EXT_RE } from "../core/fileio";
import { viewportBus } from "../core/viewport";
import { makeObject, bboxOfPoints, normalizePoints, isDarkColor } from "../core/factory";
import { addImageFromFile, expandGroupSelection, fitSheet } from "../ui/actions";
import {
  hasText, isPointBased, isInfinite, sheetSize,
  type Bounds, type CanvasObject, type ID, type InkTool, type Tool,
} from "../core/types";
import { computeSnap, type Guide } from "./snapping";
import ObjectNode, {
  SHAPE_PAD, STICKY_PAD, TEXT_PAD, decorationOf, type NodeEvents,
} from "./ObjectNode";
import CanvasScrollbars from "./CanvasScrollbars";

const CREATION_TOOLS: Set<Tool> = new Set([
  "text", "rect", "roundrect", "ellipse", "triangle", "star",
  "line", "arrow", "pen", "pencil", "highlighter", "sticky",
]);

const INK_TOOLS: Set<Tool> = new Set(["pen", "pencil", "highlighter"]);

const CURSORS: Record<string, string> = {
  select: "default", pan: "grab", text: "text", eraser: "cell",
  eyedropper: "crosshair",
};

/** Guard against unbounded stroke memory on very long drags. */
const MAX_INK_POINTS = 4000;

interface PointerInfo { button: number; shift: boolean; alt: boolean; }

export default function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const objLayerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<ID, Konva.Node>());

  // ── store subscriptions ───────────────────────────────────────────────────
  const theme = useStore((s) => s.theme);
  const tool = useStore((s) => s.tool);
  const spaceHeld = useStore((s) => s.spaceHeld);
  const gridShow = useStore((s) => s.gridShow);
  const gridSize = useStore((s) => s.gridSize);
  const gridStyle = useStore((s) => s.gridStyle);
  const snapGrid = useStore((s) => s.snapGrid);
  const snapObjects = useStore((s) => s.snapObjects);
  const selection = useStore((s) => s.selection);
  const editingId = useStore((s) => s.editingId);
  const presenting = useStore((s) => s.presenting);
  const doc = useStore((s) => activeDoc(s));
  const page = useStore((s) => activePage(activeDoc(s)));
  const camera = doc?.camera ?? { x: 0, y: 0, zoom: 1 };
  const sheet = page?.sheet;
  // The drawing surface decides default object contrast. UI theme is only a
  // fallback for infinite canvases; white A4 paper always gets dark text.
  const surfaceDark = sheet && !isInfinite(sheet)
    ? isDarkColor(sheet.background)
    : theme === "dark";

  // ── local interaction state ───────────────────────────────────────────────
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [draft, setDraft] = useState<CanvasObject | null>(null);
  const [dragHint, setDragHint] = useState(false);

  const panRef = useRef<{ sx: number; sy: number; camX: number; camY: number } | null>(null);
  const marqueeRef = useRef<{ x0: number; y0: number; additive: boolean } | null>(null);
  const drawRef = useRef<{ x0: number; y0: number; points: number[]; base: CanvasObject } | null>(null);
  const eraseRef = useRef(false);
  const startPosRef = useRef(new Map<ID, { x: number; y: number }>());
  const handoffRef = useRef<ID | null>(null);
  const lastPointerRef = useRef(0);
  const didInitialFit = useRef(false);

  const tokens = canvasTokens(theme);
  const zoom = camera.zoom;

  // ── stage registration + sizing ───────────────────────────────────────────
  useEffect(() => {
    stageBus.stage = stageRef.current;
    return () => { stageBus.stage = null; };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Expose the element so fit/recenter can measure it synchronously.
    viewportBus.el = el;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(50, r.width), h = Math.max(50, r.height);
      setSize({ w, h });
      useStore.getState().setViewport(w, h);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => { ro.disconnect(); viewportBus.el = null; };
  }, []);

  // Center the sheet the first time we know the viewport size.
  useEffect(() => {
    if (didInitialFit.current || size.w < 100) return;
    didInitialFit.current = true;
    const cam = useStore.getState().docs.find((d) => d.id === useStore.getState().activeDocId)?.camera;
    if (cam && cam.x === 0 && cam.y === 0 && cam.zoom === 1 && !isInfinite(sheet)) {
      fitSheet();
    }
  }, [size.w, size.h, sheet]);

  // While presenting, always keep the current slide fitted — including when
  // entering/leaving full screen or when the window is resized.
  useEffect(() => {
    if (!presenting || size.w < 100) return;
    const id = requestAnimationFrame(fitSheet);
    return () => cancelAnimationFrame(id);
  }, [presenting, size.w, size.h, doc?.pageId]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const getCanvasPoint = useCallback((): { x: number; y: number } => {
    const stage = stageRef.current!;
    const p = stage.getPointerPosition() ?? { x: 0, y: 0 };
    const cam = stage.position();
    const z = stage.scaleX() || 1;
    return { x: (p.x - cam.x) / z, y: (p.y - cam.y) / z };
  }, []);

  const objects = useMemo(() => page?.objects ?? [], [page]);

  const viewRect = useMemo<Bounds>(() => {
    const m = 320;
    return {
      x: -camera.x / zoom - m, y: -camera.y / zoom - m,
      w: size.w / zoom + m * 2, h: size.h / zoom + m * 2,
    };
  }, [camera, size, zoom]);

  const renderedObjects = useMemo(
    () => objects.filter((o) =>
      o.visible &&
      o.x + o.width >= viewRect.x && o.x <= viewRect.x + viewRect.w &&
      o.y + o.height >= viewRect.y && o.y <= viewRect.y + viewRect.h),
    [objects, viewRect],
  );

  const editingObj = editingId ? objects.find((o) => o.id === editingId) ?? null : null;

  // ── selection → transformer wiring ────────────────────────────────────────
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (editingId) { tr.nodes([]); tr.getLayer()?.batchDraw(); return; }
    const nodes = selection
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selection, editingId, renderedObjects]);

  const single = selection.length === 1 ? objects.find((o) => o.id === selection[0]) : undefined;
  // Text gets corner handles (scale the whole text proportionally) plus the
  // side handles (reflow the box width without changing the font size).
  const trAnchors = single && single.type === "text"
    ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
    : undefined;
  const trResize = !(single && isPointBased(single));

  // ── unified pointer: begin ────────────────────────────────────────────────

  const beginPointer = (info: PointerInfo) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (presenting) return; // slideshow: the overlay owns all input

    // pan: middle button, pan tool, or Space held
    if (info.button === 1 || tool === "pan" || spaceHeld) {
      const p = stage.getPointerPosition();
      if (!p) return;
      panRef.current = { sx: p.x, sy: p.y, camX: stage.x(), camY: stage.y() };
      return;
    }
    if (info.button === 2) return; // ignore right button

    const pt = getCanvasPoint();
    const st = useStore.getState();

    if (tool === "eraser") {
      eraseRef.current = true;
      eraseAt();
      return;
    }

    if (tool === "eyedropper") {
      pickColorAt();
      return;
    }

    if (INK_TOOLS.has(tool)) {
      const ink = st.inkSettings[tool as InkTool];
      const base = makeObject("ink", 0, 0, {
        inkTool: tool as InkTool,
        points: [pt.x, pt.y],
        dark: surfaceDark,
        stroke: ink.color,
        strokeWidth: ink.width,
        opacity: tool === "highlighter" ? 0.4 : 1,
      });
      drawRef.current = { x0: pt.x, y0: pt.y, points: [pt.x, pt.y], base };
      setDraft(base);
      if (st.selection.length) st.clearSelection();
      return;
    }

    if (CREATION_TOOLS.has(tool)) {
      if (tool === "text" || tool === "sticky") {
        // Click = auto-sized box, drag = a box of the size you draw.
        const base = makeObject(tool === "text" ? "text" : "sticky", pt.x, pt.y, {
          text: "", dark: surfaceDark,
        });
        drawRef.current = { x0: pt.x, y0: pt.y, points: [], base };
        setDraft(null);
        return;
      }
      const type = tool === "roundrect" ? "rect" : (tool as CanvasObject["type"]);
      const base = makeObject(type, pt.x, pt.y, { dark: surfaceDark });
      if (tool === "roundrect") base.cornerRadius = 14;
      drawRef.current = { x0: pt.x, y0: pt.y, points: [], base };
      setDraft(null);
      return;
    }

    if (tool === "select") {
      // Object clicks cancel bubbling, so reaching here usually means empty
      // space — double-check against the invisible hit board.
      const hit = stage.getIntersection(stage.getPointerPosition() ?? { x: 0, y: 0 });
      const onEmpty = !hit || hit.name?.() === "board";
      if (onEmpty) {
        marqueeRef.current = { x0: pt.x, y0: pt.y, additive: info.shift };
        setMarquee({ x: pt.x, y: pt.y, w: 0.01, h: 0.01 });
        if (!info.shift) st.clearSelection();
      }
    }
  };

  // ── unified pointer: move ─────────────────────────────────────────────────

  const movePointer = (shift: boolean) => {
    const stage = stageRef.current;
    if (!stage) return;

    const now = performance.now();
    if (now - lastPointerRef.current > 60) {
      lastPointerRef.current = now;
      const pt = getCanvasPoint();
      useStore.getState().setPointer(Math.round(pt.x), Math.round(pt.y));
    }

    if (panRef.current) {
      const p = stage.getPointerPosition();
      if (!p) return;
      const pan = panRef.current;
      useStore.getState().setCamera({ x: pan.camX + (p.x - pan.sx), y: pan.camY + (p.y - pan.sy) });
      return;
    }

    if (eraseRef.current) { eraseAt(); return; }

    if (marqueeRef.current) {
      const pt = getCanvasPoint();
      const m = marqueeRef.current;
      setMarquee({
        x: Math.min(m.x0, pt.x), y: Math.min(m.y0, pt.y),
        w: Math.abs(pt.x - m.x0), h: Math.abs(pt.y - m.y0),
      });
      return;
    }

    if (drawRef.current) updateDraft(drawRef.current, getCanvasPoint(), shift);
  };

  // ── unified pointer: end ──────────────────────────────────────────────────

  const endPointer = () => {
    panRef.current = null;
    eraseRef.current = false;

    if (marqueeRef.current) {
      const additive = marqueeRef.current.additive;
      const box = marquee;
      marqueeRef.current = null;
      setMarquee(null);
      if (box && (box.w > 1 || box.h > 1)) {
        const hit = objects
          .filter((o) => o.visible && !o.locked)
          .filter((o) =>
            o.x < box.x + box.w && o.x + o.width > box.x &&
            o.y < box.y + box.h && o.y + o.height > box.y)
          .map((o) => o.id);
        const st = useStore.getState();
        st.setSelection(additive ? [...new Set([...st.selection, ...hit])] : hit);
      }
    }

    if (drawRef.current) finishDraft();
  };

  // keep the latest end handler reachable from the window listener
  const endRef = useRef(endPointer);
  endRef.current = endPointer;
  useEffect(() => {
    const up = () => {
      // only act if an interaction is actually in flight (stage handler runs first)
      if (drawRef.current || marqueeRef.current || panRef.current || eraseRef.current) {
        endRef.current();
      }
    };
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
      window.removeEventListener("blur", up);
    };
  }, []);

  /**
   * Wheel navigation, document-viewer style:
   *   wheel                    → scroll the sheet up / down
   *   Shift + wheel            → scroll the sheet left / right
   *   Ctrl + wheel (or Alt)    → zoom at the cursor
   */
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage || presenting) return;
    const st = useStore.getState();
    const ev = e.evt;

    // Normalise units: some mice/OS combos report lines or pages, which
    // otherwise scroll only a few pixels per notch.
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? size.h : 1;
    const dx = ev.deltaX * unit;
    const dy = ev.deltaY * unit;

    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      const p = stage.getPointerPosition() ?? { x: size.w / 2, y: size.h / 2 };
      st.zoomAt(zoom * Math.exp(-dy * 0.0016), p.x, p.y);
      return;
    }

    if (ev.shiftKey) {
      // Horizontal: use whichever axis the device actually reported, so
      // trackpad horizontal gestures keep working too.
      const amount = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      st.setCamera({ x: camera.x - amount, y: camera.y });
      return;
    }

    st.setCamera({ x: camera.x - dx, y: camera.y - dy });
  };

  /**
   * Eyedropper: read the composited pixel under the cursor and apply it to the
   * selection (text colour for text, fill otherwise). Pure canvas read — the
   * pixel never leaves the machine.
   */
  const pickColorAt = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    const st = useStore.getState();
    try {
      const c = stage.toCanvas({ x: p.x, y: p.y, width: 1, height: 1, pixelRatio: 1 } as any);
      const data = c.getContext("2d")!.getImageData(0, 0, 1, 1).data;
      const hex = "#" + [data[0], data[1], data[2]]
        .map((v) => v.toString(16).padStart(2, "0")).join("");
      st.addSwatch(hex);
      if (st.selection.length) {
        const sel = objects.filter((o) => st.selection.includes(o.id));
        const textOnly = sel.every((o) => o.type === "text");
        st.updateObjects(st.selection,
          textOnly ? { color: hex } : { fill: hex, fillMode: "solid" },
          "Apply picked colour");
        st.showToast(`Picked ${hex} — applied to selection`);
      } else {
        st.showToast(`Picked ${hex} — saved to swatches`);
      }
    } catch {
      st.showToast("Could not read that pixel.");
    }
    st.setTool("select");
  };

  // ── erasing ───────────────────────────────────────────────────────────────
  const eraseAt = () => {
    const stage = stageRef.current;
    const layer = objLayerRef.current;
    if (!stage || !layer) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    const shape = layer.getIntersection(p);
    if (!shape || shape.name?.() === "board") return;
    const ids = new Set(objects.map((o) => o.id));
    let node: Konva.Node | null = shape;
    while (node && !ids.has(node.id())) node = node.getParent();
    if (node) useStore.getState().removeObjects([node.id()], "Erase", "erase-stroke");
  };

  // ── drawing draft ─────────────────────────────────────────────────────────

  const updateDraft = (
    d: { x0: number; y0: number; points: number[]; base: CanvasObject },
    pt: { x: number; y: number },
    shift: boolean,
  ) => {
    const base = d.base;

    if (base.type === "ink") {
      const lastX = d.points[d.points.length - 2];
      const lastY = d.points[d.points.length - 1];
      // distance filter in screen px keeps strokes smooth at any zoom
      const minDist = (base.inkTool === "highlighter" ? 3 : 1.4) / zoom;
      if (Math.hypot(pt.x - lastX, pt.y - lastY) < minDist) return;
      if (d.points.length >= MAX_INK_POINTS * 2) return;
      d.points.push(pt.x, pt.y);
      setDraft({ ...base, points: [...d.points] });
      return;
    }

    if (base.type === "line" || base.type === "arrow") {
      let ex = pt.x, ey = pt.y;
      if (shift) {
        const ang = Math.atan2(pt.y - d.y0, pt.x - d.x0);
        const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(pt.x - d.x0, pt.y - d.y0);
        ex = d.x0 + Math.cos(snapped) * len;
        ey = d.y0 + Math.sin(snapped) * len;
      }
      const { points, dx, dy } = normalizePoints([0, 0, ex - d.x0, ey - d.y0]);
      const b = bboxOfPoints(points);
      setDraft({
        ...base, points,
        x: d.x0 + dx, y: d.y0 + dy,
        width: Math.max(1, b.w), height: Math.max(1, b.h),
      });
      return;
    }

    let w = pt.x - d.x0, h = pt.y - d.y0;
    const negX = w < 0, negY = h < 0;
    w = Math.abs(w); h = Math.abs(h);
    if (shift) { const s = Math.max(w, h); w = s; h = s; }
    setDraft({
      ...base,
      x: negX ? d.x0 - w : d.x0,
      y: negY ? d.y0 - h : d.y0,
      width: Math.max(1, w), height: Math.max(1, h),
    });
  };

  const finishDraft = () => {
    const d = drawRef.current;
    drawRef.current = null;
    if (!d) { setDraft(null); return; }
    const st = useStore.getState();
    const base = d.base;

    // ── freehand ────────────────────────────────────────────────────────────
    if (base.type === "ink") {
      let pts = d.points;
      if (pts.length < 4) {
        // a tap should still leave a dot
        const r = Math.max(0.5, base.strokeWidth * 0.12);
        pts = [pts[0] - r, pts[1], pts[0] + r, pts[1]];
      }
      const { points, dx, dy } = normalizePoints(pts);
      const b = bboxOfPoints(points);
      const obj: CanvasObject = {
        ...base, points,
        x: dx, y: dy,
        width: Math.max(1, b.w), height: Math.max(1, b.h),
      };
      // Freehand tools stay active and strokes are not auto-selected, so you
      // can keep drawing without the transformer getting in the way.
      st.addObjects([obj], "Draw", false);
      setDraft(null);
      return;
    }

    // ── text / sticky: click gives a default box, drag gives a sized one ────
    if (base.type === "text" || base.type === "sticky") {
      const dragged = draft && (draft.width > 12 || draft.height > 12);
      const minLine = Math.round(base.fontSize * base.lineHeight);
      let obj: CanvasObject;
      if (dragged) {
        obj = base.type === "text"
          ? { ...draft!, width: Math.max(40, draft!.width), height: Math.max(minLine, draft!.height) }
          : { ...draft!, width: Math.max(60, draft!.width), height: Math.max(60, draft!.height) };
      } else {
        obj = base.type === "text"
          ? { ...base, x: d.x0, y: d.y0, width: 220, height: minLine }
          : { ...base, x: d.x0, y: d.y0, width: 200, height: 200 };
      }
      st.addObjects([obj], base.type === "text" ? "Add text" : "Add sticky note");
      st.setTool("select");
      setDraft(null);
      // Mount/focus the editor on the next frame — see the comment in
      // CanvasTextEditor: focusing inside the pointer handler can blur and
      // delete the still-empty object.
      requestAnimationFrame(() => {
        const current = useStore.getState();
        const currentPage = activePage(activeDoc(current));
        if (currentPage?.objects.some((candidate) => candidate.id === obj.id)) {
          current.setEditing(obj.id);
        }
      });
      return;
    }

    // ── shapes / lines ──────────────────────────────────────────────────────
    let obj = draft;
    const tooSmall = !obj || (obj.width < 4 && obj.height < 4);
    if (tooSmall) {
      obj = base.type === "line" || base.type === "arrow"
        ? { ...base, x: d.x0, y: d.y0, points: [0, 0, 140, 0], width: 140, height: 1 }
        : { ...base, x: d.x0 - 60, y: d.y0 - 40, width: 120, height: 80 };
    }
    st.addObjects([obj!], "Add " + obj!.name.replace(/ \d+$/, ""));
    st.setTool("select");
    setDraft(null);
  };

  // ── object node event handlers ────────────────────────────────────────────

  const onNodeMouseDown = (e: Konva.KonvaEventObject<MouseEvent>, o: CanvasObject) => {
    if (tool !== "select") return;
    if (e.evt.button === 1 || useStore.getState().spaceHeld) return;
    e.cancelBubble = true;
    const st = useStore.getState();
    const expanded = expandGroupSelection(objects, o.id);
    if (e.evt.shiftKey) {
      const cur = new Set(st.selection);
      const includesAll = expanded.every((id) => cur.has(id));
      if (includesAll) expanded.forEach((id) => cur.delete(id));
      else expanded.forEach((id) => cur.add(id));
      st.setSelection([...cur]);
    } else if (!expanded.every((id) => st.selection.includes(id))) {
      st.setSelection(expanded);
    }
  };

  const onNodeDblClick = (e: Konva.KonvaEventObject<MouseEvent>, o: CanvasObject) => {
    if (tool !== "select") return;
    e.cancelBubble = true;
    // A linked object opens its URL (after confirmation). Hold Alt to edit the
    // card's text instead of following the link.
    if (o.link && !e.evt.altKey) {
      useStore.getState().setSelection([o.id]);
      useStore.getState().setPendingLink(o.link);
      return;
    }
    if (hasText(o) && !o.locked) {
      const st = useStore.getState();
      st.setSelection([o.id]);
      // As with creation, defer focus until the double-click default action
      // has completed. This is particularly important in WebView2.
      requestAnimationFrame(() => useStore.getState().setEditing(o.id));
    }
  };

  const onNodeDragStart = (e: Konva.KonvaEventObject<DragEvent>, o: CanvasObject) => {
    const st = useStore.getState();

    if (e.evt.altKey && handoffRef.current !== o.id) {
      e.target.stopDrag();
      const dup: CanvasObject = {
        ...o, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        x: o.x + 14, y: o.y + 14, groupId: null,
        points: o.points ? [...o.points] : undefined,
      };
      handoffRef.current = dup.id;
      st.addObjects([dup], "Duplicate");
      requestAnimationFrame(() => {
        const node = nodeRefs.current.get(dup.id);
        if (node) { try { node.startDrag(); } catch { /* pointer released */ } }
      });
      return;
    }

    startPosRef.current.clear();
    for (const id of st.selection) {
      const n = nodeRefs.current.get(id);
      if (n) startPosRef.current.set(id, { x: n.x(), y: n.y() });
    }
  };

  const onNodeDragMove = (e: Konva.KonvaEventObject<DragEvent>, o: CanvasObject) => {
    const dragged = e.target;
    const start = startPosRef.current.get(o.id);
    if (start) {
      const dx = dragged.x() - start.x;
      const dy = dragged.y() - start.y;
      for (const [id, pos] of startPosRef.current) {
        if (id === o.id) continue;
        const n = nodeRefs.current.get(id);
        if (n) n.position({ x: pos.x + dx, y: pos.y + dy });
      }
    }

    if (snapObjects && selection.length <= 1) {
      const moving: Bounds = { x: dragged.x(), y: dragged.y(), w: o.width, h: o.height };
      const others: Bounds[] = objects
        .filter((ob) => ob.visible && ob.id !== o.id)
        .map((ob) => ({ x: ob.x, y: ob.y, w: ob.width, h: ob.height }));
      // sheet edges, centre and margin box also act as snap targets
      if (sheet && !isInfinite(sheet)) {
        const { w, h } = sheetSize(sheet);
        others.push({ x: 0, y: 0, w, h });
        if (sheet.margin > 0) {
          others.push({ x: sheet.margin, y: sheet.margin, w: w - sheet.margin * 2, h: h - sheet.margin * 2 });
        }
      }
      const res = computeSnap(moving, others, 7 / zoom);
      if (res.dx !== 0 || res.dy !== 0) {
        dragged.position({ x: moving.x + res.dx, y: moving.y + res.dy });
        setGuides(res.guides);
      } else if (guides) {
        setGuides(null);
      }
    }
  };

  const onNodeDragEnd = (_e: Konva.KonvaEventObject<DragEvent>, o: CanvasObject) => {
    setGuides(null);
    if (handoffRef.current === o.id) handoffRef.current = null;
    const st = useStore.getState();
    const ids = startPosRef.current.size > 0 ? [...startPosRef.current.keys()] : [o.id];
    const updates = new Map<ID, { x: number; y: number }>();
    for (const id of ids) {
      const n = nodeRefs.current.get(id);
      if (n) updates.set(id, { x: Math.round(n.x() * 100) / 100, y: Math.round(n.y() * 100) / 100 });
    }
    startPosRef.current.clear();
    if (updates.size === 0) return;
    st.updateObjects([...updates.keys()], (obj) => updates.get(obj.id) ?? {},
      ids.length > 1 ? "Move objects" : "Move");
  };

  const onNodeTransformEnd = (o: CanvasObject) => {
    const node = nodeRefs.current.get(o.id);
    if (!node) return;
    const sx = node.scaleX(), sy = node.scaleY();
    const patch: Partial<CanvasObject> = {
      x: Math.round(node.x() * 100) / 100,
      y: Math.round(node.y() * 100) / 100,
      rotation: Math.round(node.rotation() * 10) / 10,
    };
    if (isPointBased(o) && o.points) {
      const pts = o.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy));
      const { points, dx, dy } = normalizePoints(pts);
      const b = bboxOfPoints(points);
      patch.points = points;
      patch.x = Math.round((node.x() + dx) * 100) / 100;
      patch.y = Math.round((node.y() + dy) * 100) / 100;
      patch.width = Math.max(1, b.w);
      patch.height = Math.max(1, b.h);
    } else if (o.type === "text") {
      // Corner handles scale both axes → scale the font with the box.
      // Side handles only scale X → keep the font and just reflow the width.
      const cornerDrag = Math.abs(sy - 1) > 0.001;
      patch.width = Math.max(20, Math.round(o.width * sx));
      if (cornerDrag) {
        const factor = Math.abs(sy);
        patch.fontSize = Math.min(400, Math.max(4, Math.round(o.fontSize * factor * 10) / 10));
        patch.height = Math.max(1, Math.round(o.height * factor));
      }
    } else {
      patch.width = Math.max(4, Math.round(o.width * sx));
      patch.height = Math.max(4, Math.round(o.height * sy));
    }
    node.scale({ x: 1, y: 1 });
    useStore.getState().updateObjects([o.id], patch, "Transform");
  };

  const dragBound = useCallback(
    (pos: { x: number; y: number }) => {
      if (!snapGrid) return pos;
      const stage = stageRef.current;
      if (!stage) return pos;
      const abs = stage.getAbsoluteTransform().copy();
      const inv = abs.copy().invert();
      const pt = inv.point(pos);
      return abs.point({
        x: Math.round(pt.x / gridSize) * gridSize,
        y: Math.round(pt.y / gridSize) * gridSize,
      });
    },
    [snapGrid, gridSize],
  );

  const latest = useRef({
    onNodeMouseDown, onNodeDblClick, onNodeDragStart,
    onNodeDragMove, onNodeDragEnd, onNodeTransformEnd, dragBound,
  });
  latest.current = {
    onNodeMouseDown, onNodeDblClick, onNodeDragStart,
    onNodeDragMove, onNodeDragEnd, onNodeTransformEnd, dragBound,
  };

  const nodeEvents: NodeEvents = useMemo(() => ({
    registerRef: (id, node) => {
      if (node) nodeRefs.current.set(id, node);
      else nodeRefs.current.delete(id);
    },
    onNodeMouseDown: (e, o) => latest.current.onNodeMouseDown(e, o),
    onNodeDblClick: (e, o) => latest.current.onNodeDblClick(e, o),
    onNodeDragStart: (e, o) => latest.current.onNodeDragStart(e, o),
    onNodeDragMove: (e, o) => latest.current.onNodeDragMove(e, o),
    onNodeDragEnd: (e, o) => latest.current.onNodeDragEnd(e, o),
    onNodeTransformEnd: (o) => latest.current.onNodeTransformEnd(o),
    dragBound: (p) => latest.current.dragBound(p),
  }), []);

  // ── file drop ─────────────────────────────────────────────────────────────
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragHint(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const at = {
      x: (e.clientX - rect.left - camera.x) / zoom,
      y: (e.clientY - rect.top - camera.y) / zoom,
    };
    const st = useStore.getState();
    for (const f of files) {
      if (DOC_EXT_RE.test(f.name)) {
        try {
          const d = await openDocumentFile(f);
          d.name = f.name.replace(DOC_EXT_RE, "");
          st.openDocument(d);
          st.showToast(`Opened “${d.name}”`);
        } catch { st.showToast(`Could not open “${f.name}”`); }
      } else {
        await addImageFromFile(f, at);
      }
    }
  };

  // ── background painting: board, grid, sheet paper, margins ───────────────
  const bgScene = useCallback(
    (ctx: Konva.Context, shape: Konva.Shape) => {
      const g = (ctx as any)._context as CanvasRenderingContext2D;
      const vr = viewRect;
      const exporting = !!shape.getStage()?.getAttr("cpExport");
      const paper = sheet && !isInfinite(sheet) ? sheetSize(sheet) : null;
      // While presenting the workspace is a neutral dark backdrop and the
      // grid/margins are hidden, exactly as in an export.
      const clean = exporting || presenting;

      if (!exporting) {
        g.fillStyle = presenting ? "#101216" : tokens.board;
        g.fillRect(vr.x, vr.y, vr.w, vr.h);
      }

      // ── background grid ────────────────────────────────────────────────────
      // The pattern lives on the background board only. The sheet paper is
      // painted afterwards, on top, so the sheet stays clean.
      if (gridShow && !clean) {
        // Keep the pattern readable while zooming: coarsen the step until
        // cells are at least ~7px (dots need a little more breathing room).
        const minCell = gridStyle === "dots" ? 9 : 7;
        let step = gridSize;
        while (step * zoom < minCell) step *= 5;
        const major = step * 5;
        const x0 = Math.floor(vr.x / step) * step;
        const y0 = Math.floor(vr.y / step) * step;
        const right = vr.x + vr.w;
        const bottom = vr.y + vr.h;

        if (gridStyle === "dots") {
          // Dots keep a constant on-screen size regardless of zoom.
          const r = 1.1 / zoom;
          const rMajor = 1.7 / zoom;
          // Batch by colour: two paths instead of one path per dot.
          g.fillStyle = tokens.dot;
          g.beginPath();
          for (let x = x0; x <= right; x += step) {
            const xMajor = Math.round(x / major) * major === x;
            for (let y = y0; y <= bottom; y += step) {
              if (xMajor && Math.round(y / major) * major === y) continue;
              g.moveTo(x + r, y);
              g.arc(x, y, r, 0, Math.PI * 2);
            }
          }
          g.fill();

          g.fillStyle = tokens.dotMajor;
          g.beginPath();
          for (let x = Math.floor(vr.x / major) * major; x <= right; x += major) {
            for (let y = Math.floor(vr.y / major) * major; y <= bottom; y += major) {
              g.moveTo(x + rMajor, y);
              g.arc(x, y, rMajor, 0, Math.PI * 2);
            }
          }
          g.fill();
        } else {
          g.lineWidth = 1 / zoom;
          for (let x = x0; x <= right; x += step) {
            g.strokeStyle = Math.round(x / major) * major === x ? tokens.gridMajor : tokens.grid;
            g.beginPath(); g.moveTo(x, vr.y); g.lineTo(x, bottom); g.stroke();
          }
          for (let y = y0; y <= bottom; y += step) {
            g.strokeStyle = Math.round(y / major) * major === y ? tokens.gridMajor : tokens.grid;
            g.beginPath(); g.moveTo(vr.x, y); g.lineTo(right, y); g.stroke();
          }
        }
      }

      // ── paper (covers the grid beneath it) ─────────────────────────────────
      if (paper) {
        if (!exporting) {
          g.save();
          g.shadowColor = "rgba(0,0,0,0.35)";
          g.shadowBlur = 24 / zoom;
          g.shadowOffsetY = 6 / zoom;
        }
        g.fillStyle = sheet!.background;
        g.fillRect(0, 0, paper.w, paper.h);
        if (!exporting) g.restore();
      }

      if (paper) {
        if (!clean) {
          // margin guides
          if (sheet!.showMargin && sheet!.margin > 0) {
            g.save();
            g.strokeStyle = tokens.guide;
            g.globalAlpha = 0.5;
            g.setLineDash([6 / zoom, 5 / zoom]);
            g.lineWidth = 1 / zoom;
            g.strokeRect(sheet!.margin, sheet!.margin,
              Math.max(0, paper.w - sheet!.margin * 2), Math.max(0, paper.h - sheet!.margin * 2));
            g.restore();
          }
          // paper border
          g.strokeStyle = "rgba(0,0,0,0.28)";
          g.lineWidth = 1 / zoom;
          g.strokeRect(0, 0, paper.w, paper.h);
        }
      } else if (!clean) {
        g.strokeStyle = tokens.axisX;
        g.lineWidth = 1.5 / zoom;
        g.beginPath(); g.moveTo(0, vr.y); g.lineTo(0, vr.y + vr.h); g.stroke();
        g.beginPath(); g.moveTo(vr.x, 0); g.lineTo(vr.x + vr.w, 0); g.stroke();
      }
    },
    [viewRect, gridShow, gridSize, gridStyle, zoom, tokens, sheet, presenting],
  );

  const boardHit = useCallback((ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath();
    ctx.rect(-500000, -500000, 1000000, 1000000);
    ctx.fillStrokeShape(shape);
  }, []);

  const cursor = spaceHeld
    ? (panRef.current ? "grabbing" : "grab")
    : CURSORS[tool] ?? (CREATION_TOOLS.has(tool) ? "crosshair" : "default");

  return (
    <div
      ref={containerRef}
      className="app-canvas"
      style={{ cursor, touchAction: "none" }}
      onDragOver={(e) => { e.preventDefault(); setDragHint(true); }}
      onDragLeave={() => setDragHint(false)}
      onDrop={onDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        useStore.getState().setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={camera.x}
        y={camera.y}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={(e) => {
          if (e.evt.button === 1) e.evt.preventDefault();
          beginPointer({ button: e.evt.button, shift: e.evt.shiftKey, alt: e.evt.altKey });
        }}
        onMouseMove={(e) => movePointer(e.evt.shiftKey)}
        onMouseUp={endPointer}
        onTouchStart={(e) => {
          e.evt.preventDefault();
          beginPointer({ button: 0, shift: false, alt: false });
        }}
        onTouchMove={(e) => { e.evt.preventDefault(); movePointer(false); }}
        onTouchEnd={endPointer}
        onWheel={onWheel}
      >
        <Layer listening={false}>
          <Shape sceneFunc={bgScene} listening={false} perfectDrawEnabled={false} />
        </Layer>

        <Layer ref={objLayerRef}>
          <Shape name="board" sceneFunc={() => {}} hitFunc={boardHit} />
          {renderedObjects.map((o) => (
            <ObjectNode
              key={o.id}
              obj={o}
              draggable={tool === "select" && !presenting}
              editing={editingId === o.id}
              {...nodeEvents}
            />
          ))}
        </Layer>

        <Layer>
          {draft && (
            <ObjectNode obj={draft} draggable={false} editing={false} preview {...nodeEvents} />
          )}
          <Transformer
            ref={trRef}
            rotateEnabled
            resizeEnabled={trResize}
            enabledAnchors={trAnchors}
            anchorCornerRadius={2}
            anchorSize={7}
            anchorStroke="#0078d4"
            anchorFill="#ffffff"
            borderStroke="#0078d4"
            borderStrokeWidth={1.2}
            rotateAnchorOffset={18}
            ignoreStroke
            flipEnabled={false}
            boundBoxFunc={(oldBox, newBox) => {
              if (trResize && (newBox.width < 6 || newBox.height < 6)) return oldBox;
              return newBox;
            }}
          />
          {marquee && (
            <Rect
              x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
              fill={tokens.marquee} stroke={tokens.marqueeStroke}
              strokeWidth={1 / zoom} listening={false}
            />
          )}
          {guides?.map((g, i) =>
            g.axis === "y" ? (
              <Line key={i} points={[g.pos, g.start, g.pos, g.end]}
                stroke={tokens.guide} strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} listening={false} />
            ) : (
              <Line key={i} points={[g.start, g.pos, g.end, g.pos]}
                stroke={tokens.guide} strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} listening={false} />
            ),
          )}
        </Layer>
      </Stage>

      {editingObj && (
        <CanvasTextEditor
          key={editingObj.id}
          obj={editingObj}
          cameraX={camera.x}
          cameraY={camera.y}
          zoom={zoom}
        />
      )}

      {!presenting && <CanvasScrollbars page={page} camera={camera} size={size} />}

      {dragHint && <div className="drop-hint">Drop images or .sadas files to open</div>}
    </div>
  );
}

// ── Inline text editing overlay ──────────────────────────────────────────────

function CanvasTextEditor({ obj, cameraX, cameraY, zoom }: {
  obj: CanvasObject; cameraX: number; cameraY: number; zoom: number;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const origText = useRef(obj.text);
  const valueRef = useRef(obj.text);
  // A box drawn with the text tool keeps the height it was drawn at; typing
  // past that point grows it, so the drawn size is never silently lost.
  const floorHeight = useRef(obj.height);
  const closed = useRef(false);
  const readyForBlur = useRef(false);
  const blurTimer = useRef<number | null>(null);
  const [value, setValue] = useState(obj.text);
  const spellcheck = useStore((s) => s.spellcheck);

  const pad = obj.type === "sticky" ? STICKY_PAD : obj.type === "text" ? TEXT_PAD : SHAPE_PAD;
  const fontPx = obj.fontSize * zoom;

  const close = useCallback((commit: boolean) => {
    if (closed.current) return;
    closed.current = true;
    const st = useStore.getState();
    if (!commit) {
      st.updateObjects([obj.id], { text: origText.current }, "Edit text", "textedit:" + obj.id);
    }
    const finalText = valueRef.current;
    if (commit && obj.type === "text" && finalText.trim() === "") {
      st.removeObjects([obj.id], "Delete empty text");
    }
    st.setEditing(null);
  }, [obj.id, obj.type]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    autoGrow(el);
    const frame = requestAnimationFrame(() => {
      if (!areaRef.current) return;
      areaRef.current.focus({ preventScroll: true });
      // A newly-created object is empty; an existing object keeps the caret at
      // the end so a double-click never destroys its content.
      areaRef.current.setSelectionRange(valueRef.current.length, valueRef.current.length);
      readyForBlur.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // Register outside-click handling on the next frame. Without this delay,
    // some WebView/browser event schedules can treat the creation click as an
    // outside click and close the editor before the first character is typed.
    let listening = false;
    const onDown = (e: MouseEvent) => {
      if (areaRef.current && !areaRef.current.contains(e.target as Node)) close(true);
    };
    const frame = requestAnimationFrame(() => {
      listening = true;
      window.addEventListener("mousedown", onDown, true);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (listening) window.removeEventListener("mousedown", onDown, true);
      if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
    };
  }, [close]);

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const px = Math.max(el.scrollHeight, fontPx * obj.lineHeight + 6);
    el.style.height = px + "px";
    return px;
  };

  const style: React.CSSProperties = {
    left: cameraX + (obj.x + pad) * zoom,
    top: cameraY + (obj.y + pad) * zoom,
    width: Math.max(40, (obj.width - pad * 2) * zoom),
    fontSize: fontPx,
    fontFamily: `${obj.fontFamily}, "Segoe UI", "Nirmala UI", "Gautami", "Roboto", "Helvetica Neue", "Arial", sans-serif`,
    fontStyle: obj.italic ? "italic" : "normal",
    fontWeight: obj.bold ? 700 : 400,
    textDecoration: decorationOf(obj),
    textAlign: obj.align,
    lineHeight: obj.lineHeight,
    letterSpacing: obj.letterSpacing * zoom,
    color: obj.color,
    caretColor: obj.color,
    transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
    minHeight: Math.max(0, (obj.height - pad * 2) * zoom),
  };

  return (
    <textarea
      ref={areaRef}
      className="canvas-text-editor"
      style={style}
      value={value}
      placeholder="Type here..."
      spellCheck={spellcheck}
      onChange={(e) => {
        const next = e.currentTarget.value;
        valueRef.current = next;
        setValue(next);
        const screenHeight = autoGrow(e.currentTarget);
        const patch: Partial<CanvasObject> = { text: next };
        if (obj.type === "text") {
          patch.height = Math.max(
            obj.fontSize * obj.lineHeight,
            floorHeight.current,
            screenHeight / zoom,
          );
        }
        useStore.getState().updateObjects([obj.id], patch, "Edit text", "textedit:" + obj.id);
      }}
      onBlur={() => {
        // WebView2 may emit a transient blur while mounting/focusing an
        // absolutely-positioned textarea over a canvas. Confirm focus on the
        // next task instead of destroying the object synchronously.
        if (!readyForBlur.current) return;
        if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
        blurTimer.current = window.setTimeout(() => {
          if (document.activeElement !== areaRef.current) close(true);
        }, 0);
      }}
      onFocus={() => {
        if (blurTimer.current != null) {
          window.clearTimeout(blurTimer.current);
          blurTimer.current = null;
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); close(true); }
        if (
          e.key === "Enter" &&
          (e.ctrlKey || e.metaKey) &&
          !(e.nativeEvent as KeyboardEvent).isComposing
        ) {
          e.preventDefault();
          close(true);
        }
      }}
    />
  );
}
