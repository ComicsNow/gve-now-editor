/**
 * @jest-environment jsdom
 */
const { renderOverlay } = require('../../src/web/editor/overlay');

function items() {
  return [
    { id: 'i0', kind: 'panel', box: [0, 0, 100, 200] },
    { id: 'i1', kind: 'bubble', box: [10, 20, 30, 40] }
  ];
}

function render(props = {}) {
  const layer = document.createElement('div');
  const onSelect = jest.fn();
  renderOverlay(layer, {
    page: { width: 100, height: 200, items: items() },
    order: ['i1', 'i0'],
    selected: new Set(),
    onSelect,
    ...props
  });
  return { layer, onSelect };
}

describe('web/overlay', () => {
  it('renders one div per item in order order, positioned in native px', () => {
    const { layer } = render();
    const boxes = layer.querySelectorAll('.box');
    expect(boxes).toHaveLength(2);

    const first = boxes[0];
    expect(first.dataset.id).toBe('i1');
    expect(first.classList.contains('box-bubble')).toBe(true);
    expect(first.style.left).toBe('10px');
    expect(first.style.top).toBe('20px');
    expect(first.style.width).toBe('30px');
    expect(first.style.height).toBe('40px');
    expect(first.querySelector('.badge').textContent).toBe('1');

    const second = boxes[1];
    expect(second.dataset.id).toBe('i0');
    expect(second.classList.contains('box-panel')).toBe(true);
    expect(second.querySelector('.badge').textContent).toBe('2');
  });

  it('marks the selected box and gives it 8 resize handles', () => {
    const { layer } = render({ selected: new Set(['i0']) });
    const panel = layer.querySelector('[data-id="i0"]');
    const bubble = layer.querySelector('[data-id="i1"]');
    expect(panel.classList.contains('selected')).toBe(true);
    expect(panel.querySelectorAll('.handle')).toHaveLength(8);
    expect(bubble.classList.contains('selected')).toBe(false);
    expect(bubble.querySelectorAll('.handle')).toHaveLength(0);
  });

  it('renders only items present in the order (scaffold panels are never ordered)', () => {
    const { layer } = render({ order: ['i1'] });
    expect(layer.querySelectorAll('.box')).toHaveLength(1);
    expect(layer.querySelector('[data-id="i0"]')).toBeNull();
    expect(layer.querySelector('[data-id="i1"] .badge').textContent).toBe('1');
  });

  it('renders free-drawn items as a polygon inside their bbox', () => {
    const shaped = [{ id: 'i1', kind: 'panel', box: [10, 20, 80, 60], points: [[10, 40], [90, 40], [50, 80]] }];
    const { layer } = render({ page: { width: 100, height: 200, items: shaped }, order: ['i1'], selected: new Set(['i1']) });
    const box = layer.querySelector('[data-id="i1"]');
    expect(box.classList.contains('has-shape')).toBe(true);
    const poly = box.querySelector('polygon');
    expect(poly).toBeTruthy();
    expect(poly.getAttribute('points')).toBe('0,20 80,20 40,60'); // relative to the bbox origin
    expect(poly.classList.contains('shape-panel')).toBe(true);
    expect(box.querySelectorAll('.handle')).toHaveLength(8); // still editable by its box
    expect(box.querySelector('.badge').textContent).toBe('1');
  });

  it('renders rect items without polygon markup', () => {
    const { layer } = render();
    const panel = layer.querySelector('[data-id="i0"]');
    expect(panel.classList.contains('has-shape')).toBe(false);
    expect(panel.querySelector('polygon')).toBeNull();
  });

  it('reports clicks (with the additive flag) through onSelect', () => {
    const { layer, onSelect } = render();
    layer.querySelector('[data-id="i1"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(onSelect).toHaveBeenCalledWith('i1', { additive: true });
    layer.querySelector('[data-id="i0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('i0', { additive: false });
  });

  it('edits the position by clicking the badge and typing a number', () => {
    const onEditNumber = jest.fn();
    const { layer, onSelect } = render({ onEditNumber });
    const badge = layer.querySelector('[data-id="i0"] .badge'); // second in order -> number 2
    badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).not.toHaveBeenCalled();
    const input = badge.querySelector('.badge-input');
    expect(input).toBeTruthy();
    expect(input.value).toBe('2');
    input.value = '1';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onEditNumber).toHaveBeenCalledWith('i0', 1);
  });

  it('leaves the badge as a plain click-through when number editing is off (draw modes)', () => {
    const { layer, onSelect } = render();
    const badge = layer.querySelector('[data-id="i0"] .badge');
    badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(badge.querySelector('.badge-input')).toBeNull();
    expect(onSelect).toHaveBeenCalledWith('i0', { additive: false }); // behaves like a click on the box
  });

  it('replaces previous content on re-render', () => {
    const { layer } = render();
    render({});
    // render a second time into the same layer
    renderOverlay(layer, {
      page: { width: 100, height: 200, items: items() },
      order: ['i0', 'i1'],
      selected: new Set(),
      onSelect: jest.fn()
    });
    expect(layer.querySelectorAll('.box')).toHaveLength(2);
  });
});
