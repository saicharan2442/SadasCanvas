// ─────────────────────────────────────────────────────────────────────────────
// PresentMode — Canva-style slideshow. It reuses the live Konva canvas (so
// slides render at full fidelity, filters and all) and simply hides every
// editing surface, fits the sheet and layers navigation controls on top.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, Grid2x2, Play } from "lucide-react";
import { useStore, activeDoc } from "../core/store";
import { presentStep, presentGoTo, stopPresenting } from "./actions";

export default function PresentMode() {
  const doc = useStore((s) => activeDoc(s));
  const [showUi, setShowUi] = useState(true);
  const [overview, setOverview] = useState(false);
  const hideTimer = useRef<number | null>(null);

  const pages = doc?.pages ?? [];
  const index = Math.max(0, pages.findIndex((p) => p.id === doc?.pageId));
  const atStart = index <= 0;
  const atEnd = index >= pages.length - 1;

  // Auto-hide the controls while presenting; any pointer move brings them back.
  useEffect(() => {
    const wake = () => {
      setShowUi(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setShowUi(false), 2600);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  // Slideshow keys own the keyboard while presenting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight": case "ArrowDown": case " ": case "PageDown": case "Enter":
          e.preventDefault(); e.stopPropagation();
          if (overview) setOverview(false); else presentStep(1);
          break;
        case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace":
          e.preventDefault(); e.stopPropagation(); presentStep(-1);
          break;
        case "Home":
          e.preventDefault(); if (pages[0]) presentGoTo(pages[0].id);
          break;
        case "End":
          e.preventDefault(); if (pages.length) presentGoTo(pages[pages.length - 1].id);
          break;
        case "Escape":
          e.preventDefault(); e.stopPropagation();
          if (overview) setOverview(false); else void stopPresenting();
          break;
        case "g": case "G":
          e.preventDefault(); setOverview((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [overview, pages]);

  // Leaving browser full screen (F11 / Esc) ends the slideshow too.
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && useStore.getState().presenting) {
        void stopPresenting();
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (!doc) return null;

  return (
    <>
      {/* click zones: left third goes back, the rest advances */}
      <div className="present-click-layer">
        <div className="present-zone prev" onClick={() => presentStep(-1)} />
        <div className="present-zone next" onClick={() => presentStep(1)} />
      </div>

      <div className={"present-bar" + (showUi || overview ? "" : " hidden")}>
        <button className="present-btn" title="Previous (←)" disabled={atStart}
          onClick={() => presentStep(-1)}>
          <ChevronLeft size={18} />
        </button>
        <span className="present-count">
          {index + 1} / {pages.length}
        </span>
        <button className="present-btn" title="Next (→)" disabled={atEnd}
          onClick={() => presentStep(1)}>
          <ChevronRight size={18} />
        </button>
        <span className="present-divider" />
        <button className={"present-btn" + (overview ? " on" : "")} title="All sheets (G)"
          onClick={() => setOverview((v) => !v)}>
          <Grid2x2 size={16} />
        </button>
        <button className="present-btn" title="Exit (Esc)" onClick={() => void stopPresenting()}>
          <X size={17} />
        </button>
      </div>

      {overview && (
        <div className="present-overview" onClick={() => setOverview(false)}>
          <div className="present-overview-grid" onClick={(e) => e.stopPropagation()}>
            {pages.map((p, i) => (
              <button
                key={p.id}
                className={"present-ov-card" + (p.id === doc.pageId ? " current" : "")}
                onClick={() => { presentGoTo(p.id); setOverview(false); }}
              >
                <span className="present-ov-num">{i + 1}</span>
                <span className="present-ov-name">{p.name}</span>
                {p.id === doc.pageId && <Play size={11} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
