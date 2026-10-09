// ─────────────────────────────────────────────────────────────────────────────
// ObjectNode — renders one CanvasObject as Konva nodes.
// Supports Canva-style animations driven by the store's playback timer.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Group, Rect, Ellipse, Line, Text, Image as KImage, Arrow as KArrow } from "react-konva";
import { useStore } from "../core/store";
import { prettyUrl, type CanvasObject } from "../core/types";

// ── Animation Engine ─────────────────────────────────────────────────────────

function getAnimatedProps(o: CanvasObject, time: number): Partial<CanvasObject> & { scale?: number } {
  if (!o.animation || o.animation.type === "none") return {};
  const { type, duration, delay, direction = "enter" } = o.animation;

  // Normalised time 0..1
  let t = Math.max(0, Math.min(1, (time - delay) / duration));

  // If exit animation, reverse the progress
  if (direction === "exit") t = 1 - t;

  if (t <= 0 && direction === "enter") return { opacity: 0 };
  if (t <= 0 && direction === "exit") return { opacity: 0 };

  switch (type) {
    case "rise":
      return { y: o.y + (1 - t) * 40, opacity: Math.min(1, t * 1.5) };
    case "pan":
      return { x: o.x + (1 - t) * 60, opacity: Math.min(1, t * 1.5) };
    case "fade":
      return { opacity: t };
    case "pop": {
      const s = t < 0.5 ? t * 2.2 : 1.1 - (t - 0.5) * 0.2;
      return {
        opacity: Math.min(1, t * 2),
        width: o.width * s, height: o.height * s,
        x: o.x + (o.width * (1 - s)) / 2, y: o.y + (o.height * (1 - s)) / 2,
      };
    }
    case "wipe":
      return { opacity: Math.min(1, t * 2), width: o.width * t };
    case "breathe": {
      const s = 1 + Math.sin(t * Math.PI) * 0.05;
      return {
        width: o.width * s, height: o.height * s,
        x: o.x + (o.width * (1 - s)) / 2, y: o.y + (o.height * (1 - s)) / 2,
      };
    }
    case "typewriter":
      if (o.type === "text" || o.type === "sticky") {
        const len = Math.floor(o.text.length * t);
        return { text: o.text.slice(0, len) };
      }
      return { opacity: t };
    case "ascend":
      return { y: o.y + (1 - t) * 20, opacity: t };
    case "shift":
      return { x: o.x + (Math.sin(t * 10) * 5), opacity: t };
    case "merge":
      return { opacity: t, letterSpacing: (1 - t) * 10 };
    case "block":
      return { opacity: t, x: o.x + (1 - t) * 10 };
    case "burst": {
      const s = 1 + (t * 0.2);
      return { opacity: 1 - t, width: o.width * s, height: o.height * s, x: o.x + (o.width * (1 - s)) / 2, y: o.y + (o.height * (1 - s)) / 2 };
    }
    case "bounce": {
      const b = Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 30;
      return { y: o.y - b, opacity: 1 };
    }
    case "roll":
      return { rotation: o.rotation + (1 - t) * -90, opacity: t, x: o.x - (1 - t) * 40 };
    case "skate":
      return { x: o.x + (1 - t) * -100, rotation: (1 - t) * -5, opacity: t };
    case "spread":
      return { letterSpacing: (1 - t) * 20, opacity: t };
    case "tumble":
      return {
        rotation: o.rotation + (1 - t) * -20, opacity: t,
        y: o.y + (1 - t) * 20, x: o.x + (1 - t) * 10
      };
    case "stomp": {
      const s = 1 + (1 - t) * 2;
      return {
        opacity: t, width: o.width * s, height: o.height * s,
        x: o.x + (o.width * (1 - s)) / 2, y: o.y + (o.height * (1 - s)) / 2,
      };
    }
    case "neon":
      return { opacity: 0.8 + Math.sin(t * Math.PI * 10) * 0.2 };
    case "scrapbook":
      return { rotation: o.rotation + (Math.sin(t * 10) * 2), x: o.x + (Math.cos(t * 10) * 2) };
    case "tectonic":
      return { y: o.y + (Math.sin(t * 20) * 2) };
    case "drift":
      return { x: o.x + t * 20, y: o.y + t * 10 };
    case "baseline":
      return { y: o.y + (1 - t) * o.height, height: o.height * t, opacity: t };
    case "succession": {
      const s = t;
      return {
        opacity: t, width: o.width * s, height: o.height * s,
        x: o.x + (o.width * (1 - s)) / 2, y: o.y + (o.height * (1 - s)) / 2
      };
    }
  }
  return { opacity: t };
}

export const TEXT_PAD = 2;
export const STICKY_PAD = 12;
export const SHAPE_PAD = 8;

export interface NodeEvents {
  registerRef: (id: string, node: Konva.Node | null) => void;
  onNodeMouseDown: (e: Konva.KonvaEventObject<MouseEvent>, obj: CanvasObject) => void;
  onNodeDblClick: (e: Konva.KonvaEventObject<MouseEvent>, obj: CanvasObject) => void;
  onNodeDragStart: (e: Konva.KonvaEventObject<DragEvent>, obj: CanvasObject) => void;
  onNodeDragMove: (e: Konva.KonvaEventObject<DragEvent>, obj: CanvasObject) => void;
  onNodeDragEnd: (e: Konva.KonvaEventObject<DragEvent>, obj: CanvasObject) => void;
  onNodeTransformEnd: (obj: CanvasObject) => void;
  dragBound: (pos: { x: number; y: number }) => { x: number; y: number };
}

interface Props extends NodeEvents {
  obj: CanvasObject;
  draggable: boolean;
  editing: boolean;
  preview?: boolean;
}

function fillOf(o: CanvasObject): Record<string, unknown> {
  if (o.fillMode === "none") return { fill: "rgba(0,0,0,0)" };
  if (o.fillMode === "solid") return { fill: o.fill };
  const rad = ((o.fillAngle - 90) * Math.PI) / 180;
  const cx = o.width / 2, cy = o.height / 2;
  const diag = Math.hypot(o.width, o.height) / 2;
  return {
    fillLinearGradientStartPoint: { x: cx - Math.cos(rad) * diag, y: cy - Math.sin(rad) * diag },
    fillLinearGradientEndPoint: { x: cx + Math.cos(rad) * diag, y: cy + Math.sin(rad) * diag },
    fillLinearGradientColorStops: [0, o.fill, 1, o.fill2],
  };
}

function shadowOf(o: CanvasObject): Record<string, unknown> {
  if (!o.shadow) return {};
  return {
    shadowColor: o.shadowColor, shadowBlur: o.shadowBlur,
    shadowOffsetX: o.shadowX, shadowOffsetY: o.shadowY,
  };
}

export function fontStyleOf(o: CanvasObject): string {
  const s = `${o.italic ? "italic" : ""} ${o.bold ? "bold" : ""}`.trim();
  return s === "" ? "normal" : s === "italic bold" ? "italic bold" : s;
}

export function decorationOf(o: CanvasObject): string {
  return o.underline ? "underline" : o.strike ? "line-through" : "";
}

function starPoints(w: number, h: number, spikes = 5, inner = 0.45): number[] {
  const pts: number[] = [];
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push(cx + Math.cos(a) * (w / 2) * r, cy + Math.sin(a) * (h / 2) * r);
  }
  return pts;
}

function useHtmlImage(src?: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    let alive = true;
    const im = new Image();
    im.onload = () => { if (alive) setImg(im); };
    im.src = src;
    return () => { alive = false; };
  }, [src]);
  return img;
}

function filterChain(o: CanvasObject): any[] {
  const list: any[] = [];
  if ((o.brightness ?? 0) !== 0) list.push(Konva.Filters.Brighten);
  if ((o.contrast ?? 0) !== 0) list.push(Konva.Filters.Contrast);
  if ((o.saturation ?? 0) !== 0 || (o.hue ?? 0) !== 0) list.push(Konva.Filters.HSL);
  if (o.grayscale) list.push(Konva.Filters.Grayscale);
  if (o.sepia) list.push(Konva.Filters.Sepia);
  if (o.invert) list.push(Konva.Filters.Invert);
  if ((o.blur ?? 0) > 0) list.push(Konva.Filters.Blur);
  if ((o.pixelate ?? 0) > 1) list.push(Konva.Filters.Pixelate);
  if ((o.noise ?? 0) > 0) list.push(Konva.Filters.Noise);
  if ((o.sharpen ?? 0) !== 0) list.push(Konva.Filters.Enhance);
  return list;
}

const ImageShape: React.FC<{ o: CanvasObject }> = ({ o }) => {
  const img = useHtmlImage(o.src);
  const ref = useRef<Konva.Image | any>(null);
  const filters = filterChain(o);
  const useFilters = filters.length > 0;
  const crop = (() => {
    if (!img) return undefined;
    const cw = o.cropW ?? 1, ch = o.cropH ?? 1;
    if ((o.cropX ?? 0) === 0 && (o.cropY ?? 0) === 0 && cw === 1 && ch === 1) return undefined;
    return {
      x: (o.cropX ?? 0) * img.naturalWidth,
      y: (o.cropY ?? 0) * img.naturalHeight,
      width: cw * img.naturalWidth,
      height: ch * img.naturalHeight,
    };
  })();

  useEffect(() => {
    const n = ref.current;
    if (!n) return;
    if (img && useFilters) { n.cache({ pixelRatio: 1 }); n.getLayer()?.batchDraw(); }
    else if (n.isCached?.()) { n.clearCache(); n.getLayer()?.batchDraw(); }
  }, [img, useFilters, o.width, o.height, o.cornerRadius, o.brightness, o.contrast, o.saturation, o.hue, o.blur, o.pixelate, o.noise, o.sharpen, o.grayscale, o.sepia, o.invert, o.cropX, o.cropY, o.cropW, o.cropH]);

  return (
    <KImage
      ref={ref} image={img ?? undefined} width={o.width} height={o.height} crop={crop} cornerRadius={o.cornerRadius}
      stroke={o.strokeWidth > 0 ? o.stroke : undefined} strokeWidth={o.strokeWidth}
      filters={useFilters ? filters : undefined}
      brightness={o.brightness ?? 0} contrast={o.contrast ?? 0} saturation={o.saturation ?? 0} hue={o.hue ?? 0}
      blurRadius={o.blur ?? 0} pixelSize={Math.max(1, Math.round(o.pixelate ?? 1))} noise={o.noise ?? 0} enhance={o.sharpen ?? 0}
      {...shadowOf(o)}
    />
  );
};

function ObjectNodeInner(props: Props) {
  const { obj: o, draggable, editing, preview } = props;
  const playbackTime = useStore((s) => s.playbackTime);
  const isPlaying = useStore((s) => s.playing);
  const anim = !editing && isPlaying ? getAnimatedProps(o, playbackTime) : {};

  const listening = !preview && !o.locked;
  const blend = o.blendMode && o.blendMode !== "normal" ? o.blendMode : undefined;

  const currentX = (anim.x ?? o.x) as number;
  const currentY = (anim.y ?? o.y) as number;
  const currentW = Math.max(1, (anim.width ?? o.width) as number);
  const currentH = Math.max(1, (anim.height ?? o.height) as number);
  const currentOpacity = (anim.opacity ?? o.opacity) as number;
  const currentRotation = (anim.rotation ?? o.rotation) as number;
  const currentText = (anim.text ?? o.text) as string;
  const currentLetterSpacing = (anim.letterSpacing ?? o.letterSpacing) as number;

  const common: Record<string, unknown> = {
    id: o.id, x: currentX, y: currentY, rotation: currentRotation, opacity: currentOpacity,
    globalCompositeOperation: blend, draggable: listening && draggable, listening,
    ref: preview ? undefined : (n: Konva.Node | null) => props.registerRef(o.id, n),
    onMouseDown: preview ? undefined : (e: any) => props.onNodeMouseDown(e, o),
    onDblClick: preview ? undefined : (e: any) => props.onNodeDblClick(e, o),
    onDragStart: preview ? undefined : (e: any) => props.onNodeDragStart(e, o),
    onDragMove: preview ? undefined : (e: any) => props.onNodeDragMove(e, o),
    onDragEnd: preview ? undefined : (e: any) => props.onNodeDragEnd(e, o),
    onTransformEnd: preview ? undefined : () => props.onNodeTransformEnd(o),
    dragBoundFunc: listening && draggable ? props.dragBound : undefined,
  };

  const flip: Record<string, unknown> = {
    scaleX: o.flipX ? -1 : 1, scaleY: o.flipY ? -1 : 1,
    offsetX: o.flipX ? currentW / 2 : 0, offsetY: o.flipY ? currentH / 2 : 0,
    x: o.flipX ? currentW / 2 : 0, y: o.flipY ? currentH / 2 : 0,
  };

  const strokeProps = {
    stroke: o.strokeWidth > 0 ? o.stroke : undefined,
    strokeWidth: o.strokeWidth > 0 ? o.strokeWidth : undefined,
  };

  // Character outline (text border). Konva text needs explicit stroke props on
  // the Text node itself; otherwise the stored stroke values never render.
  // `fillAfterStrokeEnabled` keeps the fill on top so the border wraps each
  // glyph cleanly like Canva/Photoshop text outlines.
  const textStrokeProps = {
    stroke: o.strokeWidth > 0 ? o.stroke : undefined,
    strokeWidth: o.strokeWidth > 0 ? o.strokeWidth : 0,
    lineJoin: "round" as const,
    fillAfterStrokeEnabled: true,
    strokeScaleEnabled: false,
  };

  switch (o.type) {
    case "text":
      const fontStack = `${o.fontFamily}, "Segoe UI", "Nirmala UI", "Gautami", "Roboto", "Helvetica Neue", "Arial", sans-serif`;
      return editing || !currentText ? (
        <Rect {...common} width={currentW} height={Math.max(currentH, o.fontSize * o.lineHeight)} listening={false}
          stroke={preview ? "#8b3dff" : undefined} strokeWidth={preview ? 1 : undefined} dash={preview ? [6, 4] : undefined} strokeScaleEnabled={false} />
      ) : (
        <Text {...common} width={currentW} text={currentText} fontFamily={fontStack} fontSize={o.fontSize} fontStyle={fontStyleOf(o)}
          textDecoration={decorationOf(o)} fill={o.color} align={o.align} lineHeight={o.lineHeight} letterSpacing={currentLetterSpacing} wrap="word"
          {...textStrokeProps} {...shadowOf(o)} />
      );
    case "sticky": {
      const w = currentW, h = currentH;
      const proxy = { ...o, width: w, height: h };
      const fontStack = `${o.fontFamily}, "Segoe UI", "Nirmala UI", "Gautami", "Roboto", "Helvetica Neue", "Arial", sans-serif`;
      return (
        <Group {...common} width={w} height={h}>
          <Group {...flip}><Rect width={w} height={h} cornerRadius={3} {...fillOf(proxy)} {...shadowOf(proxy)} /></Group>
          {!editing && (
            <Text x={STICKY_PAD} y={STICKY_PAD - 2} width={Math.max(1, w - STICKY_PAD * 2)} height={Math.max(1, h - STICKY_PAD * 2)}
              text={currentText} fontFamily={fontStack} fontSize={o.fontSize} fontStyle={fontStyleOf(o)} textDecoration={decorationOf(o)}
              fill={o.color} align={o.align} lineHeight={o.lineHeight} letterSpacing={currentLetterSpacing} wrap="word" listening={false}
              {...textStrokeProps} />
          )}
        </Group>
      );
    }
    case "rect":
    case "ellipse":
    case "triangle":
    case "star": {
      const w = currentW, h = currentH;
      const proxy = { ...o, width: w, height: h };
      const fontStack = `${o.fontFamily}, "Segoe UI", "Nirmala UI", "Gautami", "Roboto", "Helvetica Neue", "Arial", sans-serif`;
      return (
        <Group {...common} width={w} height={h}>
          <Group {...flip}>
            {o.type === "rect" && <Rect width={w} height={h} cornerRadius={o.cornerRadius} {...fillOf(proxy)} {...strokeProps} {...shadowOf(proxy)} />}
            {o.type === "ellipse" && <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...fillOf(proxy)} {...strokeProps} {...shadowOf(proxy)} />}
            {o.type === "triangle" && <Line points={[w / 2, 0, w, h, 0, h]} closed {...fillOf(proxy)} {...strokeProps} {...shadowOf(proxy)} lineJoin="round" />}
            {o.type === "star" && <Line points={starPoints(w, h)} closed {...fillOf(proxy)} {...strokeProps} {...shadowOf(proxy)} lineJoin="round" />}
          </Group>
          {!editing && o.text !== "" && (
            <Text x={SHAPE_PAD} y={0} width={Math.max(1, w - SHAPE_PAD * 2)} height={h} verticalAlign="middle"
              text={o.text} fontFamily={fontStack} fontSize={o.fontSize} fontStyle={fontStyleOf(o)} textDecoration={decorationOf(o)}
              fill={o.color} align={o.align} lineHeight={o.lineHeight} letterSpacing={currentLetterSpacing} wrap="word" listening={false}
              {...textStrokeProps} />
          )}
        </Group>
      );
    }
    case "image":
      return (
        <Group {...common} width={currentW} height={currentH}>
          <Group {...flip}><ImageShape o={{ ...o, width: currentW, height: currentH }} /></Group>
        </Group>
      );
    case "link": {
      const w = currentW, h = currentH;
      const pad = 14; const accentW = 4;
      const proxy = { ...o, width: w, height: h };
      const fontStack = `${o.fontFamily}, "Segoe UI", "Nirmala UI", "Gautami", "Roboto", "Helvetica Neue", "Arial", sans-serif`;
      return (
        <Group {...common} width={w} height={h}>
          <Rect width={w} height={h} cornerRadius={o.cornerRadius} {...fillOf(proxy)} {...strokeProps} {...shadowOf(proxy)} />
          <Rect width={accentW} height={h} cornerRadius={[o.cornerRadius, 0, 0, o.cornerRadius]} fill="#8b3dff" listening={false} />
          {!editing && (
            <Text x={pad + accentW} y={pad - 2} width={Math.max(10, w - pad * 2 - accentW)} text={currentText || "Link"}
              fontFamily={fontStack} fontSize={o.fontSize} fontStyle={fontStyleOf(o)} fill={o.color} lineHeight={1.25} wrap="word" ellipsis listening={false} height={o.fontSize * 2.6}
              {...textStrokeProps} />
          )}
          <Text x={pad + accentW} y={h - pad - 13} width={Math.max(10, w - pad * 2 - accentW)} text={o.link ? "🔗 " + prettyUrl(o.link) : "No URL set"}
            fontFamily={fontStack} fontSize={11.5} fill={o.link ? "#8b3dff" : "#9aa3b2"} wrap="none" ellipsis listening={false} />
        </Group>
      );
    }
    case "line":
    case "arrow": {
      const headLen = Math.max(10, o.strokeWidth * 4);
      return (
        <Group {...common} width={o.width} height={o.height}>
          {o.type === "arrow" ? (
            <KArrow points={o.points ?? [0, 0]} stroke={o.stroke || "#dfe3ea"} strokeWidth={o.strokeWidth} lineCap="round" lineJoin="round"
              pointerLength={headLen} pointerWidth={headLen * 0.9} pointerAtBeginning={o.arrowHeads === "both"} pointerAtEnding={o.arrowHeads !== "none"}
              fill={o.stroke || "#dfe3ea"} hitStrokeWidth={Math.max(12, o.strokeWidth * 2)} />
          ) : (
            <Line points={o.points ?? [0, 0]} stroke={o.stroke || "#dfe3ea"} strokeWidth={o.strokeWidth} lineCap="round" lineJoin="round"
              hitStrokeWidth={Math.max(12, o.strokeWidth * 2)} />
          )}
        </Group>
      );
    }
    case "ink": {
      const tension = o.inkTool === "pencil" ? 0.18 : o.inkTool === "highlighter" ? 0.1 : 0.38;
      return (
        <Group {...common} width={o.width} height={o.height}>
          <Line points={o.points ?? [0, 0]} stroke={o.stroke} strokeWidth={o.strokeWidth} lineCap={o.inkTool === "highlighter" ? "butt" : "round"}
            lineJoin="round" tension={tension} hitStrokeWidth={Math.max(16, o.strokeWidth)} perfectDrawEnabled={false} shadowForStrokeEnabled={false}
            globalCompositeOperation={o.inkTool === "highlighter" ? "multiply" : "source-over"} />
        </Group>
      );
    }
  }
  return null;
}

const ObjectNode = React.memo(ObjectNodeInner);
export default ObjectNode;
