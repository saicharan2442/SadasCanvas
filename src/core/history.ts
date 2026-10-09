// ─────────────────────────────────────────────────────────────────────────────
// Command-pattern history. Each command knows how to `redo` (apply) and `undo`
// (revert) a document, using structurally-shared immutable arrays so commands
// are cheap to store. No full-document snapshots — commands carry only the
// data they need (the affected object/page arrays, before and after).
// ─────────────────────────────────────────────────────────────────────────────

import type { CanvasDocument } from "./types";

export interface HCommand {
  label: string;
  docId: string;
  /** Commands with the same mergeKey within `mergeWindowMs` collapse into one. */
  mergeKey?: string;
  /** Apply the command, returning the next document. */
  redo(doc: CanvasDocument): CanvasDocument;
  /** Revert the command, returning the previous document. */
  undo(doc: CanvasDocument): CanvasDocument;
}

export class HistoryManager {
  private undoStack: HCommand[] = [];
  private redoStack: HCommand[] = [];
  private lastTime = 0;
  limit = 300;
  mergeWindowMs = 900;

  /** Record an already-applied command. */
  push(cmd: HCommand) {
    const now = Date.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      top &&
      cmd.mergeKey &&
      top.mergeKey === cmd.mergeKey &&
      top.docId === cmd.docId &&
      now - this.lastTime < this.mergeWindowMs
    ) {
      // Merge: keep the original undo, take the newest redo.
      this.undoStack[this.undoStack.length - 1] = {
        ...top,
        label: cmd.label,
        redo: cmd.redo,
      };
    } else {
      this.undoStack.push(cmd);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.lastTime = now;
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }
  peekUndo(): HCommand | null {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }
  peekRedo(): HCommand | null {
    return this.redoStack[this.redoStack.length - 1] ?? null;
  }

  /** Pop the next command to undo (moves it to the redo stack). */
  takeUndo(): HCommand | null {
    const cmd = this.undoStack.pop() ?? null;
    if (cmd) this.redoStack.push(cmd);
    this.lastTime = 0; // break merge chains across undo/redo
    return cmd;
  }

  /** Pop the next command to redo (moves it back to the undo stack). */
  takeRedo(): HCommand | null {
    const cmd = this.redoStack.pop() ?? null;
    if (cmd) this.undoStack.push(cmd);
    this.lastTime = 0;
    return cmd;
  }

  clear(docId?: string) {
    if (!docId) {
      this.undoStack = [];
      this.redoStack = [];
    } else {
      this.undoStack = this.undoStack.filter((c) => c.docId !== docId);
      this.redoStack = this.redoStack.filter((c) => c.docId !== docId);
    }
    this.lastTime = 0;
  }
}
