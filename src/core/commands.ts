// ─────────────────────────────────────────────────────────────────────────────
// Command factories. Every document mutation is expressed as a reversible
// HCommand operating on the affected page's object array (or the page list).
// Arrays are treated as immutable, so keeping before/after references is cheap
// (structural sharing) and undo is always exact.
// ─────────────────────────────────────────────────────────────────────────────

import type { HCommand } from "./history";
import type { CanvasDocument, CanvasObject, ID, Page } from "./types";

export function setObjects(
  doc: CanvasDocument,
  pageId: ID,
  objects: CanvasObject[],
): CanvasDocument {
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.id === pageId ? { ...p, objects } : p)),
  };
}

export function setPages(doc: CanvasDocument, pages: Page[], pageId?: ID): CanvasDocument {
  return {
    ...doc,
    pages,
    pageId: pageId ?? (pages.some((p) => p.id === doc.pageId) ? doc.pageId : pages[0]?.id),
  };
}

/** Generic objects-array command: everything funnels through this. */
export function cmdObjects(
  docId: ID,
  pageId: ID,
  before: CanvasObject[],
  after: CanvasObject[],
  label: string,
  mergeKey?: string,
): HCommand {
  return {
    label,
    docId,
    mergeKey,
    redo: (doc) => setObjects(doc, pageId, after),
    undo: (doc) => setObjects(doc, pageId, before),
  };
}

/** Generic page-list command. */
export function cmdPages(
  docId: ID,
  before: Page[],
  after: Page[],
  label: string,
  pageId?: ID,
): HCommand {
  return {
    label,
    docId,
    redo: (doc) => setPages(doc, after, pageId),
    undo: (doc) => setPages(doc, before, pageId),
  };
}

// ── Convenience helpers used by UI/store ────────────────────────────────────

export function mapObjects(
  objects: CanvasObject[],
  ids: Set<ID>,
  fn: (o: CanvasObject) => CanvasObject,
): CanvasObject[] {
  return objects.map((o) => (ids.has(o.id) ? fn(o) : o));
}

export function patchObjects(
  objects: CanvasObject[],
  ids: ID[],
  patch: Partial<CanvasObject> | ((o: CanvasObject) => Partial<CanvasObject>),
): CanvasObject[] {
  const set = new Set(ids);
  return mapObjects(objects, set, (o) => ({
    ...o,
    ...(typeof patch === "function" ? patch(o) : patch),
  }));
}

/** Move every object of `id` to the index of `toId` — used by z-order actions. */
export function reorderIds(objects: CanvasObject[], order: ID[]): CanvasObject[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...objects].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
