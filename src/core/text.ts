// ─────────────────────────────────────────────────────────────────────────────
// Text statistics + numbered-row generation (kept pure for testability).
// ─────────────────────────────────────────────────────────────────────────────

export interface TextStats { lines: number; words: number; chars: number; }

export function textStats(text: string): TextStats {
  if (!text) return { lines: 0, words: 0, chars: 0 };
  const lines = text.split(/\r\n|\r|\n/).length;
  const words = (text.trim().match(/[\p{L}\p{N}'’_-]+/gu) ?? []).length;
  return { lines, words, chars: text.length };
}

export interface RowsOptions {
  count: number;
  numbered: boolean;
  start: number;      // first visible number (e.g. 10 → 10..10+N-1)
  zeroBased: boolean; // numbering base applied when start untouched
}

/** Build exactly `count` editable rows, optionally prefixed with line numbers. */
export function buildNumberedRows(opts: RowsOptions): string {
  const n = Math.max(0, Math.floor(opts.count));
  if (n === 0) return "";
  const first = opts.numbered ? Math.max(0, Math.floor(opts.start)) : 0;
  const last = first + n - 1;
  const pad = opts.numbered ? String(last).length : 0;
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    if (opts.numbered) rows.push(String(first + i).padStart(pad, " ") + "  ");
    else rows.push("");
  }
  return rows.join("\n");
}
