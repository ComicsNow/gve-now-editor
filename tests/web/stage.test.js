/**
 * @jest-environment jsdom
 */
const { createStage } = require('../../src/web/editor/stage');

const RECT = { left: 100, top: 50, width: 200, height: 400 }; // page 100x200 => scale 2

function mockRect(el) {
  el.getBoundingClientRect = () => ({
    left: RECT.left,
    top: RECT.top,
    width: RECT.width,
    height: RECT.height,
    right: RECT.left + RECT.width,
    bottom: RECT.top + RECT.height,
    x: RECT.left,
    y: RECT.top,
    toJSON() {
      return this;
    }
  });
}

function ptr(type, clientX, clientY, extra = {}) {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true, ...extra });
}

function setup({ items = [], mode = 'select' } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handlers = {
    onAdd: jest.fn(),
    onSelect: jest.fn(),
    onUpdateBox: jest.fn(),
    onBeginEdit: jest.fn(),
    onEditNumber: jest.fn()
  };
  const stage = createStage(container, handlers);
  mockRect(stage.stageEl);
  stage.setPage({ width: 100, height: 200, type: 'western', items, order: items.map((i) => i.id) });
  stage.setMode(mode);
  stage.setView({ scale: 1, offsetX: 0, offsetY: 0 });
  return { container, stage, handlers };
}

const BUBBLE = { id: 'i1', kind: 'bubble', box: [25, 100, 25, 25] };

afterEach(() => {
  document.body.innerHTML = '';
});

describe('web/stage', () => {
  it('builds the viewport/stage/image/overlay structure', () => {
    const { container } = setup();
    expect(container.querySelector('.stage-viewport')).toBeTruthy();
    expect(container.querySelector('.stage')).toBeTruthy();
    expect(container.querySelector('.stage-img')).toBeTruthy();
    expect(container.querySelector('.stage-overlay')).toBeTruthy();
  });

  it('applies the view transform and page size', () => {
    const { stage } = setup();
    stage.setView({ scale: 2, offsetX: 10, offsetY: 20 });
    expect(stage.stageEl.style.transform).toBe('translate(10px, 20px) scale(2)');
    expect(stage.stageEl.style.width).toBe('100px');
    expect(stage.stageEl.style.height).toBe('200px');
  });

  it('maps client points to native page px through the rendered rect', () => {
    const { stage } = setup();
    expect(stage.getNative(150, 250)).toEqual({ x: 25, y: 100 });
    expect(stage.getNative(100, 50)).toEqual({ x: 0, y: 0 });
  });

  it('draws a marquee box in draw mode and reports it on release', () => {
    const { container, stage, handlers } = setup({ mode: 'bubble' });
    stage.stageEl.dispatchEvent(ptr('pointerdown', 150, 250));
    expect(container.querySelector('.marquee')).toBeTruthy();
    window.dispatchEvent(ptr('pointermove', 200, 300));
    window.dispatchEvent(ptr('pointerup', 200, 300));
    expect(handlers.onAdd).toHaveBeenCalledWith('bubble', [25, 100, 25, 25]);
    expect(container.querySelector('.marquee')).toBeNull();
  });

  it('cancels a marquee smaller than 4px', () => {
    const { stage, handlers } = setup({ mode: 'panel' });
    stage.stageEl.dispatchEvent(ptr('pointerdown', 150, 250));
    window.dispatchEvent(ptr('pointermove', 153, 253));
    window.dispatchEvent(ptr('pointerup', 153, 253));
    expect(handlers.onAdd).not.toHaveBeenCalled();
  });

  it('drags an existing box in select mode and commits one update', () => {
    const { stage, handlers } = setup({ items: [BUBBLE] });
    const box = stage.layerEl.querySelector('[data-id="i1"]');
    box.dispatchEvent(ptr('pointerdown', 160, 270)); // native (30,110), inside the box
    window.dispatchEvent(ptr('pointermove', 180, 290)); // native (40,120)
    window.dispatchEvent(ptr('pointerup', 180, 290));
    expect(handlers.onBeginEdit).toHaveBeenCalledTimes(1);
    expect(handlers.onUpdateBox).toHaveBeenLastCalledWith('i1', [35, 110, 25, 25]);
  });

  it('selects the pressed box when a drag begins, so its handles are live', () => {
    const { stage, handlers } = setup({ items: [BUBBLE] });
    const box = stage.layerEl.querySelector('[data-id="i1"]');
    box.dispatchEvent(ptr('pointerdown', 160, 270));
    expect(handlers.onSelect).toHaveBeenLastCalledWith('i1', { additive: false });
    window.dispatchEvent(ptr('pointermove', 180, 290));
    window.dispatchEvent(ptr('pointerup', 180, 290));
    expect(handlers.onUpdateBox).toHaveBeenLastCalledWith('i1', [35, 110, 25, 25]);
  });

  it('presses on an already-selected or shift-held box without re-selecting', () => {
    const { stage, handlers } = setup({ items: [BUBBLE] });
    stage.setSelected(new Set(['i1']));
    const handle = stage.layerEl.querySelector('[data-id="i1"] .handle-se');
    handle.dispatchEvent(ptr('pointerdown', 200, 300)); // resize press: already selected
    window.dispatchEvent(ptr('pointerup', 200, 300));

    const box = stage.layerEl.querySelector('[data-id="i1"]');
    box.dispatchEvent(ptr('pointerdown', 160, 270, { shiftKey: true })); // additive click path
    window.dispatchEvent(ptr('pointerup', 160, 270));
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it('resizes from a handle in select mode', () => {
    const { stage, handlers } = setup({ items: [BUBBLE] });
    stage.setSelected(new Set(['i1']));
    const handle = stage.layerEl.querySelector('[data-id="i1"] .handle-se');
    expect(handle).toBeTruthy();
    handle.dispatchEvent(ptr('pointerdown', 200, 300)); // native (50,125), the se corner
    window.dispatchEvent(ptr('pointermove', 220, 320)); // native (60,135)
    window.dispatchEvent(ptr('pointerup', 220, 320));
    expect(handlers.onUpdateBox).toHaveBeenLastCalledWith('i1', [25, 100, 35, 35]);
  });

  it('routes page badge number edits through onEditNumber in select mode only', () => {
    const { stage, handlers } = setup({ items: [BUBBLE] });
    const clickBadge = () => {
      const badge = stage.layerEl.querySelector('[data-id="i1"] .badge');
      badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return badge;
    };

    const badge = clickBadge();
    const input = badge.querySelector('.badge-input');
    expect(input).toBeTruthy();
    expect(input.value).toBe('1');
    input.value = '1';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(handlers.onEditNumber).toHaveBeenCalledWith('i1', 1);

    stage.setMode('panel');
    clickBadge();
    expect(stage.layerEl.querySelector('.badge-input')).toBeNull(); // inert while drawing
  });

  it('selects boxes on click only in select mode; empty space deselects', () => {
    const { stage, handlers } = setup({ items: [BUBBLE] });
    const box = stage.layerEl.querySelector('[data-id="i1"]');
    box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handlers.onSelect).toHaveBeenLastCalledWith('i1', { additive: false });

    stage.stageEl.dispatchEvent(ptr('pointerdown', 400, 500));
    window.dispatchEvent(ptr('pointerup', 400, 500));
    expect(handlers.onSelect).toHaveBeenLastCalledWith(null, { additive: false });

    stage.setMode('panel');
    box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handlers.onSelect).toHaveBeenCalledTimes(2);
  });

  it('zooms at the cursor on ctrl+wheel (pinch / ctrl+scroll)', () => {
    const { stage } = setup();
    // Non-zero offsets: zoomAt's pointer coordinates live in the stage's
    // pre-transform frame, so the translate must be undone along with the
    // scale. Cursor (200,250) with rect at (100,50) and offset (10,20) is
    // frame point (110, 220) = native (100, 200) at scale 1.
    stage.setView({ scale: 1, offsetX: 10, offsetY: 20 });
    stage.stageEl.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, clientX: 200, clientY: 250, ctrlKey: true, bubbles: true, cancelable: true })
    );
    const view = stage.getView();
    expect(view.scale).toBeCloseTo(1.1617, 3); // 1.0015^100
    expect(view.offsetX).toBeCloseTo(110 - 100 * view.scale, 3);
    expect(view.offsetY).toBeCloseTo(220 - 200 * view.scale, 3);
  });

  it('pans on plain wheel (two-finger scroll)', () => {
    const { stage } = setup();
    stage.stageEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, deltaX: 30, bubbles: true, cancelable: true }));
    const view = stage.getView();
    expect(view.scale).toBe(1);
    expect(view.offsetX).toBe(-30);
    expect(view.offsetY).toBe(-100);
  });

  describe('free-draw mode', () => {
    // Native px are client/2 - (50, 25) with RECT: client (140,250) -> native (20,100).
    const click = (stage, clientX, clientY) => {
      stage.stageEl.dispatchEvent(ptr('pointerdown', clientX, clientY));
      stage.stageEl.dispatchEvent(ptr('pointerup', clientX, clientY));
    };

    it('collects clicked vertices and closes near the start, reporting box + points', () => {
      const { stage, handlers } = setup({ mode: 'panel-free' });
      click(stage, 140, 250); // native (20, 100)
      click(stage, 200, 250); // native (50, 100)
      click(stage, 170, 400); // native (35, 175)
      expect(handlers.onAdd).not.toHaveBeenCalled();

      click(stage, 142, 252); // 2.8 screen px from the first vertex: closes
      expect(handlers.onAdd).toHaveBeenCalledTimes(1);
      expect(handlers.onAdd).toHaveBeenLastCalledWith('panel', [20, 100, 30, 75], [[20, 100], [50, 100], [35, 175]]);
      expect(stage.isFreeDrawing()).toBe(false);
      expect(stage.freeLayerEl.querySelectorAll('.free-vertex').length).toBe(0);
    });

    it('reports the bubble kind in bubble-free mode', () => {
      const { stage, handlers } = setup({ mode: 'bubble-free' });
      click(stage, 140, 250);
      click(stage, 200, 250);
      click(stage, 170, 400);
      click(stage, 142, 252);
      expect(handlers.onAdd).toHaveBeenLastCalledWith('bubble', [20, 100, 30, 75], [[20, 100], [50, 100], [35, 175]]);
    });

    it('shows a live preview (vertices + rubber band) while drawing', () => {
      const { stage } = setup({ mode: 'panel-free' });
      click(stage, 140, 250);
      expect(stage.freeLayerEl.querySelectorAll('.free-vertex').length).toBe(1);
      expect(stage.freeLayerEl.querySelector('.free-vertex-start')).toBeTruthy();

      click(stage, 200, 250);
      stage.stageEl.dispatchEvent(ptr('pointermove', 240, 300));
      const line = stage.freeLayerEl.querySelector('.free-line');
      expect(line).toBeTruthy();
      // chain of the two vertices plus the rubber band to the cursor (30, 125)
      expect(line.getAttribute('points')).toBe('20,100 50,100 70,125');
    });

    it('clamps vertices to the page bounds', () => {
      const { stage, handlers } = setup({ mode: 'panel-free' });
      click(stage, 50, 0); // native (-25, -25) -> clamped to (0, 0)
      click(stage, 200, 250); // (50, 100)
      click(stage, 170, 400); // (35, 175)
      click(stage, 101, 51); // near (0, 0) closes
      expect(handlers.onAdd).toHaveBeenLastCalledWith('panel', [0, 0, 50, 175], [[0, 0], [50, 100], [35, 175]]);
    });

    it('cancels degenerate polygons (collinear or under 4px)', () => {
      const { stage, handlers } = setup({ mode: 'panel-free' });
      click(stage, 140, 250); // (20, 100)
      click(stage, 160, 250); // (30, 100)
      click(stage, 180, 250); // (40, 100) - all collinear
      click(stage, 141, 251); // closes
      expect(handlers.onAdd).not.toHaveBeenCalled();
      expect(stage.isFreeDrawing()).toBe(false);
    });

    it('does not close with fewer than 3 vertices even when clicking the start', () => {
      const { stage, handlers } = setup({ mode: 'panel-free' });
      click(stage, 140, 250);
      click(stage, 141, 251); // near the start, but only 1 vertex exists
      expect(stage.isFreeDrawing()).toBe(true);
      expect(handlers.onAdd).not.toHaveBeenCalled();
    });

    it('supports Enter to close, Backspace to pop, Escape to cancel, and mode change to cancel', () => {
      const { stage, handlers } = setup({ mode: 'panel-free' });
      click(stage, 140, 250);
      click(stage, 200, 250);
      click(stage, 170, 400);
      expect(stage.popFreeVertex()).toBe(true); // drop (35, 175)
      click(stage, 170, 400);
      expect(stage.closeFreeDraw()).toBe(true); // Enter path
      expect(handlers.onAdd).toHaveBeenLastCalledWith('panel', [20, 100, 30, 75], [[20, 100], [50, 100], [35, 175]]);

      click(stage, 140, 250);
      click(stage, 200, 250);
      stage.cancelFreeDraw();
      expect(stage.isFreeDrawing()).toBe(false);

      click(stage, 140, 250);
      stage.setMode('select');
      expect(stage.isFreeDrawing()).toBe(false);
      click(stage, 200, 250); // back in select mode: a marquee-less press, nothing added
      expect(stage.isFreeDrawing()).toBe(false);

      stage.setMode('panel-free');
      click(stage, 140, 250);
      stage.setPage({ width: 100, height: 200, type: 'western', items: [], order: [] });
      expect(stage.isFreeDrawing()).toBe(false);
    });

    it('closeFreeDraw refuses with fewer than 3 vertices', () => {
      const { stage, handlers } = setup({ mode: 'panel-free' });
      click(stage, 140, 250);
      expect(stage.closeFreeDraw()).toBe(false);
      click(stage, 200, 250);
      expect(stage.closeFreeDraw()).toBe(false);
      expect(stage.isFreeDrawing()).toBe(true);
      expect(handlers.onAdd).not.toHaveBeenCalled();
    });
  });

  it('resolves the view against the viewport (centering/clamping) when laid out', () => {
    const { stage } = setup();
    Object.defineProperty(stage.viewport, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(stage.viewport, 'clientHeight', { value: 600, configurable: true });
    stage.setView({ scale: 4, offsetX: 10, offsetY: 20 }); // page 100x200 -> 400x800 scaled
    expect(stage.getView()).toEqual({ scale: 4, offsetX: 200, offsetY: 0 });
    expect(stage.stageEl.style.transform).toBe('translate(200px, 0px) scale(4)');
    // Below the contain scale (3 here) the zoom clamps up, keeping the centre.
    stage.setView({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(stage.getView().scale).toBe(3);
    // Panning past an edge clamps back.
    stage.setView({ scale: 4, offsetX: 0, offsetY: -300 });
    expect(stage.getView()).toEqual({ scale: 4, offsetX: 200, offsetY: -200 });
  });
});
