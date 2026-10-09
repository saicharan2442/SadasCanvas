// ─────────────────────────────────────────────────────────────────────────────
// Toolbar — tools left, document actions center, view controls right.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
  MousePointer2, Hand, Type, StickyNote, Square, Circle, Triangle, Star,
  Minus, ArrowUpRight, PenLine, Pencil, Highlighter, Eraser, Pipette, ImagePlus, Link2,
  Undo2, Redo2, LayoutGrid, Grip, Magnet, Crosshair, Plus, Maximize, LocateFixed, Scissors,
  PanelLeft, PanelRight, Sun, Moon, Squircle,
} from "lucide-react";
import { useStore, activeDoc, activePage } from "../core/store";
import { runAction } from "./actions";
import type { InkTool, Tool } from "../core/types";

const INK_SWATCHES = [
  "#e8ebf2", "#20242b", "#4c8dff", "#62c26d", "#f7d154",
  "#f26d6d", "#e84c88", "#8a5cff", "#2fbfa5", "#f7974c",
];

/**
 * Colour + thickness controls for the freehand tools. They appear inline in
 * the toolbar whenever a drawing tool is active, so pen/pencil/highlighter can
 * be configured before and between strokes.
 */
function InkOptions() {
  const tool = useStore((s) => s.tool);
  const inkSettings = useStore((s) => s.inkSettings);
  const setInkSetting = useStore((s) => s.setInkSetting);
  if (tool !== "pen" && tool !== "pencil" && tool !== "highlighter") return null;

  const key = tool as InkTool;
  const cur = inkSettings[key];
  const maxWidth = key === "highlighter" ? 60 : 24;

  return (
    <>
      <div className="tsep" />
      <div className="ink-options">
        <span className="ink-label">{key === "highlighter" ? "Highlighter" : key === "pen" ? "Pen" : "Pencil"}</span>
        <span className="color-swatch" title="Ink colour" style={{ width: 22, height: 22 }}>
          <span className="swatch-fill" style={{ background: cur.color }} />
          <input
            type="color" className="native-color" value={cur.color}
            onChange={(e) => setInkSetting(key, { color: e.currentTarget.value })}
          />
        </span>
        <span className="ink-swatches">
          {INK_SWATCHES.map((c) => (
            <button
              key={c}
              title={c}
              className={"ink-dot" + (cur.color.toLowerCase() === c.toLowerCase() ? " on" : "")}
              style={{ background: c }}
              onClick={() => setInkSetting(key, { color: c })}
            />
          ))}
        </span>
        <input
          type="range" className="prop-range ink-range"
          min={1} max={maxWidth} step={0.5} value={cur.width}
          title={`Thickness: ${cur.width}px`}
          onChange={(e) => setInkSetting(key, { width: parseFloat(e.currentTarget.value) })}
        />
        <span className="ink-width-readout">{cur.width}px</span>
      </div>
    </>
  );
}

const TOOL_DEFS: { tool: Tool; icon: React.ReactNode; title: string }[] = [
  { tool: "select", icon: <MousePointer2 size={16} strokeWidth={1.75} />, title: "Select (V)" },
  { tool: "pan", icon: <Hand size={16} strokeWidth={1.75} />, title: "Pan (H) — or hold Space" },
  { tool: "text", icon: <Type size={16} strokeWidth={1.75} />, title: "Text (T)" },
  { tool: "sticky", icon: <StickyNote size={16} strokeWidth={1.75} />, title: "Sticky Note (S)" },
  { tool: "rect", icon: <Square size={16} strokeWidth={1.75} />, title: "Rectangle (R)" },
  { tool: "roundrect", icon: <Squircle size={16} strokeWidth={1.75} />, title: "Rounded Rectangle" },
  { tool: "ellipse", icon: <Circle size={16} strokeWidth={1.75} />, title: "Ellipse (O)" },
  { tool: "triangle", icon: <Triangle size={16} strokeWidth={1.75} />, title: "Triangle" },
  { tool: "star", icon: <Star size={16} strokeWidth={1.75} />, title: "Star" },
  { tool: "line", icon: <Minus size={16} strokeWidth={1.75} />, title: "Line (L)" },
  { tool: "arrow", icon: <ArrowUpRight size={16} strokeWidth={1.75} />, title: "Arrow (A)" },
  { tool: "pen", icon: <PenLine size={16} strokeWidth={1.75} />, title: "Pen (P)" },
  { tool: "pencil", icon: <Pencil size={16} strokeWidth={1.75} />, title: "Pencil" },
  { tool: "highlighter", icon: <Highlighter size={16} strokeWidth={1.75} />, title: "Highlighter" },
  { tool: "eraser", icon: <Eraser size={16} strokeWidth={1.75} />, title: "Eraser (E)" },
  { tool: "eyedropper", icon: <Pipette size={16} strokeWidth={1.75} />, title: "Eyedropper (I) — pick a colour from the canvas" },
];

const BREAK_AFTER: Tool[] = ["pan", "sticky", "star", "arrow", "eyedropper"];

/** Only show the bg-remove button when an image is selected. */
function BgRemoveToolbarBtn() {
  const sel = useStore((s) => s.selection);
  const page = useStore((s) => activePage(activeDoc(s)));
  const hasImage = page?.objects.some((o) => sel.includes(o.id) && o.type === "image");
  if (!hasImage) return null;
  return (
    <button
      className="tbtn"
      title="Remove background from selected image"
      onClick={() => runAction("img.bgRemove")}
      style={{ color: "var(--accent)" }}
    >
      <Scissors size={16} strokeWidth={1.75} />
    </button>
  );
}

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const undoLabel = useStore((s) => s.undoLabel);
  const redoLabel = useStore((s) => s.redoLabel);
  const theme = useStore((s) => s.theme);
  const gridShow = useStore((s) => s.gridShow);
  const gridStyle = useStore((s) => s.gridStyle);
  const snapGrid = useStore((s) => s.snapGrid);
  const snapObjects = useStore((s) => s.snapObjects);
  const leftVisible = useStore((s) => s.leftVisible);
  const rightVisible = useStore((s) => s.rightVisible);
  const camera = useStore((s) => activeDoc(s)?.camera);
  const rawZoom = camera?.zoom ?? 1;
  const zoom = rawZoom < 0.1
    ? (rawZoom * 100).toFixed(1)
    : String(Math.round(rawZoom * 100));

  return (
    <div className="toolbar">
      {TOOL_DEFS.map(({ tool: t, icon, title }) => (
        <React.Fragment key={t}>
          <button
            className={"tbtn" + (tool === t ? " active" : "")}
            title={title}
            onClick={() => setTool(t)}
          >
            {icon}
          </button>
          {BREAK_AFTER.includes(t) && <div className="tsep" />}
        </React.Fragment>
      ))}

      <button className="tbtn" title="Insert image…" onClick={() => runAction("insert.image")}>
        <ImagePlus size={16} strokeWidth={1.75} />
      </button>
      <button className="tbtn" title="Insert link / URL (Ctrl+K)" onClick={() => runAction("insert.link")}>
        <Link2 size={16} strokeWidth={1.75} />
      </button>
      <BgRemoveToolbarBtn />

      <div className="tsep" />

      <button className="tbtn" title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : "Undo (Ctrl+Z)"}
        disabled={!undoLabel} onClick={() => runAction("edit.undo")}>
        <Undo2 size={16} strokeWidth={1.75} />
      </button>
      <button className="tbtn" title={redoLabel ? `Redo ${redoLabel} (Ctrl+Y)` : "Redo (Ctrl+Y)"}
        disabled={!redoLabel} onClick={() => runAction("edit.redo")}>
        <Redo2 size={16} strokeWidth={1.75} />
      </button>

      <InkOptions />

      <div className="toolbar-spacer" />

      <button
        className={"tbtn" + (gridShow ? " active" : "")}
        title={`Show ${gridStyle === "dots" ? "dot" : "line"} grid — right-click to switch to ${gridStyle === "dots" ? "lines" : "dots"}`}
        onClick={() => runAction("view.grid")}
        onContextMenu={(e) => { e.preventDefault(); runAction("view.gridToggleStyle"); }}
      >
        {gridStyle === "dots"
          ? <Grip size={16} strokeWidth={1.75} />
          : <LayoutGrid size={16} strokeWidth={1.75} />}
      </button>
      <button className={"tbtn" + (snapGrid ? " active" : "")} title="Snap to grid"
        onClick={() => runAction("view.snapGrid")}>
        <Crosshair size={16} strokeWidth={1.75} />
      </button>
      <button className={"tbtn" + (snapObjects ? " active" : "")} title="Snap to objects"
        onClick={() => runAction("view.snapObjects")}>
        <Magnet size={16} strokeWidth={1.75} />
      </button>

      <div className="tsep" />

      <div className="zoom-cluster">
        <button className="tbtn" title="Zoom out (Ctrl+-)" onClick={() => runAction("view.zoomOut")}
          style={{ transform: "scale(0.9)" }}>
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <button className="zoom-label" title="Actual size (Ctrl+0)" onClick={() => runAction("view.actualSize")}>
          {zoom}%
        </button>
        <button className="tbtn" title="Zoom in (Ctrl++)" onClick={() => runAction("view.zoomIn")}>
          <Plus size={14} strokeWidth={1.75} />
        </button>
        <button className="tbtn" title="Fit sheet to screen (Ctrl+1)" onClick={() => runAction("sheet.fit")}>
          <Maximize size={15} strokeWidth={1.75} />
        </button>
        <button className="tbtn" title="Recenter view (Ctrl+.)" onClick={() => runAction("view.recenter")}>
          <LocateFixed size={15} strokeWidth={1.75} />
        </button>
      </div>

      <div className="tsep" />

      <button className={"tbtn" + (leftVisible ? " active" : "")} title="Left panel"
        onClick={() => runAction("view.leftPanel")}>
        <PanelLeft size={16} strokeWidth={1.75} />
      </button>
      <button className={"tbtn" + (rightVisible ? " active" : "")} title="Right panel"
        onClick={() => runAction("view.rightPanel")}>
        <PanelRight size={16} strokeWidth={1.75} />
      </button>
      <button className="tbtn" title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        onClick={() => runAction("view.theme")}>
        {theme === "dark" ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
      </button>
    </div>
  );
}
