'use strict';

// Global editor keymap. `step` in onNudge is 10px with Shift, else 1px.

function attachKeyboard(el, actions = {}) {
  function onKeyDown(e) {
    const target = e.target;
    const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';

    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (actions.onUndo) actions.onUndo();
      return;
    }
    if (mod && ((key === 'z' && e.shiftKey) || key === 'y')) {
      e.preventDefault();
      if (actions.onRedo) actions.onRedo();
      return;
    }

    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (actions.onNudge) actions.onNudge(-1, 0, step);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (actions.onNudge) actions.onNudge(1, 0, step);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (actions.onNudge) actions.onNudge(0, -1, step);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (actions.onNudge) actions.onNudge(0, 1, step);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (actions.onDelete) actions.onDelete();
        break;
      case 'Enter':
        e.preventDefault();
        if (actions.onEnter) actions.onEnter();
        break;
      case 'Escape':
        if (actions.onEscape) actions.onEscape();
        break;
      default:
    }
  }

  el.addEventListener('keydown', onKeyDown);
  return () => el.removeEventListener('keydown', onKeyDown);
}

module.exports = { attachKeyboard };
