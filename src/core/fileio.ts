// ─────────────────────────────────────────────────────────────────────────────
// File I/O. Fully offline: documents are (de)serialised as JSON .sadas
// files via download/upload, session + backups live in localStorage, and image
// export renders through the Konva stage. No network calls anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import type Konva from "konva";
import { sanitizeUrl } from "./types";
import type { CanvasDocument, DocumentFile, Sheet, SheetPreset } from "./types";
import { uid, DEFAULT_SHEET, repairLegacyTextContrast } from "./factory";

/** Set by CanvasStage so export actions can reach the live Konva stage. */
export const stageBus: { stage: Konva.Stage | null } = { stage: null };

// ── Serialisation ────────────────────────────────────────────────────────────

export function serializeDocument(doc: CanvasDocument): string {
  const file: DocumentFile = { app: "sadas-canvas", version: 1, savedAt: Date.now(), doc };
  return JSON.stringify(file, null, 2);
}

/** Lenient field coercion so minor corruption never loses the whole file. */
export function deserializeDocument(text: string): CanvasDocument {
  const parsed = JSON.parse(text);
  // Accept the current format and documents written by earlier CanvasPad builds.
  const known = parsed?.app === "sadas-canvas" || parsed?.app === "canvaspad";
  const raw = known ? parsed.doc : parsed?.doc ?? parsed;
  if (!raw || !Array.isArray(raw.pages) || raw.pages.length === 0) {
    throw new Error("Not a Sadas Canvas document (no pages found).");
  }
  const doc: CanvasDocument = {
    id: typeof raw.id === "string" ? raw.id : uid(),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Recovered",
    pageId: "",
    camera: {
      x: num(raw.camera?.x, 0), y: num(raw.camera?.y, 0),
      zoom: clampNum(num(raw.camera?.zoom, 1), 0.25, 4),
    },
    createdAt: num(raw.createdAt, Date.now()),
    pages: raw.pages.map((p: any, i: number) => ({
      id: typeof p?.id === "string" ? p.id : uid(),
      name: typeof p?.name === "string" ? p.name : `Sheet ${i + 1}`,
      background: "default",
      sheet: coerceSheet(p?.sheet),
      objects: Array.isArray(p?.objects) ? p.objects.filter(isObjectLike).map(coerceObject) : [],
    })),
  };
  // drop invalid/empty pages
  doc.pages = doc.pages.length ? doc.pages : [];
  if (!doc.pages.length) throw new Error("Document contained no usable pages.");
  doc.pages = doc.pages.map(repairLegacyTextContrast);
  doc.pageId = doc.pages.some((p) => p.id === raw.pageId) ? raw.pageId : doc.pages[0].id;
  return doc;
}

/** Older documents (pre-sheets) load as infinite canvases. */
function coerceSheet(s: any): Sheet {
  if (!s || typeof s !== "object") {
    return { ...DEFAULT_SHEET, preset: "infinite" };
  }
  const presets: SheetPreset[] = ["infinite", "a3", "a4", "a5", "letter", "legal", "square", "slide", "custom"];
  return {
    preset: presets.includes(s.preset) ? s.preset : "custom",
    width: Math.max(16, num(s.width, DEFAULT_SHEET.width)),
    height: Math.max(16, num(s.height, DEFAULT_SHEET.height)),
    orientation: s.orientation === "landscape" ? "landscape" : "portrait",
    margin: Math.max(0, num(s.margin, 48)),
    showMargin: s.showMargin !== false,
    background: str(s.background, "#ffffff"),
  };
}

function isObjectLike(o: any): boolean {
  return o && typeof o === "object" && typeof o.id === "string" && typeof o.type === "string";
}

function coerceObject(o: any): any {
  return {
    x: num(o.x, 0), y: num(o.y, 0),
    width: num(o.width, 100), height: num(o.height, 100),
    rotation: num(o.rotation, 0), opacity: clampNum(num(o.opacity, 1), 0, 1),
    flipX: !!o.flipX, flipY: !!o.flipY,
    visible: o.visible !== false, locked: !!o.locked,
    groupId: typeof o.groupId === "string" ? o.groupId : null,
    fillMode: ["none", "solid", "gradient"].includes(o.fillMode) ? o.fillMode : "solid",
    fill: str(o.fill, "#4c8dff"), fill2: str(o.fill2, "#8a5cff"), fillAngle: num(o.fillAngle, 90),
    stroke: str(o.stroke, ""), strokeWidth: num(o.strokeWidth, 0), cornerRadius: num(o.cornerRadius, 0),
    shadow: !!o.shadow, shadowColor: str(o.shadowColor, "#00000066"),
    shadowBlur: num(o.shadowBlur, 12), shadowX: num(o.shadowX, 0), shadowY: num(o.shadowY, 4),
    text: str(o.text, ""), fontFamily: str(o.fontFamily, "Segoe UI"), fontSize: num(o.fontSize, 18),
    bold: !!o.bold, italic: !!o.italic, underline: !!o.underline, strike: !!o.strike,
    align: ["left", "center", "right"].includes(o.align) ? o.align : "left",
    color: str(o.color, "#111318"), lineHeight: num(o.lineHeight, 1.25), letterSpacing: num(o.letterSpacing, 0),
    points: Array.isArray(o.points) ? o.points.filter((n: any) => isFinite(Number(n))).map(Number) : undefined,
    inkTool: o.inkTool, arrowHeads: o.arrowHeads,
    src: typeof o.src === "string" && (o.src.startsWith("data:") || o.src.startsWith("blob:")) ? o.src : undefined,
    naturalW: o.naturalW, naturalH: o.naturalH,
    brightness: num(o.brightness, 0), contrast: num(o.contrast, 0),
    saturation: num(o.saturation, 0), hue: num(o.hue, 0),
    blur: Math.max(0, num(o.blur, 0)), pixelate: Math.max(0, num(o.pixelate, 0)),
    noise: Math.max(0, num(o.noise, 0)), sharpen: num(o.sharpen, 0),
    grayscale: !!o.grayscale, sepia: !!o.sepia, invert: !!o.invert,
    cropX: clampNum(num(o.cropX, 0), 0, 1), cropY: clampNum(num(o.cropY, 0), 0, 1),
    cropW: clampNum(num(o.cropW, 1), 0.01, 1), cropH: clampNum(num(o.cropH, 1), 0.01, 1),
    blendMode: typeof o.blendMode === "string" ? o.blendMode : "normal",
    // Re-sanitise on load: a hand-edited file can never inject javascript: URLs
    link: typeof o.link === "string" ? sanitizeUrl(o.link) ?? undefined : undefined,
    linkNote: typeof o.linkNote === "string" ? o.linkNote : undefined,
    keepAspect: o.keepAspect !== false,
    id: o.id, type: o.type, name: str(o.name, "Object"),
  };
}

const num = (v: any, d: number) => (isFinite(Number(v)) ? Number(v) : d);
const str = (v: any, d: string) => (typeof v === "string" ? v : d);
const clampNum = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// ── Save / open (local file system, entirely offline) ───────────────────────

export function downloadDocument(doc: CanvasDocument) {
  const blob = new Blob([serializeDocument(doc)], { type: "application/json" });
  triggerDownload(blob, safeFileName(doc.name) + DOC_EXT);
}

export function openDocumentFile(file: File): Promise<CanvasDocument> {
  return file.text().then(deserializeDocument);
}

/**
 * File System Access API support. When available (Edge/Chrome/WebView2) the
 * user picks a real location and later saves write straight back to that file
 * — exactly like a desktop app. Elsewhere we fall back to a download.
 */
export const canUseFilePicker = (): boolean =>
  typeof (window as any).showSaveFilePicker === "function";

/** Remembered file handles per document id, so plain Save needs no dialog. */
const handles = new Map<string, any>();

export const hasFileHandle = (docId: string) => handles.has(docId);
export const getHandleName = (docId: string): string | null =>
  handles.get(docId)?.name ?? null;
export const forgetHandle = (docId: string) => handles.delete(docId);

/** Native document extension; legacy CanvasPad files still open. */
export const DOC_EXT = ".sadas";
export const DOC_EXT_RE = /\.(sadas|canvaspad|json)$/i;

const PICKER_TYPES = [{
  description: "Sadas Canvas document",
  accept: { "application/json": [".sadas", ".canvaspad", ".json"] as string[] },
}];

export interface SaveResult {
  ok: boolean;
  cancelled?: boolean;
  fileName?: string;
  viaDownload?: boolean;
  error?: string;
}

async function writeHandle(handle: any, doc: CanvasDocument): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(new Blob([serializeDocument(doc)], { type: "application/json" }));
  await writable.close();
}

/** Save As — always asks where to put the file. */
export async function saveDocumentAs(doc: CanvasDocument): Promise<SaveResult> {
  if (!canUseFilePicker()) {
    downloadDocument(doc);
    return { ok: true, viaDownload: true, fileName: safeFileName(doc.name) + DOC_EXT };
  }
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: safeFileName(doc.name) + DOC_EXT,
      types: PICKER_TYPES,
    });
    await writeHandle(handle, doc);
    handles.set(doc.id, handle);
    return { ok: true, fileName: handle.name };
  } catch (err: any) {
    if (err?.name === "AbortError") return { ok: false, cancelled: true };
    return { ok: false, error: err?.message ?? "Could not save the file." };
  }
}

/** Save — writes to the known file, or asks for a location the first time. */
export async function saveDocument(doc: CanvasDocument): Promise<SaveResult> {
  const handle = handles.get(doc.id);
  if (!handle) return saveDocumentAs(doc);
  try {
    // Re-check permission: it can lapse between sessions.
    if (handle.queryPermission) {
      let perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm === "prompt" && handle.requestPermission) {
        perm = await handle.requestPermission({ mode: "readwrite" });
      }
      if (perm !== "granted") return saveDocumentAs(doc);
    }
    await writeHandle(handle, doc);
    return { ok: true, fileName: handle.name };
  } catch (err: any) {
    if (err?.name === "AbortError") return { ok: false, cancelled: true };
    // File moved/deleted — fall back to asking again.
    return saveDocumentAs(doc);
  }
}

/** Open through the native picker, remembering the handle for later saves. */
export async function openWithPicker(): Promise<
  { ok: true; doc: CanvasDocument; fileName: string } | { ok: false; cancelled?: boolean; error?: string }
> {
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: PICKER_TYPES, multiple: false,
    });
    const file = await handle.getFile();
    const doc = await deserializeDocument(await file.text());
    doc.name = file.name.replace(DOC_EXT_RE, "");
    handles.set(doc.id, handle);
    return { ok: true, doc, fileName: file.name };
  } catch (err: any) {
    if (err?.name === "AbortError") return { ok: false, cancelled: true };
    return { ok: false, error: err?.message ?? "Could not open the file." };
  }
}

// ── Image export ─────────────────────────────────────────────────────────────

export function getStageDataUrl(
  format: "png" | "jpg",
  sheet?: { w: number; h: number } | null,
): string {
  const stage = stageBus.stage;
  if (!stage) throw new Error("Canvas not ready.");

  const bg = stage.getLayers()[0];
  stage.setAttr("cpExport", true);
  bg?.draw();
  try {
    if (sheet && sheet.w > 0 && sheet.h > 0) {
      const scale = stage.scaleX() || 1;
      return stage.toDataURL({
        x: stage.x(), y: stage.y(),
        width: sheet.w * scale, height: sheet.h * scale,
        pixelRatio: 2 / scale,
        mimeType: format === "jpg" ? "image/jpeg" : "image/png",
      });
    }
    return getExportContentAreaDataUrl(stage, format);
  } finally {
    stage.setAttr("cpExport", false);
    bg?.draw();
  }
}

export function exportImage(
  format: "png" | "jpg",
  docName: string,
  sheet?: { w: number; h: number } | null,
) {
  const dataUrl = getStageDataUrl(format, sheet);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = safeFileName(docName) + "." + format;
  a.click();
}

function getExportContentAreaDataUrl(stage: Konva.Stage, format: "png" | "jpg"): string {
  const layer = stage.getLayers()[1];
  // union of all object client rects, excluding the invisible hit board
  let rect: { x: number; y: number; width: number; height: number } | null = null;
  for (const node of layer?.getChildren() ?? []) {
    if (node.name?.() === "board") continue;
    const r = node.getClientRect();
    if (r.width < 0.01 || r.height < 0.01) continue;
    rect = rect
      ? {
          x: Math.min(rect.x, r.x), y: Math.min(rect.y, r.y),
          width: Math.max(rect.x + rect.width, r.x + r.width) - Math.min(rect.x, r.x),
          height: Math.max(rect.y + rect.height, r.y + r.height) - Math.min(rect.y, r.y),
        }
      : { ...r };
  }
  if (!rect) {
    rect = { x: 0, y: 0, width: stage.width(), height: stage.height() };
  }
  const pad = 24;
  return stage.toDataURL({
    x: rect.x - pad, y: rect.y - pad,
    width: rect.width + pad * 2, height: rect.height + pad * 2,
    pixelRatio: 2,
    mimeType: format === "jpg" ? "image/jpeg" : "image/png",
  });
}

function exportContentArea(stage: Konva.Stage, format: "png" | "jpg", docName: string) {
  const dataUrl = getExportContentAreaDataUrl(stage, format);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = safeFileName(docName) + "." + format;
  a.click();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function safeFileName(name: string) {
  return (name || "Untitled").replace(/[\\/:*?"<>|]/g, "_").trim() || "Untitled";
}

// ── SVG import sanitisation (security: strip scripts & event handlers) ──────

export function sanitizeSvg(svgText: string): string {
  let out = svgText;
  out = out.replace(/<\s*script[\s\S]*?(<\s*\/\s*script\s*>|$)/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/(href|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2');
  out = out.replace(/<\s*(foreignObject|iframe|object|embed)[\s\S]*?(<\s*\/\s*(foreignObject|iframe|object|embed)\s*>|\/>|$)/gi, "");
  return out;
}

// ── Session persistence + rotating backups (localStorage) ───────────────────

export interface SessionData { savedAt: number; activeDocId: string; docs: CanvasDocument[]; }

export function persistSession(docs: CanvasDocument[], activeDocId: string) {
  try {
    const data: SessionData = { savedAt: Date.now(), activeDocId, docs };
    localStorage.setItem("cp:session", JSON.stringify(data));
  } catch { /* storage full — skip silently, stay offline-safe */ }
}

export function clearSession() {
  try { localStorage.removeItem("cp:session"); } catch {}
}

/** Rotating backup slots per document — keeps the last 3 (like .bak files). */
export function pushBackup(doc: CanvasDocument) {
  try {
    const key = `cp:backup:${doc.id}`;
    const prev: { ts: number; json: string }[] = JSON.parse(localStorage.getItem(key) || "[]");
    const json = serializeDocument(doc);
    prev.push({ ts: Date.now(), json });
    while (prev.length > 3) prev.shift();
    localStorage.setItem(key, JSON.stringify(prev));
  } catch {}
}

export function readBackups(docId: string): { ts: number; json: string }[] {
  try { return JSON.parse(localStorage.getItem(`cp:backup:${docId}`) || "[]"); } catch { return []; }
}

/** Crash-recovery flag: set on boot, cleared on clean unload. */
export function markBoot(): boolean {
  try {
    const crashed = localStorage.getItem("cp:alive") === "1";
    localStorage.setItem("cp:alive", "1");
    return crashed;
  } catch { return false; }
}
export function markCleanExit() {
  try { localStorage.setItem("cp:alive", "0"); } catch {}
}
