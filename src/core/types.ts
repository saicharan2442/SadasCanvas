// ─────────────────────────────────────────────────────────────────────────────
// Sadas Canvas core model types. Plain JSON-serialisable data only — no
// classes, no database, no network. Documents persist as JSON (.sadas) files.
// ─────────────────────────────────────────────────────────────────────────────

export type ID = string;

export interface Camera {
  x: number;      // stage translation, px (screen space)
  y: number;
  zoom: number;   // 0.25 – 4
}

export type Tool =
  | "select" | "pan" | "text" | "eyedropper"
  | "rect" | "roundrect" | "ellipse" | "triangle" | "star"
  | "line" | "arrow"
  | "pen" | "pencil" | "highlighter"
  | "sticky" | "eraser";

export type ObjectType =
  | "text" | "rect" | "ellipse" | "triangle" | "star"
  | "line" | "arrow" | "ink" | "image" | "sticky" | "link";

export type FillMode = "none" | "solid" | "gradient";
export type TextAlign = "left" | "center" | "right";
export type InkTool = "pen" | "pencil" | "highlighter";
export type ArrowHeads = "end" | "both" | "none";

/**
 * A single canvas object. One flat interface (discriminated by `type`) keeps
 * serialisation, command patches and the properties panel simple. Geometry is
 * stored unscaled — width/height are the source of truth, Konva node scale is
 * baked back into these values after every transform.
 */
export interface CanvasObject {
  id: ID;
  type: ObjectType;
  name: string;

  // geometry
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  opacity: number;  // 0–1
  flipX: boolean;
  flipY: boolean;

  // state
  visible: boolean;
  locked: boolean;
  groupId: ID | null;

  // stroke & fill (shapes / sticky / image frame)
  fillMode: FillMode;
  fill: string;    // solid colour or gradient start
  fill2: string;   // gradient end
  fillAngle: number; // degrees
  stroke: string;
  strokeWidth: number; // 0 = no stroke
  cornerRadius: number;

  // shadow
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;

  // text (text / sticky / label inside shapes)
  text: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  align: TextAlign;
  color: string;
  lineHeight: number;    // multiplier
  letterSpacing: number; // px

  // point-based geometry (line / arrow / ink) — relative to x,y
  points?: number[];
  inkTool?: InkTool;
  arrowHeads?: ArrowHeads;

  // image
  src?: string;          // data URL (asset embedded in document)
  naturalW?: number;
  naturalH?: number;
  keepAspect?: boolean;

  // ── Photoshop-style adjustments (GPU-free, Konva filters) ────────────────
  brightness?: number;   // -1..1
  contrast?: number;     // -100..100
  saturation?: number;   // -2..6   (HSL)
  hue?: number;          // 0..359  (HSL rotate)
  blur?: number;         // 0..60 px
  pixelate?: number;     // 0 = off, else block size
  noise?: number;        // 0..1 grain
  sharpen?: number;      // -1..1 (Konva "enhance")
  grayscale?: boolean;
  sepia?: boolean;
  invert?: boolean;

  /** Crop window, normalised 0..1 of the source image. */
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;

  /** Canvas composite / blend mode (applies to any object). */
  blendMode?: BlendMode;

  /** Hyperlink attached to any object (Ctrl+K); link cards also use this. */
  link?: string;
  /** Optional caption shown under the title on a link card. */
  linkNote?: string;

  /** Animation settings. */
  animation?: AnimationSettings;
}

/**
 * Only http(s) and mailto links are allowed. Anything else — notably
 * javascript:, data: and file: — is rejected, so imported or pasted content
 * can never smuggle in executable URLs.
 */
export function sanitizeUrl(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  // Bare domains are treated as https.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : "https://" + value;
  let url: URL;
  try { url = new URL(candidate); } catch { return null; }
  const scheme = url.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:" && scheme !== "mailto:") return null;
  if (scheme !== "mailto:" && !url.hostname) return null;
  return url.href;
}

/** Short, human-friendly form of a URL for display on a card. */
export function prettyUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol === "mailto:") return u.pathname;
    return (u.hostname + (u.pathname === "/" ? "" : u.pathname)).replace(/^www\./, "");
  } catch { return raw; }
}

export type BlendMode =
  | "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
  | "color-dodge" | "color-burn" | "hard-light" | "soft-light"
  | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity";

export const BLEND_MODES: BlendMode[] = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
];

export type AnimationType =
  | "none"
  // Text specific (mostly)
  | "typewriter" | "ascend" | "shift" | "merge" | "block" | "burst" | "bounce" | "roll" | "skate" | "spread" | "clarify"
  // General
  | "rise" | "pan" | "fade" | "pop" | "wipe" | "blur" | "succession" | "breathe" | "baseline" | "drift" | "tectonic" | "tumble" | "neon" | "scrapbook" | "stomp";

export interface AnimationSettings {
  type: AnimationType;
  duration: number; // seconds
  delay: number;    // seconds
  direction: "enter" | "exit" | "both";
}

/** Crop aspect presets offered in the properties panel. */
export const CROP_ASPECTS: { label: string; ratio: number | null }[] = [
  { label: "Free", ratio: null },
  { label: "1:1", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
];

/** True when any pixel adjustment is active (so we only cache when needed). */
export function hasAdjustments(o: CanvasObject): boolean {
  return !!(
    (o.brightness ?? 0) !== 0 || (o.contrast ?? 0) !== 0 ||
    (o.saturation ?? 0) !== 0 || (o.hue ?? 0) !== 0 ||
    (o.blur ?? 0) > 0 || (o.pixelate ?? 0) > 1 ||
    (o.noise ?? 0) > 0 || (o.sharpen ?? 0) !== 0 ||
    o.grayscale || o.sepia || o.invert
  );
}

// ── Sheets (artboards / pages with a physical size, Canva-style) ────────────

export type SheetPreset =
  | "infinite" | "a3" | "a4" | "a5" | "letter" | "legal" | "square" | "slide" | "custom";

export interface SheetPresetDef { label: string; w: number; h: number; hint: string; }

/** Portrait base sizes in CSS px @96 DPI. */
export const SHEET_PRESETS: Record<Exclude<SheetPreset, "infinite" | "custom">, SheetPresetDef> = {
  a3:     { label: "A3",        w: 1123, h: 1587, hint: "297 × 420 mm" },
  a4:     { label: "A4",        w: 794,  h: 1123, hint: "210 × 297 mm" },
  a5:     { label: "A5",        w: 559,  h: 794,  hint: "148 × 210 mm" },
  letter: { label: "Letter",    w: 816,  h: 1056, hint: "8.5 × 11 in" },
  legal:  { label: "Legal",     w: 816,  h: 1344, hint: "8.5 × 14 in" },
  square: { label: "Square",    w: 1000, h: 1000, hint: "1000 × 1000 px" },
  slide:  { label: "Slide 16:9", w: 1280, h: 720, hint: "1280 × 720 px" },
};

export interface Sheet {
  preset: SheetPreset;
  /** Base (portrait) size; orientation swaps the axes. */
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  margin: number;
  showMargin: boolean;
  background: string;
}

/** Actual on-canvas size of a sheet, honouring orientation. */
export function sheetSize(s: Sheet): { w: number; h: number } {
  const portrait = s.orientation === "portrait";
  const w = portrait ? Math.min(s.width, s.height) : Math.max(s.width, s.height);
  const h = portrait ? Math.max(s.width, s.height) : Math.min(s.width, s.height);
  // squares and custom sizes keep their literal values
  if (s.width === s.height || s.preset === "custom") {
    return s.orientation === "landscape" && s.preset === "custom"
      ? { w: s.height, h: s.width }
      : { w: s.width, h: s.height };
  }
  return { w, h };
}

export const isInfinite = (s?: Sheet) => !s || s.preset === "infinite";

export interface Page {
  id: ID;
  name: string;
  background: string;
  sheet: Sheet;
  objects: CanvasObject[];
}

export interface CanvasDocument {
  id: ID;
  name: string;
  pages: Page[];
  pageId: ID;
  camera: Camera;
  createdAt: number;
}

/** Serialised .sadas container (JSON form). */
export interface DocumentFile {
  app: "sadas-canvas";
  version: 1;
  savedAt: number;
  doc: CanvasDocument;
}

export interface Bounds { x: number; y: number; w: number; h: number; }

// Zoom limits. ZOOM_MIN must be small enough to fit a 50 ft × 50 ft sheet
// (≈57600 px) in a 1920 px viewport: 1920/57600 ≈ 0.033.
export const ZOOM_MIN = 0.01;
export const ZOOM_MAX = 10;

export const GRID_SIZES = [5, 10, 20, 50];

/** Canvas background pattern. Dots are the default, Figma/Canva style. */
export type GridStyle = "dots" | "lines";

// ── Unit system ──────────────────────────────────────────────────────────────
// All sizes are stored internally as CSS pixels at 96 DPI.
// Conversions happen only in the UI layer.

export type SizeUnit = "px" | "cm" | "mm" | "in" | "ft" | "pt" | "pc";

export interface UnitDef {
  label: string;
  short: string;
  toPixels: number;    // 1 unit = N px  (at 96 DPI)
  precision: number;   // decimal places to show
  max: number;         // max value in this unit that maps to a reasonable canvas
  min: number;
}

export const UNIT_DEFS: Record<SizeUnit, UnitDef> = {
  px: { label: "Pixels",      short: "px", toPixels: 1,           precision: 0, max: 100000, min: 1    },
  cm: { label: "Centimetres", short: "cm", toPixels: 96 / 2.54,   precision: 2, max: 1600,   min: 0.1  },
  mm: { label: "Millimetres", short: "mm", toPixels: 96 / 25.4,   precision: 1, max: 16000,  min: 1    },
  in: { label: "Inches",      short: "in", toPixels: 96,           precision: 3, max: 630,    min: 0.01 },
  ft: { label: "Feet",        short: "ft", toPixels: 96 * 12,      precision: 3, max: 50,     min: 0.01 },
  pt: { label: "Points",      short: "pt", toPixels: 96 / 72,      precision: 1, max: 50000,  min: 1    },
  pc: { label: "Picas",       short: "pc", toPixels: 96 / 6,       precision: 2, max: 4200,   min: 0.1  },
};

/** Convert a value in `unit` to px (internally). */
export const unitToPx = (value: number, unit: SizeUnit): number =>
  Math.round(value * UNIT_DEFS[unit].toPixels * 100) / 100;

/** Convert a px value to the given `unit` for display. */
export const pxToUnit = (px: number, unit: SizeUnit): number => {
  const raw = px / UNIT_DEFS[unit].toPixels;
  return Math.round(raw * Math.pow(10, UNIT_DEFS[unit].precision)) / Math.pow(10, UNIT_DEFS[unit].precision);
};

/** Point-based node types have their geometry in `points`, not w/h anchors. */
export const isPointBased = (o: CanvasObject) =>
  o.type === "line" || o.type === "arrow" || o.type === "ink";

/** Types that carry editable label text. */
export const hasText = (o: CanvasObject) =>
  o.type === "text" || o.type === "sticky" || o.type === "link" ||
  o.type === "rect" || o.type === "ellipse" || o.type === "triangle" || o.type === "star";
