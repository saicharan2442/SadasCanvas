// ─────────────────────────────────────────────────────────────────────────────
// Dev-mode unit checks for the command/history engine. Runs once on startup
// (dev only) and reports to the console — keeping the production bundle lean
// while still verifying the undo contract on every dev run.
// ─────────────────────────────────────────────────────────────────────────────

import { HistoryManager } from "./history";
import { cmdObjects, cmdPages } from "./commands";
import { makeDocument, makeObject } from "./factory";
import type { CanvasDocument } from "./types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("self-test failed: " + msg);
}

export function runSelfTests(): boolean {
  try {
    const h = new HistoryManager();
    let doc: CanvasDocument = makeDocument("t");
    const page = doc.pages[0];

    // command: add two objects
    const a = makeObject("rect", 0, 0, { width: 50, height: 40 });
    const b = makeObject("ellipse", 10, 10);
    const add1 = cmdObjects(doc.id, page.id, [], [a], "Add");
    const add2 = cmdObjects(doc.id, page.id, [a], [a, b], "Add");
    doc = add1.redo(doc);
    h.push(add1);
    doc = add2.redo(doc);
    h.push(add2);
    assert(doc.pages[0].objects.length === 2, "add objects");

    // command: update patch
    const upd = cmdObjects(doc.id, page.id, [a, b], [{ ...a, x: 99 }, b], "Move", "m1");
    doc = upd.redo(doc);
    h.push(upd);
    assert(doc.pages[0].objects[0].x === 99, "apply patch");

    // merge: same mergeKey inside window collapses
    const upd2 = cmdObjects(doc.id, page.id, doc.pages[0].objects, [{ ...a, x: 120 }, b], "Move", "m1");
    doc = upd2.redo(doc);
    h.push(upd2);
    assert(h.canUndo(), "can undo after merge");

    // undo chain: merged move (should restore x=0 in one step), add2, add1
    let c = h.takeUndo()!;
    doc = c.undo(doc);
    assert(doc.pages[0].objects[0].x === 0, "merged undo restores original value");
    c = h.takeUndo()!;
    doc = c.undo(doc);
    assert(doc.pages[0].objects.length === 1, "undo second add");
    c = h.takeUndo()!;
    doc = c.undo(doc);
    assert(doc.pages[0].objects.length === 0, "undo first add");
    assert(!h.canUndo(), "undo stack empty");
    assert(h.canRedo(), "redo available");

    // redo chain restores everything
    for (let i = 0; i < 3; i++) { c = h.takeRedo()!; doc = c.redo(doc); }
    assert(doc.pages[0].objects.length === 2, "redo restores objects");
    assert(doc.pages[0].objects[0].x === 120, "redo applies merged final value");

    // page commands
    const p2 = { ...page, id: "p2", name: "Two", objects: [] };
    const addPage = cmdPages(doc.id, doc.pages, [...doc.pages, p2], "Add page", "p2");
    doc = addPage.redo(doc);
    h.push(addPage);
    assert(doc.pages.length === 2 && doc.pageId === "p2", "page added + activated");
    c = h.takeUndo()!;
    doc = c.undo(doc);
    assert(doc.pages.length === 1, "page add undone");

    // new action clears redo stack
    const add3 = cmdObjects(doc.id, page.id, doc.pages[0].objects, [...doc.pages[0].objects, a], "Add");
    doc = add3.redo(doc);
    h.push(add3);
    assert(!h.canRedo(), "redo cleared by new command");

    console.info("%c[Sadas Canvas] history self-tests: PASS", "color:#4ec98a");
    return true;
  } catch (err) {
    console.error("[Sadas Canvas] history self-tests: FAIL", err);
    return false;
  }
}
