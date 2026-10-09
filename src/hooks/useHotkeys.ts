// ─────────────────────────────────────────────────────────────────────────────
// Global keyboard shortcuts. Every chord routes through the action registry.
// Ignored while typing in inputs; Space maps to temporary pan; Tab cycles
// selection; Ctrl+Tab switches document tabs.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useStore } from "../core/store";
import { CHORD_MAP, cycleSelection } from "../ui/actions";

function chordOf(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase();
  if (["control", "shift", "alt", "meta"].includes(key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key === " " ? "space" : key);
  return parts.join("+");
}

export function useHotkeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target?.closest?.("input, textarea, select, [contenteditable]");

      // Slideshow mode: PresentMode owns the keyboard (arrows, space, Esc…).
      if (useStore.getState().presenting) return;

      // Space → temporary pan mode
      if (e.code === "Space" && !inField) {
        e.preventDefault();
        if (!useStore.getState().spaceHeld) useStore.getState().setSpaceHeld(true);
        return;
      }
      if (inField) return;

      // While a modal/palette is open, swallow bare-key tool switches (dialogs
      // manage their own Escape/Enter); chords like Ctrl+S still work.
      const ui = useStore.getState();
      const modalOpen = ui.paletteOpen || ui.rowsOpen || ui.settingsOpen ||
        ui.aboutOpen || ui.linkOpen || !!ui.pendingLink;
      if (modalOpen && !e.ctrlKey && !e.metaKey) return;

      // Tab → cycle selection through objects
      if (e.key === "Tab") {
        e.preventDefault();
        cycleSelection(e.shiftKey ? -1 : 1);
        return;
      }

      const chord = chordOf(e);
      if (!chord) return;

      // document tab switching
      if (chord === "ctrl+tab" || chord === "ctrl+shift+tab") {
        e.preventDefault();
        const st = useStore.getState();
        const idx = st.docs.findIndex((d) => d.id === st.activeDocId);
        if (st.docs.length > 1 && idx >= 0) {
          const dir = chord === "ctrl+tab" ? 1 : -1;
          const next = st.docs[(idx + dir + st.docs.length) % st.docs.length];
          st.setActiveDoc(next.id);
        }
        return;
      }

      const action = CHORD_MAP.get(chord);
      if (action) {
        e.preventDefault();
        if (!action.enabled || action.enabled()) action.run();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") useStore.getState().setSpaceHeld(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
