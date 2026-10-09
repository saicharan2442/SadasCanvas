import { useEffect, useRef } from "react";
import { useStore } from "../core/store";
import { ACTION_MAP, runAction } from "./actions";

export default function ContextMenu() {
  const contextMenu = useStore((s) => s.contextMenu);
  const setContextMenu = useStore((s) => s.setContextMenu);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const onScroll = () => setContextMenu(null);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("wheel", onScroll);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("wheel", onScroll);
    };
  }, [contextMenu, setContextMenu]);

  if (!contextMenu) return null;

  const items = [
    "edit.copy", "edit.paste", "edit.duplicate", "edit.delete", "SEP",
    "edit.bringForward", "edit.sendBackward", "edit.bringToFront", "edit.sendToBack", "SEP",
    "edit.group", "edit.ungroup", "SEP",
    "edit.lock", "edit.unlock", "SEP",
    "insert.link", "SEP",
    "edit.setAsBackground", "SEP",
    "file.exportPng"
  ];

  let { x, y } = contextMenu;
  const w = 240;
  const h = items.length * 32;
  if (x + w > window.innerWidth) x = window.innerWidth - w - 8;
  if (y + h > window.innerHeight) y = window.innerHeight - h - 8;

  return (
    <div
      ref={ref}
      className="menu-pane"
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 99999,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {items.map((id, i) => {
        if (id === "SEP") return <div key={i} className="menu-sep" />;
        const action = ACTION_MAP.get(id);
        if (!action) return null;
        const enabled = action.enabled ? action.enabled() : true;
        const checked = action.checked ? action.checked() : false;
        const visible = action.visible ? action.visible() : true;
        if (!visible) return null;
        
        let label = action.label;
        if (id === "edit.undo" && useStore.getState().undoLabel) {
          label = `Undo ${useStore.getState().undoLabel}`;
        } else if (id === "edit.redo" && useStore.getState().redoLabel) {
          label = `Redo ${useStore.getState().redoLabel}`;
        }
        
        return (
          <button
            key={i}
            className="menu-item"
            disabled={!enabled}
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu(null);
              runAction(id);
            }}
          >
            <span className="menu-check">{checked ? "✓" : null}</span>
            <span className="menu-label">{label}</span>
            {action.shortcut && <span className="menu-sc">{action.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
