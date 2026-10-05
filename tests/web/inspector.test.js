/**
 * @jest-environment jsdom
 */
const { renderInspector } = require('../../src/web/editor/inspector');

describe('web/inspector', () => {
  it('shows kind, badge, and editable metrics for the selected item', () => {
    const el = document.createElement('div');
    renderInspector(el, {
      item: { id: 'i1', kind: 'bubble', box: [10, 20, 30, 40] },
      badge: 3,
      onBoxChange: jest.fn()
    });
    expect(el.textContent).toContain('bubble');
    expect(el.textContent).toContain('3');
    for (const [field, value] of [['x', '10'], ['y', '20'], ['w', '30'], ['h', '40']]) {
      expect(el.querySelector(`[data-field="${field}"]`).value).toBe(value);
    }
  });

  it('reports edited boxes through onBoxChange', () => {
    const el = document.createElement('div');
    const onBoxChange = jest.fn();
    renderInspector(el, {
      item: { id: 'i1', kind: 'bubble', box: [10, 20, 30, 40] },
      badge: 1,
      onBoxChange
    });
    const x = el.querySelector('[data-field="x"]');
    x.value = '5';
    x.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onBoxChange).toHaveBeenCalledWith([5, 20, 30, 40], 'x');

    const h = el.querySelector('[data-field="h"]');
    h.value = '7';
    h.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onBoxChange).toHaveBeenLastCalledWith([10, 20, 30, 7], 'h');
  });

  it('ignores non-numeric edits', () => {
    const el = document.createElement('div');
    const onBoxChange = jest.fn();
    renderInspector(el, {
      item: { id: 'i1', kind: 'bubble', box: [10, 20, 30, 40] },
      badge: 1,
      onBoxChange
    });
    const x = el.querySelector('[data-field="x"]');
    x.value = 'abc';
    x.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onBoxChange).not.toHaveBeenCalled();
  });

  it('deletes the selected item through the Delete button', () => {
    const el = document.createElement('div');
    const onDelete = jest.fn();
    renderInspector(el, {
      item: { id: 'i1', kind: 'panel', box: [0, 0, 10, 10] },
      badge: 2,
      onDelete
    });
    const button = el.querySelector('.inspector-delete');
    expect(button).not.toBeNull();
    expect(button.textContent).toBe('Delete');
    button.click();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders an empty state without a selection', () => {
    const el = document.createElement('div');
    renderInspector(el, { item: null, badge: null, onBoxChange: jest.fn() });
    expect(el.querySelector('[data-field="x"]')).toBeNull();
    expect(el.querySelector('.inspector-delete')).toBeNull();
    expect(el.textContent).toMatch(/no selection/i);
  });
});
