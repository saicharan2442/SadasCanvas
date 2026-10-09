// ─────────────────────────────────────────────────────────────────────────────
// Central action registry. Menus, keyboard shortcuts and the command palette
// all execute through these actions so behaviour stays consistent.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useStore, activeDoc, activePage, selectionBounds, contentBounds,
} from "../core/store";
import {
  openDocumentFile, exportImage, sanitizeSvg, pushBackup,
  saveDocument, saveDocumentAs, openWithPicker, canUseFilePicker, DOC_EXT_RE,
} from "../core/fileio";
import { makeObject, uid } from "../core/factory";
import { cmdObjects } from "../core/commands";
import {
  hasText, isInfinite, sheetSize, SHEET_PRESETS, ZOOM_MAX, ZOOM_MIN,
  type Bounds, type CanvasObject, type ID, type SheetPreset,
} from "../core/types";
import { measureViewport } from "../core/viewport";
import { clamp } from "../core/store";

export interface AppAction {
  id: string;
  label: string;
  category: "File" | "Edit" | "View" | "Insert" | "Sheet" | "Format" | "Object" | "Tools" | "Help";
  shortcut?: string; // display form, e.g. "Ctrl+Z"
  chord?: string;    // key combo, e.g. "ctrl+shift+g"
  enabled?: () => boolean;
  checked?: () => boolean;
  run: () => void;
}

const st = () => useStore.getState();
const sel = () => st().selection;
const curDoc = () => activeDoc(st());
const curPage = () => activePage(curDoc());
const hasSelection = () => sel().length > 0;
const multiSelection = () => sel().length > 1;

function selectedObjects(): CanvasObject[] {
  const p = curPage(); if (!p) return [];
  const set = new Set(sel());
  return p.objects.filter((o) => set.has(o.id));
}

function mutateSel(patch: Partial<CanvasObject> | ((o: CanvasObject) => Partial<CanvasObject>), label: string, mergeKey?: string) {
  const ids = sel(); if (!ids.length) return;
  st().updateObjects(ids, patch, label, mergeKey);
}

function reorderSelection(mode: "front" | "back" | "forward" | "backward") {
  const page = curPage(); const doc = curDoc(); if (!page || !doc) return;
  const ids = new Set(sel()); if (!ids.size) return;
  const objs = [...page.objects];
  const labels = { front: "Bring to front", back: "Send to back", forward: "Bring forward", backward: "Send backward" };
  let after: CanvasObject[];
  if (mode === "front" || mode === "back") {
    const picked = objs.filter((o) => ids.has(o.id));
    const rest = objs.filter((o) => !ids.has(o.id));
    after = mode === "front" ? [...rest, ...picked] : [...picked, ...rest];
  } else {
    after = [...objs];
    const n = after.length;
    if (mode === "forward") {
      for (let i = n - 2; i >= 0; i--) {
        if (ids.has(after[i].id) && !ids.has(after[i + 1].id)) {
          [after[i], after[i + 1]] = [after[i + 1], after[i]];
        }
      }
    } else {
      for (let i = 1; i < n; i++) {
        if (ids.has(after[i].id) && !ids.has(after[i - 1].id)) {
          [after[i], after[i - 1]] = [after[i - 1], after[i]];
        }
      }
    }
  }
  st().dispatch(cmdObjects(doc.id, page.id, page.objects, after, labels[mode]));
}

function alignSelection(mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom") {
  const page = curPage(); if (!page) return;
  const objs = selectedObjects(); if (objs.length < 2) return;
  const b = selectionBounds(page.objects, sel())!;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const label = "Align " + mode;
  st().updateObjects(sel(), (o) => {
    switch (mode) {
      case "left": return { x: b.x };
      case "right": return { x: b.x + b.w - o.width };
      case "centerX": return { x: cx - o.width / 2 };
      case "top": return { y: b.y };
      case "bottom": return { y: b.y + b.h - o.height };
      case "centerY": return { y: cy - o.height / 2 };
    }
  }, label);
}

function distributeSelection(axis: "h" | "v") {
  const page = curPage(); if (!page) return;
  const objs = selectedObjects(); if (objs.length < 3) return;
  const sorted = [...objs].sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const start = axis === "h" ? first.x : first.y;
  const end = axis === "h" ? last.x + last.width : last.y + last.height;
  const total = sorted.reduce((s, o) => s + (axis === "h" ? o.width : o.height), 0);
  const gap = (end - start - total) / (sorted.length - 1);
  let cursor = start;
  const pos = new Map<ID, number>();
  for (const o of sorted) { pos.set(o.id, cursor); cursor += (axis === "h" ? o.width : o.height) + gap; }
  st().updateObjects(sel(), (o) => axis === "h" ? { x: pos.get(o.id) } : { y: pos.get(o.id) },
    axis === "h" ? "Distribute horizontally" : "Distribute vertically");
}

function groupSelection() {
  const ids = sel(); if (ids.length < 2) return;
  const gid = uid();
  mutateSel({ groupId: gid }, "Group");
}

function ungroupSelection() {
  mutateSel({ groupId: null }, "Ungroup");
}

function nudgeSelection(dx: number, dy: number) {
  if (!hasSelection()) return;
  mutateSel((o) => ({ x: round2(o.x + dx), y: round2(o.y + dy) }), "Nudge", "nudge:" + sel().join(","));
}
const round2 = (v: number) => Math.round(v * 100) / 100;

// ── File helpers ─────────────────────────────────────────────────────────────

let openInput: HTMLInputElement | null = null;

/** Open: native picker when available, hidden <input> otherwise. */
async function triggerOpen() {
  if (canUseFilePicker() && typeof (window as any).showOpenFilePicker === "function") {
    const res = await openWithPicker();
    if (res.ok) {
      st().openDocument(res.doc);
      st().showToast(`Opened “${res.doc.name}”`);
    } else if (!res.cancelled && res.error) {
      st().showToast("Could not open file: " + res.error);
    }
    return;
  }
  triggerOpenInput();
}

function triggerOpenInput() {
  if (!openInput) {
    openInput = document.createElement("input");
    openInput.type = "file";
    openInput.accept = ".sadas,.canvaspad,.json,application/json";
    openInput.onchange = async () => {
      const file = openInput!.files?.[0];
      openInput!.value = "";
      if (!file) return;
      try {
        const doc = await openDocumentFile(file);
        doc.name = file.name.replace(DOC_EXT_RE, "");
        st().openDocument(doc);
        st().showToast(`Opened “${doc.name}”`);
      } catch (err: any) {
        st().showToast("Could not open file: " + (err?.message ?? "unknown error"));
      }
    };
  }
  openInput.click();
}

/**
 * Save / Save As. "Save As" always prompts for a location; "Save" reuses the
 * location chosen earlier and only prompts the first time. Where the File
 * System Access API is unavailable, both fall back to a normal download.
 */
async function saveActive(as = false) {
  const doc = curDoc(); if (!doc) return;
  pushBackup(doc); // rotating local backup before every write
  const res = as ? await saveDocumentAs(doc) : await saveDocument(doc);
  if (res.cancelled) { st().showToast("Save cancelled"); return; }
  if (!res.ok) { st().showToast(res.error ?? "Could not save the file."); return; }
  st().markSaved();
  st().showToast(
    res.viaDownload
      ? `Downloaded “${res.fileName}” to your Downloads folder`
      : `Saved to “${res.fileName}”`,
  );
}

// ── Image ingest (shared by Insert menu, drag-drop and paste) ────────────────

export async function addImageFromFile(file: File, at?: { x: number; y: number }) {
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (!file.type.startsWith("image/") && !isSvg) return false;
  let dataUrl: string;
  if (isSvg) {
    const clean = sanitizeSvg(await file.text());
    dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(clean)));
  } else {
    dataUrl = await fileToDataUrl(file);
  }
  const img = await loadImage(dataUrl);
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const { viewport } = st();
  const doc = curDoc();
  const cam = doc?.camera ?? { x: 0, y: 0, zoom: 1 };
  const cx = at?.x ?? (viewport.w / 2 - cam.x) / cam.zoom;
  const cy = at?.y ?? (viewport.h / 2 - cam.y) / cam.zoom;
  const obj = makeObject("image", cx - w / 2, cy - h / 2, {
    width: w, height: h, src: dataUrl, naturalW: img.naturalWidth, naturalH: img.naturalHeight,
  });
  st().addObjects([obj], "Insert image");
  return true;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let imageInput: HTMLInputElement | null = null;
function triggerImageInsert() {
  if (!imageInput) {
    imageInput = document.createElement("input");
    imageInput.type = "file";
    imageInput.accept = "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml,.svg";
    imageInput.onchange = () => {
      const f = imageInput!.files?.[0];
      imageInput!.value = "";
      if (f) void addImageFromFile(f);
    };
  }
  imageInput.click();
}

// ── Zoom helpers ─────────────────────────────────────────────────────────────

function zoomBy(factor: number) {
  const doc = curDoc(); if (!doc) return;
  const next = doc.camera.zoom * factor;
  // Ensure we can always reach usable zoom levels even from very small ones
  st().zoomAt(Math.max(ZOOM_MIN, next));
}

/**
 * Centre `box` (canvas coordinates) in the visible canvas area.
 *
 * `zoom: "fit"` scales the box to fill the viewport minus padding; a number
 * keeps that exact zoom and only recentres. Camera values are rounded to whole
 * device pixels so text and 1px strokes stay crisp.
 */
export function centerOn(
  box: Bounds,
  opts: { zoom?: number | "fit"; pad?: number } = {},
) {
  const { zoom: mode = "fit", pad = 56 } = opts;
  const presenting = st().presenting;
  const vp = measureViewport(st().viewport);

  // Overlay scrollbars sit on the right/bottom edges, so the centre of the
  // *visible* area is inset by a bar. They're hidden while presenting.
  const availW = presenting ? vp.w : vp.usableW;
  const availH = presenting ? vp.h : vp.usableH;

  const w = Math.max(1, box.w);
  const h = Math.max(1, box.h);
  const zoom = clamp(
    mode === "fit"
      ? Math.min((availW - pad) / w, (availH - pad) / h)
      : mode,
    ZOOM_MIN, ZOOM_MAX,
  );

  st().setCamera({
    zoom,
    x: Math.round(availW / 2 - (box.x + w / 2) * zoom),
    y: Math.round(availH / 2 - (box.y + h / 2) * zoom),
  });
}

/** Zoom so the whole sheet (or all content, on an infinite canvas) is visible. */
export function fitSheet() {
  const page = curPage();
  if (!page) return;
  if (isInfinite(page.sheet)) { fitToContent(false); return; }
  const { w, h } = sheetSize(page.sheet);
  // For very large sheets (e.g. 50 ft) use minimal padding so we don't waste
  // pixels on blank space.
  const pad = st().presenting ? 20 : Math.min(64, Math.max(8, Math.min(w, h) * 0.02));
  centerOn({ x: 0, y: 0, w, h }, { pad });
}

/** Recentre without changing zoom: sheet, or content on an infinite canvas. */
export function recenterView() {
  const page = curPage();
  const doc = curDoc();
  if (!page || !doc) return;
  const zoom = doc.camera.zoom;
  if (!isInfinite(page.sheet)) {
    const { w, h } = sheetSize(page.sheet);
    centerOn({ x: 0, y: 0, w, h }, { zoom });
    return;
  }
  const b = sel().length ? selectionBounds(page.objects, sel()) : contentBounds(page);
  centerOn(b ?? { x: 0, y: 0, w: 0, h: 0 }, { zoom });
}

/** Apply a size preset to the current sheet, then re-fit the view. */
export function applySheetPreset(preset: SheetPreset) {
  const doc = curDoc(); const page = curPage();
  if (!doc || !page) return;
  if (preset === "infinite") {
    st().setPageSheet(page.id, { preset: "infinite" }, "Infinite canvas");
    return;
  }
  const def = SHEET_PRESETS[preset as Exclude<SheetPreset, "infinite" | "custom">];
  if (!def) return;
  st().setPageSheet(page.id, { preset, width: def.w, height: def.h }, `Sheet size ${def.label}`);
  requestAnimationFrame(fitSheet);
}

function setOrientation(orientation: "portrait" | "landscape") {
  const page = curPage();
  if (!page || isInfinite(page.sheet)) return;
  st().setPageSheet(page.id, { orientation }, "Sheet " + orientation);
  requestAnimationFrame(fitSheet);
}

function stepSheet(dir: 1 | -1) {
  const doc = curDoc();
  if (!doc || doc.pages.length < 2) return;
  const idx = doc.pages.findIndex((p) => p.id === doc.pageId);
  const next = doc.pages[(idx + dir + doc.pages.length) % doc.pages.length];
  st().setActivePage(next.id);
  if (st().presenting) requestAnimationFrame(fitSheet);
}

/** Slideshow navigation: stops at the ends instead of wrapping. */
export function presentStep(dir: 1 | -1) {
  const doc = curDoc();
  if (!doc) return;
  const idx = doc.pages.findIndex((p) => p.id === doc.pageId);
  const next = idx + dir;
  if (next < 0 || next >= doc.pages.length) return;
  st().setActivePage(doc.pages[next].id);
  requestAnimationFrame(fitSheet);
}

export function presentGoTo(pageId: ID) {
  st().setActivePage(pageId);
  requestAnimationFrame(fitSheet);
}

export async function startPresenting(fromFirst = false) {
  const doc = curDoc();
  if (!doc) return;
  if (fromFirst && doc.pages[0]) st().setActivePage(doc.pages[0].id);
  st().setPresenting(true);
  try { await document.documentElement.requestFullscreen?.(); } catch { /* user can press F11 */ }
  requestAnimationFrame(() => requestAnimationFrame(fitSheet));
}

export async function stopPresenting() {
  st().setPresenting(false);
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
  requestAnimationFrame(fitSheet);
}

function exportSheetImage(format: "png" | "jpg") {
  const doc = curDoc(); const page = curPage();
  if (!doc || !page) return;
  try {
    exportImage(format, `${doc.name} — ${page.name}`,
      isInfinite(page.sheet) ? null : sheetSize(page.sheet));
  } catch (e: any) { st().showToast(e?.message ?? "Export failed"); }
}

function fitToContent(boundsOnlySelection = false) {
  const doc = curDoc(); const page = curPage(); if (!doc || !page) return;
  const b = boundsOnlySelection
    ? selectionBounds(page.objects, sel())
    : contentBounds(page);
  // Nothing to frame: put the origin in the middle at 100%.
  if (!b) { centerOn({ x: 0, y: 0, w: 0, h: 0 }, { zoom: 1 }); return; }
  centerOn(b, { pad: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────

export const ACTIONS: AppAction[] = [
  // File ─────────────────────────────────────────────────────────────────
  { id: "file.new", label: "New", category: "File", shortcut: "Ctrl+N", chord: "ctrl+n",
    run: () => st().newDocument() },
  { id: "file.open", label: "Open…", category: "File", shortcut: "Ctrl+O", chord: "ctrl+o",
    run: triggerOpen },
  { id: "file.save", label: "Save", category: "File", shortcut: "Ctrl+S", chord: "ctrl+s",
    run: () => saveActive(false) },
  { id: "file.saveAs", label: "Save As…", category: "File", shortcut: "Ctrl+Shift+S", chord: "ctrl+shift+s",
    run: () => saveActive(true) },
  { id: "file.closeTab", label: "Close Tab", category: "File", shortcut: "Ctrl+W", chord: "ctrl+w",
    run: () => st().closeDocument(st().activeDocId) },
  { id: "file.exportPng", label: "Export Sheet as PNG…", category: "File",
    run: () => exportSheetImage("png") },
  { id: "file.exportJpg", label: "Export Sheet as JPG…", category: "File",
    run: () => exportSheetImage("jpg") },
  { id: "file.exportAll", label: "Export All Content as PNG…", category: "File",
    run: () => { const d = curDoc(); if (d) try { exportImage("png", d.name); } catch (e: any) { st().showToast(e.message); } } },

  // Sheet ────────────────────────────────────────────────────────────────
  { id: "sheet.add", label: "Add Sheet", category: "Sheet", shortcut: "Ctrl+Enter", chord: "ctrl+enter",
    run: () => { st().addPage(); requestAnimationFrame(fitSheet); } },
  { id: "sheet.duplicate", label: "Duplicate Sheet", category: "Sheet",
    run: () => { const p = curPage(); if (p) st().duplicatePage(p.id); } },
  { id: "sheet.delete", label: "Delete Sheet", category: "Sheet",
    enabled: () => (curDoc()?.pages.length ?? 0) > 1,
    run: () => { const p = curPage(); if (p) st().deletePage(p.id); } },
  { id: "sheet.next", label: "Next Sheet", category: "Sheet", shortcut: "Page Down", chord: "pagedown",
    run: () => stepSheet(1) },
  { id: "sheet.prev", label: "Previous Sheet", category: "Sheet", shortcut: "Page Up", chord: "pageup",
    run: () => stepSheet(-1) },
  { id: "sheet.fit", label: "Fit Sheet to Screen", category: "Sheet", shortcut: "Ctrl+1", chord: "ctrl+1",
    run: fitSheet },
  { id: "present.start", label: "Present from First Sheet", category: "Sheet", shortcut: "F5", chord: "f5",
    run: () => void startPresenting(true) },
  { id: "present.current", label: "Present from Current Sheet", category: "Sheet", shortcut: "Shift+F5", chord: "shift+f5",
    run: () => void startPresenting(false) },
  { id: "sheet.portrait", label: "Portrait", category: "Sheet",
    checked: () => curPage()?.sheet.orientation === "portrait" && !isInfinite(curPage()?.sheet),
    enabled: () => !isInfinite(curPage()?.sheet),
    run: () => setOrientation("portrait") },
  { id: "sheet.landscape", label: "Landscape", category: "Sheet",
    checked: () => curPage()?.sheet.orientation === "landscape",
    enabled: () => !isInfinite(curPage()?.sheet),
    run: () => setOrientation("landscape") },
  { id: "sheet.margins", label: "Show Margin Guides", category: "Sheet",
    checked: () => !!curPage()?.sheet.showMargin,
    enabled: () => !isInfinite(curPage()?.sheet),
    run: () => { const p = curPage(); if (p) st().setPageSheet(p.id, { showMargin: !p.sheet.showMargin }, "Toggle margins"); } },
  { id: "sheet.infinite", label: "Infinite Canvas", category: "Sheet",
    checked: () => isInfinite(curPage()?.sheet),
    run: () => applySheetPreset("infinite") },
  ...(Object.keys(SHEET_PRESETS) as (keyof typeof SHEET_PRESETS)[]).map((key): AppAction => ({
    id: "sheet.size." + key,
    label: `${SHEET_PRESETS[key].label}  (${SHEET_PRESETS[key].hint})`,
    category: "Sheet",
    checked: () => curPage()?.sheet.preset === key,
    run: () => applySheetPreset(key),
  })),
  { id: "sheet.bar", label: "Show Sheets Bar", category: "View",
    checked: () => st().sheetsBarVisible,
    run: () => st().setFlag("sheetsBarVisible", !st().sheetsBarVisible) },

  // Edit ─────────────────────────────────────────────────────────────────
  { id: "edit.undo", label: "Undo", category: "Edit", shortcut: "Ctrl+Z", chord: "ctrl+z",
    enabled: () => st().undoLabel != null, run: () => st().undo() },
  { id: "edit.redo", label: "Redo", category: "Edit", shortcut: "Ctrl+Y", chord: "ctrl+y",
    enabled: () => st().redoLabel != null, run: () => st().redo() },
  { id: "edit.redo2", label: "Redo", category: "Edit", chord: "ctrl+shift+z",
    enabled: () => st().redoLabel != null, run: () => st().redo() },
  { id: "edit.cut", label: "Cut", category: "Edit", shortcut: "Ctrl+X", chord: "ctrl+x",
    enabled: hasSelection, run: () => st().copySelection(true) },
  { id: "edit.copy", label: "Copy", category: "Edit", shortcut: "Ctrl+C", chord: "ctrl+c",
    enabled: hasSelection, run: () => st().copySelection(false) },
  { id: "edit.paste", label: "Paste", category: "Edit", shortcut: "Ctrl+V", chord: "ctrl+v",
    run: () => st().pasteClipboard() },
  { id: "edit.duplicate", label: "Duplicate", category: "Edit", shortcut: "Ctrl+D", chord: "ctrl+d",
    enabled: hasSelection, run: () => st().duplicateSelection() },
  { id: "edit.delete", label: "Delete", category: "Edit", shortcut: "Delete", chord: "delete",
    enabled: hasSelection, run: () => st().removeObjects(sel()) },
  { id: "edit.delete2", label: "Delete", category: "Edit", chord: "backspace",
    enabled: hasSelection, run: () => st().removeObjects(sel()) },
  { id: "edit.selectAll", label: "Select All", category: "Edit", shortcut: "Ctrl+A", chord: "ctrl+a",
    run: () => st().selectAll() },
  { id: "edit.deselect", label: "Deselect", category: "Edit", shortcut: "Esc", chord: "escape",
    enabled: hasSelection, run: () => st().clearSelection() },

  // View ─────────────────────────────────────────────────────────────────
  { id: "view.zoomIn", label: "Zoom In", category: "View", shortcut: "Ctrl++", chord: "ctrl+=",
    run: () => zoomBy(1.25) },
  { id: "view.zoomOut", label: "Zoom Out", category: "View", shortcut: "Ctrl+-", chord: "ctrl+-",
    run: () => zoomBy(0.8) },
  { id: "view.actualSize", label: "Actual Size (100%)", category: "View", shortcut: "Ctrl+0", chord: "ctrl+0",
    // 100% *and* recentred — otherwise you can end up at 100% looking at blank canvas.
    run: () => {
      const page = curPage();
      if (!page) return;
      if (!isInfinite(page.sheet)) {
        const { w, h } = sheetSize(page.sheet);
        centerOn({ x: 0, y: 0, w, h }, { zoom: 1 });
      } else {
        const b = sel().length ? selectionBounds(page.objects, sel()) : contentBounds(page);
        centerOn(b ?? { x: 0, y: 0, w: 0, h: 0 }, { zoom: 1 });
      }
    } },
  { id: "view.recenter", label: "Recenter View", category: "View", shortcut: "Ctrl+.", chord: "ctrl+.",
    run: recenterView },
  { id: "view.fitScreen", label: "Fit to Screen", category: "View", shortcut: "Ctrl+Shift+0", chord: "ctrl+shift+0",
    run: () => fitToContent(false) },
  { id: "view.fitSelection", label: "Fit Selection", category: "View",
    enabled: hasSelection, run: () => fitToContent(true) },
  { id: "view.grid", label: "Show Grid", category: "View",
    checked: () => st().gridShow, run: () => st().setGrid({ gridShow: !st().gridShow }) },
  { id: "view.gridDots", label: "Grid Style: Dots", category: "View",
    checked: () => st().gridStyle === "dots",
    run: () => st().setGrid({ gridStyle: "dots", gridShow: true }) },
  { id: "view.gridLines", label: "Grid Style: Lines", category: "View",
    checked: () => st().gridStyle === "lines",
    run: () => st().setGrid({ gridStyle: "lines", gridShow: true }) },
  { id: "view.gridToggleStyle", label: "Toggle Dots / Lines", category: "View", shortcut: "Ctrl+'", chord: "ctrl+'",
    run: () => st().setGrid({ gridStyle: st().gridStyle === "dots" ? "lines" : "dots", gridShow: true }) },
  { id: "view.snapGrid", label: "Snap to Grid", category: "View",
    checked: () => st().snapGrid, run: () => st().setGrid({ snapGrid: !st().snapGrid }) },
  { id: "view.snapObjects", label: "Snap to Objects", category: "View",
    checked: () => st().snapObjects, run: () => st().setGrid({ snapObjects: !st().snapObjects }) },
  { id: "view.theme", label: "Use Light Theme", category: "View",
    checked: () => st().theme === "light",
    run: () => st().setTheme(st().theme === "dark" ? "light" : "dark") },
  { id: "view.leftPanel", label: "Left Panel", category: "View",
    checked: () => st().leftVisible, run: () => st().setFlag("leftVisible", !st().leftVisible) },
  { id: "view.rightPanel", label: "Right Panel", category: "View",
    checked: () => st().rightVisible, run: () => st().setFlag("rightVisible", !st().rightVisible) },
  { id: "view.distractionFree", label: "Distraction-Free Mode", category: "View", shortcut: "F",
    checked: () => st().chromeHidden, run: () => st().setFlag("chromeHidden", !st().chromeHidden) },
  { id: "view.fullscreen", label: "Toggle Full Screen", category: "View", shortcut: "F11", chord: "f11",
    run: () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); } },

  // Insert (tool switches) ───────────────────────────────────────────────
  { id: "tool.select", label: "Select Tool", category: "Tools", shortcut: "V", chord: "v", run: () => st().setTool("select") },
  { id: "tool.pan", label: "Pan Tool", category: "Tools", shortcut: "H", chord: "h", run: () => st().setTool("pan") },
  { id: "tool.text", label: "Text", category: "Insert", shortcut: "T", chord: "t", run: () => st().setTool("text") },
  { id: "tool.sticky", label: "Sticky Note", category: "Insert", shortcut: "S", chord: "s", run: () => st().setTool("sticky") },
  { id: "tool.rect", label: "Rectangle", category: "Insert", shortcut: "R", chord: "r", run: () => st().setTool("rect") },
  { id: "tool.roundrect", label: "Rounded Rectangle", category: "Insert", run: () => st().setTool("roundrect") },
  { id: "tool.ellipse", label: "Ellipse", category: "Insert", shortcut: "O", chord: "o", run: () => st().setTool("ellipse") },
  { id: "tool.triangle", label: "Triangle", category: "Insert", run: () => st().setTool("triangle") },
  { id: "tool.star", label: "Star", category: "Insert", run: () => st().setTool("star") },
  { id: "tool.line", label: "Line", category: "Insert", shortcut: "L", chord: "l", run: () => st().setTool("line") },
  { id: "tool.arrow", label: "Arrow", category: "Insert", shortcut: "A", chord: "a", run: () => st().setTool("arrow") },
  { id: "tool.pen", label: "Pen", category: "Insert", shortcut: "P", chord: "p", run: () => st().setTool("pen") },
  { id: "tool.pencil", label: "Pencil", category: "Insert", run: () => st().setTool("pencil") },
  { id: "tool.highlighter", label: "Highlighter", category: "Insert", run: () => st().setTool("highlighter") },
  { id: "tool.eraser", label: "Eraser", category: "Tools", shortcut: "E", chord: "e", run: () => st().setTool("eraser") },
  { id: "tool.eyedropper", label: "Eyedropper (pick colour)", category: "Tools", shortcut: "I", chord: "i",
    run: () => st().setTool("eyedropper") },

  // Image adjustments ────────────────────────────────────────────────────
  { id: "img.grayscale", label: "Image: Black & White", category: "Tools",
    enabled: () => selectedObjects().some((o) => o.type === "image"),
    run: () => mutateSel((o) => ({ grayscale: !o.grayscale }), "Black & white") },
  { id: "img.sepia", label: "Image: Sepia", category: "Tools",
    enabled: () => selectedObjects().some((o) => o.type === "image"),
    run: () => mutateSel((o) => ({ sepia: !o.sepia }), "Sepia") },
  { id: "img.invert", label: "Image: Invert", category: "Tools",
    enabled: () => selectedObjects().some((o) => o.type === "image"),
    run: () => mutateSel((o) => ({ invert: !o.invert }), "Invert") },
  { id: "img.reset", label: "Image: Reset Adjustments", category: "Tools",
    enabled: () => selectedObjects().some((o) => o.type === "image"),
    run: () => mutateSel({
      brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0,
      pixelate: 0, noise: 0, sharpen: 0,
      grayscale: false, sepia: false, invert: false,
      cropX: 0, cropY: 0, cropW: 1, cropH: 1,
    }, "Reset adjustments") },
  { id: "img.bgRemove", label: "Image: Remove Background…", category: "Tools",
    enabled: () => selectedObjects().some((o) => o.type === "image"),
    run: () => st().setFlag("bgRemoveOpen", true) },
  { id: "img.fitSheet", label: "Image: Fit to Sheet", category: "Tools",
    enabled: () => selectedObjects().some((o) => o.type === "image"),
    run: () => {
      const page = curPage();
      if (!page || isInfinite(page.sheet)) return;
      const { w, h } = sheetSize(page.sheet);
      mutateSel((o) => {
        const ar = (o.naturalW ?? o.width) / (o.naturalH ?? o.height);
        const scale = Math.max(w / (h * ar), 1) ;
        void scale;
        const fitW = w, fitH = Math.round(w / ar);
        return { x: 0, y: Math.round((h - fitH) / 2), width: fitW, height: fitH };
      }, "Fit image to sheet");
    } },
  { id: "insert.image", label: "Image…", category: "Insert", run: triggerImageInsert },
  { id: "insert.link", label: "Link / URL…", category: "Insert", shortcut: "Ctrl+K", chord: "ctrl+k",
    run: () => st().setFlag("linkOpen", true) },
  { id: "insert.openLink", label: "Open Link", category: "Insert",
    enabled: () => selectedObjects().some((o) => !!o.link),
    run: () => {
      const withLink = selectedObjects().find((o) => !!o.link);
      if (withLink?.link) st().setPendingLink(withLink.link);
    } },
  { id: "insert.copyLink", label: "Copy Link Address", category: "Insert",
    enabled: () => selectedObjects().some((o) => !!o.link),
    run: () => {
      const withLink = selectedObjects().find((o) => !!o.link);
      if (!withLink?.link) return;
      navigator.clipboard?.writeText(withLink.link)
        .then(() => st().showToast("Link copied"))
        .catch(() => st().showToast("Could not copy link"));
    } },
  { id: "insert.rows", label: "Create Numbered Rows…", category: "Insert", run: () => st().setFlag("rowsOpen", true) },

  // Format ───────────────────────────────────────────────────────────────
  { id: "fmt.bold", label: "Bold", category: "Format", shortcut: "Ctrl+B", chord: "ctrl+b",
    enabled: hasSelection, run: () => toggleTextStyle("bold") },
  { id: "fmt.italic", label: "Italic", category: "Format", shortcut: "Ctrl+I", chord: "ctrl+i",
    enabled: hasSelection, run: () => toggleTextStyle("italic") },
  { id: "fmt.underline", label: "Underline", category: "Format", shortcut: "Ctrl+U", chord: "ctrl+u",
    enabled: hasSelection, run: () => toggleTextStyle("underline") },
  { id: "fmt.strike", label: "Strikethrough", category: "Format",
    enabled: hasSelection, run: () => toggleTextStyle("strike") },
  { id: "fmt.alignLeft", label: "Text Align Left", category: "Format",
    enabled: hasSelection, run: () => mutateSel({ align: "left" }, "Align text left") },
  { id: "fmt.alignCenter", label: "Text Align Center", category: "Format",
    enabled: hasSelection, run: () => mutateSel({ align: "center" }, "Align text center") },
  { id: "fmt.alignRight", label: "Text Align Right", category: "Format",
    enabled: hasSelection, run: () => mutateSel({ align: "right" }, "Align text right") },
  { id: "fmt.alignObjectsLeft", label: "Align Left Edges", category: "Format",
    enabled: multiSelection, run: () => alignSelection("left") },
  { id: "fmt.alignObjectsCenterX", label: "Align Horizontal Centers", category: "Format",
    enabled: multiSelection, run: () => alignSelection("centerX") },
  { id: "fmt.alignObjectsRight", label: "Align Right Edges", category: "Format",
    enabled: multiSelection, run: () => alignSelection("right") },
  { id: "fmt.alignObjectsTop", label: "Align Top Edges", category: "Format",
    enabled: multiSelection, run: () => alignSelection("top") },
  { id: "fmt.alignObjectsCenterY", label: "Align Vertical Centers", category: "Format",
    enabled: multiSelection, run: () => alignSelection("centerY") },
  { id: "fmt.alignObjectsBottom", label: "Align Bottom Edges", category: "Format",
    enabled: multiSelection, run: () => alignSelection("bottom") },
  { id: "fmt.distributeH", label: "Distribute Horizontally", category: "Format",
    enabled: () => sel().length > 2, run: () => distributeSelection("h") },
  { id: "fmt.distributeV", label: "Distribute Vertically", category: "Format",
    enabled: () => sel().length > 2, run: () => distributeSelection("v") },

  // Object ───────────────────────────────────────────────────────────────
  { id: "obj.group", label: "Group", category: "Object", shortcut: "Ctrl+G", chord: "ctrl+g",
    enabled: multiSelection, run: groupSelection },
  { id: "obj.ungroup", label: "Ungroup", category: "Object", shortcut: "Ctrl+Shift+G", chord: "ctrl+shift+g",
    enabled: hasSelection, run: ungroupSelection },
  { id: "obj.front", label: "Bring to Front", category: "Object", chord: "ctrl+]",
    enabled: hasSelection, run: () => reorderSelection("front") },
  { id: "obj.forward", label: "Bring Forward", category: "Object", chord: "]",
    enabled: hasSelection, run: () => reorderSelection("forward") },
  { id: "obj.backward", label: "Send Backward", category: "Object", chord: "[",
    enabled: hasSelection, run: () => reorderSelection("backward") },
  { id: "obj.back", label: "Send to Back", category: "Object", chord: "ctrl+[",
    enabled: hasSelection, run: () => reorderSelection("back") },
  { id: "obj.lock", label: "Lock", category: "Object",
    enabled: hasSelection, run: () => { mutateSel({ locked: true }, "Lock"); st().clearSelection(); } },
  { id: "obj.unlock", label: "Unlock", category: "Object",
    enabled: hasSelection, run: () => mutateSel({ locked: false }, "Unlock") },
  { id: "obj.hide", label: "Hide", category: "Object",
    enabled: hasSelection, run: () => { mutateSel({ visible: false }, "Hide"); st().clearSelection(); } },
  { id: "obj.show", label: "Show", category: "Object",
    enabled: hasSelection, run: () => mutateSel({ visible: true }, "Show") },
  { id: "obj.flipH", label: "Flip Horizontal", category: "Object",
    enabled: hasSelection, run: () => mutateSel((o) => ({ flipX: !o.flipX }), "Flip horizontal") },
  { id: "obj.flipV", label: "Flip Vertical", category: "Object",
    enabled: hasSelection, run: () => mutateSel((o) => ({ flipY: !o.flipY }), "Flip vertical") },

  // Tools ────────────────────────────────────────────────────────────────
  { id: "tools.palette", label: "Command Palette", category: "Tools", shortcut: "Ctrl+Shift+P", chord: "ctrl+shift+p",
    run: () => st().setFlag("paletteOpen", true) },
  { id: "tools.find", label: "Find…", category: "Tools", shortcut: "Ctrl+F", chord: "ctrl+f",
    run: () => st().setFlag("findOpen", true) },
  { id: "tools.settings", label: "Settings…", category: "Tools", run: () => st().setFlag("settingsOpen", true) },

  // Nudges / cycles (hotkey only) ─────────────────────────────────────────
  { id: "nudge.left", label: "Nudge Left", category: "Object", chord: "arrowleft", run: () => nudgeSelection(-1, 0) },
  { id: "nudge.right", label: "Nudge Right", category: "Object", chord: "arrowright", run: () => nudgeSelection(1, 0) },
  { id: "nudge.up", label: "Nudge Up", category: "Object", chord: "arrowup", run: () => nudgeSelection(0, -1) },
  { id: "nudge.down", label: "Nudge Down", category: "Object", chord: "arrowdown", run: () => nudgeSelection(0, 1) },
  { id: "nudge.left10", label: "Nudge Left ×10", category: "Object", chord: "shift+arrowleft", run: () => nudgeSelection(-10, 0) },
  { id: "nudge.right10", label: "Nudge Right ×10", category: "Object", chord: "shift+arrowright", run: () => nudgeSelection(10, 0) },
  { id: "nudge.up10", label: "Nudge Up ×10", category: "Object", chord: "shift+arrowup", run: () => nudgeSelection(0, -10) },
  { id: "nudge.down10", label: "Nudge Down ×10", category: "Object", chord: "shift+arrowdown", run: () => nudgeSelection(0, 10) },

  // Help ─────────────────────────────────────────────────────────────────
  { id: "help.shortcuts", label: "Keyboard Shortcuts", category: "Help", run: () => st().setFlag("aboutOpen", true) },
  { id: "help.about", label: "About Sadas Canvas", category: "Help", run: () => st().setFlag("aboutOpen", true) },
];

function toggleTextStyle(key: "bold" | "italic" | "underline" | "strike") {
  const objs = selectedObjects().filter((o) => hasText(o));
  if (!objs.length) return;
  const next = !objs.every((o) => o[key]);
  mutateSel({ [key]: next } as Partial<CanvasObject>, "Toggle " + key);
}

export const ACTION_MAP = new Map(ACTIONS.map((a) => [a.id, a]));

export function runAction(id: string) {
  const a = ACTION_MAP.get(id);
  if (!a) return;
  if (a.enabled && !a.enabled()) return;
  a.run();
}

/** chord → action id map for the global hotkey hook. */
export const CHORD_MAP = new Map<string, AppAction>();
for (const a of ACTIONS) if (a.chord) CHORD_MAP.set(a.chord, a);

/** Expand a click selection to include grouped siblings. */
export function expandGroupSelection(objects: CanvasObject[], pickedId: ID): ID[] {
  const obj = objects.find((o) => o.id === pickedId);
  if (obj?.groupId) {
    return objects.filter((o) => o.groupId === obj.groupId && o.visible && !o.locked).map((o) => o.id);
  }
  return [pickedId];
}

/** Cycle-through selection (Tab). */
export function cycleSelection(dir: 1 | -1 = 1) {
  const page = curPage(); if (!page) return;
  const pickable = page.objects.filter((o) => o.visible && !o.locked);
  if (!pickable.length) return;
  const cur = sel()[0];
  const idx = pickable.findIndex((o) => o.id === cur);
  const next = pickable[(idx + dir + pickable.length) % pickable.length];
  st().setSelection([next.id]);
}
