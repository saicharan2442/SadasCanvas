// ─────────────────────────────────────────────────────────────────────────────
// Dialogs — About/Help, Settings, Create Numbered Rows, Recovery banner.
// Note: deliberately NO AI settings section — Sadas Canvas has zero AI features.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { X, Info, Keyboard, ShieldCheck, Link as LinkIcon } from "lucide-react";
import { useStore, activeDoc, activePage } from "../core/store";
import { buildNumberedRows } from "../core/text";
import { makeDocument, makeObject, isDarkColor } from "../core/factory";
import { removeBackground, removeBackgroundPreview } from "../editor/bgremove";
import { clearSession, deserializeDocument, readBackups, pushBackup } from "../core/fileio";
import {
  isInfinite, sanitizeUrl, prettyUrl,
  type CanvasDocument, type CanvasObject,
} from "../core/types";

function Modal({ title, icon, onClose, children, wide, foot }: {
  title: string; icon?: React.ReactNode; onClose: () => void;
  children: React.ReactNode; wide?: boolean; foot?: React.ReactNode;
}) {
  return (
    <div className="overlay-backdrop" onMouseDown={onClose}>
      <div className={"dialog" + (wide ? " wide" : "")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          {icon}
          {title}
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} title="Close (Esc)"><X size={14} /></button>
        </div>
        <div className="dialog-body" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
          {children}
        </div>
        {foot && <div className="dialog-foot">{foot}</div>}
      </div>
    </div>
  );
}

// ── About & shortcuts ────────────────────────────────────────────────────────

const SHORTCUTS: [string, string][] = [
  ["Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S", "New / Open / Save / Save As"],
  ["Ctrl+W · Ctrl+Tab", "Close tab · Next tab"],
  ["Ctrl+Z · Ctrl+Y", "Undo · Redo"],
  ["Ctrl+C / X / V / D", "Copy / Cut / Paste / Duplicate"],
  ["Ctrl+A · Esc", "Select all · Deselect"],
  ["Ctrl+F", "Find & replace"],
  ["Ctrl+G · Ctrl+Shift+G", "Group · Ungroup"],
  ["Ctrl+B / I / U", "Bold / Italic / Underline"],
  ["Ctrl+K", "Insert / edit link"],
  ["I", "Eyedropper (pick colour)"],
  ["Select image → Tools → Remove BG", "Offline background removal"],
  ["Delete", "Delete selection"],
  ["Tab · Shift+Tab", "Cycle selection"],
  ["Arrows · Shift+Arrows", "Nudge 1px · 10px"],
  ["Alt+drag", "Duplicate while dragging"],
  ["Wheel", "Scroll sheet up / down"],
  ["Shift+wheel", "Scroll sheet left / right"],
  ["Ctrl+wheel", "Zoom (25–400%)"],
  ["Space+drag · Middle-drag", "Pan"],
  ["V H T S R O L A P E", "Tools"],
  ["[ ] · Ctrl+[ ]", "Send backward/forward · to back/front"],
  ["Ctrl+0 · Ctrl+Shift+0", "Actual size · Fit to screen"],
  ["Ctrl+1 · Ctrl+.", "Fit sheet to screen · Recenter view"],
  ["Ctrl+Enter", "Add sheet after current"],
  ["Page Up · Page Down", "Previous sheet · Next sheet"],
  ["F5 · Shift+F5", "Present from first / current sheet"],
  ["→ ← Space · G · Esc", "Slideshow: next / back · all sheets · exit"],
  ["Ctrl+Shift+P", "Command palette"],
  ["F · F11", "Distraction-free · Full screen"],
];

export function AboutDialog() {
  const onClose = () => useStore.getState().setFlag("aboutOpen", false);
  return (
    <Modal title="About Sadas Canvas" icon={<Info size={14} />} onClose={onClose} wide
      foot={<button className="mini-btn accent" onClick={onClose}>OK</button>}>
      <p style={{ marginTop: 0 }}>
        <strong style={{ color: "var(--text)" }}>Sadas Canvas</strong> — a lightweight, free-form canvas
        combining note-taking simplicity with a design-tool object canvas.
      </p>
      <div className="settings-row" style={{ paddingTop: 0 }}>
        <ShieldCheck size={16} style={{ color: "var(--ok)", flex: "none" }} />
        <div className="settings-label" style={{ color: "var(--text-2)" }}>
          Fully offline. No network calls, no telemetry, no updates, no AI features.
          Documents are plain JSON <code>.sadas</code> files saved on this machine;
          sessions and rotating backups live in local browser storage only.
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
        <Keyboard size={14} />
        <strong style={{ color: "var(--text)" }}>Keyboard shortcuts</strong>
      </div>
      <div className="shortcut-grid">
        {SHORTCUTS.map(([keys, desc]) => (
          <React.Fragment key={keys}>
            <span>{desc}</span>
            <span style={{ textAlign: "right" }}>
              {keys.split(" · ").map((k, i) => (
                <span key={i} className="kbd" style={{ marginLeft: 4 }}>{k}</span>
              ))}
            </span>
          </React.Fragment>
        ))}
      </div>
    </Modal>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function SettingsDialog() {
  const theme = useStore((s) => s.theme);
  const autosaveSec = useStore((s) => s.autosaveSec);
  const spellcheck = useStore((s) => s.spellcheck);
  const gridShow = useStore((s) => s.gridShow);
  const gridSize = useStore((s) => s.gridSize);
  const gridStyle = useStore((s) => s.gridStyle);
  const snapGrid = useStore((s) => s.snapGrid);
  const snapObjects = useStore((s) => s.snapObjects);
  const doc = useStore((s) => activeDoc(s));
  const onClose = () => useStore.getState().setFlag("settingsOpen", false);
  const st = useStore.getState;
  const backups = doc ? readBackups(doc.id) : [];

  return (
    <Modal title="Settings" onClose={onClose} wide
      foot={<button className="mini-btn accent" onClick={onClose}>Done</button>}>

      <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>General</div>
      <div className="settings-row">
        <div className="settings-label">Theme
          <div className="settings-desc">Compact Windows-style UI, light or dark.</div>
        </div>
        <select className="sel-input" style={{ width: 120 }} value={theme}
          onChange={(e) => st().setTheme(e.currentTarget.value as "dark" | "light")}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
      <div className="settings-row">
        <div className="settings-label">Spell check while editing
          <div className="settings-desc">Uses the built-in browser spell checker.</div>
        </div>
        <input type="checkbox" checked={spellcheck} onChange={(e) => st().setSpellcheck(e.currentTarget.checked)} />
      </div>
      <div className="settings-row">
        <div className="settings-label">Auto-save backup interval
          <div className="settings-desc">
            Writes the session to local storage and keeps the last 3 rotating backups per document.
          </div>
        </div>
        <select className="sel-input" style={{ width: 120 }} value={autosaveSec}
          onChange={(e) => st().setAutosave(Number(e.currentTarget.value))}>
          <option value={0}>Off</option>
          <option value={30}>30 seconds</option>
          <option value={60}>1 minute</option>
          <option value={300}>5 minutes</option>
          <option value={600}>10 minutes</option>
        </select>
      </div>

      <div style={{ fontWeight: 600, color: "var(--text)", margin: "14px 0 4px" }}>Canvas</div>
      <div className="settings-row">
        <div className="settings-label">Show grid</div>
        <input type="checkbox" checked={gridShow} onChange={(e) => st().setGrid({ gridShow: e.currentTarget.checked })} />
      </div>
      <div className="settings-row">
        <div className="settings-label">Grid style
          <div className="settings-desc">Dot grid (default) or classic ruled lines.</div>
        </div>
        <select className="sel-input" style={{ width: 120 }} value={gridStyle}
          onChange={(e) => st().setGrid({ gridStyle: e.currentTarget.value as "dots" | "lines" })}>
          <option value="dots">Dots</option>
          <option value="lines">Lines</option>
        </select>
      </div>
      <div className="settings-row">
        <div className="settings-label">Grid spacing</div>
        <select className="sel-input" style={{ width: 120 }} value={gridSize}
          onChange={(e) => st().setGrid({ gridSize: Number(e.currentTarget.value) })}>
          {[5, 10, 20, 50].map((g) => <option key={g} value={g}>{g} px</option>)}
        </select>
      </div>
      <div className="settings-row">
        <div className="settings-label">Snap to grid</div>
        <input type="checkbox" checked={snapGrid} onChange={(e) => st().setGrid({ snapGrid: e.currentTarget.checked })} />
      </div>
      <div className="settings-row">
        <div className="settings-label">Snap to objects (alignment guides)</div>
        <input type="checkbox" checked={snapObjects} onChange={(e) => st().setGrid({ snapObjects: e.currentTarget.checked })} />
      </div>

      <div style={{ fontWeight: 600, color: "var(--text)", margin: "14px 0 4px" }}>Files & recovery</div>
      <div className="settings-row">
        <div className="settings-label">Backups for “{doc?.name ?? "—"}”
          <div className="settings-desc">
            {backups.length === 0
              ? "No backups yet — backups are created on Save and by auto-save."
              : "Restore a previous state of this document."}
          </div>
          {backups.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {backups.map((b, i) => (
                <button key={b.ts} className="mini-btn"
                  onClick={() => {
                    try {
                      const restored: CanvasDocument = deserializeDocument(b.json);
                      restored.id = doc!.id;
                      st().openDocument(restored);
                      pushBackup(restored);
                      st().showToast(`Restored backup #${i + 1}`);
                      onClose();
                    } catch { st().showToast("Backup is not readable."); }
                  }}>
                  {new Date(b.ts).toLocaleTimeString()} — restore
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-label">Reset local session
          <div className="settings-desc">Clears stored session data on this machine and starts fresh.</div>
        </div>
        <button className="mini-btn"
          onClick={() => {
            clearSession();
            const fresh = makeDocument();
            st().loadDocs([fresh], fresh.id);
            st().showToast("Session cleared");
            onClose();
          }}>
          Clear…
        </button>
      </div>

      <div style={{ fontWeight: 600, color: "var(--text)", margin: "14px 0 4px" }}>Shortcuts</div>
      <div className="settings-row">
        <div className="settings-label">Keyboard shortcuts
          <div className="settings-desc">Fixed set — listed under Help → Keyboard Shortcuts.</div>
        </div>
        <button className="mini-btn" onClick={() => { onClose(); st().setFlag("aboutOpen", true); }}>
          View…
        </button>
      </div>
    </Modal>
  );
}

// ── Create numbered rows ─────────────────────────────────────────────────────

export function RowsDialog() {
  const [count, setCount] = useState(20);
  const [numbered, setNumbered] = useState(true);
  const [start, setStart] = useState(1);
  const onClose = () => useStore.getState().setFlag("rowsOpen", false);

  const create = () => {
    const text = buildNumberedRows({ count, numbered, start, zeroBased: start === 0 });
    if (!text) { onClose(); return; }
    const st = useStore.getState();
    const doc = activeDoc(st);
    const cam = doc?.camera ?? { x: 0, y: 0, zoom: 1 };
    const { viewport } = st;
    const x = (viewport.w / 2 - cam.x) / cam.zoom - 90;
    const y = (viewport.h / 2 - cam.y) / cam.zoom - 140;
    const page = activePage(doc);
    const obj = makeObject("text", x, y, {
      text,
      width: 240,
      dark: !page || isInfinite(page.sheet)
        ? st.theme === "dark"
        : isDarkColor(page.sheet.background),
    });
    obj.fontFamily = "Consolas";
    obj.fontSize = 15;
    obj.lineHeight = 1.5;
    st.addObjects([obj], `Create ${count} rows`);
    onClose();
    // Let the modal unmount before the canvas editor requests focus.
    requestAnimationFrame(() => useStore.getState().setEditing(obj.id));
  };

  return (
    <Modal title="Create numbered rows" onClose={onClose}
      foot={
        <>
          <button className="mini-btn" onClick={onClose}>Cancel</button>
          <button className="mini-btn accent" onClick={create}>Insert</button>
        </>
      }>
      <div className="prop-grid" style={{ rowGap: 10 }}>
        <div className="prop-row">
          <span className="prop-label wide">Rows</span>
          <input type="number" className="num-input" min={1} max={5000} value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(5000, Number(e.currentTarget.value) || 1)))} autoFocus />
        </div>
        <div className="prop-row">
          <span className="prop-label wide">Start #</span>
          <input type="number" className="num-input" min={0} value={start} disabled={!numbered}
            onChange={(e) => setStart(Math.max(0, Number(e.currentTarget.value) || 0))} />
        </div>
        <div className="prop-row full">
          <label className="check">
            <input type="checkbox" checked={numbered} onChange={(e) => setNumbered(e.currentTarget.checked)} />
            Prefix rows with line numbers
          </label>
        </div>
      </div>
      <div style={{ marginTop: 12, color: "var(--text-3)", fontSize: 11, lineHeight: 1.6 }}>
        Inserts exactly N editable text rows. Example: start 10 with 20 rows gives 10…29.
        Use start 0 for zero-based numbering; numbers continue for any start value.
      </div>
    </Modal>
  );
}

// ── Insert / edit link (Ctrl+K) ──────────────────────────────────────────────

export function LinkDialog() {
  const selection = useStore((s) => s.selection);
  const page = useStore((s) => activePage(activeDoc(s)));
  const target = page?.objects.find((o) => selection.includes(o.id));
  // Attach to the selected object, or drop a new link card when nothing is selected.
  const attaching = !!target;

  const [url, setUrl] = useState(target?.link ?? "");
  const [title, setTitle] = useState(
    target && target.type === "link" ? target.text : target ? "" : "",
  );
  const [error, setError] = useState<string | null>(null);
  const onClose = () => useStore.getState().setFlag("linkOpen", false);

  const submit = () => {
    const clean = sanitizeUrl(url);
    if (!clean) {
      setError("Enter a valid http(s) or mailto address.");
      return;
    }
    const st = useStore.getState();
    if (target) {
      const patch: Partial<CanvasObject> = { link: clean };
      if (target.type === "link") patch.text = title.trim() || prettyUrl(clean);
      st.updateObjects([target.id], patch, "Set link");
      st.showToast("Link attached");
    } else {
      const doc = activeDoc(st);
      const cam = doc?.camera ?? { x: 0, y: 0, zoom: 1 };
      const { viewport } = st;
      const obj = makeObject(
        "link",
        (viewport.w / 2 - cam.x) / cam.zoom - 150,
        (viewport.h / 2 - cam.y) / cam.zoom - 48,
        {
          dark: st.theme === "dark",
          text: title.trim() || prettyUrl(clean),
          link: clean,
        },
      );
      st.addObjects([obj], "Add link card");
    }
    onClose();
  };

  return (
    <Modal
      title={attaching ? "Link selected object" : "Insert link card"}
      icon={<LinkIcon size={14} />}
      onClose={onClose}
      foot={
        <>
          {target?.link && (
            <button className="mini-btn" style={{ marginRight: "auto" }}
              onClick={() => {
                useStore.getState().updateObjects([target.id], { link: undefined }, "Remove link");
                onClose();
              }}>
              Remove link
            </button>
          )}
          <button className="mini-btn" onClick={onClose}>Cancel</button>
          <button className="mini-btn accent" onClick={submit}>
            {attaching ? "Attach" : "Insert"}
          </button>
        </>
      }
    >
      <div className="prop-grid" style={{ rowGap: 10 }}>
        <div className="prop-row full">
          <span className="prop-label wide">URL</span>
          <input
            className="text-input"
            placeholder="example.com or https://example.com"
            value={url}
            autoFocus
            spellCheck={false}
            onChange={(e) => { setUrl(e.currentTarget.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
        </div>
        {(!attaching || target?.type === "link") && (
          <div className="prop-row full">
            <span className="prop-label wide">Title</span>
            <input
              className="text-input"
              placeholder="Optional label"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </div>
        )}
      </div>
      {error && <div style={{ color: "var(--danger)", marginTop: 10 }}>{error}</div>}
      <div style={{ marginTop: 12, color: "var(--text-3)", fontSize: 11, lineHeight: 1.6 }}>
        Only http, https and mailto addresses are accepted. Links are stored in
        the document and never opened automatically — double-click a link card
        (or use Open Link) and confirm before your browser visits it.
      </div>
    </Modal>
  );
}

// ── Confirm before leaving the app to visit a link ───────────────────────────

export function LinkConfirmDialog() {
  const url = useStore((s) => s.pendingLink);
  if (!url) return null;
  const onClose = () => useStore.getState().setPendingLink(null);
  return (
    <Modal title="Open external link?" icon={<LinkIcon size={14} />} onClose={onClose}
      foot={
        <>
          <button className="mini-btn" onClick={onClose}>Cancel</button>
          <button className="mini-btn accent"
            onClick={() => {
              window.open(url, "_blank", "noopener,noreferrer");
              onClose();
            }}>
            Open in browser
          </button>
        </>
      }>
      <p style={{ marginTop: 0 }}>This opens outside Sadas Canvas:</p>
      <p style={{
        wordBreak: "break-all", color: "var(--text)",
        background: "var(--panel-3)", padding: "8px 10px", borderRadius: 8,
      }}>
        {url}
      </p>
      <p style={{ marginBottom: 0 }}>
        Sadas Canvas itself stays offline — nothing is sent anywhere. Opening a link
        hands it to your browser and needs an internet connection to load.
      </p>
    </Modal>
  );
}

// ── Background remover dialog ────────────────────────────────────────────────

export function BgRemoveDialog() {
  const selection = useStore((s) => s.selection);
  const page = useStore((s) => activePage(activeDoc(s)));
  const target = page?.objects.find((o) => selection.includes(o.id) && o.type === "image");
  const onClose = () => useStore.getState().setFlag("bgRemoveOpen", false);

  const [tolerance, setTolerance] = useState(30);
  const [feather, setFeather] = useState(1);
  const [edgeFlood, setEdgeFlood] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"auto" | "brush">("auto");
  const [brushSize, setBrushSize] = useState(24);
  const [brushMode, setBrushMode] = useState<"erase" | "restore">("erase");
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const brushCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const brushWrapRef = useRef<HTMLDivElement | null>(null);
  // The *original* unmodified pixels — Restore always reads from this.
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const brushImgRef = useRef<HTMLImageElement | null>(null);
  const isPainting = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!target?.src) return;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      imgRef.current = im;
      brushImgRef.current = im;
      setupBrushCanvas(im);
      updatePreview(im);
    };
    im.src = target.src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.src]);

  /** Set up both the editable canvas and the read-only original copy. */
  const setupBrushCanvas = (im: HTMLImageElement) => {
    const MAX = 400;
    const scale = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.round(im.naturalWidth * scale);
    const h = Math.round(im.naturalHeight * scale);

    // Editable canvas
    const c = brushCanvasRef.current;
    if (c) {
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(im, 0, 0, w, h);
    }

    // Snapshot of the original — never modified, used by Restore.
    if (!originalCanvasRef.current) originalCanvasRef.current = document.createElement("canvas");
    const oc = originalCanvasRef.current;
    oc.width = w; oc.height = h;
    oc.getContext("2d")!.drawImage(im, 0, 0, w, h);
  };

  const updatePreview = async (im?: HTMLImageElement) => {
    const img = im ?? imgRef.current;
    if (!img) return;
    setLoading(true);
    try {
      setPreviewUrl(await removeBackgroundPreview(img, { tolerance, feather, edgeFlood }));
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => updatePreview(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tolerance, feather, edgeFlood]);

  /** Load the auto-remove result onto the brush canvas for manual refinement. */
  const loadAutoResult = () => {
    if (!previewUrl) return;
    const pm = new Image();
    pm.onload = () => {
      const c = brushCanvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(pm, 0, 0, c.width, c.height);
    };
    pm.src = previewUrl;
  };

  // ── Brush painting ────────────────────────────────────────────────────────
  //
  // Instead of reading all pixels per stroke, we use canvas compositing:
  //  • Erase  → draw a circle with `globalCompositeOperation = "destination-out"`
  //  • Restore → draw the original pixels under a circle clip

  /** Convert a DOM pointer event to canvas-pixel coordinates, accounting for zoom + pan. */
  const getCanvasXY = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const c = brushCanvasRef.current;
    const wrap = brushWrapRef.current;
    if (!c || !wrap) return null;

    let clientX: number, clientY: number;
    if ("touches" in e && e.touches.length) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("clientX" in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    } else return null;

    // Position relative to the scrollable wrapper's top-left.
    const wrapRect = wrap.getBoundingClientRect();
    const relX = clientX - wrapRect.left;
    const relY = clientY - wrapRect.top;

    // Undo the CSS transform: translate(panOffset) then scale(zoom).
    // The canvas origin in wrapper space is at panOffset, and it's scaled by zoom.
    // So canvas pixel = (wrapperPx - panOffset) / zoom  * (canvasNativePx / canvasCSSpx)
    // But because we set transformOrigin to "0 0" and the canvas has no max-width
    // constraint inside the transform, canvasCSSpx = canvasNativePx at zoom=1.
    const canvasX = (relX - panOffset.x) / zoom;
    const canvasY = (relY - panOffset.y) / zoom;

    return { x: canvasX, y: canvasY };
  };

  /** Paint a single circle at (px,py) in canvas coordinates. */
  const paintAt = (px: number, py: number) => {
    const c = brushCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    // brushSize is in "screen" pixels at zoom=1. Convert to canvas pixels.
    const r = brushSize * 0.5;

    if (brushMode === "erase") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // Restore: stamp the original pixels through a circular clip.
      const oc = originalCanvasRef.current;
      if (!oc) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(oc, 0, 0);
      ctx.restore();
    }
  };

  /** Draw circles along the line from lastPt to pt so there are no gaps. */
  const paintLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const r = brushSize * 0.5;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const step = Math.max(1, r * 0.3); // overlap for smooth coverage
    const steps = Math.ceil(dist / step);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      paintAt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    }
  };

  const onPointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pt = getCanvasXY(e);
    if (!pt) return;
    isPainting.current = true;
    lastPt.current = pt;
    paintAt(pt.x, pt.y);
  };

  const onPointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isPainting.current) return;
    if ("preventDefault" in e) e.preventDefault();
    const pt = getCanvasXY(e);
    if (!pt) return;
    if (lastPt.current) paintLine(lastPt.current, pt);
    else paintAt(pt.x, pt.y);
    lastPt.current = pt;
  };

  const onPointerUp = () => { isPainting.current = false; lastPt.current = null; };

  // ── Apply ─────────────────────────────────────────────────────────────────

  const apply = async () => {
    if (mode === "brush") {
      const c = brushCanvasRef.current;
      const origImg = brushImgRef.current;
      if (!c || !origImg) return;
      // Scale the small brush canvas back up to the original resolution.
      const out = document.createElement("canvas");
      out.width = origImg.naturalWidth; out.height = origImg.naturalHeight;
      out.getContext("2d")!.drawImage(c, 0, 0, out.width, out.height);
      const st = useStore.getState();
      st.updateObjects([target!.id], { src: out.toDataURL("image/png") }, "Remove background (brush)");
      st.showToast("Background removed");
      onClose();
      return;
    }
    const img = imgRef.current;
    if (!img || !target) return;
    setLoading(true);
    try {
      const url = await removeBackground(img, { tolerance, feather, edgeFlood });
      const st = useStore.getState();
      st.updateObjects([target.id], { src: url }, "Remove background");
      st.showToast("Background removed");
      onClose();
    } catch (e: any) {
      useStore.getState().showToast(e?.message ?? "Background removal failed");
    }
    setLoading(false);
  };

  // ── Cursor ────────────────────────────────────────────────────────────────

  const brushCursor = (() => {
    const d = Math.max(6, Math.min(120, brushSize));
    const half = Math.round(d / 2 + 2);
    const strokeCol = brushMode === "erase" ? "%23ff3333" : "%2322cc22";
    const fillCol = brushMode === "erase" ? "%23ff333322" : "%2322cc2222";
    const svg =
      `%3Csvg xmlns='http://www.w3.org/2000/svg' width='${d + 4}' height='${d + 4}'%3E` +
      `%3Ccircle cx='${half}' cy='${half}' r='${d / 2}' fill='${fillCol}' stroke='${strokeCol}' stroke-width='1.5'/%3E` +
      `%3Ccircle cx='${half}' cy='${half}' r='1.5' fill='${strokeCol}'/%3E` +
      `%3C/svg%3E`;
    return `url("data:image/svg+xml;utf8,${svg}") ${half} ${half}, crosshair`;
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  if (!target) {
    return (
      <Modal title="Remove Background" onClose={onClose}
        foot={<button className="mini-btn accent" onClick={onClose}>OK</button>}>
        <p>Select an image first, then open this tool.</p>
      </Modal>
    );
  }

  return (
    <Modal title="Remove Background" onClose={onClose} wide
      foot={
        <>
          <button className="mini-btn" onClick={onClose}>Cancel</button>
          <button className="mini-btn accent" onClick={apply} disabled={loading}>
            {loading ? "Processing…" : "Apply"}
          </button>
        </>
      }>

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={mode === "auto" ? "on" : ""} onClick={() => setMode("auto")}>Auto Remove</button>
        <button className={mode === "brush" ? "on" : ""} onClick={() => {
          setMode("brush");
          setTimeout(() => { if (brushImgRef.current) setupBrushCanvas(brushImgRef.current); }, 60);
        }}>Brush Erase</button>
      </div>

      {mode === "auto" && (
        <>
          <div style={{ display: "flex", gap: 14, minHeight: 160 }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginBottom: 4 }}>Original</div>
              {target.src && (
                <img src={target.src} alt="original"
                  style={{ maxWidth: "100%", maxHeight: 150, borderRadius: 8, border: "1px solid var(--border)" }} />
              )}
            </div>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginBottom: 4 }}>Preview</div>
              <div className="checker-bg" style={{ display: "inline-block", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                {previewUrl ? (
                  <img src={previewUrl} alt="preview" style={{ maxWidth: "100%", maxHeight: 150, display: "block" }} />
                ) : (
                  <div style={{ width: 120, height: 90, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>
                    {loading ? "…" : "—"}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="prop-grid" style={{ marginTop: 14, rowGap: 10 }}>
            <div className="prop-row full adjust-row">
              <span className="adjust-label">Tolerance</span>
              <input type="range" className="prop-range" min={5} max={80} value={tolerance}
                onChange={(e) => setTolerance(Number(e.currentTarget.value))} />
              <span style={{ width: 30, textAlign: "right", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{tolerance}</span>
            </div>
            <div className="prop-row full adjust-row">
              <span className="adjust-label">Feather</span>
              <input type="range" className="prop-range" min={0} max={6} step={0.5} value={feather}
                onChange={(e) => setFeather(Number(e.currentTarget.value))} />
              <span style={{ width: 30, textAlign: "right", color: "var(--text-2)" }}>{feather}</span>
            </div>
            <div className="prop-row full">
              <label className="check">
                <input type="checkbox" checked={edgeFlood} onChange={(e) => setEdgeFlood(e.currentTarget.checked)} />
                Flood from edges (best for photos)
              </label>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
            Fully offline. Adjust Tolerance, then click Apply.
          </div>
        </>
      )}

      {mode === "brush" && (
        <>
          {/* ── Controls row ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <div className="seg" style={{ width: 160 }}>
              <button className={brushMode === "erase" ? "on" : ""} onClick={() => setBrushMode("erase")}>Erase</button>
              <button className={brushMode === "restore" ? "on" : ""} onClick={() => setBrushMode("restore")}>Restore</button>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-2)" }}>Size</span>
            <input type="range" className="prop-range" style={{ width: 70 }} min={4} max={80} value={brushSize}
              onChange={(e) => setBrushSize(Number(e.currentTarget.value))} />
            {/* Live circle preview */}
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30 }}>
              <span style={{
                width: Math.max(4, brushSize * 0.55), height: Math.max(4, brushSize * 0.55),
                borderRadius: "50%", display: "block",
                border: `2px solid ${brushMode === "erase" ? "#ff3333" : "#22cc22"}`,
                background: brushMode === "erase" ? "rgba(255,50,50,0.12)" : "rgba(34,204,34,0.12)",
                transition: "width 80ms, height 80ms",
              }} />
            </span>
            <span style={{ fontSize: 11, color: "var(--text-2)", width: 30 }}>{brushSize}px</span>

            {/* Zoom controls */}
            <span className="tsep" style={{ height: 16, margin: "0 4px" }} />
            <button className="icon-btn" title="Zoom out (Ctrl+scroll down)"
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
              disabled={zoom <= 0.5}>−</button>
            <span style={{
              fontSize: 11, color: "var(--text)", width: 40, textAlign: "center",
              fontVariantNumeric: "tabular-nums", cursor: "default",
            }}
              title="Click to reset zoom"
              onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}>
              {Math.round(zoom * 100)}%
            </span>
            <button className="icon-btn" title="Zoom in (Ctrl+scroll up)"
              onClick={() => setZoom((z) => Math.min(5, Math.round((z + 0.25) * 100) / 100))}
              disabled={zoom >= 5}>+</button>
            <button className="mini-btn" onClick={loadAutoResult} title="Run Auto Remove first, then refine with the brush">
              Auto → Brush
            </button>
          </div>

          {/* ── Zoomable / pannable canvas viewport ── */}
          <div
            ref={brushWrapRef}
            className="checker-bg"
            style={{
              borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)",
              height: 340, position: "relative", cursor: isPainting.current ? brushCursor : brushCursor,
            }}
            onWheel={(e) => {
              e.stopPropagation();
              if (e.ctrlKey || e.metaKey) {
                // Ctrl + scroll → zoom
                e.preventDefault();
                setZoom((z) => {
                  const next = z + (e.deltaY < 0 ? 0.15 : -0.15);
                  return Math.max(0.5, Math.min(5, Math.round(next * 100) / 100));
                });
              } else {
                // Plain scroll → pan
                setPanOffset((p) => ({
                  x: p.x - e.deltaX * 0.8,
                  y: p.y - e.deltaY * 0.8,
                }));
              }
            }}
            onMouseDown={(e) => {
              // Middle-click or Space for panning
              if (e.button === 1) {
                e.preventDefault();
                panStart.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
                return;
              }
              onPointerDown(e as any);
            }}
            onMouseMove={(e) => {
              if (panStart.current) {
                setPanOffset({
                  x: panStart.current.ox + (e.clientX - panStart.current.x),
                  y: panStart.current.oy + (e.clientY - panStart.current.y),
                });
                return;
              }
              onPointerMove(e as any);
            }}
            onMouseUp={() => {
              if (panStart.current) { panStart.current = null; return; }
              onPointerUp();
            }}
            onMouseLeave={() => { panStart.current = null; onPointerUp(); }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <canvas
              ref={brushCanvasRef}
              style={{
                cursor: brushCursor,
                display: "block",
                transformOrigin: "0 0",
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                touchAction: "none",
                imageRendering: zoom >= 2.5 ? "pixelated" : "auto",
              }}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
            <strong>Ctrl+Scroll</strong> to zoom in/out · <strong>Scroll</strong> to pan ·
            <strong> Middle-click drag</strong> to pan · Click the % to reset ·
            <strong> Erase</strong> = red · <strong>Restore</strong> = green
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Crash recovery banner ────────────────────────────────────────────────────

export function RecoveryBanner({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  return (
    <div className="recovery-banner">
      <ShieldCheck size={14} style={{ color: "var(--warn)" }} />
      <span style={{ flex: 1 }}>
        Sadas Canvas recovered your previous session after an unexpected shutdown.
      </span>
      <button className="mini-btn" onClick={onDiscard}>Discard</button>
      <button className="mini-btn accent" onClick={onKeep}>Keep recovered work</button>
    </div>
  );
}
