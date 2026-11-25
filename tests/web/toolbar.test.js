/**
 * @jest-environment jsdom
 */
'use strict';

const { buildToolbar, updateUndoButtons } = require('../../src/web/editor/toolbar');

describe('web/editor/toolbar', () => {
  it('renders toolbar elements and wires actions', () => {
    const el = document.createElement('div');
    const undo = { canUndo: () => true, canRedo: () => false };
    const setMode = jest.fn();
    const doUndo = jest.fn();
    const save = jest.fn();

    buildToolbar(el, {
      session: { comic: { series: 'Alpha', name: '01.cbz' } },
      storeType: 'western',
      undo,
      setMode,
      doUndo,
      save
    });

    expect(el.querySelector('.editor-title').textContent).toContain('Alpha — 01.cbz');
    expect(el.querySelector('.chip.type-western')).toBeTruthy();

    const undoBtn = el.querySelector('.undo');
    expect(undoBtn.disabled).toBe(false);
    undoBtn.click();
    expect(doUndo).toHaveBeenCalled();

    const redoBtn = el.querySelector('.redo');
    expect(redoBtn.disabled).toBe(true);

    const modeBtn = el.querySelector('.mode-btn[data-mode="bubble"]');
    expect(modeBtn).toBeTruthy();
    modeBtn.click();
    expect(setMode).toHaveBeenCalledWith('bubble');
  });
});
