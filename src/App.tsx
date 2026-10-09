// ─────────────────────────────────────────────────────────────────────────────
// Sadas Canvas — application root. Assembles the shell and wires the
// offline session lifecycle: persist, rotate backups, crash recovery.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import MenuBar from "./ui/MenuBar";
import Toolbar from "./ui/Toolbar";
import TabStrip from "./ui/TabStrip";
import LeftPanel from "./ui/LeftPanel";
import PropertiesPanel from "./ui/PropertiesPanel";
import StatusBar from "./ui/StatusBar";
import SheetsBar from "./ui/SheetsBar";
import PresentMode from "./ui/PresentMode";
import AnimatePanel from "./ui/AnimatePanel";
import CommandPalette from "./ui/CommandPalette";
import FindReplace from "./ui/FindReplace";
import {
  AboutDialog, SettingsDialog, RowsDialog, RecoveryBanner,
  LinkDialog, LinkConfirmDialog, BgRemoveDialog,
} from "./ui/Dialogs";
import CanvasStage from "./editor/CanvasStage";
import { useHotkeys } from "./hooks/useHotkeys";
import { useStore, activeDoc, activePage, getClipboard } from "./core/store";
import {
  persistSession, pushBackup, markBoot, markCleanExit, clearSession,
} from "./core/fileio";
import { addImageFromFile } from "./ui/actions";
import { makeDocument, makeObject, isDarkColor } from "./core/factory";
import { isInfinite, sanitizeUrl, prettyUrl } from "./core/types";
import { runSelfTests } from "./core/selftest";

export default function App() {
  useHotkeys();

  const theme = useStore((s) => s.theme);
  const leftVisible = useStore((s) => s.leftVisible);
  const rightVisible = useStore((s) => s.rightVisible);
  const chromeHidden = useStore((s) => s.chromeHidden);
  const presenting = useStore((s) => s.presenting);
  const animateOpen = useStore((s) => s.animateOpen);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const findOpen = useStore((s) => s.findOpen);
  const aboutOpen = useStore((s) => s.aboutOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const rowsOpen = useStore((s) => s.rowsOpen);
  const linkOpen = useStore((s) => s.linkOpen);
  const bgRemoveOpen = useStore((s) => s.bgRemoveOpen);
  const docs = useStore((s) => s.docs);
  const activeDocId = useStore((s) => s.activeDocId);
  const autosaveSec = useStore((s) => s.autosaveSec);
  const toast = useStore((s) => s.toast);
  const toastTs = useStore((s) => s.toastTs);

  const [recovered, setRecovered] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  // ── boot: theme, dev self-tests, crash flag ─────────────────────────────
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (import.meta.env.DEV) runSelfTests();
    try {
      const crashed = markBoot();
      if (crashed && localStorage.getItem("cp:session")) setRecovered(true);
    } catch { /* private mode */ }
  }, []);

  // ── session persistence (debounced on any document change) ──────────────
  useEffect(() => {
    const t = setTimeout(() => persistSession(docs, activeDocId), 700);
    return () => clearTimeout(t);
  }, [docs, activeDocId]);

  // ── rotating backups on the autosave interval ───────────────────────────
  useEffect(() => {
    if (!autosaveSec) return;
    const iv = setInterval(() => {
      const st = useStore.getState();
      const d = activeDoc(st);
      if (d && st.dirty[d.id]) {
        pushBackup(d);
        persistSession(st.docs, st.activeDocId);
      }
    }, autosaveSec * 1000);
    return () => clearInterval(iv);
  }, [autosaveSec]);

  // ── connectivity watch (display only — no requests are ever made) ───────
  useEffect(() => {
    const sync = () => useStore.getState().setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // ── clean exit detection ────────────────────────────────────────────────
  useEffect(() => {
    const onUnload = () => {
      const st = useStore.getState();
      persistSession(st.docs, st.activeDocId);
      markCleanExit();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // ── external paste: images → image objects, text → text objects ─────────
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (getClipboard().length > 0) return; // internal object clipboard owns Ctrl+V
      const cd = e.clipboardData;
      if (!cd) return;

      const files = Array.from(cd.files ?? []);
      let handled = false;
      for (const f of files) handled = (await addImageFromFile(f)) || handled;

      if (!handled) {
        const text = cd.getData("text/plain");
        if (text && text.trim().length > 0) {
          const st = useStore.getState();
          const page = activePage(activeDoc(st));
          if (page) {
            const cam = activeDoc(st)!.camera;
            const { viewport } = st;

            // A pasted URL becomes a link card rather than a wall of text.
            const asUrl = /\s/.test(text.trim()) ? null : sanitizeUrl(text.trim());
            if (asUrl) {
              const card = makeObject(
                "link",
                (viewport.w / 2 - cam.x) / cam.zoom - 150,
                (viewport.h / 2 - cam.y) / cam.zoom - 48,
                { dark: st.theme === "dark", text: prettyUrl(asUrl), link: asUrl },
              );
              st.addObjects([card], "Paste link");
              e.preventDefault();
              return;
            }

            const lines = text.split(/\r\n|\r|\n/);
            const w = Math.min(
              520,
              Math.max(160, ...lines.map((l) => l.length * 7.4)) + 20,
            );
            const obj = makeObject(
              "text",
              (viewport.w / 2 - cam.x) / cam.zoom - w / 2,
              (viewport.h / 2 - cam.y) / cam.zoom - Math.min(300, lines.length * 12),
              {
                text: text.slice(0, 20000),
                width: Math.round(w),
                dark: isInfinite(page.sheet) ? st.theme === "dark" : isDarkColor(page.sheet.background),
              },
            );
            st.addObjects([obj], "Paste text");
            handled = true;
          }
        }
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // ── toast visibility ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    setToastVisible(true);
    const t = setTimeout(() => setToastVisible(false), 2300);
    return () => clearTimeout(t);
  }, [toast, toastTs]);

  return (
    <div className={"app" + (chromeHidden || presenting ? " chrome-hidden" : "") + (presenting ? " presenting" : "")}>
      <MenuBar />
      <Toolbar />
      <TabStrip />
      {recovered && (
        <RecoveryBanner
          onKeep={() => setRecovered(false)}
          onDiscard={() => {
            clearSession();
            const fresh = makeDocument();
            useStore.getState().loadDocs([fresh], fresh.id);
            setRecovered(false);
          }}
        />
      )}
      <div className="app-main">
        {leftVisible && <LeftPanel />}
        <div className="app-canvas-wrap">
          <CanvasStage />
          {findOpen && <FindReplace />}
          <SheetsBar />
        </div>
        {rightVisible && !animateOpen && <PropertiesPanel />}
        {animateOpen && <AnimatePanel />}
      </div>
      <StatusBar />
      {paletteOpen && <CommandPalette />}
      {aboutOpen && <AboutDialog />}
      {settingsOpen && <SettingsDialog />}
      {rowsOpen && <RowsDialog />}
      {linkOpen && <LinkDialog />}
      {bgRemoveOpen && <BgRemoveDialog />}
      <LinkConfirmDialog />
      {presenting && <PresentMode />}
      {toast && toastVisible && <div className="toast">{toast}</div>}
    </div>
  );
}
