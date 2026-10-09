// ─────────────────────────────────────────────────────────────────────────────
// Offline background remover. Pure client-side canvas pixel manipulation —
// no AI, no network. Two strategies:
//
// 1. Edge-flood: samples the dominant colour from the image edges, then flood-
//    fills inward from each edge pixel, marking every pixel within a colour
//    tolerance as transparent. This handles simple single-colour backgrounds
//    (white, green-screen, studio shots) very well.
//
// 2. Luminance threshold: removes all pixels brighter (or darker) than a
//    configurable cutoff — useful for scanned documents and line art.
//
// Both run inside a Web Worker message if available, or on the main thread
// with a chunked loop to avoid freezing the UI.
// ─────────────────────────────────────────────────────────────────────────────

export interface BgRemoveOpts {
  /** 0 = auto-detect from edges; otherwise specify the background hex colour. */
  bgColor?: string;
  /** Colour distance tolerance 0–100 (default 30). Higher = more aggressive. */
  tolerance: number;
  /** Also feather the transition by this many pixels (0 = hard edge). */
  feather: number;
  /** Remove pixels matching the *edges* of the image (true, default) or a
   *  specific colour only (false). */
  edgeFlood: boolean;
}

const DEFAULT: BgRemoveOpts = {
  tolerance: 30,
  feather: 1,
  edgeFlood: true,
};

/**
 * Remove the background from an HTMLImageElement and return a data-URL PNG.
 * Runs synchronously on the main thread (images are usually < 4MP).
 */
export async function removeBackground(
  img: HTMLImageElement,
  opts: Partial<BgRemoveOpts> = {},
): Promise<string> {
  const o = { ...DEFAULT, ...opts };
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w < 1 || h < 1) throw new Error("Image has no pixels.");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // ── Detect the background colour from edge pixels ────────────────────────
  const bg = o.bgColor ? hexToRgb(o.bgColor) : sampleEdges(data, w, h);
  const tol = (o.tolerance / 100) * 442; // max Euclidean RGB distance ≈ 441.67

  if (o.edgeFlood) {
    // Flood-fill from every edge pixel that matches the background.
    const visited = new Uint8Array(w * h);
    const queue: number[] = [];

    const enqueue = (x: number, y: number) => {
      const idx = y * w + x;
      if (visited[idx]) return;
      const off = idx * 4;
      if (colorDist(data[off], data[off + 1], data[off + 2], bg) <= tol) {
        visited[idx] = 1;
        queue.push(idx);
      }
    };

    // Seed from all four edges.
    for (let x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h - 1); }
    for (let y = 0; y < h; y++) { enqueue(0, y); enqueue(w - 1, y); }

    // BFS flood.
    while (queue.length > 0) {
      const idx = queue.pop()!;
      const x = idx % w, y = (idx - x) / w;
      if (x > 0) enqueue(x - 1, y);
      if (x < w - 1) enqueue(x + 1, y);
      if (y > 0) enqueue(x, y - 1);
      if (y < h - 1) enqueue(x, y + 1);
    }

    // Erase visited pixels.
    for (let i = 0; i < visited.length; i++) {
      if (visited[i]) data[i * 4 + 3] = 0;
    }

    // Optional feather: partial transparency near the boundary.
    if (o.feather > 0) {
      featherEdges(data, visited, w, h, o.feather);
    }
  } else {
    // Simple threshold: remove every pixel within tolerance of bgColor.
    for (let i = 0; i < data.length; i += 4) {
      if (colorDist(data[i], data[i + 1], data[i + 2], bg) <= tol) {
        data[i + 3] = 0;
      }
    }
    if (o.feather > 0) {
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] === 0 ? 1 : 0;
      featherEdges(data, mask, w, h, o.feather);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Generate a small preview (max 200px side) to show the result before committing. */
export async function removeBackgroundPreview(
  img: HTMLImageElement,
  opts: Partial<BgRemoveOpts> = {},
): Promise<string> {
  const maxSide = 200;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  small.getContext("2d")!.drawImage(img, 0, 0, w, h);

  const tmp = new Image();
  tmp.width = w; tmp.height = h;
  await new Promise<void>((resolve) => {
    tmp.onload = () => resolve();
    tmp.src = small.toDataURL("image/png");
  });

  return removeBackground(tmp, opts);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function colorDist(r: number, g: number, b: number, bg: [number, number, number]): number {
  const dr = r - bg[0], dg = g - bg[1], db = b - bg[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Sample the most common colour from the outermost 3-pixel border of the
 * image. We bucket into 8-bit-per-channel bins and pick the largest bucket.
 */
function sampleEdges(data: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const bins = new Map<number, number>();
  const add = (x: number, y: number) => {
    const off = (y * w + x) * 4;
    // quantise to 5-bit per channel for binning
    const key = ((data[off] >> 3) << 10) | ((data[off + 1] >> 3) << 5) | (data[off + 2] >> 3);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  };
  const band = Math.min(3, Math.floor(Math.min(w, h) / 4));
  for (let b = 0; b < band; b++) {
    for (let x = 0; x < w; x++) { add(x, b); add(x, h - 1 - b); }
    for (let y = band; y < h - band; y++) { add(b, y); add(w - 1 - b, y); }
  }
  let bestKey = 0, bestCount = 0;
  for (const [key, count] of bins) { if (count > bestCount) { bestKey = key; bestCount = count; } }
  // expand back to 8-bit
  const r5 = (bestKey >> 10) & 0x1f, g5 = (bestKey >> 5) & 0x1f, b5 = bestKey & 0x1f;
  return [(r5 << 3) | (r5 >> 2), (g5 << 3) | (g5 >> 2), (b5 << 3) | (b5 >> 2)];
}

/**
 * Soften the boundary: for each pixel within `radius` of a removed↔kept edge,
 * blend the alpha proportionally.
 */
function featherEdges(
  data: Uint8ClampedArray, mask: Uint8Array, w: number, h: number, radius: number,
) {
  const r = Math.max(1, Math.ceil(radius));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx]) continue; // already removed
      // check if any removed pixel is within radius
      let minDist = r + 1;
      for (let dy = -r; dy <= r && minDist > 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (mask[ny * w + nx]) {
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) minDist = d;
          }
        }
      }
      if (minDist <= r) {
        const alpha = Math.round((minDist / r) * data[idx * 4 + 3]);
        data[idx * 4 + 3] = alpha;
      }
    }
  }
}
