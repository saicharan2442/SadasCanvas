// ─────────────────────────────────────────────────────────────────────────────
// Central application state (zustand). Documents live here; every content
// mutation flows through dispatch(HCommand) so undo/redo is total.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { HistoryManager, type HCommand } from "./history";
import { cmdObjects, cmdPages } from "./commands";
import {
  makeDocument, makePage, cloneObject, uid, DEFAULT_SHEET, repairLegacyTextContrast,
} from "./factory";
import type {
  Bounds, Camera, CanvasDocument, CanvasObject, GridStyle, ID, InkTool, Page, Sheet, Tool,
} from "./types";
import { ZOOM_MAX, ZOOM_MIN } from "./types";

export interface InkSetting { color: string; width: number; }
export type InkSettings = Record<InkTool, InkSetting>;

const DEFAULT_INK: InkSettings = {
  pen: { color: "#e8ebf2", width: 3.5 },
  pencil: { color: "#9aa3b2", width: 1.6 },
  highlighter: { color: "#f7d154", width: 22 },
};

export const history = new HistoryManager();

/** In-app clipboard (objects never leave the machine). */
let clipboard: CanvasObject[] = [];
export function setClipboard(objects: CanvasObject[]) { clipboard = objects; }
export function getClipboard(): CanvasObject[] { return clipboard; }

/** Canvas paint tokens per UI theme (Konva reads these, not CSS). */
export const CANVAS_THEME = {
  dark: {
    board: "#24272d", grid: "rgba(255,255,255,0.055)", gridMajor: "rgba(255,255,255,0.11)",
    dot: "rgba(255,255,255,0.20)", dotMajor: "rgba(255,255,255,0.40)",
    axisX: "rgba(120,170,255,0.28)", marquee: "rgba(76,141,255,0.12)", marqueeStroke: "#4c8dff",
    guide: "#ff4fa3",
  },
  light: {
    board: "#eef0f4", grid: "rgba(0,0,0,0.055)", gridMajor: "rgba(0,0,0,0.12)",
    dot: "rgba(0,0,0,0.22)", dotMajor: "rgba(0,0,0,0.40)",
    axisX: "rgba(40,110,220,0.35)", marquee: "rgba(0,103,192,0.10)", marqueeStroke: "#0067c0",
    guide: "#e91e8c",
  },
} as const;

export function canvasTokens(theme: "dark" | "light") {
  return CANVAS_THEME[theme];
}

interface AppState {
  docs: CanvasDocument[];
  activeDocId: ID;
  selection: ID[];
  editingId: ID | null;

  tool: Tool;
  spaceHeld: boolean;
  inkSettings: InkSettings;
  sheetsBarVisible: boolean;
  /** Recently picked / used colours (eyedropper + palette). */
  swatches: string[];

  gridShow: boolean;
  gridSize: number;
  gridStyle: GridStyle;
  snapGrid: boolean;
  snapObjects: boolean;

  theme: "dark" | "light";
  dirty: Record<ID, boolean>;
  undoLabel: string | null;
  redoLabel: string | null;

  viewport: { w: number; h: number };
  pointer: { x: number; y: number };
  lastSaved: number | null;
  autosaveSec: number; // 0 = off
  spellcheck: boolean;

  paletteOpen: boolean;
  findOpen: boolean;
  aboutOpen: boolean;
  settingsOpen: boolean;
  rowsOpen: boolean;
  linkOpen: boolean;
  bgRemoveOpen: boolean;
  animateOpen: boolean;
  /** URL awaiting user confirmation before the browser opens it. */
  pendingLink: string | null;
  leftVisible: boolean;
  rightVisible: boolean;
  chromeHidden: boolean;

  toast: string | null;
  toastTs: number;
  /** Browser connectivity. Sadas Canvas works identically either way. */
  online: boolean;

  contextMenu: { x: number; y: number } | null;
  setContextMenu: (menu: { x: number; y: number } | null) => void;

  /** Full-screen slideshow mode. */
  presenting: boolean;
  playing: boolean;
  playbackTime: number;
  setPresenting: (v: boolean) => void;
  setPlaying: (v: boolean) => void;
  setPlaybackTime: (t: number) => void;

  // ── document/history ──────────────────────────────────────────────────────
  dispatch: (cmd: HCommand) => void;
  undo: () => void;
  redo: () => void;

  // convenience mutators (build commands from current state)
  addObjects: (objects: CanvasObject[], label?: string, selectAfter?: boolean) => void;
  removeObjects: (ids: ID[], label?: string, mergeKey?: string) => void;
  updateObjects: (ids: ID[], patch: Partial<CanvasObject> | ((o: CanvasObject) => Partial<CanvasObject>), label?: string, mergeKey?: string) => void;
  replaceObject: (after: CanvasObject, label?: string) => void;

  // ── selection ─────────────────────────────────────────────────────────────
  setSelection: (ids: ID[]) => void;
  selectOnly: (id: ID) => void;
  toggleSelect: (id: ID) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setEditing: (id: ID | null) => void;

  // ── tools / view ──────────────────────────────────────────────────────────
  setTool: (t: Tool) => void;
  setSpaceHeld: (v: boolean) => void;
  setInkSetting: (tool: InkTool, patch: Partial<InkSetting>) => void;
  addSwatch: (color: string) => void;
  setPageSheet: (pageId: ID, patch: Partial<Sheet>, label?: string) => void;
  setTheme: (t: "dark" | "light") => void;
  setGrid: (p: Partial<Pick<AppState, "gridShow" | "gridSize" | "gridStyle" | "snapGrid" | "snapObjects">>) => void;
  setCamera: (cam: Partial<Camera>) => void;
  zoomAt: (zoom: number, cx?: number, cy?: number) => void;
  setViewport: (w: number, h: number) => void;
  setPointer: (x: number, y: number) => void;

  // ── clipboard ops ─────────────────────────────────────────────────────────
  copySelection: (cut?: boolean) => void;
  pasteClipboard: () => void;
  duplicateSelection: () => void;

  // ── pages ─────────────────────────────────────────────────────────────────
  setActivePage: (pageId: ID) => void;
  /** Insert a sheet directly after `afterPageId` (defaults to the current one). */
  addPage: (afterPageId?: ID) => void;
  duplicatePage: (pageId: ID) => void;
  renamePage: (pageId: ID, name: string) => void;
  deletePage: (pageId: ID) => void;
  movePage: (pageId: ID, dir: -1 | 1) => void;

  // ── documents / tabs ──────────────────────────────────────────────────────
  setActiveDoc: (docId: ID) => void;
  newDocument: () => void;
  openDocument: (doc: CanvasDocument) => void;
  closeDocument: (docId: ID) => void;
  renameDocument: (docId: ID, name: string) => void;

  // ── ui flags ──────────────────────────────────────────────────────────────
  setFlag: (k: "paletteOpen" | "findOpen" | "aboutOpen" | "settingsOpen" | "rowsOpen" | "linkOpen" | "bgRemoveOpen" | "animateOpen" | "leftVisible" | "rightVisible" | "chromeHidden" | "sheetsBarVisible", v: boolean) => void;
  setPendingLink: (url: string | null) => void;
  setOnline: (v: boolean) => void;
  setAutosave: (sec: number) => void;
  setSpellcheck: (v: boolean) => void;
  markSaved: () => void;
  showToast: (msg: string) => void;

  // ── session ───────────────────────────────────────────────────────────────
  loadDocs: (docs: CanvasDocument[], activeId?: ID) => void;
}

function readInitialDocs(): { docs: CanvasDocument[]; activeDocId: ID } {
  try {
    const raw = localStorage.getItem("cp:session");
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.docs) && data.docs.length > 0) {
        const docs: CanvasDocument[] = data.docs
          .filter((d: any) => d && Array.isArray(d.pages) && d.pages.length)
          // sessions written before sheets existed open as infinite canvases
          .map((d: any) => ({
            ...d,
            pages: d.pages.map((p: any) => repairLegacyTextContrast({
              ...p,
              sheet: p?.sheet ?? { ...DEFAULT_SHEET, preset: "infinite" },
            })),
          }));
        if (docs.length) {
          return {
            docs,
            activeDocId: docs.some((d: CanvasDocument) => d.id === data.activeDocId)
              ? data.activeDocId : docs[0].id,
          };
        }
      }
    }
  } catch { /* fall through to fresh document */ }
  const doc = makeDocument();
  return { docs: [doc], activeDocId: doc.id };
}

const initial = typeof window !== "undefined"
  ? readInitialDocs()
  : (() => { const d = makeDocument(); return { docs: [d], activeDocId: d.id }; })();

export const useStore = create<AppState>()((set, get) => {
  const syncHistoryLabels = () =>
    set({
      undoLabel: history.peekUndo()?.label ?? null,
      redoLabel: history.peekRedo()?.label ?? null,
    });

  const pruneSelection = () => {
    const { docs, activeDocId, selection } = get();
    const doc = docs.find((d) => d.id === activeDocId);
    const page = doc?.pages.find((p) => p.id === doc.pageId);
    if (!page) { if (selection.length) set({ selection: [] }); return; }
    const alive = new Set(page.objects.map((o) => o.id));
    const next = selection.filter((id) => alive.has(id));
    if (next.length !== selection.length) set({ selection: next });
  };

  return {
    docs: initial.docs,
    activeDocId: initial.activeDocId,
    selection: [],
    editingId: null,
    tool: "select",
    spaceHeld: false,
    inkSettings: readInk(),
    sheetsBarVisible: readBool("cp:sheetsBar", true),
    swatches: readSwatches(),
    gridShow: readBool("cp:gridShow", true),
    gridSize: readNum("cp:gridSize", 20),
    gridStyle: readGridStyle(),
    snapGrid: readBool("cp:snapGrid", false),
    snapObjects: readBool("cp:snapObjects", true),
    theme: readTheme(),
    dirty: {},
    undoLabel: null,
    redoLabel: null,
    viewport: { w: 1200, h: 800 },
    pointer: { x: 0, y: 0 },
    lastSaved: null,
    autosaveSec: readNum("cp:autosave", 30),
    spellcheck: readBool("cp:spellcheck", true),
    paletteOpen: false,
    findOpen: false,
    aboutOpen: false,
    settingsOpen: false,
    rowsOpen: false,
    linkOpen: false,
    bgRemoveOpen: false,
    animateOpen: false,
    pendingLink: null,
    leftVisible: true,
    rightVisible: true,
    chromeHidden: false,
    toast: null,
    toastTs: 0,
    online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,

    contextMenu: null,
    setContextMenu: (menu) => set({ contextMenu: menu }),

    presenting: false,
    playing: false,
    playbackTime: 0,

    dispatch: (cmd) => {
      const { docs } = get();
      const doc = docs.find((d) => d.id === cmd.docId);
      if (!doc) return;
      const next = cmd.redo(doc);
      history.push(cmd);
      set({
        docs: docs.map((d) => (d.id === cmd.docId ? next : d)),
        dirty: { ...get().dirty, [cmd.docId]: true },
      });
      syncHistoryLabels();
      pruneSelection();
    },

    undo: () => {
      const cmd = history.takeUndo();
      if (!cmd) return;
      const { docs } = get();
      const doc = docs.find((d) => d.id === cmd.docId);
      if (!doc) { syncHistoryLabels(); return; }
      set({
        docs: docs.map((d) => (d.id === cmd.docId ? cmd.undo(doc) : d)),
        dirty: { ...get().dirty, [cmd.docId]: true },
        activeDocId: cmd.docId,
        editingId: null,
      });
      syncHistoryLabels();
      pruneSelection();
    },

    redo: () => {
      const cmd = history.takeRedo();
      if (!cmd) return;
      const { docs } = get();
      const doc = docs.find((d) => d.id === cmd.docId);
      if (!doc) { syncHistoryLabels(); return; }
      set({
        docs: docs.map((d) => (d.id === cmd.docId ? cmd.redo(doc) : d)),
        dirty: { ...get().dirty, [cmd.docId]: true },
        activeDocId: cmd.docId,
        editingId: null,
      });
      syncHistoryLabels();
      pruneSelection();
    },

    addObjects: (objects, label, selectAfter = true) => {
      const doc = activeDoc(get()); const page = activePage(doc);
      if (!doc || !page || objects.length === 0) return;
      get().dispatch(cmdObjects(doc.id, page.id, page.objects, [...page.objects, ...objects],
        label ?? `Add ${objects.length > 1 ? objects.length + " objects" : objects[0].name}`));
      if (selectAfter) set({ selection: objects.map((o) => o.id) });
    },

    removeObjects: (ids, label, mergeKey) => {
      const doc = activeDoc(get()); const page = activePage(doc);
      if (!doc || !page || ids.length === 0) return;
      const idSet = new Set(ids);
      const after = page.objects.filter((o) => !idSet.has(o.id));
      get().dispatch(cmdObjects(doc.id, page.id, page.objects, after, label ?? `Delete ${ids.length > 1 ? ids.length + " objects" : "object"}`, mergeKey));
      set({ selection: [] });
    },

    updateObjects: (ids, patch, label, mergeKey) => {
      const doc = activeDoc(get()); const page = activePage(doc);
      if (!doc || !page || ids.length === 0) return;
      const idSet = new Set(ids);
      const after = page.objects.map((o) =>
        idSet.has(o.id) ? { ...o, ...(typeof patch === "function" ? patch(o) : patch) } : o);
      get().dispatch(cmdObjects(doc.id, page.id, page.objects, after, label ?? "Modify object", mergeKey));
    },

    replaceObject: (after, label) => {
      const doc = activeDoc(get()); const page = activePage(doc);
      if (!doc || !page) return;
      get().dispatch(cmdObjects(doc.id, page.id, page.objects,
        page.objects.map((o) => (o.id === after.id ? after : o)), label ?? "Modify object"));
    },

    setSelection: (ids) => set({ selection: ids }),
    selectOnly: (id) => set({ selection: [id] }),
    toggleSelect: (id) => {
      const s = get().selection;
      set({ selection: s.includes(id) ? s.filter((x) => x !== id) : [...s, id] });
    },
    clearSelection: () => set({ selection: [] }),
    selectAll: () => {
      const doc = activeDoc(get()); const page = activePage(doc);
      if (!page) return;
      set({ selection: page.objects.filter((o) => o.visible && !o.locked).map((o) => o.id) });
    },
    setEditing: (id) => set({ editingId: id }),

    setTool: (tool) => set({ tool, editingId: null }),
    setSpaceHeld: (spaceHeld) => set({ spaceHeld }),

    setInkSetting: (tool, patch) => {
      const next = { ...get().inkSettings, [tool]: { ...get().inkSettings[tool], ...patch } };
      set({ inkSettings: next });
      try { localStorage.setItem("cp:ink", JSON.stringify(next)); } catch {}
    },

    addSwatch: (color) => {
      const next = [color, ...get().swatches.filter((c) => c.toLowerCase() !== color.toLowerCase())]
        .slice(0, 18);
      set({ swatches: next });
      try { localStorage.setItem("cp:swatches", JSON.stringify(next)); } catch {}
    },

    setPageSheet: (pageId, patch, label) => {
      const doc = activeDoc(get());
      if (!doc) return;
      const after = doc.pages.map((p) => (p.id === pageId ? { ...p, sheet: { ...p.sheet, ...patch } } : p));
      get().dispatch(cmdPages(doc.id, doc.pages, after, label ?? "Change sheet", doc.pageId));
    },
    setTheme: (theme) => {
      set({ theme });
      try { localStorage.setItem("cp:theme", theme); } catch {}
      if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
    },
    setGrid: (p) => {
      set(p);
      const s = get();
      try {
        localStorage.setItem("cp:gridShow", String(s.gridShow));
        localStorage.setItem("cp:gridSize", String(s.gridSize));
        localStorage.setItem("cp:gridStyle", s.gridStyle);
        localStorage.setItem("cp:snapGrid", String(s.snapGrid));
        localStorage.setItem("cp:snapObjects", String(s.snapObjects));
      } catch {}
    },
    setCamera: (cam) => {
      const { docs, activeDocId } = get();
      const doc = docs.find((d) => d.id === activeDocId);
      if (!doc) return;
      const camera = { ...doc.camera, ...cam };
      camera.zoom = clamp(camera.zoom, ZOOM_MIN, ZOOM_MAX);
      set({ docs: docs.map((d) => (d.id === doc.id ? { ...d, camera } : d)) });
    },
    zoomAt: (zoom, cx, cy) => {
      const doc = activeDoc(get());
      if (!doc) return;
      const st = get();
      const { viewport } = st;
      const px = cx ?? viewport.w / 2, py = cy ?? viewport.h / 2;
      const old = doc.camera;
      const next = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
      const scale = next / old.zoom;
      st.setCamera({
        zoom: next,
        x: px - (px - old.x) * scale,
        y: py - (py - old.y) * scale,
      });
    },
    setViewport: (w, h) => set({ viewport: { w, h } }),
    setPointer: (x, y) => set({ pointer: { x, y } }),

    copySelection: (cut) => {
      const { selection } = get();
      const doc = activeDoc(get()); const page = activePage(doc);
      if (!page || selection.length === 0) return;
      const objs = page.objects.filter((o) => selection.includes(o.id));
      setClipboard(objs.map((o) => ({ ...o, points: o.points ? [...o.points] : undefined })));
      
      try { navigator.clipboard?.writeText("__SADAS_CANVAS_OBJECTS__").catch(() => {}); } catch {}

      if (cut) get().removeObjects(selection, "Cut");
      else get().showToast(`${objs.length} object${objs.length > 1 ? "s" : ""} copied`);
    },

    pasteClipboard: () => {
      const clip = getClipboard();
      if (clip.length === 0) return;
      const pasted = clip.map((o) => cloneObject(o, 20, 20));
      setClipboard(pasted.map((o) => ({ ...o, points: o.points ? [...o.points] : undefined })));
      get().addObjects(pasted, "Paste");
    },

    duplicateSelection: () => {
      const { selection } = get();
      const doc = activeDoc(get()); const page = activePage(doc);
      if (!page || selection.length === 0) return;
      const dups = page.objects.filter((o) => selection.includes(o.id)).map((o) => cloneObject(o, 16, 16));
      get().addObjects(dups, "Duplicate");
    },

    setActivePage: (pageId) => {
      const { docs, activeDocId } = get();
      set({
        docs: docs.map((d) => (d.id === activeDocId ? { ...d, pageId } : d)),
        selection: [], editingId: null,
      });
    },

    addPage: (afterPageId) => {
      const doc = activeDoc(get());
      if (!doc) return;
      // New sheets inherit the current sheet's size/orientation, and land
      // straight after it so decks build in reading order (Canva-style).
      const anchorId = afterPageId ?? doc.pageId;
      const anchor = doc.pages.find((p) => p.id === anchorId) ?? activePage(doc);
      const page = makePage(undefined, anchor?.sheet);
      const idx = doc.pages.findIndex((p) => p.id === anchorId);
      const after = [...doc.pages];
      after.splice(idx >= 0 ? idx + 1 : after.length, 0, page);
      get().dispatch(cmdPages(doc.id, doc.pages, after, "Add sheet", page.id));
    },

    duplicatePage: (pageId) => {
      const doc = activeDoc(get());
      if (!doc) return;
      const src = doc.pages.find((p) => p.id === pageId);
      if (!src) return;
      const copy: Page = {
        ...src, id: uid(), name: src.name + " copy",
        objects: src.objects.map((o) => ({ ...o, id: uid(), points: o.points ? [...o.points] : undefined })),
      };
      const idx = doc.pages.findIndex((p) => p.id === pageId);
      const after = [...doc.pages]; after.splice(idx + 1, 0, copy);
      get().dispatch(cmdPages(doc.id, doc.pages, after, "Duplicate page", copy.id));
    },

    renamePage: (pageId, name) => {
      const doc = activeDoc(get());
      if (!doc) return;
      const after = doc.pages.map((p) => (p.id === pageId ? { ...p, name } : p));
      get().dispatch(cmdPages(doc.id, doc.pages, after, "Rename page", pageId));
    },

    deletePage: (pageId) => {
      const doc = activeDoc(get());
      if (!doc || doc.pages.length <= 1) return;
      const after = doc.pages.filter((p) => p.id !== pageId);
      const nextActive = doc.pageId === pageId
        ? doc.pages[Math.max(0, doc.pages.findIndex((p) => p.id === pageId) - 1)]?.id
        : doc.pageId;
      get().dispatch(cmdPages(doc.id, doc.pages, after, "Delete page", nextActive));
    },

    movePage: (pageId, dir) => {
      const doc = activeDoc(get());
      if (!doc) return;
      const idx = doc.pages.findIndex((p) => p.id === pageId);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= doc.pages.length) return;
      const after = [...doc.pages];
      const [p] = after.splice(idx, 1); after.splice(to, 0, p);
      get().dispatch(cmdPages(doc.id, doc.pages, after, "Reorder page", pageId));
    },

    setActiveDoc: (docId) => set({ activeDocId: docId, selection: [], editingId: null }),

    newDocument: () => {
      const doc = makeDocument();
      set({ docs: [...get().docs, doc], activeDocId: doc.id, selection: [], editingId: null });
    },

    openDocument: (doc) => {
      const { docs } = get();
      const exists = docs.some((d) => d.id === doc.id);
      set({
        docs: exists ? docs.map((d) => (d.id === doc.id ? doc : d)) : [...docs, doc],
        activeDocId: doc.id, selection: [], editingId: null,
      });
    },

    closeDocument: (docId) => {
      const { docs, activeDocId, dirty } = get();
      if (docs.length <= 1) { get().newDocument(); return; }
      const idx = docs.findIndex((d) => d.id === docId);
      const after = docs.filter((d) => d.id !== docId);
      history.clear(docId);
      const nextDirty = { ...dirty }; delete nextDirty[docId];
      set({
        docs: after,
        dirty: nextDirty,
        activeDocId: activeDocId === docId
          ? after[Math.min(idx, after.length - 1)].id : activeDocId,
      });
      syncHistoryLabels();
      pruneSelection();
    },

    renameDocument: (docId, name) => {
      const { docs, dirty } = get();
      set({
        docs: docs.map((d) => (d.id === docId ? { ...d, name } : d)),
        dirty: { ...dirty, [docId]: true },
      });
    },

    setFlag: (k, v) => {
      set({ [k]: v } as any);
      if (k === "sheetsBarVisible") {
        try { localStorage.setItem("cp:sheetsBar", String(v)); } catch {}
      }
    },
    setAutosave: (sec) => {
      set({ autosaveSec: sec });
      try { localStorage.setItem("cp:autosave", String(sec)); } catch {}
    },
    setSpellcheck: (v) => {
      set({ spellcheck: v });
      try { localStorage.setItem("cp:spellcheck", String(v)); } catch {}
    },
    markSaved: () => {
      const { dirty, activeDocId } = get();
      const next = { ...dirty }; delete next[activeDocId];
      set({ dirty: next, lastSaved: Date.now() });
    },
    setPresenting: (presenting) =>
      set({ presenting, selection: [], editingId: null, tool: "select" }),
    setPlaying: (playing) => set({ playing }),
    setPlaybackTime: (playbackTime) => set({ playbackTime }),
    setPendingLink: (url) => set({ pendingLink: url }),
    setOnline: (online) => set({ online }),
    showToast: (msg) => set({ toast: msg, toastTs: Date.now() }),

    loadDocs: (docs, activeId) => {
      history.clear();
      set({
        docs, activeDocId: activeId ?? docs[0].id,
        selection: [], editingId: null, dirty: {},
      });
      syncHistoryLabels();
    },
  };
});

// ── Non-reactive helpers ─────────────────────────────────────────────────────

export function activeDoc(s: { docs: CanvasDocument[]; activeDocId: ID }): CanvasDocument | null {
  return s.docs.find((d) => d.id === s.activeDocId) ?? null;
}
export function activePage(doc: CanvasDocument | null): Page | null {
  if (!doc) return null;
  return doc.pages.find((p) => p.id === doc.pageId) ?? doc.pages[0] ?? null;
}
export function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

export function selectionBounds(objects: CanvasObject[], ids: ID[]): Bounds | null {
  const set = new Set(ids);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objects) {
    if (!set.has(o.id)) continue;
    minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.width); maxY = Math.max(maxY, o.y + o.height);
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function contentBounds(page: Page | null): Bounds | null {
  if (!page || page.objects.length === 0) return null;
  return selectionBounds(page.objects, page.objects.map((o) => o.id));
}

function readBool(key: string, def: boolean): boolean {
  try { const v = localStorage.getItem(key); return v == null ? def : v === "true"; } catch { return def; }
}
function readNum(key: string, def: number): number {
  try { const v = localStorage.getItem(key); const n = v == null ? NaN : Number(v); return isFinite(n) ? n : def; } catch { return def; }
}
function readInk(): InkSettings {
  try {
    const raw = localStorage.getItem("cp:ink");
    if (!raw) return { ...DEFAULT_INK };
    const parsed = JSON.parse(raw);
    const pick = (k: InkTool): InkSetting => ({
      color: typeof parsed?.[k]?.color === "string" ? parsed[k].color : DEFAULT_INK[k].color,
      width: isFinite(Number(parsed?.[k]?.width)) ? Number(parsed[k].width) : DEFAULT_INK[k].width,
    });
    return { pen: pick("pen"), pencil: pick("pencil"), highlighter: pick("highlighter") };
  } catch { return { ...DEFAULT_INK }; }
}

function readTheme(): "dark" | "light" {
  try { return localStorage.getItem("cp:theme") === "light" ? "light" : "dark"; } catch { return "dark"; }
}

function readSwatches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem("cp:swatches") || "[]");
    return Array.isArray(raw) ? raw.filter((c) => typeof c === "string").slice(0, 18) : [];
  } catch { return []; }
}

function readGridStyle(): GridStyle {
  try {
    return localStorage.getItem("cp:gridStyle") === "lines" ? "lines" : "dots";
  } catch { return "dots"; }
}
