// ─────────────────────────────────────────────────────────────────────────────
// TabStrip — open documents as tabs with dirty indicators + inline rename.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useStore } from "../core/store";

export default function TabStrip() {
  const docs = useStore((s) => s.docs);
  const activeDocId = useStore((s) => s.activeDocId);
  const dirty = useStore((s) => s.dirty);
  const [renaming, setRenaming] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const commitRename = (docId: string) => {
    const v = inputRef.current?.value.trim();
    if (v) useStore.getState().renameDocument(docId, v);
    setRenaming(null);
  };

  return (
    <div className="tabstrip">
      {docs.map((d) => {
        const active = d.id === activeDocId;
        const isDirty = !!dirty[d.id];
        return (
          <div
            key={d.id}
            className={"tab" + (active ? " active" : "")}
            onMouseDown={(e) => {
              if (e.button === 1) { e.preventDefault(); useStore.getState().closeDocument(d.id); return; }
              if (!active) useStore.getState().setActiveDoc(d.id);
            }}
            onDoubleClick={() => setRenaming(d.id)}
            title={d.name + (isDirty ? " (unsaved changes)" : "")}
          >
            {renaming === d.id ? (
              <input
                ref={inputRef}
                className="row-rename"
                defaultValue={d.name}
                onBlur={() => commitRename(d.id)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename(d.id);
                  if (e.key === "Escape") setRenaming(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="tab-name">
                {isDirty && <span className="dirty-dot">●</span>}
                {d.name}
              </span>
            )}
            {docs.length > 1 && (
              <button
                className="tab-close"
                title="Close tab"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); useStore.getState().closeDocument(d.id); }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}
      <button
        className="tab-add"
        title="New document (Ctrl+N)"
        onClick={() => useStore.getState().newDocument()}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
