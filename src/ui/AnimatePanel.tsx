// ─────────────────────────────────────────────────────────────────────────────
// AnimatePanel — Canva-style animation selection.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { X, Play, Download } from "lucide-react";
import { useStore } from "../core/store";
import type { AnimationType } from "../core/types";
import { stageBus } from "../core/fileio";

const SUGGESTED: AnimationType[] = [
  "typewriter", "ascend", "shift", "merge", "block", "burst", "bounce", "roll", "skate", "spread", "clarify"
];

const GENERAL: AnimationType[] = [
  "rise", "pan", "fade", "pop", "wipe", "blur", "succession", "breathe", "baseline", "drift", "tectonic", "tumble", "neon", "scrapbook", "stomp"
];

export default function AnimatePanel() {
  const selection = useStore((s) => s.selection);
  const st = useStore.getState;
  const isPlaying = useStore((s) => s.playing);

  const onClose = () => st().setFlag("animateOpen", false);

  const applyAnim = (type: AnimationType) => {
    if (selection.length === 0) return;
    st().updateObjects(selection, {
      animation: { type, duration: 1, delay: 0, direction: "enter" }
    }, "Apply animation");

    // Preview
    st().setPlaybackTime(0);
    st().setPlaying(true);
  };

  const startPlayback = () => {
    st().setPlaybackTime(0);
    st().setPlaying(true);
  };

  // Playback Loop
  useEffect(() => {
    if (!isPlaying) return;
    let frame: number;
    let start = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - start) / 1000;
      st().setPlaybackTime(elapsed);
      if (elapsed < 3.0) {
        frame = requestAnimationFrame(loop);
      } else {
        st().setPlaying(false);
        st().setPlaybackTime(0);
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  return (
    <div className="side-panel right animate-panel">
      <div className="panel-head">
        Animate
        <span className="spacer" />
        <button className="icon-btn" onClick={onClose}><X size={14} /></button>
      </div>

      <div className="panel-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="mini-btn accent" style={{ flex: 1 }} onClick={startPlayback}>
            <Play size={12} /> Preview
          </button>
          <button className="mini-btn" onClick={() => void downloadAsVideo()}>
            <Download size={12} /> Video
          </button>
        </div>

        <div className="prop-group-title">Suggested</div>
        <div className="text-effects-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {SUGGESTED.map((type) => (
            <AnimCard key={type} type={type} onClick={() => applyAnim(type)} />
          ))}
        </div>

        <div className="prop-group-title" style={{ marginTop: 20 }}>General</div>
        <div className="text-effects-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {GENERAL.map((type) => (
            <AnimCard key={type} type={type} onClick={() => applyAnim(type)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AnimCard({ type, onClick }: { type: AnimationType; onClick: () => void }) {
  return (
    <button className="text-effect-card" onClick={onClick}>
      <div className="anim-preview-box">
        <div className={`anim-icon-${type}`} />
      </div>
      <span className="text-effect-label" style={{ textTransform: 'capitalize' }}>{type}</span>
    </button>
  );
}

/**
 * Record the canvas for 3 seconds and download as WebM/MP4.
 * Uses MediaRecorder API which works entirely offline.
 */
async function downloadAsVideo() {
  const stage = stageBus.stage;
  if (!stage) return;

  // Konva uses multiple canvases (layers). To record them all, we capture
  // the stream from the visible DOM container's canvas or the main layer.
  const layer = stage.getLayers()[1]; // Main object layer
  if (!layer) return;
  const canvas = (layer.getCanvas() as any)._canvas;
  if (!canvas || !canvas.captureStream) {
    useStore.getState().showToast("Video export is not supported in this browser.");
    return;
  }

  const stream = (canvas as any).captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sadas-animation.webm";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const st = useStore.getState();
  st.showToast("Recording 3s animation...");

  // Reset and play
  st.setPlaybackTime(0);
  st.setPlaying(true);

  // Small delay to ensure the first frame is correct
  setTimeout(() => {
    recorder.start();
    setTimeout(() => {
      recorder.stop();
      st.setPlaying(false);
      st.setPlaybackTime(0);
    }, 3000);
  }, 100);
}
