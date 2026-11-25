/**
 * @jest-environment jsdom
 */
'use strict';

const { createViewRouter, createToast } = require('../../src/web/views');

describe('web/views', () => {
  it('switches views and updates nav buttons', () => {
    const views = {
      lib: document.createElement('div'),
      edit: document.createElement('div')
    };
    const nav = {
      lib: document.createElement('button'),
      edit: document.createElement('button')
    };
    const router = createViewRouter(views, nav);

    router.showView('edit');
    expect(views.lib.hidden).toBe(true);
    expect(views.edit.hidden).toBe(false);
    expect(nav.edit.classList.contains('active')).toBe(true);
    expect(nav.lib.classList.contains('active')).toBe(false);
  });

  it('displays and auto-hides toast messages', () => {
    jest.useFakeTimers();
    const el = document.createElement('div');
    const toast = createToast(el, 1000);

    toast('Saved successfully', 'info');
    expect(el.textContent).toBe('Saved successfully');
    expect(el.className).toBe('toast toast-info');
    expect(el.hidden).toBe(false);

    jest.advanceTimersByTime(1000);
    expect(el.hidden).toBe(true);
    jest.useRealTimers();
  });
});
