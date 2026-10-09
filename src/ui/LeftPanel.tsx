// ─────────────────────────────────────────────────────────────────────────────
// LeftPanel — Pages (add/rename/duplicate/delete/reorder) and Layers
// (select, show/hide, lock, z-order, delete).
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import {
  Plus, Copy, Trash2, Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown,
  Type, Square, Circle, Triangle, Star, Minus, ArrowUpRight, PenLine,
  Image as ImageIcon, StickyNote, Link as LinkIcon,
} from "lucide-react";
import { useStore, activeDoc, activePage } from "../core/store";
import { cmdObjects } from "../core/commands";
import type { ObjectType, Page } from "../core/types";

const TYPE_ICON: Record<ObjectType, React.ReactNode> = {
  text: <Type size={12} />, rect: <Square size={12} />, ellipse: <Circle size={12} />,
  triangle: <Triangle size={12} />, star: <Star size={12} />, line: <Minus size={12} />,
  arrow: <ArrowUpRight size={12} />, ink: <PenLine size={12} />,
  image: <ImageIcon size={12} />, sticky: <StickyNote size={12} />,
  link: <LinkIcon size={12} />,
};

export default function LeftPanel() {
  const doc = useStore((s) => activeDoc(s));
  return (
    <div className="side-panel left">
      <PagesSection pages={doc?.pages ?? []} activePageId={doc?.pageId ?? ""} />
      <LayersSection />
    </div>
  );
}

// ── Pages ────────────────────────────────────────────────────────────────────

function PagesSection({ pages, activePageId }: { pages: Page[]; activePageId: string }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const s = useStore.getState;
  const commit = (id: string) => {
    const v = inputRef.current?.value.trim();
    if (v) s().renamePage(id, v);
    setRenaming(null);
  };

  return (
    <div className="panel-section" style={{ flex: "0 0 auto", maxHeight: "38%", minHeight: 120 }}>
      <div className="panel-head">
        Sheets
        <span className="spacer" />
        <button className="icon-btn" title="Add sheet" onClick={() => s().addPage()}>
          <Plus size={13} />
        </button>
      </div>
      <div className="panel-body">
        {pages.map((p, i) => (
          <div
            key={p.id}
            className={"row-item" + (p.id === activePageId ? " selected" : "")}
            onClick={() => s().setActivePage(p.id)}
            onDoubleClick={() => setRenaming(p.id)}
            title={p.name}
          >
            <span className="row-thumb">{i + 1}</span>
            {renaming === p.id ? (
              <input
                ref={inputRef}
                className="row-rename"
                defaultValue={p.name}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => commit(p.id)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commit(p.id);
                  if (e.key === "Escape") setRenaming(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="row-label">{p.name}</span>
            )}
            <span className="row-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn" title="Move up" disabled={i === 0}
                onClick={() => s().movePage(p.id, -1)}>
                <ChevronUp size={12} />
              </button>
              <button className="icon-btn" title="Move down" disabled={i === pages.length - 1}
                onClick={() => s().movePage(p.id, 1)}>
                <ChevronDown size={12} />
              </button>
              <button className="icon-btn" title="Duplicate sheet"
                onClick={() => s().duplicatePage(p.id)}>
                <Copy size={12} />
              </button>
              <button className="icon-btn danger" title="Delete sheet" disabled={pages.length <= 1}
                onClick={() => s().deletePage(p.id)}>
                <Trash2 size={12} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Layers ───────────────────────────────────────────────────────────────────

function LayersSection() {
  const doc = useStore((s) => activeDoc(s));
  const page = useStore((s) => activePage(activeDoc(s)));
  const selection = useStore((s) => s.selection);
  const s = useStore.getState;

  if (!doc || !page) return null;
  const layers = [...page.objects].reverse(); // topmost first

  const reorderOne = (id: string, dir: 1 | -1) => {
    const idx = page.objects.findIndex((o) => o.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= page.objects.length) return;
    const after = [...page.objects];
    const [o] = after.splice(idx, 1);
    after.splice(to, 0, o);
    s().dispatch(cmdObjects(doc.id, page.id, page.objects, after, dir === 1 ? "Bring forward" : "Send backward"));
  };

  return (
    <div className="panel-section grow">
      <div className="panel-head">
        Layers
        <span className="spacer" />
        <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
          {page.objects.length}
        </span>
      </div>
      <div className="panel-body">
        {layers.length === 0 && (
          <div className="props-empty" style={{ padding: "14px 8px" }}>
            No objects yet.
            <br />Pick a tool and draw on the canvas.
          </div>
        )}
        {layers.map((o) => {
          const sel = selection.includes(o.id);
          return (
            <div
              key={o.id}
              className={
                "row-item" + (sel ? " selected" : "") + (o.locked ? " locked-row" : "")
              }
              onClick={(e) => {
                if (e.shiftKey || e.ctrlKey || e.metaKey) s().toggleSelect(o.id);
                else s().setSelection([o.id]);
              }}
              title={o.name}
            >
              <span className="row-type-ic">{TYPE_ICON[o.type]}</span>
              <span className={"row-label" + (o.visible ? "" : " dim")}>
                {o.name}
              </span>
              <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" title={o.visible ? "Hide" : "Show"}
                  onClick={() => s().updateObjects([o.id], { visible: !o.visible }, o.visible ? "Hide layer" : "Show layer")}>
                  {o.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button className="icon-btn" title={o.locked ? "Unlock" : "Lock"}
                  onClick={() => {
                    s().updateObjects([o.id], { locked: !o.locked }, o.locked ? "Unlock layer" : "Lock layer");
                    if (!o.locked) s().setSelection(selection.filter((id) => id !== o.id));
                  }}>
                  {o.locked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
                <button className="icon-btn" title="Bring forward" onClick={() => reorderOne(o.id, 1)}>
                  <ChevronUp size={12} />
                </button>
                <button className="icon-btn" title="Send backward" onClick={() => reorderOne(o.id, -1)}>
                  <ChevronDown size={12} />
                </button>
                <button className="icon-btn danger" title="Delete"
                  onClick={() => s().removeObjects([o.id])}>
                  <Trash2 size={12} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
