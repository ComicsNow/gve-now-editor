/**
 * @jest-environment jsdom
 */
const { renderOrderPanel } = require('../../src/web/editor/order-panel');

const ITEMS = [
  { id: 'i0', kind: 'panel', box: [0, 0, 100, 200] },
  { id: 'i1', kind: 'bubble', box: [10, 20, 30, 40] }
];

function setup(props = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const handlers = { onSelect: jest.fn(), onMove: jest.fn(), onSetCaret: jest.fn(), onDrop: jest.fn(), onSetNumber: jest.fn() };
  renderOrderPanel(el, { order: ['i1', 'i0'], items: ITEMS, caret: 2, ...handlers, ...props });
  return { el, ...handlers };
}

// Rows in a fixed 30px rhythm: row i covers [i*30, (i+1)*30].
function patchRowRects(el) {
  el.querySelectorAll('.order-row').forEach((row, i) => {
    row.getBoundingClientRect = () => ({
      top: i * 30,
      height: 30,
      left: 0,
      right: 100,
      bottom: (i + 1) * 30,
      width: 100,
      x: 0,
      y: i * 30,
      toJSON() {
        return this;
      }
    });
  });
}

function ptr(type, clientX, clientY) {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('web/order-panel DOM', () => {
  it('renders rows in order with badges, kind classes and caret slots', () => {
    const { el } = setup();
    const rows = el.querySelectorAll('.order-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].dataset.id).toBe('i1');
    expect(rows[0].classList.contains('row-bubble')).toBe(true);
    expect(rows[0].querySelector('.badge').textContent).toBe('1');
    expect(rows[1].dataset.id).toBe('i0');
    expect(rows[1].classList.contains('row-panel')).toBe(true);
    expect(rows[1].querySelector('.badge').textContent).toBe('2');

    const slots = el.querySelectorAll('.caret-slot');
    expect(slots).toHaveLength(3);
    expect(slots[2].classList.contains('active')).toBe(true);
    expect(slots[0].classList.contains('active')).toBe(false);
  });

  it('reports caret clicks with the slot index', () => {
    const { el, onSetCaret } = setup();
    el.querySelectorAll('.caret-slot')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSetCaret).toHaveBeenCalledWith(1);
  });

  it('reports row moves and does not select on move clicks', () => {
    const { el, onMove, onSelect } = setup();
    const second = el.querySelectorAll('.order-row')[1];
    second.querySelector('.move-up').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onMove).toHaveBeenCalledWith('i0', -1);
    second.querySelector('.move-down').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onMove).toHaveBeenCalledWith('i0', 1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects a row on click', () => {
    const { el, onSelect } = setup();
    el.querySelectorAll('.order-row')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('i1', { additive: false });
  });

  describe('drag to reorder', () => {
    it('drags a row down and reports the final index after removal', () => {
      const { el, onDrop, onSelect } = setup();
      patchRowRects(el);
      const row = el.querySelectorAll('.order-row')[0]; // i1, index 0
      row.dispatchEvent(ptr('pointerdown', 5, 10));
      window.dispatchEvent(ptr('pointermove', 5, 70)); // below both midpoints
      expect(row.classList.contains('dragging')).toBe(true);
      expect(el.querySelector('.caret-slot[data-index="2"]').classList.contains('drop-slot')).toBe(true);
      window.dispatchEvent(ptr('pointerup', 5, 70));
      expect(onDrop).toHaveBeenCalledWith('i1', 1); // dropIndex(0, 2)
      expect(row.classList.contains('dragging')).toBe(false);
      expect(el.querySelector('.caret-slot.drop-slot')).toBeNull();

      // The click the browser fires after the drag must not select.
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('drags a row up to the top', () => {
      const { el, onDrop } = setup();
      patchRowRects(el);
      const row = el.querySelectorAll('.order-row')[1]; // i0, index 1
      row.dispatchEvent(ptr('pointerdown', 5, 40));
      window.dispatchEvent(ptr('pointermove', 5, 5)); // above both midpoints
      window.dispatchEvent(ptr('pointerup', 5, 5));
      expect(onDrop).toHaveBeenCalledWith('i0', 0); // dropIndex(1, 0)
    });

    it('presses without movement stay clicks', () => {
      const { el, onDrop, onSelect } = setup();
      patchRowRects(el);
      const row = el.querySelectorAll('.order-row')[0];
      row.dispatchEvent(ptr('pointerdown', 5, 10));
      window.dispatchEvent(ptr('pointermove', 6, 11)); // under the slop
      window.dispatchEvent(ptr('pointerup', 6, 11));
      expect(onDrop).not.toHaveBeenCalled();
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onSelect).toHaveBeenCalledWith('i1', { additive: false });
    });

    it('does not reorder when the drop lands on the dragged row', () => {
      const { el, onDrop } = setup();
      patchRowRects(el);
      const row = el.querySelectorAll('.order-row')[0];
      row.dispatchEvent(ptr('pointerdown', 5, 10));
      window.dispatchEvent(ptr('pointermove', 5, 20)); // still within its own row
      window.dispatchEvent(ptr('pointerup', 5, 20));
      expect(onDrop).not.toHaveBeenCalled();
    });

    it('cancels cleanly on pointercancel', () => {
      const { el, onDrop } = setup();
      patchRowRects(el);
      const row = el.querySelectorAll('.order-row')[0];
      row.dispatchEvent(ptr('pointerdown', 5, 10));
      window.dispatchEvent(ptr('pointermove', 5, 70));
      window.dispatchEvent(ptr('pointercancel', 5, 70));
      expect(onDrop).not.toHaveBeenCalled();
      expect(row.classList.contains('dragging')).toBe(false);
      expect(el.querySelector('.caret-slot.drop-slot')).toBeNull();
    });

    it('does not start a drag from the move buttons or the badge', () => {
      const { el, onDrop } = setup();
      patchRowRects(el);
      const row = el.querySelectorAll('.order-row')[0];
      row.querySelector('.move-down').dispatchEvent(ptr('pointerdown', 5, 10));
      window.dispatchEvent(ptr('pointermove', 5, 70));
      window.dispatchEvent(ptr('pointerup', 5, 70));
      row.querySelector('.badge').dispatchEvent(ptr('pointerdown', 5, 10));
      window.dispatchEvent(ptr('pointermove', 5, 70));
      window.dispatchEvent(ptr('pointerup', 5, 70));
      expect(onDrop).not.toHaveBeenCalled();
      expect(row.classList.contains('dragging')).toBe(false);
    });
  });

  describe('number editing', () => {
    it('opens an editor on the badge and reports the typed position', () => {
      const { el, onSetNumber, onSelect } = setup();
      const badge = el.querySelectorAll('.order-row')[1].querySelector('.badge'); // i0, number 2
      badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onSelect).not.toHaveBeenCalled();
      const input = badge.querySelector('.badge-input');
      expect(input).toBeTruthy();
      expect(input.value).toBe('2');
      input.value = '1';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onSetNumber).toHaveBeenCalledWith('i0', 1);
    });

    it('clamps typed numbers to 1..count', () => {
      const { el, onSetNumber } = setup();
      const badge = el.querySelectorAll('.order-row')[0].querySelector('.badge');
      badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const input = badge.querySelector('.badge-input');
      input.value = '7';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onSetNumber).toHaveBeenCalledWith('i1', 2); // only 2 rows exist
    });

    it('cancels on Escape and restores the number', () => {
      const { el, onSetNumber } = setup();
      const badge = el.querySelectorAll('.order-row')[0].querySelector('.badge');
      badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const input = badge.querySelector('.badge-input');
      input.value = '9';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onSetNumber).not.toHaveBeenCalled();
      expect(badge.querySelector('.badge-input')).toBeNull();
      expect(badge.textContent).toBe('1');
    });
  });
});
