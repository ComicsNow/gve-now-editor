'use strict';

const { attachKeyboard } = require('./editor/keyboard');

function bindEditorKeyboard({
  target = document.body,
  stageGetter,
  sessionGetter,
  nudgeSelection,
  deleteSelection,
  doUndo,
  doRedo,
  setMode,
  renderInspectorPanel
}) {
  return attachKeyboard(target, {
    onNudge: nudgeSelection,
    onDelete: () => {
      const stage = stageGetter();
      if (stage && stage.isFreeDrawing()) stage.popFreeVertex();
      else deleteSelection();
    },
    onEnter: () => {
      const stage = stageGetter();
      if (stage && stage.isFreeDrawing()) stage.closeFreeDraw();
    },
    onUndo: doUndo,
    onRedo: doRedo,
    onEscape: () => {
      const stage = stageGetter();
      if (stage && stage.isFreeDrawing()) {
        stage.cancelFreeDraw();
        return;
      }
      const session = sessionGetter();
      if (!session) return;
      setMode('select');
      session.selection.clear();
      stage.setSelected(session.selection);
      renderInspectorPanel();
    }
  });
}

module.exports = { bindEditorKeyboard };
