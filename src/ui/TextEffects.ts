// ─────────────────────────────────────────────────────────────────────────────
// Text effect presets — one-click styles applied to selected text objects.
// Each preset is a partial CanvasObject patch. The tiny preview canvas renders
// live thumbnails with the exact same properties Konva will use on the stage.
// ─────────────────────────────────────────────────────────────────────────────

import type { CanvasObject } from "../core/types";

export interface TextPreset {
  id: string;
  name: string;
  patch: Partial<CanvasObject>;
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: "none",
    name: "Plain",
    patch: {
      bold: false, italic: false, underline: false, strike: false,
      shadow: false, fillMode: "none",
      stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "bold-dark",
    name: "Bold",
    patch: {
      bold: true, italic: false,
      color: "#1c1f27", fontSize: 28,
      shadow: false, stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "heading-accent",
    name: "Heading",
    patch: {
      bold: true, italic: false, fontSize: 36,
      color: "#8b3dff",
      shadow: false, stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "shadow-lift",
    name: "Shadow",
    patch: {
      bold: true, fontSize: 26, color: "#1c1f27",
      shadow: true, shadowColor: "#00000044",
      shadowBlur: 8, shadowX: 2, shadowY: 4,
      stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "glow-purple",
    name: "Glow",
    patch: {
      bold: true, fontSize: 26, color: "#ffffff",
      shadow: true, shadowColor: "#8b3dffcc",
      shadowBlur: 18, shadowX: 0, shadowY: 0,
      stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "glow-cyan",
    name: "Neon",
    patch: {
      bold: true, fontSize: 26, color: "#00ffcc",
      shadow: true, shadowColor: "#00ffccaa",
      shadowBlur: 22, shadowX: 0, shadowY: 0,
      stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "outline-dark",
    name: "Outline",
    patch: {
      bold: true, fontSize: 28, color: "#ffffff",
      stroke: "#1c1f27", strokeWidth: 2,
      shadow: false,
    },
  },
  {
    id: "outline-accent",
    name: "Pop",
    patch: {
      bold: true, fontSize: 28, color: "#8b3dff",
      stroke: "#ffffff", strokeWidth: 2,
      shadow: true, shadowColor: "#00000033",
      shadowBlur: 6, shadowX: 1, shadowY: 3,
    },
  },
  {
    id: "retro-shadow",
    name: "Retro",
    patch: {
      bold: true, fontSize: 30, color: "#f7d154",
      shadow: true, shadowColor: "#e84c88",
      shadowBlur: 0, shadowX: 3, shadowY: 3,
      stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "emboss",
    name: "Emboss",
    patch: {
      bold: true, fontSize: 28, color: "#d8dce5",
      shadow: true, shadowColor: "#ffffff99",
      shadowBlur: 0, shadowX: -1, shadowY: -1,
      stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "fire",
    name: "Fire",
    patch: {
      bold: true, fontSize: 28, color: "#ff4500",
      shadow: true, shadowColor: "#ff8c00cc",
      shadowBlur: 14, shadowX: 0, shadowY: -3,
      stroke: "#ffd700", strokeWidth: 1,
    },
  },
  {
    id: "ice",
    name: "Ice",
    patch: {
      bold: true, fontSize: 28, color: "#a8d8ea",
      shadow: true, shadowColor: "#4c8dffaa",
      shadowBlur: 16, shadowX: 0, shadowY: 0,
      stroke: "#ffffff", strokeWidth: 1,
    },
  },
  {
    id: "gradient-warm",
    name: "Warm",
    patch: {
      bold: true, fontSize: 28, color: "#e84c88",
      shadow: true, shadowColor: "#f7974c88",
      shadowBlur: 10, shadowX: 0, shadowY: 2,
      stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "mono",
    name: "Mono",
    patch: {
      bold: false, italic: false, fontSize: 18,
      fontFamily: "Consolas", color: "#62c26d",
      shadow: false, stroke: "", strokeWidth: 0,
    },
  },
  {
    id: "elegant",
    name: "Elegant",
    patch: {
      bold: false, italic: true, fontSize: 26,
      fontFamily: "Georgia", color: "#2a2d36",
      shadow: false, stroke: "", strokeWidth: 0,
      letterSpacing: 2,
    },
  },
  {
    id: "stamp",
    name: "Stamp",
    patch: {
      bold: true, fontSize: 22, color: "#d3453c",
      stroke: "#d3453c", strokeWidth: 2,
      shadow: false, italic: false,
      letterSpacing: 6,
    },
  },
  {
    id: "sticker",
    name: "Sticker",
    patch: {
      bold: true, fontSize: 26, color: "#1c1f27",
      stroke: "#ffffff", strokeWidth: 5,
      shadow: true, shadowColor: "#00000033",
      shadowBlur: 8, shadowX: 2, shadowY: 3,
    },
  },
  {
    id: "framed",
    name: "Framed",
    patch: {
      bold: true, fontSize: 24, color: "#ffffff",
      fillMode: "solid", fill: "#1c1f27",
      cornerRadius: 6, stroke: "#8b3dff", strokeWidth: 2,
    },
  },
  {
    id: "chalk",
    name: "Chalk",
    patch: {
      bold: false, italic: false, fontSize: 28,
      fontFamily: "Comic Sans MS", color: "#ffffffcc",
      shadow: true, shadowColor: "#ffffff44",
      shadowBlur: 4, shadowX: 1, shadowY: 1,
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    patch: {
      bold: true, fontSize: 26, color: "#00c4cc",
      fillMode: "solid", fill: "#111318",
      cornerRadius: 0, shadow: false,
    },
  },
  {
    id: "candy",
    name: "Candy",
    patch: {
      bold: true, fontSize: 28, color: "#ffffff",
      stroke: "#e84c88", strokeWidth: 3,
      shadow: true, shadowColor: "#8b3dff88",
      shadowBlur: 10, shadowX: 0, shadowY: 0,
    },
  },
];

/**
 * Render a tiny preview thumbnail for a text preset.
 * Returns a data-URL PNG that can be used as an <img> src.
 */
export function renderPreviewThumb(
  preset: TextPreset,
  width = 72,
  height = 38,
  darkBg = true,
): string {
  const c = document.createElement("canvas");
  c.width = width * 2;
  c.height = height * 2;
  const ctx = c.getContext("2d")!;
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = darkBg ? "#24262e" : "#f3f4f8";
  ctx.fillRect(0, 0, width, height);

  const p = preset.patch;
  const fontSize = Math.min(16, (p.fontSize ?? 18) * 0.52);
  const family = p.fontFamily ?? "Segoe UI";
  const bold = p.bold ? "bold" : "";
  const italic = p.italic ? "italic " : "";
  ctx.font = `${italic}${bold} ${fontSize}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = width / 2;
  const y = height / 2;

  // Shadow
  if (p.shadow && p.shadowColor) {
    ctx.shadowColor = p.shadowColor;
    ctx.shadowBlur = Math.min(10, p.shadowBlur ?? 0);
    ctx.shadowOffsetX = p.shadowX ?? 0;
    ctx.shadowOffsetY = p.shadowY ?? 0;
  }

  // Stroke (drawn first, underneath fill)
  if (p.stroke && (p.strokeWidth ?? 0) > 0) {
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = Math.min(3, p.strokeWidth!);
    ctx.lineJoin = "round";
    ctx.strokeText("Aa", x, y);
  }

  // Frame/Box (if applicable)
  if (p.fillMode === "solid" && p.fill) {
    ctx.fillStyle = p.fill;
    const bw = width * 0.75, bh = height * 0.75;
    ctx.beginPath();
    const r = p.cornerRadius ?? 0;
    ctx.roundRect((width - bw) / 2, (height - bh) / 2, bw, bh, r);
    ctx.fill();
    if (p.strokeWidth && p.stroke) {
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = p.strokeWidth * 0.5;
      ctx.stroke();
    }
  }

  // Fill
  ctx.fillStyle = p.color ?? (darkBg ? "#e8eaf0" : "#1c1f27");
  ctx.fillText("Aa", x, y);

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  return c.toDataURL("image/png");
}
