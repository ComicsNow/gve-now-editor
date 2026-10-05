'use strict';

// Library browser: search comics-now's library and open one in the editor.

const PAGE_SIZE = 50;

function createLibraryView(el, { api, onOpen, onExport }) {
  el.textContent = '';
  let page = 0;
  let total = 0;

  const form = document.createElement('form');
  form.className = 'library-search';
  const input = document.createElement('input');
  input.className = 'search-input';
  input.type = 'search';
  input.placeholder = 'Search series or file name…';
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Search';
  form.append(input, button);

  // The editor works on existing guided data, so the default list is the set
  // the reader steps (guidedViewStatus = completed). Unticking shows everything.
  const filterLabel = document.createElement('label');
  filterLabel.className = 'library-filter';
  const onlyGuided = document.createElement('input');
  onlyGuided.type = 'checkbox';
  onlyGuided.className = 'library-only-guided';
  onlyGuided.checked = true;
  const filterText = document.createElement('span');
  filterText.textContent = 'Only comics with guided view';
  filterLabel.append(onlyGuided, filterText);

  const status = document.createElement('div');
  status.className = 'library-status';

  const list = document.createElement('div');
  list.className = 'comic-list';

  const pager = document.createElement('div');
  pager.className = 'pager';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'pager-prev';
  prevBtn.textContent = '← Prev';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'pager-next';
  nextBtn.textContent = 'Next →';
  const pageInfo = document.createElement('span');
  pageInfo.className = 'pager-info';
  pager.append(prevBtn, pageInfo, nextBtn);

  el.append(form, filterLabel, status, list, pager);

  function renderList(comics) {
    list.textContent = '';
    for (const comic of comics) {
      const row = document.createElement('div');
      row.className = 'comic-row';
      row.dataset.id = comic.id;

      const title = document.createElement('div');
      title.className = 'comic-title';
      title.textContent = comic.series ? `${comic.series} — ${comic.name}` : comic.name;

      const statusChip = document.createElement('span');
      const state = comic.guidedViewStatus || 'unknown';
      statusChip.className = `chip status status-${state}`;
      statusChip.textContent = state;

      row.append(title, statusChip);
      if (comic.mangaMode) {
        const manga = document.createElement('span');
        manga.className = 'chip chip-manga';
        manga.textContent = 'manga';
        row.appendChild(manga);
      }

      const open = document.createElement('button');
      open.className = 'open';
      open.type = 'button';
      open.textContent = 'Edit';
      open.addEventListener('click', () => onOpen(comic.id));

      const exportBtn = document.createElement('button');
      exportBtn.className = 'export';
      exportBtn.type = 'button';
      exportBtn.textContent = 'Export';
      exportBtn.disabled = !comic.guidedViewPath;
      exportBtn.addEventListener('click', () => onExport(comic.id));

      row.append(open, exportBtn);
      list.appendChild(row);
    }
  }

  function renderPager() {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    prevBtn.disabled = page <= 0;
    nextBtn.disabled = page >= pages - 1;
    pageInfo.textContent = `Page ${page + 1} of ${pages}`;
  }

  async function refresh() {
    status.textContent = 'Searching…';
    try {
      const data = await api.listComics({
        q: input.value.trim(),
        status: onlyGuided.checked ? 'completed' : '',
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      });
      const comics = data.comics || [];
      total = typeof data.total === 'number' ? data.total : comics.length;
      renderList(comics);
      renderPager();
      status.textContent = `${total} comic(s)`;
    } catch (err) {
      status.textContent = `Search failed: ${err.message}`;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    page = 0;
    refresh();
  });

  onlyGuided.addEventListener('change', () => {
    page = 0;
    refresh();
  });

  prevBtn.addEventListener('click', () => {
    if (page > 0) {
      page -= 1;
      refresh();
    }
  });

  nextBtn.addEventListener('click', () => {
    page += 1;
    refresh();
  });

  refresh();

  return { refresh, input };
}

module.exports = { createLibraryView };
