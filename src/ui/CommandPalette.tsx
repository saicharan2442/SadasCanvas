// ─────────────────────────────────────────────────────────────────────────────
// CommandPalette (Ctrl+Shift+P) — fuzzy-searchable access to every action.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Command, CornerDownLeft } from "lucide-react";
import { useStore } from "../core/store";
import { ACTIONS, runAction } from "./actions";

export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = ACTIONS.filter((a) => a.enabled ? a.enabled() || alwaysListed(a.id) : true);
    if (!q) return pool;
    return pool
      .map((a) => ({ a, score: score(a, q) }))
      .filter((r) => r.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((r) => r.a);
  }, [query]);

  useEffect(() => { setCursor(0); }, [results.length]);

  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const close = () => useStore.getState().setFlag("paletteOpen", false);

  const runAt = (i: number) => {
    const action = results[i];
    if (!action) return;
    if (action.enabled && !action.enabled()) return;
    close();
    runAction(action.id);
  };

  return (
    <div className="overlay-backdrop" onMouseDown={close}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Command size={15} />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); runAt(cursor); }
            }}
          />
          <CornerDownLeft size={13} style={{ color: "var(--text-3)" }} />
        </div>
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">No matching commands</div>}
          {results.slice(0, 60).map((a, i) => {
            const disabled = a.enabled ? !a.enabled() : false;
            return (
              <div
                key={a.id}
                className={"palette-item" + (i === cursor ? " cursor" : "")}
                style={disabled ? { opacity: 0.4 } : undefined}
                onMouseEnter={() => setCursor(i)}
                onClick={() => runAt(i)}
              >
                {a.label}
                <span className="p-cat">{a.category}</span>
                {a.shortcut && <span className="p-sc">{a.shortcut}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function alwaysListed(id: string) {
  return id.startsWith("nudge.");
}

function score(a: { label: string; category: string }, q: string): number {
  const label = a.label.toLowerCase();
  const hay = `${a.category.toLowerCase()} ${label}`;
  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 60;
  if (hay.includes(q)) return 40;
  // subsequence match
  let qi = 0;
  for (let i = 0; i < hay.length && qi < q.length; i++) if (hay[i] === q[qi]) qi++;
  return qi === q.length ? 15 : 0;
}
