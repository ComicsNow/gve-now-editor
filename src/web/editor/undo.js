'use strict';

// Snapshot stack for editor undo/redo. Snapshots are per-page editor states
// captured *before* a mutation; undo swaps the current state onto the redo
// stack and returns the snapshot to restore.
function createUndoStack({ limit = 50 } = {}) {
  const undoStack = [];
  const redoStack = [];

  return {
    push(snapshot) {
      undoStack.push(snapshot);
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
    },
    undo(current) {
      if (!undoStack.length) return null;
      redoStack.push(current);
      return undoStack.pop();
    },
    redo(current) {
      if (!redoStack.length) return null;
      undoStack.push(current);
      return redoStack.pop();
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    }
  };
}

module.exports = { createUndoStack };
