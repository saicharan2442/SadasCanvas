// ─────────────────────────────────────────────────────────────────────────────
// MenuBar — compact desktop-style menu bar driven by the action registry.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useStore, activeDoc } from "../core/store";
import { ACTION_MAP, runAction, type AppAction } from "./actions";

type MenuEntry = { type: "action"; id: string } | { type: "sep" } | { type: "caption"; label: string };

const A = (id: string): MenuEntry => ({ type: "action", id });
const SEP: MenuEntry = { type: "sep" };
const CAP = (label: string): MenuEntry => ({ type: "caption", label });

const MENUS: { label: string; items: MenuEntry[] }[] = [
  {
    label: "File",
    items: [A("file.new"), A("file.open"), SEP, A("file.save"), A("file.saveAs"), SEP,
      A("file.exportPng"), A("file.exportJpg"), A("file.exportPdf"), SEP, A("file.closeTab")],
  },
  {
    label: "Edit",
    items: [A("edit.undo"), A("edit.redo"), SEP, A("edit.cut"), A("edit.copy"), A("edit.paste"),
      A("edit.duplicate"), SEP, A("edit.delete"), SEP, A("edit.selectAll"), A("edit.deselect")],
  },
  {
    label: "View",
    items: [A("view.zoomIn"), A("view.zoomOut"), A("view.actualSize"), A("sheet.fit"),
      A("view.fitScreen"), A("view.fitSelection"), A("view.recenter"), SEP,
      A("view.grid"), A("view.gridDots"), A("view.gridLines"), SEP,
      A("view.snapGrid"), A("view.snapObjects"), SEP,
      A("view.theme"), A("view.leftPanel"), A("view.rightPanel"), A("sheet.bar"), SEP,
      A("view.distractionFree"), A("view.fullscreen")],
  },
  {
    label: "Insert",
    items: [A("tool.text"), A("tool.sticky"), SEP, A("tool.rect"), A("tool.roundrect"),
      A("tool.ellipse"), A("tool.triangle"), A("tool.star"), SEP, A("tool.line"), A("tool.arrow"),
      SEP, A("tool.pen"), A("tool.pencil"), A("tool.highlighter"), A("tool.eraser"), SEP,
      A("insert.image"), A("insert.link"), A("insert.rows"), SEP,
      A("insert.openLink"), A("insert.copyLink")],
  },
  {
    label: "Sheet",
    items: [A("sheet.add"), A("sheet.duplicate"), A("sheet.delete"), SEP,
      A("sheet.prev"), A("sheet.next"), A("sheet.fit"), SEP,
      CAP("Sheet size"),
      A("sheet.size.a3"), A("sheet.size.a4"), A("sheet.size.a5"),
      A("sheet.size.letter"), A("sheet.size.legal"),
      A("sheet.size.square"), A("sheet.size.slide"), A("sheet.infinite"), SEP,
      A("sheet.portrait"), A("sheet.landscape"), A("sheet.margins"), SEP,
      A("present.start"), A("present.current"), SEP,
      A("sheet.bar"), A("file.exportPng")],
  },
  {
    label: "Format",
    items: [A("fmt.bold"), A("fmt.italic"), A("fmt.underline"), A("fmt.strike"), SEP,
      A("fmt.alignLeft"), A("fmt.alignCenter"), A("fmt.alignRight"), SEP,
      CAP("Arrange selection"),
      A("fmt.alignObjectsLeft"), A("fmt.alignObjectsCenterX"), A("fmt.alignObjectsRight"),
      A("fmt.alignObjectsTop"), A("fmt.alignObjectsCenterY"), A("fmt.alignObjectsBottom"), SEP,
      A("fmt.distributeH"), A("fmt.distributeV")],
  },
  {
    label: "Object",
    items: [A("obj.group"), A("obj.ungroup"), SEP, A("obj.front"), A("obj.forward"),
      A("obj.backward"), A("obj.back"), SEP, A("obj.lock"), A("obj.unlock"),
      A("obj.hide"), A("obj.show"), SEP, A("obj.flipH"), A("obj.flipV")],
  },
  {
    label: "Tools",
    items: [A("tools.palette"), A("tools.find"), SEP,
      A("tool.select"), A("tool.pan"), A("tool.eyedropper"), SEP,
      CAP("Image adjustments"),
      A("img.bgRemove"), SEP,
      A("img.grayscale"), A("img.sepia"), A("img.invert"),
      A("img.fitSheet"), A("img.reset"), SEP,
      A("tools.settings")],
  },
  {
    label: "Help",
    items: [A("help.shortcuts"), A("help.about")],
  },
];

export default function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const undoLabel = useStore((s) => s.undoLabel);
  const redoLabel = useStore((s) => s.redoLabel);
  const theme = useStore((s) => s.theme);
  const selection = useStore((s) => s.selection);
  const gridShow = useStore((s) => s.gridShow);
  const snapGrid = useStore((s) => s.snapGrid);
  const snapObjects = useStore((s) => s.snapObjects);
  const leftVisible = useStore((s) => s.leftVisible);
  const rightVisible = useStore((s) => s.rightVisible);
  const chromeHidden = useStore((s) => s.chromeHidden);
  const dirty = useStore((s) => !!(activeDoc(s) && s.dirty[s.activeDocId]));
  // subscribed values only need to trigger re-render for enabled/checked states
  void undoLabel; void redoLabel; void theme; void selection; void gridShow;
  void snapGrid; void snapObjects; void leftVisible; void rightVisible; void chromeHidden;

  useEffect(() => {
    if (open == null) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const labelFor = (a: AppAction) => {
    if (a.id === "edit.undo" && undoLabel) return `Undo ${undoLabel}`;
    if (a.id === "edit.redo" && redoLabel) return `Redo ${redoLabel}`;
    return a.label;
  };

  return (
    <div className="menu-bar" ref={barRef}>
      <div className="menu-brand">
        <svg width="18" height="18" viewBox="0 0 128 128">
          <rect width="128" height="128" rx="32" fill="var(--accent)" />
          <path d="M35 85 C 35 95, 55 100, 64 100 C 85 100, 93 85, 93 75 C 93 55, 35 55, 35 35 C 35 25, 45 15, 64 15 C 80 15, 93 25, 93 35" stroke="rgba(255,255,255,0.3)" strokeWidth="14" fill="none" strokeLinecap="round" />
          <path d="M40 80 C 40 90, 55 95, 64 95 C 85 95, 88 80, 88 72 C 88 55, 40 55, 40 38 C 40 28, 48 20, 64 20 C 78 20, 88 28, 88 38" stroke="white" strokeWidth="14" fill="none" strokeLinecap="round" />
          <circle cx="92" cy="36" r="12" fill="var(--accent-2)" />
        </svg>
        <span style={{ marginLeft: 2 }}>Sadas Canvas</span>
        {dirty && <span className="dirty-dot" title="Unsaved changes">●</span>}
      </div>
      {MENUS.map((menu, i) => (
        <div key={menu.label} style={{ position: "relative", display: "flex" }}>
          <button
            className={"menu-root-btn" + (open === i ? " open" : "")}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => { if (open != null && open !== i) setOpen(i); }}
          >
            {menu.label}
          </button>
          {open === i && (
            <div className="menu-pop" onMouseLeave={() => {}}>
              {menu.items.map((entry, j) => {
                if (entry.type === "sep") return <div key={j} className="menu-sep" />;
                if (entry.type === "caption") return <div key={j} className="menu-caption">{entry.label}</div>;
                const action = ACTION_MAP.get(entry.id);
                if (!action) return null;
                const enabled = action.enabled ? action.enabled() : true;
                const checked = action.checked ? action.checked() : false;
                return (
                  <button
                    key={entry.id + j}
                    className="menu-item"
                    disabled={!enabled}
                    onClick={() => { setOpen(null); runAction(action.id); }}
                  >
                    <span className="menu-check">{checked ? <Check size={12} strokeWidth={2.5} /> : null}</span>
                    <span className="menu-label">{labelFor(action)}</span>
                    {action.shortcut && <span className="menu-sc">{action.shortcut}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <div className="menu-bar-spacer" />
      <div className="menu-bar-status">
        <ConnectionPill />
      </div>
    </div>
  );
}

/**
 * Connectivity badge. Sadas Canvas never calls the network itself — this only
 * tells the user whether opening a link will reach the internet.
 */
export function ConnectionPill() {
  const online = useStore((s) => s.online);
  return (
    <span
      className="sb-item"
      style={{ color: online ? "var(--ok)" : "var(--warn)" }}
      title={
        online
          ? "Connected. Documents stay on this device — nothing is uploaded."
          : "Offline. All editing, saving and exporting still work."
      }
    >
      <span className={"dot " + (online ? "ok" : "warn")} />
      {online ? "Online" : "Offline"}
    </span>
  );
}
