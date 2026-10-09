// ─────────────────────────────────────────────────────────────────────────────
// Object / page / document factories with sensible, theme-aware defaults.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CanvasDocument, CanvasObject, ID, ObjectType, Page, Sheet,
} from "./types";
import { SHEET_PRESETS, isInfinite } from "./types";

/** New documents start on an A4 portrait sheet (switchable to infinite canvas). */
export const DEFAULT_SHEET: Sheet = {
  preset: "a4",
  width: SHEET_PRESETS.a4.w,
  height: SHEET_PRESETS.a4.h,
  orientation: "portrait",
  margin: 48,
  showMargin: true,
  background: "#ffffff",
};

export const uid = (): ID =>
  (crypto as any).randomUUID
    ? crypto.randomUUID()
    : "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const ACCENT = "#4c8dff";

export const STICKY_COLORS = ["#ffd966", "#ff9d9d", "#9dffb0", "#9dc9ff", "#e2a9ff", "#ffc9a3"];

export const FONT_FAMILIES = [
  "Segoe UI", "Arial", "Calibri", "Cambria", "Georgia", "Times New Roman",
  "Courier New", "Consolas", "Verdana", "Trebuchet MS", "Comic Sans MS",
];

/**
 * Returns whether a CSS hex colour is visually dark. Object defaults must use
 * the canvas/sheet colour, not the UI theme: a dark toolbar can still contain
 * a white A4 sheet.
 */
export function isDarkColor(color: string, fallback = false): boolean {
  const value = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  const full = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value);
  let hex: string | null = null;
  if (short) hex = short[1].split("").map((c) => c + c).join("");
  else if (full) hex = full[1];
  if (!hex) return fallback;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Perceptual luminance; 150 keeps mid-tone sheets on the safer white side.
  return r * 0.299 + g * 0.587 + b * 0.114 < 150;
}

/**
 * The first sheet implementation accidentally used dark-UI foregrounds on
 * white paper. Repair only that exact old default, leaving intentional custom
 * colours untouched.
 */
export function repairLegacyTextContrast(page: Page): Page {
  if (isInfinite(page.sheet) || isDarkColor(page.sheet.background)) return page;
  let changed = false;
  const objects = page.objects.map((o) => {
    if (o.type === "text" && o.color.toLowerCase() === "#e8eaee") {
      changed = true;
      return { ...o, color: "#14171c" };
    }
    return o;
  });
  return changed ? { ...page, objects } : page;
}

const TYPE_NAMES: Record<ObjectType, string> = {
  text: "Text", rect: "Rectangle", ellipse: "Ellipse", triangle: "Triangle",
  star: "Star", line: "Line", arrow: "Arrow", ink: "Stroke",
  image: "Image", sticky: "Sticky note", link: "Link",
};

let counters: Record<string, number> = {};
function nextName(type: ObjectType): string {
  counters[type] = (counters[type] ?? 0) + 1;
  return `${TYPE_NAMES[type]} ${counters[type]}`;
}

/** Base defaults every object carries. */
function base(type: ObjectType, x: number, y: number): CanvasObject {
  return {
    id: uid(),
    type,
    name: nextName(type),
    x, y,
    width: 100, height: 100,
    rotation: 0, opacity: 1,
    flipX: false, flipY: false,
    visible: true, locked: false, groupId: null,
    fillMode: "solid", fill: ACCENT, fill2: "#8a5cff", fillAngle: 90,
    stroke: "", strokeWidth: 0, cornerRadius: 0,
    shadow: false, shadowColor: "#00000066", shadowBlur: 12, shadowX: 0, shadowY: 4,
    text: "", fontFamily: "Segoe UI", fontSize: 18,
    bold: false, italic: false, underline: false, strike: false,
    align: "left", color: "#111318", lineHeight: 1.25, letterSpacing: 0,
  };
}

export interface MakeOpts {
  width?: number; height?: number;
  text?: string;
  dark?: boolean; // theme at creation time (default label color etc.)
  points?: number[];
  src?: string; naturalW?: number; naturalH?: number;
  inkTool?: "pen" | "pencil" | "highlighter";
  /** Explicit stroke overrides (ink/line/arrow tool settings). */
  stroke?: string; strokeWidth?: number; opacity?: number;
  /** Hyperlink (link cards and Ctrl+K on any object). */
  link?: string; linkNote?: string;
}

export function makeObject(type: ObjectType, x: number, y: number, opts: MakeOpts = {}): CanvasObject {
  const o = base(type, x, y);
  if (opts.width != null) o.width = Math.max(1, opts.width);
  if (opts.height != null) o.height = Math.max(1, opts.height);

  switch (type) {
    case "text":
      o.width = opts.width ?? 220;
      o.height = 32;
      o.fillMode = "none";
      o.color = opts.dark ? "#e8eaee" : "#14171c";
      o.fontSize = 20;
      o.text = opts.text ?? "Double-click to edit";
      break;
    case "sticky": {
      o.width = opts.width ?? 200;
      o.height = opts.height ?? 200;
      o.fill = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
      o.color = "#20232a";
      o.shadow = true;
      o.shadowBlur = 10; o.shadowY = 3;
      o.text = opts.text ?? "";
      break;
    }
    case "line":
    case "arrow":
      o.points = opts.points ?? [0, 0, opts.width ?? 140, 0];
      o.fillMode = "none";
      o.stroke = opts.dark ? "#dfe3ea" : "#23262d";
      o.strokeWidth = 2.5;
      o.arrowHeads = type === "arrow" ? "end" : "none";
      o.width = bboxOfPoints(o.points).w;
      o.height = bboxOfPoints(o.points).h;
      break;
    case "ink":
      o.inkTool = opts.inkTool ?? "pen";
      o.points = opts.points ?? [0, 0];
      o.fillMode = "none";
      if (o.inkTool === "highlighter") {
        o.stroke = "#f7d154"; o.strokeWidth = 22; o.opacity = 0.45;
      } else if (o.inkTool === "pencil") {
        o.stroke = opts.dark ? "#c9ced8" : "#3a3f4a"; o.strokeWidth = 2;
      } else {
        o.stroke = opts.dark ? "#e8ebf2" : "#1c1f26"; o.strokeWidth = 3.5;
      }
      o.width = bboxOfPoints(o.points).w;
      o.height = bboxOfPoints(o.points).h;
      break;
    case "rect":
      o.cornerRadius = 0;
      break;
    case "link": {
      o.width = opts.width ?? 300;
      o.height = opts.height ?? 96;
      o.fill = opts.dark ? "#2a2d36" : "#ffffff";
      o.stroke = opts.dark ? "#3d414c" : "#d3d7e0";
      o.strokeWidth = 1;
      o.cornerRadius = 12;
      o.color = opts.dark ? "#eceef3" : "#1c1f27";
      o.fontSize = 15;
      o.bold = true;
      o.shadow = true;
      o.shadowBlur = 14;
      o.shadowY = 3;
      o.shadowColor = "#00000033";
      o.text = opts.text ?? "Link";
      break;
    }
    case "image":
      o.src = opts.src;
      o.naturalW = opts.naturalW; o.naturalH = opts.naturalH;
      o.fillMode = "none";
      o.keepAspect = true;
      o.brightness = 0; o.contrast = 0; o.saturation = 0; o.hue = 0;
      o.blur = 0; o.pixelate = 0; o.noise = 0; o.sharpen = 0;
      o.grayscale = false; o.sepia = false; o.invert = false;
      o.cropX = 0; o.cropY = 0; o.cropW = 1; o.cropH = 1;
      break;
  }
  if (opts.text != null) o.text = opts.text;
  if (opts.link != null) o.link = opts.link;
  if (opts.linkNote != null) o.linkNote = opts.linkNote;
  if (opts.stroke != null) o.stroke = opts.stroke;
  if (opts.strokeWidth != null) o.strokeWidth = opts.strokeWidth;
  if (opts.opacity != null) o.opacity = opts.opacity;
  return o;
}

export function bboxOfPoints(points: number[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const px = points[i], py = points[i + 1];
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Shift point-based objects so their bbox origin sits at (0,0). */
export function normalizePoints(points: number[]): { points: number[]; dx: number; dy: number } {
  const b = bboxOfPoints(points);
  return {
    points: points.map((v, i) => (i % 2 === 0 ? v - b.x : v - b.y)),
    dx: b.x, dy: b.y,
  };
}

export function makePage(name?: string, sheet?: Sheet): Page {
  return {
    id: uid(),
    name: name ?? `Sheet ${countersPage()}`,
    background: "default",
    sheet: sheet ? { ...sheet } : { ...DEFAULT_SHEET },
    objects: [],
  };
}
let pageCount = 0;
function countersPage() { return ++pageCount; }

export function makeDocument(name = "Untitled"): CanvasDocument {
  const page = makePage("Sheet 1");
  return {
    id: uid(),
    name,
    pages: [page],
    pageId: page.id,
    camera: { x: 0, y: 0, zoom: 1 },
    createdAt: Date.now(),
  };
}

export function cloneObject(o: CanvasObject, dx = 16, dy = 16): CanvasObject {
  return {
    ...o,
    id: uid(),
    x: o.x + dx, y: o.y + dy,
    groupId: null,
    points: o.points ? [...o.points] : undefined,
  };
}
