// ─────────────────────────────────────────────────────────────────────────────
// PropertiesPanel — inspects the current selection. With multiple objects the
// first object's values are shown and patches apply to the whole selection.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  Group as GroupIcon, Ungroup as UngroupIcon, Copy, Trash2, Pipette,
  Link as LinkIcon, Play,
} from "lucide-react";
import { useStore, activeDoc, activePage } from "../core/store";
import { FONT_FAMILIES, STICKY_COLORS } from "../core/factory";
import {
  hasText, isPointBased, isInfinite, sheetSize, SHEET_PRESETS,
  BLEND_MODES, CROP_ASPECTS, prettyUrl,
  UNIT_DEFS, unitToPx, pxToUnit,
  type BlendMode, type CanvasObject, type Page, type Sheet, type SheetPreset, type SizeUnit,
} from "../core/types";
import { runAction, fitSheet, applySheetPreset } from "./actions";
import { TEXT_PRESETS, renderPreviewThumb } from "./TextEffects";

const SWATCHES = [
  "#4c8dff", "#8a5cff", "#e84c88", "#f26d6d", "#f7974c", "#f7d154",
  "#62c26d", "#2fbfa5", "#56c7f0", "#20242b", "#8b93a1", "#ffffff",
];

export default function PropertiesPanel() {
  const doc = useStore((s) => activeDoc(s));
  const page = useStore((s) => activePage(activeDoc(s)));
  const selection = useStore((s) => s.selection);
  if (!doc || !page) return <div className="side-panel right" />;

  const objs = page.objects.filter((o) => selection.includes(o.id));
  const first = objs[0];

  return (
    <div className="side-panel right" style={{ overflowY: "auto" }}>
      {objs.length === 0 || !first ? (
        <SheetSection page={page} />
      ) : (
        <>
          <div className="prop-group">
            <div className="prop-group-title">
              {objs.length === 1 ? first.name : `${objs.length} objects selected`}
            </div>
            <GeometrySection objs={objs} />
          </div>
          <StyleSection objs={objs} first={first} />
          <ShadowSection objs={objs} first={first} />
          <TextSection objs={objs} first={first} />
          <TextEffectsSection objs={objs} first={first} />
          <ImageSection objs={objs} first={first} />
          <LinkSection objs={objs} first={first} />
          <BlendSection objs={objs} first={first} />

          <div className="prop-group">
            <button className="mini-btn accent" style={{ width: '100%' }} onClick={() => useStore.getState().setFlag("animateOpen", true)}>
              <Play size={12} /> Animate
            </button>
          </div>
          <ArrangeSection objs={objs} />
        </>
      )}
    </div>
  );
}

// ── Sheet (page) settings — shown when nothing is selected ──────────────────

/** Input that shows and edits a px value in any unit. Converts on commit. */
function UnitNumberInput({ px, unit, onCommit }: {
  px: number; unit: SizeUnit; onCommit: (newPx: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const def = UNIT_DEFS[unit];
  const displayed = pxToUnit(px, unit);

  const commit = (el: HTMLInputElement) => {
    const raw = parseFloat(el.value);
    if (!isFinite(raw)) { el.value = String(displayed); return; }
    const clamped = Math.min(def.max, Math.max(def.min, raw));
    el.value = String(clamped);
    const newPx = Math.round(Math.max(1, unitToPx(clamped, unit)));
    onCommit(newPx);
  };

  return (
    <input
      key={focused ? "editing" : String(displayed)}
      type="number"
      className="num-input"
      defaultValue={displayed}
      step={1 / Math.pow(10, def.precision)}
      min={def.min} max={def.max}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { setFocused(false); commit(e.currentTarget); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
    />
  );
}

function SheetSection({ page }: { page: Page }) {
  const sheet = page.sheet;
  const infinite = isInfinite(sheet);
  const size = sheetSize(sheet);
  const set = (patch: Partial<Sheet>, label: string) =>
    useStore.getState().setPageSheet(page.id, patch, label);
  const [unit, setUnit] = useState<SizeUnit>("px");
  const def = UNIT_DEFS[unit];

  // DPI for print-size hint (96 = screen, 300 = print)
  const [dpi, setDpi] = useState(96);

  return (
    <>
      <div className="prop-group">
        <div className="prop-group-title">Sheet — {page.name}</div>
        <div className="prop-grid">

          {/* Preset selector */}
          <div className="prop-row full">
            <select
              className="sel-input"
              value={sheet.preset}
              onChange={(e) => {
                const v = e.currentTarget.value as SheetPreset;
                if (v === "infinite") { applySheetPreset("infinite"); return; }
                if (v === "custom") { set({ preset: "custom" }, "Custom sheet"); return; }
                applySheetPreset(v);
              }}
            >
              <option value="infinite">Infinite canvas</option>
              {(Object.keys(SHEET_PRESETS) as (keyof typeof SHEET_PRESETS)[]).map((k) => (
                <option key={String(k)} value={String(k)}>
                  {SHEET_PRESETS[k].label} — {SHEET_PRESETS[k].hint}
                </option>
              ))}
              <option value="custom">Custom size</option>
            </select>
          </div>

          {!infinite && (
            <>
              {/* Orientation */}
              <div className="prop-row full">
                <div className="seg">
                  <button className={sheet.orientation === "portrait" ? "on" : ""}
                    onClick={() => { set({ orientation: "portrait" }, "Portrait"); requestAnimationFrame(fitSheet); }}>
                    Portrait
                  </button>
                  <button className={sheet.orientation === "landscape" ? "on" : ""}
                    onClick={() => { set({ orientation: "landscape" }, "Landscape"); requestAnimationFrame(fitSheet); }}>
                    Landscape
                  </button>
                </div>
              </div>

              {/* Unit selector + DPI */}
              <div className="prop-row full" style={{ gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-2)", flex: "none" }}>Unit</span>
                <select
                  className="sel-input"
                  value={unit}
                  onChange={(e) => setUnit(e.currentTarget.value as SizeUnit)}
                  title="Choose the measurement unit for Width and Height"
                >
                  {(Object.keys(UNIT_DEFS) as SizeUnit[]).map((u) => (
                    <option key={u} value={u}>
                      {UNIT_DEFS[u].label} ({UNIT_DEFS[u].short})
                    </option>
                  ))}
                </select>
                {/* DPI picker shown only for print units */}
                {(unit === "in" || unit === "ft" || unit === "cm" || unit === "mm" || unit === "pt" || unit === "pc") && (
                  <>
                    <span style={{ fontSize: 11, color: "var(--text-2)", flex: "none" }}>DPI</span>
                    <select
                      className="sel-input"
                      value={dpi}
                      onChange={(e) => setDpi(Number(e.currentTarget.value))}
                      title="Dots per inch — affects the print-size hint only. Canvas pixels are unchanged."
                      style={{ width: 74 }}
                    >
                      <option value={72}>72 dpi</option>
                      <option value={96}>96 dpi</option>
                      <option value={150}>150 dpi</option>
                      <option value={300}>300 dpi</option>
                      <option value={600}>600 dpi</option>
                    </select>
                  </>
                )}
              </div>

              {/* Width & Height */}
              <Row label="W">
                <UnitNumberInput
                  px={sheet.width} unit={unit}
                  onCommit={(v) => set({ width: v, preset: "custom" }, "Sheet width")}
                />
              </Row>
              <Row label="H">
                <UnitNumberInput
                  px={sheet.height} unit={unit}
                  onCommit={(v) => set({ height: v, preset: "custom" }, "Sheet height")}
                />
              </Row>

              {/* Current size summary — shows px + chosen unit + print size */}
              <div className="prop-row full" style={{ flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                <div className="sheet-size-badge">
                  <span className="sheet-size-num">{pxToUnit(size.w, unit).toFixed(def.precision)}</span>
                  <span className="sheet-size-sep">×</span>
                  <span className="sheet-size-num">{pxToUnit(size.h, unit).toFixed(def.precision)}</span>
                  <span className="sheet-size-unit">{def.short}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.6 }}>
                  {Math.round(size.w)} × {Math.round(size.h)} px
                  {(unit !== "px") && (
                    <>
                      {" · "}
                      at {dpi} dpi: {(size.w / dpi * 2.54).toFixed(1)} × {(size.h / dpi * 2.54).toFixed(1)} cm
                      {" / "}
                      {(size.w / dpi).toFixed(2)} × {(size.h / dpi).toFixed(2)} in
                    </>
                  )}
                </div>
              </div>

              {/* Quick custom size presets for common print/screen sizes */}
              {sheet.preset === "custom" && (
                <div className="prop-row full" style={{ flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-2)", fontWeight: 600 }}>Quick sizes</div>
                  <div className="chip-row" style={{ flexWrap: "wrap", gap: 4 }}>
                    {[
                      { label: "800×600", w: 800, h: 600 },
                      { label: "1280×720", w: 1280, h: 720 },
                      { label: "1920×1080", w: 1920, h: 1080 },
                      { label: "4096×2160", w: 4096, h: 2160 },
                      { label: "3×5 in", w: Math.round(3 * 96), h: Math.round(5 * 96) },
                      { label: "4×6 in", w: Math.round(4 * 96), h: Math.round(6 * 96) },
                    ].map((p) => (
                      <button key={p.label} className="chip"
                        style={{ fontSize: 10 }}
                        onClick={() => set({ width: p.w, height: p.h, preset: "custom" }, "Custom size: " + p.label)}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Margin */}
              <Row label="M" wide>
                <UnitNumberInput
                  px={sheet.margin} unit={unit}
                  onCommit={(v) => set({ margin: v }, "Sheet margin")}
                />
              </Row>

              <div className="prop-row full">
                <label className="check">
                  <input type="checkbox" checked={sheet.showMargin}
                    onChange={(e) => set({ showMargin: e.currentTarget.checked }, "Toggle margins")} />
                  Show margin guides
                </label>
              </div>

              <div className="prop-row full">
                <span className="prop-label">BG</span>
                <ColorField value={sheet.background}
                  onChange={(v) => set({ background: v }, "Sheet background")} />
              </div>
            </>
          )}

          <div className="prop-row full" style={{ gap: 5, flexWrap: "wrap" }}>
            <button className="mini-btn" onClick={() => fitSheet()}>Fit sheet</button>
            <button className="mini-btn" onClick={() => runAction("sheet.add")}>Add sheet</button>
            <button className="mini-btn" onClick={() => runAction("sheet.duplicate")}>Duplicate</button>
            <button className="mini-btn" onClick={() => runAction("file.exportPng")}>Export PNG</button>
          </div>
        </div>
      </div>

      <div className="props-empty" style={{ paddingTop: 8 }}>
        Select an object to edit its properties.
        <br />Drag on empty canvas to select many.
        <br />
        <br /><span className="kbd">Ctrl</span>+<span className="kbd">A</span> selects everything.
      </div>
    </>
  );
}

// ── building blocks ──────────────────────────────────────────────────────────

function usePatch(objs: CanvasObject[]) {
  return (patch: Partial<CanvasObject> | ((o: CanvasObject) => Partial<CanvasObject>), label: string, mergeKey?: string) => {
    useStore.getState().updateObjects(objs.map((o) => o.id), patch, label, mergeKey);
  };
}

function NumberInput({ value, onCommit, min, max, step = 1, suffix }: {
  value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  const [focused, setFocused] = useState(false);
  const commit = (el: HTMLInputElement) => {
    let v = parseFloat(el.value);
    if (!isFinite(v)) { el.value = String(value); return; }
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    v = Math.round(v * 100) / 100;
    el.value = String(v);
    if (v !== value) onCommit(v);
  };
  return (
    <input
      key={focused ? "editing" : value}
      type="number"
      className="num-input"
      defaultValue={value}
      step={step}
      min={min} max={max}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { setFocused(false); commit(e.currentTarget); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
      title={suffix}
    />
  );
}

function Row({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={"prop-row" + (wide ? " full" : "")}>
      <span className={"prop-label" + (wide ? " wide" : "")}>{label}</span>
      {children}
    </div>
  );
}

function RangeRow({ value, min, max, step = 1, format, onChange }: {
  value: number; min: number; max: number; step?: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div className="range-row">
      <input
        type="range" className="prop-range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.currentTarget.value))}
      />
      <output>{format(value)}</output>
    </div>
  );
}

function toHex(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return "#" + c.slice(1).split("").map((ch) => ch + ch).join("");
  }
  return "#000000";
}

function ColorField({ value, none, onChange, title }: {
  value: string; none?: boolean; onChange: (v: string) => void; title?: string;
}) {
  const shown = none ? "#000000" : toHex(value);
  return (
    <div className="color-field" title={title}>
      <span className={"color-swatch" + (none ? " none" : "")}>
        <span className="swatch-fill" style={{ background: shown }} />
        <input
          type="color" className="native-color" value={shown}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      </span>
      <input
        className="color-hex" value={none ? "none" : value} readOnly={!!none}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
        }}
        spellCheck={false}
      />
    </div>
  );
}

function SwatchRow({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  const picked = useStore((s) => s.swatches);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", gridColumn: "1 / -1", marginBottom: 6 }}>
      {[...picked, ...SWATCHES].slice(0, 18).map((c) => (
        <button key={c} title={c}
          style={{
            width: 17, height: 17, borderRadius: 4, background: c, padding: 0,
            border: value.toLowerCase() === c.toLowerCase()
              ? "2px solid var(--accent)" : "1px solid var(--border-2)",
          }}
          onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

// ── sections ─────────────────────────────────────────────────────────────────

function GeometrySection({ objs }: { objs: CanvasObject[] }) {
  const o = objs[0];
  const patch = usePatch(objs);
  const ids = objs.map((x) => x.id).join(",");
  const pointBased = objs.every((x) => isPointBased(x));
  const textOnly = objs.every((x) => x.type === "text");
  return (
    <div className="prop-grid">
      <Row label="X"><NumberInput value={o.x} onCommit={(v) => patch({ x: v }, "Set X", "prop:x:" + ids)} /></Row>
      <Row label="Y"><NumberInput value={o.y} onCommit={(v) => patch({ y: v }, "Set Y", "prop:y:" + ids)} /></Row>
      {!pointBased && (
        <>
          <Row label="W"><NumberInput value={o.width} min={1} onCommit={(v) => patch({ width: v }, "Set width", "prop:w:" + ids)} /></Row>
          {!textOnly && (
            <Row label="H"><NumberInput value={o.height} min={1} onCommit={(v) => patch({ height: v }, "Set height", "prop:h:" + ids)} /></Row>
          )}
        </>
      )}
      <Row label="R" wide={false}>
        <NumberInput value={o.rotation} step={1} onCommit={(v) => patch({ rotation: ((v % 360) + 360) % 360 }, "Rotate", "prop:rot:" + ids)} />
      </Row>
      <Row label="%" wide>
        <RangeRow value={Math.round(o.opacity * 100)} min={0} max={100}
          format={(v) => `${v}%`}
          onChange={(v) => patch({ opacity: v / 100 }, "Opacity", "prop:op:" + ids)} />
      </Row>
    </div>
  );
}

function StyleSection({ objs, first }: { objs: CanvasObject[]; first: CanvasObject }) {
  const patch = usePatch(objs);
  const ids = objs.map((x) => x.id).join(",");
  const paintable = objs.some((o) => !isPointBased(o) && o.type !== "text");
  const strokeable = objs.some((o) => o.type !== "text");
  const roundable = objs.every((o) => o.type === "rect" || o.type === "image");
  const arrows = objs.every((o) => o.type === "arrow");
  const isSticky = objs.every((o) => o.type === "sticky");
  if (!paintable && !strokeable && !arrows) return null;

  return (
    <div className="prop-group">
      <div className="prop-group-title">Fill & stroke</div>
      <div className="prop-grid">
        {paintable && (
          <>
            <div className="prop-row full">
              <div className="seg">
                {(["none", "solid", "gradient"] as const).map((m) => (
                  <button key={m} className={first.fillMode === m ? "on" : ""}
                    onClick={() => patch({ fillMode: m }, "Set fill mode")}>
                    {m === "none" ? "None" : m === "solid" ? "Solid" : "Gradient"}
                  </button>
                ))}
              </div>
            </div>
            {first.fillMode !== "none" && (
              <>
                <div className="prop-row full">
                  <ColorField value={first.fill} title="Fill color"
                    onChange={(v) => { patch({ fill: v }, "Fill color", "prop:fill:" + ids); }} />
                  <button className="icon-btn" title="Pick a colour from the canvas (I)"
                    onClick={() => useStore.getState().setTool("eyedropper")}>
                    <Pipette size={13} />
                  </button>
                  {first.fillMode === "gradient" && (
                    <ColorField value={first.fill2} title="Gradient end"
                      onChange={(v) => patch({ fill2: v }, "Gradient end", "prop:fill2:" + ids)} />
                  )}
                </div>
                {first.fillMode === "gradient" && (
                  <div className="prop-row full">
                    <span className="prop-label">∠</span>
                    <RangeRow value={first.fillAngle} min={0} max={360}
                      format={(v) => `${v}°`}
                      onChange={(v) => patch({ fillAngle: v }, "Gradient angle", "prop:fa:" + ids)} />
                  </div>
                )}
                {isSticky && (
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {STICKY_COLORS.map((c) => (
                      <button key={c} title={c}
                        style={{
                          width: 20, height: 20, borderRadius: 4, background: c, padding: 0,
                          border: first.fill.toLowerCase() === c
                            ? "2px solid var(--accent)" : "1px solid var(--border-2)",
                        }}
                        onClick={() => patch({ fill: c }, "Sticky color")} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
        {strokeable && (
          <>
            <div className="prop-row full">
              <span className="prop-label">S</span>
              <ColorField value={first.stroke || "#000000"} none={!first.stroke}
                title="Stroke color (set width below)"
                onChange={(v) => patch({ stroke: v, strokeWidth: Math.max(1, first.strokeWidth) }, "Stroke color", "prop:sc:" + ids)} />
              <button className="mini-btn" style={{ height: 24 }}
                onClick={() => patch({ stroke: "", strokeWidth: 0 }, "Remove stroke")}>
                None
              </button>
            </div>
            <Row label="W" wide>
              <NumberInput value={first.strokeWidth} min={0} max={80} step={0.5}
                onCommit={(v) => patch({ strokeWidth: v }, "Stroke width", "prop:sw:" + ids)} />
            </Row>
          </>
        )}
        {roundable && (
          <Row label="⌒" wide>
            <NumberInput value={first.cornerRadius} min={0} max={400}
              onCommit={(v) => patch({ cornerRadius: v }, "Corner radius", "prop:cr:" + ids)} />
          </Row>
        )}
        {arrows && (
          <div className="prop-row full">
            <span className="prop-label">➤</span>
            <select className="sel-input" value={first.arrowHeads ?? "end"}
              onChange={(e) => patch({ arrowHeads: e.currentTarget.value as CanvasObject["arrowHeads"] }, "Arrow heads")}>
              <option value="end">Head at end</option>
              <option value="both">Heads at both ends</option>
              <option value="none">No heads (line)</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function ShadowSection({ objs, first }: { objs: CanvasObject[]; first: CanvasObject }) {
  const patch = usePatch(objs);
  const ids = objs.map((x) => x.id).join(",");
  if (isPointBased(first)) return null;
  return (
    <div className="prop-group">
      <div className="prop-group-title">
        Shadow
        <span className="spacer" style={{ flex: 1 }} />
        <label className="check">
          <input type="checkbox" checked={first.shadow}
            onChange={(e) => patch({ shadow: e.currentTarget.checked }, "Toggle shadow")} />
        </label>
      </div>
      {first.shadow && (
        <div className="prop-grid">
          <div className="prop-row full">
            <ColorField value={first.shadowColor.replace(/[0-9a-fA-F]{2}$/, "")} title="Shadow color"
              onChange={(v) => patch({ shadowColor: v + "88" }, "Shadow color", "prop:shc:" + ids)} />
          </div>
          <Row label="B" wide>
            <NumberInput value={first.shadowBlur} min={0} max={100}
              onCommit={(v) => patch({ shadowBlur: v }, "Shadow blur", "prop:shb:" + ids)} />
          </Row>
          <Row label="X">
            <NumberInput value={first.shadowX} min={-100} max={100}
              onCommit={(v) => patch({ shadowX: v }, "Shadow X", "prop:shx:" + ids)} />
          </Row>
          <Row label="Y">
            <NumberInput value={first.shadowY} min={-100} max={100}
              onCommit={(v) => patch({ shadowY: v }, "Shadow Y", "prop:shy:" + ids)} />
          </Row>
        </div>
      )}
    </div>
  );
}

/** One-click text effect presets + live border controls. */
function TextEffectsSection({ objs, first }: { objs: CanvasObject[]; first: CanvasObject }) {
  const patch = usePatch(objs);
  const dark = useStore((s) => s.theme === "dark");
  const ids = objs.map((x) => x.id).join(",");
  if (!objs.some((o) => hasText(o))) return null;

  const hasBorder = (first.strokeWidth ?? 0) > 0 && !!first.stroke;

  return (
    <>
      {/* ── Text Border ── */}
      <div className="prop-group">
        <div className="prop-group-title">
          Text Border
          <span style={{ flex: 1 }} />
          <label className="check">
            <input
              type="checkbox"
              checked={hasBorder}
              onChange={(e) =>
                e.currentTarget.checked
                  ? patch({ stroke: "#8b3dff", strokeWidth: 2 }, "Enable text border")
                  : patch({ stroke: "", strokeWidth: 0 }, "Remove text border")
              }
            />
          </label>
        </div>
        {hasBorder && (
          <div className="prop-grid">
            {/* border colour + quick swatches */}
            <div className="prop-row full">
              <ColorField
                value={first.stroke || "#8b3dff"}
                title="Border colour"
                onChange={(v) => patch({ stroke: v }, "Border colour", "prop:txstroke:" + ids)}
              />
            </div>
            {/* colour swatches for quick picks */}
            <div style={{ gridColumn: "1/-1", display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["#ffffff","#000000","#8b3dff","#e84c88","#f7d154","#62c26d","#4c8dff","#f26d6d","#00c4cc"].map((c) => (
                <button key={c} title={c}
                  style={{
                    width: 18, height: 18, borderRadius: 4, background: c, padding: 0, flex: "none",
                    border: (first.stroke || "").toLowerCase() === c.toLowerCase()
                      ? "2px solid var(--accent)" : "1px solid var(--border-2)",
                  }}
                  onClick={() => patch({ stroke: c }, "Border colour")} />
              ))}
            </div>
            {/* thickness */}
            <div className="range-row" style={{ gridColumn: "1/-1" }}>
              <span style={{ fontSize: 11, color: "var(--text-2)", width: 56, flex: "none" }}>Thickness</span>
              <input
                type="range" className="prop-range" min={1} max={20} step={0.5}
                value={first.strokeWidth ?? 2}
                onChange={(e) => patch({ strokeWidth: Number(e.currentTarget.value) }, "Border width", "prop:txsw:" + ids)}
              />
              <output style={{ width: 32, textAlign: "right", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                {first.strokeWidth ?? 2}px
              </output>
            </div>
            {/* quick preset border styles */}
            <div className="prop-row full chip-row" style={{ gridColumn: "1/-1" }}>
              {[
                { label: "Thin", w: 1 }, { label: "Medium", w: 3 },
                { label: "Bold", w: 6 }, { label: "Heavy", w: 10 },
              ].map((s) => (
                <button key={s.label} className={"chip" + ((first.strokeWidth ?? 0) === s.w ? " on" : "")}
                  onClick={() => patch({ strokeWidth: s.w }, "Border " + s.label)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Text Effect Presets ── */}
      <div className="prop-group">
        <div className="prop-group-title">Text Effects</div>
        <div className="text-effects-grid">
          {TEXT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="text-effect-card"
              title={preset.name}
              onClick={() => patch(preset.patch, `Effect: ${preset.name}`)}
            >
              <img
                src={renderPreviewThumb(preset, 72, 38, dark)}
                width={72} height={38}
                alt={preset.name}
                draggable={false}
              />
              <span className="text-effect-label">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function TextSection({ objs, first }: { objs: CanvasObject[]; first: CanvasObject }) {
  const patch = usePatch(objs);
  const ids = objs.map((x) => x.id).join(",");
  if (!objs.some((o) => hasText(o))) return null;
  const segBtn = (key: "bold" | "italic" | "underline" | "strike", icon: React.ReactNode, title: string, chord: string | null) => (
    <button className={first[key] ? "on" : ""} title={title}
      onClick={() => (chord ? runAction(chord) : patch({ [key]: !first[key] } as Partial<CanvasObject>, "Toggle " + key))}>
      {icon}
    </button>
  );
  return (
    <div className="prop-group">
      <div className="prop-group-title">Text</div>
      <div className="prop-grid">
        <div className="prop-row full">
          <select className="sel-input" value={first.fontFamily}
            onChange={(e) => patch({ fontFamily: e.currentTarget.value }, "Font family")}>
            {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <Row label="A" wide={false}>
          <NumberInput value={first.fontSize} min={4} max={300}
            onCommit={(v) => patch({ fontSize: v }, "Font size", "prop:fs:" + ids)} />
          </Row>
        <div className="prop-row">
          <div className="seg">
            {segBtn("bold", <Bold size={12} />, "Bold (Ctrl+B)", "fmt.bold")}
            {segBtn("italic", <Italic size={12} />, "Italic (Ctrl+I)", "fmt.italic")}
            {segBtn("underline", <Underline size={12} />, "Underline (Ctrl+U)", "fmt.underline")}
            {segBtn("strike", <Strikethrough size={12} />, "Strikethrough", null)}
          </div>
        </div>
        <div className="prop-row full">
          <div className="seg">
            <button className={first.align === "left" ? "on" : ""} title="Align left"
              onClick={() => patch({ align: "left" }, "Align left")}><AlignLeft size={12} /></button>
            <button className={first.align === "center" ? "on" : ""} title="Align center"
              onClick={() => patch({ align: "center" }, "Align center")}><AlignCenter size={12} /></button>
            <button className={first.align === "right" ? "on" : ""} title="Align right"
              onClick={() => patch({ align: "right" }, "Align right")}><AlignRight size={12} /></button>
          </div>
        </div>
        <Row label="LH">
          <NumberInput value={first.lineHeight} min={0.5} max={4} step={0.05}
            onCommit={(v) => patch({ lineHeight: v }, "Line height", "prop:lh:" + ids)} />
        </Row>
        <Row label="LS">
          <NumberInput value={first.letterSpacing} min={-5} max={40} step={0.5}
            onCommit={(v) => patch({ letterSpacing: v }, "Letter spacing", "prop:ls:" + ids)} />
        </Row>
        <div className="prop-row full">
          <ColorField value={first.color} title="Text color"
            onChange={(v) => patch({ color: v }, "Text color", "prop:tc:" + ids)} />
        </div>
        <SwatchRow value={first.color}
          onPick={(c) => patch({ color: c }, "Text color")} />
      </div>
    </div>
  );
}

/** Photoshop-style adjustment stack for images + shape controls. */
function ImageSection({ objs, first }: { objs: CanvasObject[]; first: CanvasObject }) {
  const patch = usePatch(objs);
  const ids = objs.map((x) => x.id).join(",");
  if (!objs.every((o) => o.type === "image")) return null;

  // Determine the current radius: 9999 means fully circular (we display "Circle").
  const isCircle = (first.cornerRadius ?? 0) >= 9999;
  const isSomeRadius = (first.cornerRadius ?? 0) > 0 && !isCircle;

  const adj = (
    label: string, key: keyof CanvasObject, min: number, max: number,
    scale = 1, step = 1,
  ) => (
    <div className="prop-row full adjust-row">
      <span className="adjust-label">{label}</span>
      <RangeRow
        value={Math.round(((first[key] as number) ?? 0) * scale)}
        min={min} max={max} step={step}
        format={(v) => `${v}`}
        onChange={(v) => patch({ [key]: v / scale } as Partial<CanvasObject>, label, `prop:${String(key)}:${ids}`)}
      />
    </div>
  );

  const toggle = (label: string, key: "grayscale" | "sepia" | "invert") => (
    <button
      className={"chip" + (first[key] ? " on" : "")}
      onClick={() => patch({ [key]: !first[key] } as Partial<CanvasObject>, label)}
    >
      {label}
    </button>
  );

  const setCrop = (ratio: number | null) => {
    if (ratio == null) {
      patch({ cropX: 0, cropY: 0, cropW: 1, cropH: 1 }, "Reset crop");
      return;
    }
    patch((o) => {
      const natW = o.naturalW ?? o.width;
      const natH = o.naturalH ?? o.height;
      const srcRatio = natW / natH;
      // Largest centred window of the requested aspect.
      let cw = 1, ch = 1;
      if (srcRatio > ratio) cw = ratio / srcRatio;
      else ch = srcRatio / ratio;
      return {
        cropX: (1 - cw) / 2, cropY: (1 - ch) / 2, cropW: cw, cropH: ch,
        height: Math.round(o.width / ratio),
      };
    }, "Crop to aspect");
  };

  const cropped = (first.cropW ?? 1) < 1 || (first.cropH ?? 1) < 1;

  return (
    <>
    {/* ── Remove Background — big, obvious button ── */}
    <div className="prop-group">
      <button
        className="bg-remove-btn"
        onClick={() => runAction("img.bgRemove")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 5l14 14M5 19L19 5" opacity="0.3" />
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M9 3v18M3 9h18" />
        </svg>
        Remove Background
      </button>
      <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 6, lineHeight: 1.5 }}>
        Auto-detects and removes the background. Use the Brush tab to erase or restore areas manually. Fully offline.
      </div>
    </div>

    {/* ── Image Shape / Radius ── */}
    <div className="prop-group">
      <div className="prop-group-title">Image Shape</div>
      <div className="prop-grid">
        {/* Quick shape chips */}
        <div className="prop-row full chip-row">
          <button className={"chip" + ((first.cornerRadius ?? 0) === 0 ? " on" : "")}
            onClick={() => patch({ cornerRadius: 0 }, "Image shape: square")}>Square</button>
          <button className={"chip" + (isSomeRadius ? " on" : "")}
            onClick={() => patch({ cornerRadius: Math.min(first.width, first.height) / 6 }, "Image shape: rounded")}>Rounded</button>
          <button className={"chip" + (isCircle ? " on" : "")}
            onClick={() => patch({ cornerRadius: 9999 }, "Image shape: circle")}>Circle</button>
        </div>
        {/* Precise radius slider */}
        {!isCircle && (
          <div className="range-row" style={{ gridColumn: "1/-1" }}>
            <span style={{ fontSize: 11, color: "var(--text-2)", width: 44, flex: "none" }}>Radius</span>
            <input type="range" className="prop-range"
              min={0} max={Math.round(Math.min(first.width, first.height) / 2)}
              value={Math.min(first.cornerRadius ?? 0, Math.round(Math.min(first.width, first.height) / 2))}
              onChange={(e) => patch({ cornerRadius: Number(e.currentTarget.value) }, "Corner radius", "prop:imgcr:" + ids)} />
            <output style={{ width: 32, textAlign: "right", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
              {Math.round(first.cornerRadius ?? 0)}px
            </output>
          </div>
        )}
        {/* Image border */}
        <div className="prop-row full">
          <span className="prop-label">Border</span>
          <ColorField value={first.stroke || "#8b3dff"} none={!first.stroke}
            onChange={(v) => patch({ stroke: v, strokeWidth: Math.max(2, first.strokeWidth) }, "Image border", "prop:imgsc:" + ids)} />
          <input type="range" className="prop-range" style={{ width: 60, flex: "none" }}
            min={0} max={24} value={first.strokeWidth ?? 0}
            onChange={(e) => patch({ strokeWidth: Number(e.currentTarget.value) }, "Border width", "prop:imgsw:" + ids)} />
          <output style={{ width: 26, textAlign: "right", color: "var(--text-2)", fontSize: 11, fontVariantNumeric: "tabular-nums", flex: "none" }}>
            {first.strokeWidth ?? 0}
          </output>
        </div>
      </div>
    </div>

    {/* ── Adjustments ── */}
    <div className="prop-group">
      <div className="prop-group-title">
        Adjustments
        <span style={{ flex: 1 }} />
        <button className="link-btn" title="Reset all adjustments"
          onClick={() => patch({
            brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0,
            pixelate: 0, noise: 0, sharpen: 0,
            grayscale: false, sepia: false, invert: false,
          }, "Reset adjustments")}>
          Reset
        </button>
      </div>
      <div className="prop-grid">
        {adj("Brightness", "brightness", -100, 100, 100)}
        {adj("Contrast", "contrast", -100, 100, 1)}
        {adj("Saturation", "saturation", -100, 200, 50)}
        {adj("Hue", "hue", 0, 359, 1)}
        {adj("Sharpen", "sharpen", -100, 100, 100)}
        {adj("Blur", "blur", 0, 60, 1)}
        {adj("Pixelate", "pixelate", 0, 40, 1)}
        {adj("Grain", "noise", 0, 100, 100)}
        <div className="prop-row full chip-row">
          {toggle("B/W", "grayscale")}
          {toggle("Sepia", "sepia")}
          {toggle("Invert", "invert")}
        </div>
      </div>

      <div className="prop-group-title" style={{ marginTop: 12 }}>
        Crop
        {cropped && (
          <>
            <span style={{ flex: 1 }} />
            <button className="link-btn" onClick={() => setCrop(null)}>Reset</button>
          </>
        )}
      </div>
      <div className="prop-row full chip-row">
        {CROP_ASPECTS.map((a) => (
          <button key={a.label} className="chip" onClick={() => setCrop(a.ratio)}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
    </>
  );
}

/** Hyperlink attached to the selection (any object type can carry one). */
function LinkSection({ objs, first }: { objs: CanvasObject[]; first: CanvasObject }) {
  const patch = usePatch(objs);
  const isCard = first.type === "link";
  if (!isCard && objs.length > 1) return null;

  return (
    <div className="prop-group">
      <div className="prop-group-title">
        Link
        <span style={{ flex: 1 }} />
        {first.link && (
          <button className="link-btn"
            onClick={() => patch({ link: undefined }, "Remove link")}>
            Remove
          </button>
        )}
      </div>
      {first.link ? (
        <>
          <div
            style={{
              fontSize: 11, color: "var(--accent)", wordBreak: "break-all",
              background: "var(--panel-3)", padding: "7px 9px", borderRadius: 8,
              marginBottom: 7,
            }}
            title={first.link}
          >
            {prettyUrl(first.link)}
          </div>
          <div className="prop-btn-row">
            <button className="mini-btn accent"
              onClick={() => useStore.getState().setPendingLink(first.link!)}>
              Open
            </button>
            <button className="mini-btn" onClick={() => runAction("insert.link")}>Edit</button>
            <button className="mini-btn" onClick={() => runAction("insert.copyLink")}>Copy</button>
          </div>
        </>
      ) : (
        <div className="prop-btn-row">
          <button className="mini-btn" onClick={() => runAction("insert.link")}>
            <LinkIcon size={12} /> Add link (Ctrl+K)
          </button>
        </div>
      )}
    </div>
  );
}

/** Blend mode + quick pixel effects available on every object. */
function BlendSection({ objs, first }: { objs: CanvasObject[]; first: CanvasObject }) {
  const patch = usePatch(objs);
  return (
    <div className="prop-group">
      <div className="prop-group-title">Blending</div>
      <div className="prop-grid">
        <div className="prop-row full">
          <select
            className="sel-input"
            value={first.blendMode ?? "normal"}
            onChange={(e) => patch({ blendMode: e.currentTarget.value as BlendMode }, "Blend mode")}
          >
            {BLEND_MODES.map((m) => (
              <option key={m} value={m}>
                {m === "normal" ? "Normal" : m.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function ArrangeSection({ objs }: { objs: CanvasObject[] }) {
  return (
    <div className="prop-group">
      <div className="prop-group-title">Actions</div>
      <div className="prop-btn-row">
        {objs.length > 1 && (
          <button className="mini-btn" onClick={() => runAction("obj.group")}>
            <GroupIcon size={12} /> Group
          </button>
        )}
        {objs.some((o) => o.groupId) && (
          <button className="mini-btn" onClick={() => runAction("obj.ungroup")}>
            <UngroupIcon size={12} /> Ungroup
          </button>
        )}
        <button className="mini-btn" onClick={() => runAction("edit.duplicate")}>
          <Copy size={12} /> Duplicate
        </button>
        <button className="mini-btn" onClick={() => runAction("edit.delete")}>
          <Trash2 size={12} /> Delete
        </button>
      </div>
      {objs.length > 1 && (
        <div className="prop-btn-row" style={{ marginTop: 6 }}>
          <button className="mini-btn" onClick={() => runAction("fmt.alignObjectsLeft")}>Left</button>
          <button className="mini-btn" onClick={() => runAction("fmt.alignObjectsCenterX")}>Center</button>
          <button className="mini-btn" onClick={() => runAction("fmt.alignObjectsRight")}>Right</button>
          <button className="mini-btn" onClick={() => runAction("fmt.alignObjectsTop")}>Top</button>
          <button className="mini-btn" onClick={() => runAction("fmt.alignObjectsCenterY")}>Middle</button>
          <button className="mini-btn" onClick={() => runAction("fmt.alignObjectsBottom")}>Bottom</button>
          {objs.length > 2 && (
            <>
              <button className="mini-btn" onClick={() => runAction("fmt.distributeH")}>Distrib. H</button>
              <button className="mini-btn" onClick={() => runAction("fmt.distributeV")}>Distrib. V</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
