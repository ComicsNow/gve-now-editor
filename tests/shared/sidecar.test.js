const fs = require('fs');
const path = require('path');
const {
  normalizeBox,
  normalizeSidecarPage,
  normalizeSidecar,
  regeneratePage,
  regenerateSidecar,
  mergeSidecar,
  pruneWesternPanels,
  validateEditorDocument
} = require('../../src/shared/sidecar');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sidecars', f), 'utf8'));
const WEST = load('western-sample.json');
const MANGA = load('manga-sample.json');

describe('shared/sidecar', () => {
  describe('normalizeBox', () => {
    it('accepts array boxes and object-form (spread-array bug) entries', () => {
      expect(normalizeBox([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
      expect(normalizeBox({ 0: 53, 1: -22, 2: 1553, 3: 1218, isPanel: true, bubbles: [] })).toEqual([53, -22, 1553, 1218]);
    });

    it('rounds floats', () => {
      expect(normalizeBox([1.6, 2.4, 3.5, 4.5])).toEqual([2, 2, 4, 5]);
    });

    it('rejects malformed values', () => {
      expect(normalizeBox(null)).toBeNull();
      expect(normalizeBox(undefined)).toBeNull();
      expect(normalizeBox([1, 2, 3])).toBeNull();
      expect(normalizeBox({})).toBeNull();
      expect(normalizeBox({ 0: 1, 1: 2, 2: NaN, 3: 4 })).toBeNull();
    });
  });

  describe('normalizeSidecarPage (western)', () => {
    const boxOf = (items) => (id) => items.find((i) => i.id === id).box;

    it('drops scaffold panels and numbers bubbles by the sequence when bubbles exist', () => {
      const page = {
        panels: [[0, 0, 400, 300], [0, 350, 400, 300]],
        bubbles: [[50, 50, 100, 60], [400, 600, 80, 50], [60, 60, 90, 50]],
        sequence: [[400, 600, 80, 50], [60, 60, 90, 50], [50, 50, 100, 60]]
      };
      const { items, order, warnings } = normalizeSidecarPage(page, 'western');
      // Panels are detector scaffold on western bubble pages — they only ever
      // existed to order the bubbles, so the editor neither shows nor keeps
      // them once the reader steps bubbles alone.
      expect(items.map((i) => i.kind)).toEqual(['bubble', 'bubble', 'bubble']);
      expect(order.map(boxOf(items))).toEqual([
        [400, 600, 80, 50], [60, 60, 90, 50], [50, 50, 100, 60]
      ]);
      expect(warnings).toEqual([]);
    });

    it('without a sequence, falls back to the stored bubble order', () => {
      const page = {
        panels: [[0, 0, 400, 300]],
        bubbles: [[50, 50, 100, 60], [60, 60, 90, 50]],
        sequence: []
      };
      const { items, order, warnings } = normalizeSidecarPage(page, 'western');
      expect(warnings).toContain('no-sequence');
      expect(items.map((i) => i.kind)).toEqual(['bubble', 'bubble']);
      expect(order).toEqual([items[0].id, items[1].id]);
    });

    it('keeps panels on a bubble-less western page — they are the reader steps', () => {
      const page = {
        panels: [[0, 0, 400, 300], [0, 350, 400, 300]],
        bubbles: [],
        sequence: [[0, 350, 400, 300], [0, 0, 400, 300]]
      };
      const { items, order } = normalizeSidecarPage(page, 'western');
      expect(items.map((i) => i.kind)).toEqual(['panel', 'panel']);
      expect(order.map(boxOf(items))).toEqual([[0, 350, 400, 300], [0, 0, 400, 300]]);
    });

    it('warns when sequence boxes match nothing and drops them', () => {
      const page = {
        panels: [[0, 0, 400, 300]],
        bubbles: [[50, 50, 100, 60]],
        sequence: [[999, 999, 10, 10], [50, 50, 100, 60]]
      };
      const { items, order, warnings } = normalizeSidecarPage(page, 'western');
      expect(items.map((i) => i.kind)).toEqual(['bubble']);
      expect(order).toEqual([items[0].id]);
      expect(warnings).toContain('dropped-sequence-boxes');
    });

    it('appends bubbles the sequence never referenced', () => {
      const page = {
        panels: [[0, 0, 400, 300]],
        bubbles: [[50, 50, 100, 60], [200, 100, 80, 60]],
        sequence: [[50, 50, 100, 60]]
      };
      const { items, order, warnings } = normalizeSidecarPage(page, 'western');
      expect(items.map((i) => i.kind)).toEqual(['bubble', 'bubble']);
      expect(order).toEqual([items[0].id, items[1].id]);
      expect(warnings).toContain('appended-items');
    });
  });

  describe('normalizeSidecarPage (manga)', () => {
    it('splits the raw mixed panel set and flattens object-form sequences', () => {
      const rawPanel = [0, 0, 1680, 1200];
      const child = [100, 100, 200, 150];
      const page = {
        panels: [rawPanel, child],
        bubbles: [],
        sequence: [{ 0: 0, 1: 0, 2: 1680, 3: 1200, isPanel: true, bubbles: [child] }, child]
      };
      const { items, order, warnings } = normalizeSidecarPage(page, 'manga');
      expect(items.map((i) => i.kind)).toEqual(['panel', 'bubble']);
      expect(items[0].box).toEqual(rawPanel);
      expect(items[1].box).toEqual(child);
      expect(order).toEqual([items[0].id, items[1].id]);
      expect(warnings).toEqual([]);
    });

    it('keeps the legacy split when bubbles are not referenced by the sequence', () => {
      // Some legacy manga sidecars carry a bubbles list from a separate
      // detection pass that the sequence never references. The reader treats
      // those pages as legacy; the editor must classify them identically, and
      // keep the unreferenced bubbles as (orphan) bubble items.
      const page = {
        panels: [[0, 0, 100, 100], [10, 10, 30, 30]],
        bubbles: [[500, 500, 20, 20]],
        sequence: [[0, 0, 100, 100], [10, 10, 30, 30]]
      };
      const { items, order } = normalizeSidecarPage(page, 'manga');
      expect(items.map((i) => [i.kind, i.box])).toEqual([
        ['panel', [0, 0, 100, 100]],
        ['bubble', [10, 10, 30, 30]],
        ['bubble', [500, 500, 20, 20]]
      ]);
      expect(order).toEqual(['i0', 'i1', 'i2']);
    });

    it('handles a legacy bare-array page as all-panel items', () => {
      const page = [[0, 0, 100, 100], [200, 0, 100, 100]];
      const { items, order, warnings } = normalizeSidecarPage(page, 'western');
      expect(items.every((i) => i.kind === 'panel')).toBe(true);
      expect(order).toEqual(items.map((i) => i.id));
      expect(warnings).toContain('bare-array');
    });
  });

  describe('normalizeSidecar on real fixtures', () => {
    it('western fixture: preserves ids/counts and every item appears exactly once', () => {
      const doc = normalizeSidecar(WEST);
      expect(doc.comicId).toBe(WEST.comicId);
      expect(doc.type).toBe('western');
      expect(Object.keys(doc.pages)).toEqual(Object.keys(WEST.pages));

      for (const name of Object.keys(WEST.pages)) {
        const src = WEST.pages[name];
        const m = doc.pages[name];
        expect(m.order.length).toBe(m.items.length);
        expect(new Set(m.order)).toEqual(new Set(m.items.map((i) => i.id)));
        expect(m.items.filter((i) => i.kind === 'panel').length).toBe(src.bubbles.length > 0 ? 0 : src.panels.length);
        expect(m.items.filter((i) => i.kind === 'bubble').length).toBe(src.bubbles.length);
      }
    });

    it('manga fixture: splits every raw box into exactly one item', () => {
      const doc = normalizeSidecar(MANGA);
      expect(doc.type).toBe('manga');
      for (const name of Object.keys(MANGA.pages)) {
        const src = MANGA.pages[name];
        const m = doc.pages[name];
        expect(m.items.length).toBe(src.panels.length);
        expect(m.order.length).toBe(m.items.length);
        expect(new Set(m.order)).toEqual(new Set(m.items.map((i) => i.id)));
      }
    });
  });

  describe('regeneration', () => {
    it('regeneratePage projects items by order per type convention', () => {
      const page = {
        items: [
          { id: 'a', kind: 'bubble', box: [1, 1, 4, 4] },
          { id: 'b', kind: 'panel', box: [0, 0, 10, 10] }
        ],
        order: ['b', 'a']
      };
      expect(regeneratePage(page, 'western')).toEqual({
        panels: [[0, 0, 10, 10]],
        bubbles: [[1, 1, 4, 4]],
        sequence: [[1, 1, 4, 4]]
      });
      expect(regeneratePage(page, 'manga').sequence).toEqual([[0, 0, 10, 10], [1, 1, 4, 4]]);
    });

    it('western: worked-out pages regenerate without the scaffold panels', () => {
      const r = regenerateSidecar(normalizeSidecar(WEST));
      for (const [name, page] of Object.entries(r.pages)) {
        const src = WEST.pages[name];
        if (src.bubbles.length > 0) {
          // Reader convention: sequence = bubbles on worked-out pages, and the
          // panels were only ever ordering scaffold.
          expect(page.sequence).toEqual(page.bubbles);
          expect(page.panels).toEqual([]);
        } else {
          expect(page.sequence).toEqual(page.panels);
          expect(new Set(page.panels.map((b) => b.join(',')))).toEqual(new Set(src.panels.map((b) => b.join(','))));
        }
        expect(new Set(page.bubbles.map((b) => b.join(',')))).toEqual(new Set(src.bubbles.map((b) => b.join(','))));
      }
    });

    it('manga: emits pure arrays and a full interleaved sequence', () => {
      const r = regenerateSidecar(normalizeSidecar(MANGA));
      for (const page of Object.values(r.pages)) {
        expect(page.sequence.length).toBe(page.panels.length + page.bubbles.length);
        for (const b of [...page.panels, ...page.bubbles, ...page.sequence]) {
          expect(Array.isArray(b)).toBe(true);
        }
      }
    });

    it('is idempotent on both real fixtures (normalize -> regenerate -> normalize)', () => {
      // Item array order is not canonical across a round-trip; the invariants are the
      // display order (as kind+box sequence) and the item multiset.
      const display = (doc, name) => doc.pages[name].order.map((id) => {
        const item = doc.pages[name].items.find((x) => x.id === id);
        return { kind: item.kind, box: item.box };
      });
      const multiset = (doc, name) => doc.pages[name].items
        .map((i) => `${i.kind}:${i.box.join(',')}`)
        .sort();

      for (const fixture of [WEST, MANGA]) {
        const n1 = normalizeSidecar(fixture);
        const n2 = normalizeSidecar(regenerateSidecar(n1));
        for (const name of Object.keys(n1.pages)) {
          expect(display(n2, name)).toEqual(display(n1, name));
          expect(multiset(n2, name)).toEqual(multiset(n1, name));
        }
      }
    });
  });

  describe('free-draw points', () => {
    const TRI = [[10, 10], [90, 10], [50, 90]];

    it('normalize attaches panelPoints/bubblePoints positionally', () => {
      const panelPage = {
        panels: [[10, 10, 80, 80], [0, 0, 100, 50]],
        bubbles: [],
        sequence: [[10, 10, 80, 80], [0, 0, 100, 50]],
        panelPoints: [TRI, null]
      };
      const p = normalizeSidecarPage(panelPage, 'western');
      expect(p.items.map((i) => i.kind)).toEqual(['panel', 'panel']);
      expect(p.items[0].points).toEqual(TRI);
      expect('points' in p.items[1]).toBe(false);

      // On a bubble page only the bubbles survive; bubblePoints ride along.
      const bubblePage = {
        panels: [[0, 0, 400, 300]],
        bubbles: [[20, 20, 30, 30], [40, 40, 30, 30]],
        sequence: [[20, 20, 30, 30], [40, 40, 30, 30]],
        bubblePoints: [TRI, null]
      };
      const b = normalizeSidecarPage(bubblePage, 'western');
      expect(b.items.map((i) => i.kind)).toEqual(['bubble', 'bubble']);
      expect(b.items[0].points).toEqual(TRI);
      expect('points' in b.items[1]).toBe(false);
    });

    it('keeps positional alignment when an invalid box is dropped', () => {
      const page = {
        panels: [[10, 10, 80, 80], [1, 2, 3], [0, 200, 100, 50]],
        bubbles: [],
        sequence: [],
        panelPoints: [TRI, [[1, 1]], [[5, 5], [20, 5], [20, 20]]]
      };
      const { items } = normalizeSidecarPage(page, 'western');
      expect(items.length).toBe(2);
      expect(items[0].points).toEqual(TRI);
      expect(items[1].points).toEqual([[5, 5], [20, 5], [20, 20]]);
    });

    it('rejects malformed point entries (fewer than 3 pairs, non-numeric) and rounds the rest', () => {
      const page = {
        panels: [[0, 0, 10, 10], [0, 20, 10, 10], [0, 40, 10, 10]],
        bubbles: [],
        sequence: [],
        panelPoints: [[[1, 1], [2, 2]], [['a', 1], [2, 2], [3, 3]], [[0.4, 0.4], [9.6, 0.4], [5, 9.6]]]
      };
      const { items } = normalizeSidecarPage(page, 'western');
      expect('points' in items[0]).toBe(false);
      expect('points' in items[1]).toBe(false);
      expect(items[2].points).toEqual([[0, 0], [10, 0], [5, 10]]);
    });

    it('manga: points ride the raw mixed set (both explicit and legacy splits)', () => {
      const editorWritten = {
        panels: [[0, 0, 100, 100], [10, 10, 30, 30]],
        bubbles: [[500, 500, 20, 20]],
        sequence: [[0, 0, 100, 100], [10, 10, 30, 30], [500, 500, 20, 20]],
        panelPoints: [TRI, null],
        bubblePoints: [[[500, 500], [520, 500], [510, 520]]]
      };
      const m1 = normalizeSidecarPage(editorWritten, 'manga');
      expect(m1.items[0].points).toEqual(TRI);
      expect('points' in m1.items[1]).toBe(false);
      expect(m1.items[2].points).toEqual([[500, 500], [520, 500], [510, 520]]);

      // Legacy (heuristic) split: the child box classifies as a bubble, but its
      // points still come from its index in the raw panels array.
      const legacy = {
        panels: [[0, 0, 100, 100], [10, 10, 30, 30]],
        bubbles: [],
        sequence: [[0, 0, 100, 100], [10, 10, 30, 30]],
        panelPoints: [null, TRI]
      };
      const m2 = normalizeSidecarPage(legacy, 'manga');
      expect(m2.items.map((i) => i.kind)).toEqual(['panel', 'bubble']);
      expect(m2.items[1].points).toEqual(TRI);
    });

    it('regeneratePage emits parallel points arrays only for shaped pages', () => {
      const page = {
        items: [
          { id: 'b', kind: 'panel', box: [0, 0, 100, 100], points: [[0.4, 0.4], [99.6, 0.4], [50, 99.6]] },
          { id: 'a', kind: 'bubble', box: [10, 10, 20, 20] }
        ],
        order: ['a', 'b']
      };
      expect(regeneratePage(page, 'western')).toEqual({
        panels: [[0, 0, 100, 100]],
        bubbles: [[10, 10, 20, 20]],
        sequence: [[10, 10, 20, 20]],
        panelPoints: [[[0, 0], [100, 0], [50, 100]]]
      });
    });

    it('round-trips points through normalize -> regenerate -> normalize', () => {
      const original = {
        comicId: 'c9',
        type: 'western',
        pages: {
          'p.jpg': { panels: [[10, 10, 80, 80]], bubbles: [], sequence: [[10, 10, 80, 80]], panelPoints: [TRI] }
        }
      };
      const r = regenerateSidecar(normalizeSidecar(original));
      expect(r.pages['p.jpg'].panelPoints).toEqual([TRI]);
      const n2 = normalizeSidecar(r);
      expect(n2.pages['p.jpg'].items[0].points).toEqual(TRI);
    });
  });

  describe('mergeSidecar', () => {
    // Real-data shape where full regeneration would reorder reader-visible
    // arrays: the sequence interleaves bubbles across panels.
    const interleaved = () => ({
      panels: [[0, 0, 100, 100], [0, 100, 100, 100]],
      bubbles: [[10, 10, 20, 20], [10, 110, 20, 20], [90, 10, 10, 10]],
      sequence: [[10, 110, 20, 20], [10, 10, 20, 20], [90, 10, 10, 10]]
    });
    const spreadManga = () => ({
      panels: [[1, 2, 3, 4], [10, 10, 20, 20], [0, 0, 60, 60]],
      bubbles: [],
      sequence: [{ 0: 1, 1: 2, 2: 3, 3: 4, isPanel: true, bubbles: [] }, { 0: 0, 1: 0, 2: 60, 3: 60, isPanel: true, bubbles: [] }]
    });

    // What the editor GET -> PUT round trip looks like for an unedited file.
    const docFrom = (original) => {
      const normalized = normalizeSidecar(original);
      return { comicId: original.comicId, type: normalized.type, pages: normalized.pages };
    };

    it('keeps untouched pages verbatim (raw arrays, spread objects and all)', () => {
      const original = {
        comicId: 'c1',
        type: 'western',
        pages: { 'a.jpg': interleaved() }
      };
      const merged = mergeSidecar(docFrom(original), original);
      expect(merged.pages['a.jpg']).toEqual(original.pages['a.jpg']);
      expect(JSON.stringify(merged)).toBe(JSON.stringify(original));
    });

    it('keeps untouched manga pages raw-mixed rather than splitting them', () => {
      const original = {
        comicId: 'c2',
        type: 'manga',
        pages: { 'b.png': spreadManga() }
      };
      const merged = mergeSidecar(docFrom(original), original);
      expect(merged.pages['b.png']).toEqual(original.pages['b.png']);
      // The raw mixed panel set and the spread-object sequence survive untouched.
      expect(merged.pages['b.png'].bubbles).toEqual([]);
      expect(merged.pages['b.png'].panels.length).toBe(3);
      expect(merged.pages['b.png'].sequence[0].isPanel).toBe(true);
    });

    it('detects changes by content, not by client ids', () => {
      const original = { comicId: 'c1', type: 'western', pages: { 'a.jpg': interleaved() } };
      const doc = docFrom(original);
      // Same boxes and display order under fresh ids, as a client round trip produces.
      const page = doc.pages['a.jpg'];
      const rename = new Map(page.items.map((i, n) => [i.id, 'n' + n]));
      page.items = page.items.map((i) => ({ ...i, id: rename.get(i.id) }));
      page.order = page.order.map((id) => rename.get(id));
      const merged = mergeSidecar(doc, original);
      expect(merged.pages['a.jpg']).toEqual(original.pages['a.jpg']);
    });

    it('regenerates only the changed pages', () => {
      const original = {
        comicId: 'c1',
        type: 'western',
        pages: { 'a.jpg': interleaved(), 'b.jpg': { panels: [[0, 0, 10, 10]], bubbles: [], sequence: [[0, 0, 10, 10]] } }
      };
      const doc = docFrom(original);
      const moved = doc.pages['b.jpg'].items[0];
      moved.box = [1, 1, 10, 10];
      const merged = mergeSidecar(doc, original);

      expect(merged.pages['a.jpg']).toEqual(original.pages['a.jpg']);
      expect(merged.pages['b.jpg']).toEqual({ panels: [[1, 1, 10, 10]], bubbles: [], sequence: [[1, 1, 10, 10]] });
    });

    it('a touched western bubble page regenerates without the scaffold panels', () => {
      const original = { comicId: 'c1', type: 'western', pages: { 'a.jpg': interleaved() } };
      const doc = docFrom(original);
      const page = doc.pages['a.jpg'];
      page.order = [page.order[1], page.order[0], ...page.order.slice(2)];
      const merged = mergeSidecar(doc, original);
      expect(merged.pages['a.jpg'].panels).toEqual([]);
      expect(merged.pages['a.jpg'].bubbles.length).toBe(3);
      expect(merged.pages['a.jpg'].sequence).toEqual(merged.pages['a.jpg'].bubbles);
    });

    it('preserves original pages missing from the document and adds new pages canonically', () => {
      const original = {
        comicId: 'c1',
        type: 'western',
        pages: { 'gone.jpg': interleaved() }
      };
      const doc = {
        comicId: 'c1',
        type: 'western',
        pages: {
          'new.jpg': {
            items: [{ id: 'a', kind: 'bubble', box: [5, 5, 5, 5] }],
            order: ['a']
          }
        }
      };
      const merged = mergeSidecar(doc, original);
      expect(merged.pages['gone.jpg']).toEqual(original.pages['gone.jpg']);
      expect(merged.pages['new.jpg']).toEqual({ panels: [], bubbles: [[5, 5, 5, 5]], sequence: [[5, 5, 5, 5]] });
    });

    it('keeps untouched polygon pages verbatim (points included)', () => {
      const original = {
        comicId: 'c1',
        type: 'western',
        pages: {
          'a.jpg': { panels: [[10, 10, 80, 80]], bubbles: [], sequence: [[10, 10, 80, 80]], panelPoints: [[[10, 10], [90, 10], [50, 90]]] }
        }
      };
      const merged = mergeSidecar(docFrom(original), original);
      expect(JSON.stringify(merged)).toBe(JSON.stringify(original));
    });

    it('detects shape-only changes (same box, different points)', () => {
      const original = {
        comicId: 'c1',
        type: 'western',
        pages: {
          'a.jpg': { panels: [[10, 10, 80, 80]], bubbles: [], sequence: [[10, 10, 80, 80]], panelPoints: [[[10, 10], [90, 10], [50, 90]]] }
        }
      };
      const doc = docFrom(original);
      doc.pages['a.jpg'].items[0].points = [[10, 10], [90, 50], [10, 90]];
      const merged = mergeSidecar(doc, original);
      expect(merged.pages['a.jpg'].panelPoints).toEqual([[[10, 10], [90, 50], [10, 90]]]);
    });

    it('regenerates everything when there is no original sidecar', () => {
      const doc = {
        comicId: 'c1',
        type: 'western',
        pages: { 'a.jpg': { items: [{ id: 'a', kind: 'panel', box: [0, 0, 1, 1] }], order: ['a'] } }
      };
      expect(mergeSidecar(doc, null)).toEqual(regenerateSidecar(doc));
    });
  });

  describe('pruneWesternPanels', () => {
    const mixedPage = () => ({
      items: [
        { id: 'p0', kind: 'panel', box: [0, 0, 10, 10] },
        { id: 'b0', kind: 'bubble', box: [1, 1, 2, 2] }
      ],
      order: ['p0', 'b0']
    });

    it('drops panels (and only panels) once a western page has a bubble', () => {
      const p = mixedPage();
      const out = pruneWesternPanels(p, 'western');
      expect(out.items.map((i) => i.id)).toEqual(['b0']);
      expect(out.order).toEqual(['b0']);
      expect(p.items.length).toBe(2); // input untouched
    });

    it('returns the page unchanged for manga or bubble-less pages', () => {
      const bubbleLess = { items: [{ id: 'p0', kind: 'panel', box: [0, 0, 10, 10] }], order: ['p0'] };
      expect(pruneWesternPanels(bubbleLess, 'western')).toBe(bubbleLess);

      const manga = mixedPage();
      expect(pruneWesternPanels(manga, 'manga')).toBe(manga);

      const bubbleOnly = { items: [{ id: 'b0', kind: 'bubble', box: [1, 1, 2, 2] }], order: ['b0'] };
      expect(pruneWesternPanels(bubbleOnly, 'western')).toBe(bubbleOnly);
    });
  });

  describe('validateEditorDocument', () => {
    const baseDoc = () => ({
      comicId: 'x',
      type: 'western',
      pages: {
        'P1.jpg': {
          width: 200,
          height: 100,
          items: [
            { id: 'i0', kind: 'panel', box: [0, 0, 100, 50] },
            { id: 'i1', kind: 'bubble', box: [10, 10, 20, 10] }
          ],
          order: ['i0', 'i1']
        }
      }
    });

    it('accepts a valid document', () => {
      expect(validateEditorDocument(baseDoc())).toEqual({ errors: [], warnings: [] });
    });

    it('rejects an order that is not a permutation of item ids', () => {
      const doc = baseDoc();
      doc.pages['P1.jpg'].order = ['i0'];
      const { errors } = validateEditorDocument(doc);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join(' ')).toMatch(/order/i);
    });

    it('rejects duplicate ids and unknown kinds', () => {
      const doc = baseDoc();
      doc.pages['P1.jpg'].items.push({ id: 'i0', kind: 'panel', box: [0, 0, 5, 5] });
      expect(validateEditorDocument(doc).errors.join(' ')).toMatch(/duplicate/i);

      const doc2 = baseDoc();
      doc2.pages['P1.jpg'].items[1].kind = 'caption';
      expect(validateEditorDocument(doc2).errors.join(' ')).toMatch(/kind/i);
    });

    it('rejects non-positive sizes and non-finite numbers', () => {
      const doc = baseDoc();
      doc.pages['P1.jpg'].items[0].box = [0, 0, 0, 50];
      expect(validateEditorDocument(doc).errors.join(' ')).toMatch(/size|box/i);

      const doc2 = baseDoc();
      doc2.pages['P1.jpg'].items[0].box = [0, 0, Infinity, 50];
      expect(validateEditorDocument(doc2).errors.length).toBeGreaterThan(0);
    });

    it('validates optional polygon points structurally', () => {
      const ok = baseDoc();
      ok.pages['P1.jpg'].items[0].points = [[0, 0], [100, 0], [50, 50]];
      expect(validateEditorDocument(ok)).toEqual({ errors: [], warnings: [] });

      const bad = baseDoc();
      bad.pages['P1.jpg'].items[0].points = [[0, 0], [100, 0]];
      expect(validateEditorDocument(bad).errors.join(' ')).toMatch(/points/i);

      const bad2 = baseDoc();
      bad2.pages['P1.jpg'].items[0].points = [[0, 0], [100, 'x'], [50, 50]];
      expect(validateEditorDocument(bad2).errors.length).toBeGreaterThan(0);
    });

    it('warns (not errors) on real-world out-of-bounds boxes', () => {
      const doc = baseDoc();
      doc.pages['P1.jpg'].items[0].box = [0, -22, 100, 50];
      const { errors, warnings } = validateEditorDocument(doc);
      expect(errors).toEqual([]);
      expect(warnings.join(' ')).toMatch(/bounds|out of/i);

      const doc2 = baseDoc();
      doc2.pages['P1.jpg'].items[0].box = [0, 0, 202, 50];
      expect(validateEditorDocument(doc2).warnings.length).toBeGreaterThan(0);
    });
  });
});
