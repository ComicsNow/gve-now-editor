'use strict';

function renderPageList(container, { pageNames = [], currentPage, getPage, onSelectPage } = {}) {
  container.textContent = '';
  const head = document.createElement('div');
  head.className = 'pane-head';
  head.textContent = `Pages (${pageNames.length})`;
  container.appendChild(head);

  pageNames.forEach((name, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn' + (name === currentPage ? ' current' : '');
    const p = getPage ? getPage(name) : null;
    const count = p && p.items ? p.items.length : 0;
    btn.textContent = `${index + 1}. ${name} (${count})`;
    btn.addEventListener('click', () => {
      if (onSelectPage) onSelectPage(name);
    });
    container.appendChild(btn);
  });
}

module.exports = { renderPageList };
