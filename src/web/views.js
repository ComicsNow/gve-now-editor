'use strict';

function createViewRouter(views, navButtons) {
  function showView(name) {
    for (const [key, element] of Object.entries(views)) {
      if (element) element.hidden = key !== name;
    }
    for (const [key, btn] of Object.entries(navButtons)) {
      if (btn) btn.classList.toggle('active', key === name);
    }
  }
  return { showView };
}

function createToast(toastEl, duration = 6000) {
  let timer = null;
  return function toast(message, kind = 'info') {
    toastEl.textContent = message;
    toastEl.className = `toast toast-${kind}`;
    toastEl.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      toastEl.hidden = true;
    }, duration);
  };
}

module.exports = { createViewRouter, createToast };
