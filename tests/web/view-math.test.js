const { zoomAt, fitWidthScale, clampZoom, containScale, resolveView } = require('../../src/web/editor/view-math');

describe('web/view-math', () => {
  it('zoomAt keeps the native point under the cursor fixed', () => {
    // scale 1, no offset: pointer at 100 -> native 100; zoom 2x -> offset -100.
    expect(zoomAt({ scale: 1, offsetX: 0, offsetY: 0 }, 100, 50, 2)).toEqual({ scale: 2, offsetX: -100, offsetY: -50 });
  });

  it('zoomAt treats the pointer as a pre-transform frame coordinate (translate undone with the scale)', () => {
    // scale 2, offset 10: frame point 110 is native (110-10)/2 = 50; zooming
    // to 4 keeps that native point at frame 110 -> offset 110 - 50*4 = -90.
    expect(zoomAt({ scale: 2, offsetX: 10, offsetY: 20 }, 110, 220, 2)).toEqual({ scale: 4, offsetX: -90, offsetY: -180 });
  });

  it('zoomAt is stable across successive zooms', () => {
    let view = { scale: 1, offsetX: 0, offsetY: 0 };
    view = zoomAt(view, 100, 0, 2); // scale 2, offset -100
    view = zoomAt(view, 100, 0, 0.5); // back to scale 1, offset 0
    expect(view).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('fitWidthScale divides the viewport width by the page width', () => {
    expect(fitWidthScale(1000, 500)).toBe(2);
    expect(fitWidthScale(0, 500)).toBe(1);
  });

  it('clampZoom keeps scale within bounds', () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(100)).toBe(8);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  describe('resolveView', () => {
    it('centers the page in any axis where it is smaller than the viewport', () => {
      // page 1000x2000 at 0.5 => 500x1000; viewport 800x600.
      const v = resolveView({ scale: 0.5, offsetX: 0, offsetY: 0 }, 800, 600, 1000, 2000);
      expect(v.scale).toBe(0.5);
      expect(v.offsetX).toBe(150); // (800-500)/2
      expect(v.offsetY).toBe(0); // taller than viewport: clamped to the top edge
    });

    it('clamps offsets so no dead space shows when the page is larger', () => {
      const v = resolveView({ scale: 1, offsetX: -300, offsetY: 50 }, 800, 600, 1000, 2000);
      expect(v.offsetX).toBe(-200); // range [-200, 0]
      expect(v.offsetY).toBe(0);
      const v2 = resolveView({ scale: 1, offsetX: -100, offsetY: -500 }, 800, 600, 1000, 2000);
      expect(v2.offsetX).toBe(-100);
      expect(v2.offsetY).toBe(-500); // range [-1400, 0]
    });

    it('stops zooming out at the contain scale (whole page visible), re-centering', () => {
      // contain for 800x600 vs 1000x2000 is 0.3.
      const v = resolveView({ scale: 0.1, offsetX: 0, offsetY: 0 }, 800, 600, 1000, 2000);
      expect(v.scale).toBe(0.3);
      expect(v.offsetX).toBe(250); // (800-300)/2
      expect(v.offsetY).toBe(0); // exactly fills the height
    });

    it('caps zoom-in at MAX_ZOOM keeping the viewport centre anchored', () => {
      const v = resolveView({ scale: 20, offsetX: -100, offsetY: -100 }, 800, 600, 1000, 2000);
      expect(v.scale).toBe(8);
    });

    it('is a no-op for degenerate viewport or page sizes (unlaid-out DOM)', () => {
      const view = { scale: 2, offsetX: 10, offsetY: 20 };
      expect(resolveView(view, 0, 0, 100, 200)).toEqual(view);
      expect(resolveView(view, 800, 600, 0, 0)).toEqual(view);
    });
  });

  it('containScale is min(vw/pw, vh/ph)', () => {
    expect(containScale(800, 600, 1000, 2000)).toBeCloseTo(0.3);
    expect(containScale(0, 0, 100, 200)).toBe(0.1); // degenerate -> MIN_ZOOM
  });
});
