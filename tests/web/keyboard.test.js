/**
 * @jest-environment jsdom
 */
const { attachKeyboard } = require('../../src/web/editor/keyboard');

function setup() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const actions = {
    onNudge: jest.fn(),
    onDelete: jest.fn(),
    onUndo: jest.fn(),
    onRedo: jest.fn(),
    onEscape: jest.fn(),
    onEnter: jest.fn()
  };
  const detach = attachKeyboard(el, actions);
  const key = (k, init = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  return { el, actions, detach, key };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('web/keyboard', () => {
  it('maps arrow keys to nudges, with Shift as the 10px step', () => {
    const { actions, key } = setup();
    key('ArrowLeft');
    expect(actions.onNudge).toHaveBeenLastCalledWith(-1, 0, 1);
    key('ArrowRight', { shiftKey: true });
    expect(actions.onNudge).toHaveBeenLastCalledWith(1, 0, 10);
    key('ArrowUp');
    expect(actions.onNudge).toHaveBeenLastCalledWith(0, -1, 1);
    key('ArrowDown', { shiftKey: true });
    expect(actions.onNudge).toHaveBeenLastCalledWith(0, 1, 10);
  });

  it('maps Delete/Backspace, Escape, and undo/redo chords', () => {
    const { actions, key } = setup();
    key('Delete');
    key('Backspace');
    expect(actions.onDelete).toHaveBeenCalledTimes(2);

    key('Escape');
    expect(actions.onEscape).toHaveBeenCalledTimes(1);

    key('Enter');
    expect(actions.onEnter).toHaveBeenCalledTimes(1);

    key('z', { ctrlKey: true });
    expect(actions.onUndo).toHaveBeenCalledTimes(1);
    key('z', { ctrlKey: true, shiftKey: true });
    expect(actions.onRedo).toHaveBeenCalledTimes(1);
    key('y', { metaKey: true });
    expect(actions.onRedo).toHaveBeenCalledTimes(2);
  });

  it('ignores keystrokes from form fields', () => {
    const { el, actions, key } = setup();
    const input = document.createElement('input');
    el.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(actions.onDelete).not.toHaveBeenCalled();
    key('ArrowLeft');
    expect(actions.onNudge).toHaveBeenCalledTimes(1);
  });

  it('detaches cleanly', () => {
    const { actions, detach, key } = setup();
    detach();
    key('Delete');
    expect(actions.onDelete).not.toHaveBeenCalled();
  });
});
