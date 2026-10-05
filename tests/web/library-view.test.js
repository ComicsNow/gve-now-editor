/**
 * @jest-environment jsdom
 */
const { createLibraryView } = require('../../src/web/library-view');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function comics() {
  return [
    { id: 'a', series: 'Alpha', name: 'Alpha 01.cbz', guidedViewStatus: 'completed', guidedViewPath: '/g/a.json', mangaMode: false },
    { id: 'b', series: null, name: 'Bee.cbz', guidedViewStatus: 'pending', guidedViewPath: null, mangaMode: true }
  ];
}

describe('web/library-view', () => {
  it('lists comics with status chips and wires open/export', async () => {
    const el = document.createElement('div');
    const api = { listComics: jest.fn(async () => ({ comics: comics() })) };
    const onOpen = jest.fn();
    const onExport = jest.fn();
    createLibraryView(el, { api, onOpen, onExport });
    await flush();

    const rows = el.querySelectorAll('.comic-row');
    expect(rows).toHaveLength(2);
    expect(el.textContent).toContain('Alpha 01.cbz');
    expect(rows[0].querySelector('.status').textContent).toBe('completed');
    expect(rows[0].querySelector('.status').classList.contains('status-completed')).toBe(true);
    expect(rows[1].querySelector('.chip-manga')).toBeTruthy();

    rows[0].querySelector('.open').click();
    expect(onOpen).toHaveBeenCalledWith('a');
    rows[0].querySelector('.export').click();
    expect(onExport).toHaveBeenCalledWith('a');
    expect(rows[1].querySelector('.export').disabled).toBe(true);
  });

  it('re-queries on search submit', async () => {
    const el = document.createElement('div');
    const api = { listComics: jest.fn(async () => ({ comics: comics() })) };
    createLibraryView(el, { api, onOpen: jest.fn(), onExport: jest.fn() });
    await flush();

    el.querySelector('.search-input').value = 'alp';
    el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(api.listComics).toHaveBeenLastCalledWith({ q: 'alp', status: 'completed', limit: 50, offset: 0 });
    expect(el.querySelectorAll('.comic-row')).toHaveLength(2);
  });

  it('defaults to comics with a guided view and re-queries when the filter is toggled off', async () => {
    const el = document.createElement('div');
    const api = { listComics: jest.fn(async () => ({ comics: comics() })) };
    createLibraryView(el, { api, onOpen: jest.fn(), onExport: jest.fn() });
    await flush();
    expect(api.listComics).toHaveBeenLastCalledWith({ q: '', status: 'completed', limit: 50, offset: 0 });

    const toggle = el.querySelector('.library-only-guided');
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(api.listComics).toHaveBeenLastCalledWith({ q: '', status: '', limit: 50, offset: 0 });
  });

  it('shows a status message when the search fails', async () => {
    const el = document.createElement('div');
    const api = { listComics: jest.fn(async () => { throw new Error('boom'); }) };
    createLibraryView(el, { api, onOpen: jest.fn(), onExport: jest.fn() });
    await flush();
    expect(el.querySelector('.library-status').textContent).toContain('boom');
  });

  it('pages through the total with prev/next and renders pager state', async () => {
    const el = document.createElement('div');
    const api = {
      listComics: jest.fn(async () => ({ comics: comics(), total: 120 }))
    };
    createLibraryView(el, { api, onOpen: jest.fn(), onExport: jest.fn() });
    await flush();

    expect(api.listComics).toHaveBeenLastCalledWith({ q: '', status: 'completed', limit: 50, offset: 0 });
    expect(el.querySelector('.pager-info').textContent).toBe('Page 1 of 3');
    expect(el.querySelector('.pager-prev').disabled).toBe(true);
    expect(el.querySelector('.pager-next').disabled).toBe(false);
    expect(el.querySelector('.library-status').textContent).toBe('120 comic(s)');

    el.querySelector('.pager-next').click();
    await flush();
    expect(api.listComics).toHaveBeenLastCalledWith({ q: '', status: 'completed', limit: 50, offset: 50 });
    expect(el.querySelector('.pager-info').textContent).toBe('Page 2 of 3');
    expect(el.querySelector('.pager-prev').disabled).toBe(false);

    el.querySelector('.pager-prev').click();
    await flush();
    expect(api.listComics).toHaveBeenLastCalledWith({ q: '', status: 'completed', limit: 50, offset: 0 });

    // next is disabled on the last page
    el.querySelector('.pager-next').click();
    el.querySelector('.pager-next').click();
    await flush();
    expect(el.querySelector('.pager-info').textContent).toBe('Page 3 of 3');
    expect(el.querySelector('.pager-next').disabled).toBe(true);
  });

  it('resets to the first page on search submit', async () => {
    const el = document.createElement('div');
    const api = { listComics: jest.fn(async () => ({ comics: comics(), total: 120 })) };
    createLibraryView(el, { api, onOpen: jest.fn(), onExport: jest.fn() });
    await flush();

    el.querySelector('.pager-next').click();
    await flush();
    expect(api.listComics).toHaveBeenLastCalledWith({ q: '', status: 'completed', limit: 50, offset: 50 });

    el.querySelector('.search-input').value = 'alp';
    el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(api.listComics).toHaveBeenLastCalledWith({ q: 'alp', status: 'completed', limit: 50, offset: 0 });
  });
});
