/**
 * @jest-environment jsdom
 */
'use strict';

const { renderPageList } = require('../../src/web/editor/page-list');

describe('web/editor/page-list', () => {
  it('renders page buttons and triggers onSelectPage on click', () => {
    const el = document.createElement('div');
    const onSelect = jest.fn();
    const getPage = (name) => ({ items: name === 'p1.jpg' ? [1, 2] : [] });

    renderPageList(el, {
      pageNames: ['p1.jpg', 'p2.jpg'],
      currentPage: 'p1.jpg',
      getPage,
      onSelectPage: onSelect
    });

    const buttons = el.querySelectorAll('.page-btn');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].classList.contains('current')).toBe(true);
    expect(buttons[0].textContent).toContain('p1.jpg (2)');
    expect(buttons[1].textContent).toContain('p2.jpg (0)');

    buttons[1].click();
    expect(onSelect).toHaveBeenCalledWith('p2.jpg');
  });
});
