// ─────────────────────────────────────────────────────────────────────────────
// FindReplace (Ctrl+F) — searches text across all objects on every page of the
// active document; navigates, highlights, replaces one or all.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronUp, ChevronDown, CaseSensitive, Regex, WholeWord, Replace } from "lucide-react";
import { useStore, activeDoc } from "../core/store";
import { hasText, type CanvasObject } from "../core/types";

interface Match {
  pageId: string;
  pageName: string;
  obj: CanvasObject;
  count: number;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function FindReplace() {
  const open = useStore((s) => s.findOpen);
  const doc = useStore((s) => activeDoc(s));
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else { setIndex(0); }
  }, [open]);

  const matcher = useMemo((): RegExp | null => {
    if (!query) return null;
    try {
      const src = useRegex ? query : escapeRegex(query);
      const body = wholeWord ? `\\b(?:${src})\\b` : src;
      return new RegExp(body, caseSensitive ? "g" : "gi");
    } catch { return null; }
  }, [query, caseSensitive, wholeWord, useRegex]);

  const matches = useMemo((): Match[] => {
    if (!matcher || !doc) return [];
    const out: Match[] = [];
    for (const p of doc.pages) {
      for (const o of p.objects) {
        if (!hasText(o) || !o.text) continue;
        matcher.lastIndex = 0;
        const count = (o.text.match(matcher) ?? []).length;
        if (count > 0) out.push({ pageId: p.id, pageName: p.name, obj: o, count });
      }
    }
    return out;
  }, [matcher, doc]);

  const total = matches.reduce((s, m) => s + m.count, 0);

  useEffect(() => {
    if (index >= matches.length) setIndex(0);
  }, [matches.length, index]);

  if (!open) return null;

  const close = () => useStore.getState().setFlag("findOpen", false);

  const jump = (i: number) => {
    if (!matches.length) return;
    const idx = ((i % matches.length) + matches.length) % matches.length;
    setIndex(idx);
    const m = matches[idx];
    const st = useStore.getState();
    if (doc && doc.pageId !== m.pageId) st.setActivePage(m.pageId);
    st.setSelection([m.obj.id]);
    const { viewport } = st;
    const z = doc?.camera.zoom ?? 1;
    st.setCamera({
      zoom: z,
      x: viewport.w / 2 - (m.obj.x + m.obj.width / 2) * z,
      y: viewport.h / 2 - (m.obj.y + m.obj.height / 2) * z,
    });
  };

  const replaceIn = (m: Match) => {
    if (!matcher) return;
    matcher.lastIndex = 0;
    const next = m.obj.text.replace(matcher, replacement);
    useStore.getState().updateObjects([m.obj.id], { text: next }, "Replace", "find-replace");
  };

  return (
    <div className="find-bar" onKeyDown={(e) => e.stopPropagation()}>
      <div className="find-row">
        <input
          ref={inputRef}
          className="text-input"
          placeholder="Find in document…"
          value={query}
          onChange={(e) => { setQuery(e.currentTarget.value); setIndex(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            else if (e.key === "Enter") jump(index + (e.shiftKey ? -1 : matches.length ? 1 : 0));
          }}
        />
        <span className="find-count" title="Matches">
          {matches.length ? `${Math.min(index + 1, matches.length)}/${matches.length}` : query ? "0" : ""}
        </span>
        <button className="icon-btn" title={caseSensitive ? "Case sensitive: on" : "Case sensitive: off"}
          style={caseSensitive ? { color: "var(--accent)" } : undefined}
          onClick={() => setCaseSensitive(!caseSensitive)}>
          <CaseSensitive size={14} />
        </button>
        <button className="icon-btn" title={wholeWord ? "Whole word: on" : "Whole word: off"}
          style={wholeWord ? { color: "var(--accent)" } : undefined}
          onClick={() => setWholeWord(!wholeWord)}>
          <WholeWord size={14} />
        </button>
        <button className="icon-btn" title={useRegex ? "Regex: on" : "Regex: off"}
          style={useRegex ? { color: "var(--accent)" } : undefined}
          onClick={() => setUseRegex(!useRegex)}>
          <Regex size={14} />
        </button>
        <button className="icon-btn" title="Previous (Shift+Enter)" disabled={!matches.length}
          onClick={() => jump(index - 1)}>
          <ChevronUp size={14} />
        </button>
        <button className="icon-btn" title="Next (Enter)" disabled={!matches.length}
          onClick={() => jump(index + 1)}>
          <ChevronDown size={14} />
        </button>
        <button className="icon-btn" title="Replace controls"
          style={showReplace ? { color: "var(--accent)" } : undefined}
          onClick={() => setShowReplace(!showReplace)}>
          <Replace size={14} />
        </button>
        <button className="icon-btn" title="Close (Esc)" onClick={close}>
          <X size={14} />
        </button>
      </div>
      {showReplace && (
        <>
          <div className="find-row">
            <input
              className="text-input"
              placeholder="Replace with…"
              value={replacement}
              onChange={(e) => setReplacement(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Escape") close(); }}
            />
            <button className="mini-btn" disabled={!matches.length}
              onClick={() => { if (matches[index]) { replaceIn(matches[index]); jump(index); } }}>
              Replace
            </button>
            <button className="mini-btn" disabled={!matches.length}
              onClick={() => matches.forEach(replaceIn)}>
              All
            </button>
          </div>
        </>
      )}
      {matches.length > 0 && (
        <div className="find-options">
          <span style={{ fontSize: 11 }}>
            {total} occurrence{total === 1 ? "" : "s"} · current: {matches[index]?.pageName ?? ""} → {matches[index]?.obj.name ?? ""}
          </span>
        </div>
      )}
    </div>
  );
}
