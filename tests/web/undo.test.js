const { createUndoStack } = require('../../src/web/editor/undo');

describe('web/undo', () => {
  it('undo returns the previous snapshot and pushes the current onto redo', () => {
    const stack = createUndoStack();
    const s0 = { page: 'p1', items: [], order: [] };
    const s1 = { page: 'p1', items: [{ id: 'a' }], order: ['a'] };
    stack.push(s0); // mutation took us from s0 to s1
    const current = { page: 'p1', items: [{ id: 'a' }, { id: 'b' }], order: ['a', 'b'] };

    expect(stack.canUndo()).toBe(true);
    expect(stack.undo(current)).toEqual(s0);
    expect(stack.canRedo()).toBe(true);
    expect(stack.redo(s0)).toEqual(current);
    expect(stack.canRedo()).toBe(false);
  });

  it('returns null when there is nothing to undo or redo', () => {
    const stack = createUndoStack();
    expect(stack.undo({})).toBeNull();
    expect(stack.redo({})).toBeNull();
  });

  it('a new push clears the redo history', () => {
    const stack = createUndoStack();
    stack.push('s0');
    stack.undo('s1');
    expect(stack.canRedo()).toBe(true);
    stack.push('s2');
    expect(stack.canRedo()).toBe(false);
  });

  it('caps the undo depth', () => {
    const stack = createUndoStack({ limit: 3 });
    for (let i = 0; i < 6; i++) stack.push(`s${i}`);
    let count = 0;
    while (stack.undo('current') !== null) count++;
    expect(count).toBe(3);
  });

  it('clear empties both stacks', () => {
    const stack = createUndoStack();
    stack.push('a');
    stack.undo('b');
    stack.clear();
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
  });
});
