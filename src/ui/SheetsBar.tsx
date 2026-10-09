// ─────────────────────────────────────────────────────────────────────────────
// SheetsBar — Canva-style strip of sheet thumbnails along the bottom of the
// workspace. Click to switch, double-click to rename, drag to reorder, with
// per-sheet duplicate/delete and an "Add sheet" button.
//
// Thumbnails are lightweight SVG previews (no second Konva stage), so a long
// document stays cheap to render.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { Plus, Copy, Trash2, ChevronDown, Play } from "lucide-react";
import { useStore, activeDoc, contentBounds } from "../core/store";
import { fitSheet, startPresenting } from "./actions";
import {
  isInfinite, sheetSize, type CanvasObject, type Page,
} from "../core/types";

const THUMB_H = 74;
const MAX_THUMB_OBJECTS = 60;

export default function SheetsBar() {
  const doc = useStore((s) => activeDoc(s));
  const visible = useStore((s) => s.sheetsBarVisible);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const st = useStore.getState;

  if (!doc) return null;

  if (!visible) {
    return (
      <div className="sheets-bar collapsed">
        <button className="mini-btn" onClick={() => st().setFlag("sheetsBarVisible", true)}>
          Sheets ({doc.pages.length})
        </button>
      </div>
    );
  }

  const commitRename = (id: string) => {
    const v = inputRef.current?.value.trim();
    if (v) st().renamePage(id, v);
    setRenaming(null);
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const from = doc.pages.findIndex((p) => p.id === dragId);
    const to = doc.pages.findIndex((p) => p.id === targetId);
    if (from < 0 || to < 0) return;
    // movePage shifts one step at a time; repeat to reach the drop index
    const dir = to > from ? 1 : -1;
    for (let i = from; i !== to; i += dir) st().movePage(dragId, dir as 1 | -1);
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="sheets-bar">
      <div className="sheets-bar-head">
        <span className="sheets-bar-title">Sheets</span>
        <span className="sheets-bar-count">{doc.pages.length}</span>
        <span style={{ flex: 1 }} />
        <button className="mini-btn accent" title="Present from the first sheet (F5)"
          onClick={() => void startPresenting(true)}>
          <Play size={11} /> Present
        </button>
        <button className="icon-btn" title="Hide sheets bar"
          onClick={() => st().setFlag("sheetsBarVisible", false)}>
          <ChevronDown size={13} />
        </button>
      </div>

      <div className="sheets-scroll">
        {doc.pages.map((page, i) => {
          const active = page.id === doc.pageId;
          return (
            <div
              key={page.id}
              className={
                "sheet-card" + (active ? " active" : "") +
                (overId === page.id && dragId && dragId !== page.id ? " drop-target" : "")
              }
              draggable={renaming !== page.id}
              onDragStart={() => setDragId(page.id)}
              onDragOver={(e) => { e.preventDefault(); setOverId(page.id); }}
              onDragLeave={() => setOverId((cur) => (cur === page.id ? null : cur))}
              onDrop={() => onDrop(page.id)}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onClick={() => {
                if (!active) { st().setActivePage(page.id); requestAnimationFrame(fitSheet); }
              }}
              onDoubleClick={() => setRenaming(page.id)}
              title={`${page.name} — ${sheetLabel(page)}`}
            >
              <div className="sheet-thumb" style={{ aspectRatio: thumbRatio(page) }}>
                <SheetThumb page={page} />
              </div>
              <div className="sheet-card-foot">
                <span className="sheet-index">{i + 1}</span>
                {renaming === page.id ? (
                  <input
                    ref={inputRef}
                    className="row-rename"
                    defaultValue={page.name}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => commitRename(page.id)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commitRename(page.id);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <span className="sheet-name">{page.name}</span>
                )}
                <span className="sheet-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn" title="Duplicate sheet"
                    onClick={() => st().duplicatePage(page.id)}>
                    <Copy size={11} />
                  </button>
                  <button className="icon-btn danger" title="Delete sheet"
                    disabled={doc.pages.length <= 1}
                    onClick={() => st().deletePage(page.id)}>
                    <Trash2 size={11} />
                  </button>
                </span>
              </div>
              {/* insert a new sheet immediately after this one */}
              <button
                className="sheet-insert"
                title={`Insert sheet after ${page.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  st().addPage(page.id);
                  requestAnimationFrame(fitSheet);
                }}
              >
                <Plus size={12} />
              </button>
            </div>
          );
        })}

        <button
          className="sheet-add"
          title="Add sheet (Ctrl+Enter)"
          onClick={() => {
            const last = doc.pages[doc.pages.length - 1];
            st().addPage(last?.id);
            requestAnimationFrame(fitSheet);
          }}
        >
          <Plus size={16} />
          Add sheet
        </button>
      </div>
    </div>
  );
}

function thumbRatio(page: Page): string {
  if (isInfinite(page.sheet)) return "4 / 3";
  const { w, h } = sheetSize(page.sheet);
  return `${w} / ${h}`;
}

function sheetLabel(page: Page): string {
  if (isInfinite(page.sheet)) return "Infinite canvas";
  const { w, h } = sheetSize(page.sheet);
  const name = page.sheet.preset === "custom" ? "Custom" : page.sheet.preset.toUpperCase();
  return `${name} · ${Math.round(w)} × ${Math.round(h)} px`;
}

/** Minimal vector preview of a sheet's objects. */
function SheetThumb({ page }: { page: Page }) {
  const infinite = isInfinite(page.sheet);
  let view = { x: 0, y: 0, w: 0, h: 0 };

  if (infinite) {
    const b = contentBounds(page);
    const pad = 40;
    view = b
      ? { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
      : { x: 0, y: 0, w: 800, h: 600 };
  } else {
    const { w, h } = sheetSize(page.sheet);
    view = { x: 0, y: 0, w, h };
  }
  if (view.w <= 0 || view.h <= 0) view = { x: 0, y: 0, w: 800, h: 600 };

  const objects = page.objects.filter((o) => o.visible).slice(-MAX_THUMB_OBJECTS);

  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%" height="100%"
      style={{ background: infinite ? "var(--panel-3)" : page.sheet.background, display: "block" }}
    >
      {objects.map((o) => (
        <ThumbShape key={o.id} o={o} />
      ))}
    </svg>
  );
}

function ThumbShape({ o }: { o: CanvasObject }) {
  const fill = o.fillMode === "none" ? "none" : o.fill;
  const stroke = o.strokeWidth > 0 && o.stroke ? o.stroke : "none";
  const t = o.rotation ? `rotate(${o.rotation} ${o.x} ${o.y})` : undefined;
  const common = { transform: t, opacity: o.opacity };

  switch (o.type) {
    case "rect":
    case "image":
    case "sticky":
      return (
        <rect {...common} x={o.x} y={o.y} width={o.width} height={o.height}
          rx={o.cornerRadius || (o.type === "sticky" ? 4 : 0)}
          fill={o.type === "image" ? "#9bb0c9" : fill === "none" ? "#c9d2de" : fill}
          stroke={stroke} strokeWidth={o.strokeWidth} />
      );
    case "ellipse":
      return (
        <ellipse {...common} cx={o.x + o.width / 2} cy={o.y + o.height / 2}
          rx={o.width / 2} ry={o.height / 2}
          fill={fill} stroke={stroke} strokeWidth={o.strokeWidth} />
      );
    case "triangle":
      return (
        <polygon {...common}
          points={`${o.x + o.width / 2},${o.y} ${o.x + o.width},${o.y + o.height} ${o.x},${o.y + o.height}`}
          fill={fill} stroke={stroke} strokeWidth={o.strokeWidth} />
      );
    case "star":
      return (
        <polygon {...common} points={starPoints(o)} fill={fill} stroke={stroke} strokeWidth={o.strokeWidth} />
      );
    case "line":
    case "arrow":
    case "ink": {
      const pts = o.points ?? [];
      if (pts.length < 4) return null;
      const d = pointsToPath(pts, o.x, o.y);
      return (
        <path {...common} d={d} fill="none"
          stroke={o.stroke || "#8b93a1"}
          strokeWidth={Math.max(o.strokeWidth, 1.5)}
          strokeLinecap="round" strokeLinejoin="round" />
      );
    }
    case "text": {
      const lines = o.text.split(/\r?\n/).slice(0, 6);
      const lh = o.fontSize * o.lineHeight;
      return (
        <g {...common}>
          {lines.map((ln, i) => (
            <text key={i}
              x={o.align === "center" ? o.x + o.width / 2 : o.align === "right" ? o.x + o.width : o.x}
              y={o.y + o.fontSize + i * lh}
              textAnchor={o.align === "center" ? "middle" : o.align === "right" ? "end" : "start"}
              fill={o.color}
              fontSize={o.fontSize}
              fontFamily={o.fontFamily}
              fontWeight={o.bold ? 700 : 400}
              fontStyle={o.italic ? "italic" : "normal"}
            >
              {ln.slice(0, 60)}
            </text>
          ))}
        </g>
      );
    }
  }
  return null;
}

function pointsToPath(pts: number[], ox: number, oy: number): string {
  let d = `M ${ox + pts[0]} ${oy + pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += ` L ${ox + pts[i]} ${oy + pts[i + 1]}`;
  return d;
}

function starPoints(o: CanvasObject): string {
  const spikes = 5, inner = 0.45;
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
  const out: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    out.push(`${cx + Math.cos(a) * (o.width / 2) * r},${cy + Math.sin(a) * (o.height / 2) * r}`);
  }
  return out.join(" ");
}

export { THUMB_H };
