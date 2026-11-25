/**
 * @jest-environment jsdom
 */
'use strict';

const { bindEditorKeyboard } = require('../../src/web/editor-keyboard');

describe('web/editor-keyboard', () => {
  it('binds undo/redo and nudge shortcuts', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    const onNudge = jest.fn();

    const cleanup = bindEditorKeyboard({
      target: document.body,
      stageGetter: () => null,
      sessionGetter: () => ({ selection: new Set(['i1']) }),
      nudgeSelection: onNudge,
      deleteSelection: jest.fn(),
      doUndo: onUndo,
      doRedo: onRedo,
      setMode: jest.fn(),
      renderInspectorPanel: jest.fn()
    });

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(onUndo).toHaveBeenCalled();

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));
    expect(onRedo).toHaveBeenCalled();

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(onNudge).toHaveBeenCalledWith(1, 0, 1);

    cleanup();
  });
});
