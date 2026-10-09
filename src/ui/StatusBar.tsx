// ─────────────────────────────────────────────────────────────────────────────
// StatusBar — offline pill, save state, cursor, counts, live text stats,
// grid controls, zoom readout. Compact 25px, Windows-app style.
// ─────────────────────────────────────────────────────────────────────────────

import { useStore, activeDoc, activePage } from "../core/store";
import { runAction, fitSheet } from "./actions";
import { textStats } from "../core/text";
import { hasText, isInfinite, sheetSize, GRID_SIZES } from "../core/types";

export default function StatusBar() {
  const doc = useStore((s) => activeDoc(s));
  const page = useStore((s) => activePage(activeDoc(s)));
  const selection = useStore((s) => s.selection);
  const editingId = useStore((s) => s.editingId);
  const pointer = useStore((s) => s.pointer);
  const dirty = useStore((s) => !!(activeDoc(s) && s.dirty[s.activeDocId]));
  const lastSaved = useStore((s) => s.lastSaved);
  const gridSize = useStore((s) => s.gridSize);
  const gridStyle = useStore((s) => s.gridStyle);
  const tool = useStore((s) => s.tool);
  const theme = useStore((s) => s.theme);
  const online = useStore((s) => s.online);

  const rawZoom = doc?.camera.zoom ?? 1;
  const zoom = rawZoom < 0.1
    ? (rawZoom * 100).toFixed(1)
    : String(Math.round(rawZoom * 100));
  const objects = page?.objects ?? [];

  const statObj = editingId
    ? objects.find((o) => o.id === editingId)
    : selection.length === 1 ? objects.find((o) => o.id === selection[0]) : undefined;
  const stats = statObj && hasText(statObj) && statObj.text ? textStats(statObj.text) : null;

  return (
    <div className="status-bar">
      <span
        className="sb-item"
        title={
          online
            ? "Connected. Sadas Canvas still works entirely locally — no uploads, no telemetry."
            : "No connection. Every feature keeps working; only opening links needs the internet."
        }
      >
        <span className={"dot " + (online ? "ok" : "warn")} />
        {online ? "Online" : "Offline"}
        <span style={{ color: "var(--text-3)", marginLeft: 5 }}>· Local only</span>
      </span>
      <span className="sb-sep" />
      <span className="sb-item" title={dirty ? "Unsaved changes (Ctrl+S to save)" : "No unsaved changes"}>
        <span className={"dot " + (dirty ? "warn" : "ok")} />
        {dirty ? "Unsaved changes" : lastSaved ? "Saved " + new Date(lastSaved).toLocaleTimeString() : "Ready"}
      </span>
      <span className="sb-sep" />
      <span className="sb-item hoverable" title="Fit sheet to screen (Ctrl+1)"
        onClick={() => fitSheet()} style={{ cursor: "default" }}>
        {page
          ? isInfinite(page.sheet)
            ? `${page.name} · Infinite canvas`
            : `${page.name} · ${page.sheet.preset === "custom" ? "Custom" : page.sheet.preset.toUpperCase()} ` +
              `${Math.round(sheetSize(page.sheet).w)}×${Math.round(sheetSize(page.sheet).h)}`
          : "—"}
        {doc && doc.pages.length > 1 ? `  (${doc.pages.findIndex((p) => p.id === page?.id) + 1}/${doc.pages.length})` : ""}
      </span>
      <span className="sb-sep" />
      <span className="sb-item" style={{ fontVariantNumeric: "tabular-nums" }}>
        X {pointer.x} · Y {pointer.y}
      </span>
      <span className="sb-sep" />
      <span className="sb-item">
        {objects.length} object{objects.length === 1 ? "" : "s"}
        {selection.length > 0 && ` · ${selection.length} selected`}
        {selection.length > 0 && selection[0] && objects.find((o) => o.id === selection[0])?.locked ? " (locked)" : ""}
      </span>
      {stats && (
        <>
          <span className="sb-sep" />
          <span className="sb-item">
            Lines {stats.lines} · Words {stats.words} · Chars {stats.chars}
          </span>
        </>
      )}
      <span className="sb-spacer" />
      <span className="sb-item" style={{ textTransform: "capitalize" }}>{tool}</span>
      <span className="sb-sep" />
      <span className="sb-item hoverable" title="Theme">
        <button className="sb-select" style={{ cursor: "default", background: "none", border: 0, color: "inherit", padding: 0 }}
          onClick={() => runAction("view.theme")}>
          {theme === "dark" ? "Dark" : "Light"}
        </button>
      </span>
      <span className="sb-item">
        <select
          className="sb-select"
          value={gridStyle}
          onChange={(e) => useStore.getState().setGrid({
            gridStyle: e.currentTarget.value as "dots" | "lines", gridShow: true,
          })}
          title="Canvas pattern (Ctrl+')"
        >
          <option value="dots">Dots</option>
          <option value="lines">Lines</option>
        </select>
        <select
          className="sb-select"
          value={gridSize}
          onChange={(e) => useStore.getState().setGrid({ gridSize: Number(e.currentTarget.value) })}
          title="Spacing"
        >
          {GRID_SIZES.map((g) => <option key={g} value={g}>{g}px</option>)}
        </select>
      </span>
      <span className="sb-sep" />
      <span className="sb-item hoverable" title="Zoom (Ctrl+wheel, or Ctrl +/−). Click for 100%."
        onClick={() => runAction("view.actualSize")} style={{ cursor: "default", fontVariantNumeric: "tabular-nums" }}>
        {zoom}%
      </span>
      <span className="sb-item hoverable" title="Fit to screen" onClick={() => runAction("view.fitScreen")} style={{ cursor: "default" }}>
        Fit
      </span>
    </div>
  );
}
