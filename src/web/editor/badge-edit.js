'use strict';

// Inline "type a new number" editor for badges (order-panel rows and on-page
// boxes). It swaps the badge's content for a small input: Enter commits the
// clamped 1-based position and returns the badge to plain text, Escape and
// blur cancel. Key and pointer events stay local to the input so the host
// row/box keeps its own click, drag and keymap behavior.
function openBadgeEditor(badgeEl, { value, max = Infinity, onCommit } = {}) {
  if (badgeEl.querySelector('.badge-input')) return null;

  const input = document.createElement('input');
  input.className = 'badge-input';
  input.type = 'text';
  input.inputMode = 'numeric';
  input.value = String(value);
  badgeEl.textContent = '';
  badgeEl.appendChild(input);

  let done = false;
  const restore = () => {
    badgeEl.textContent = String(value);
  };
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit) {
      const raw = input.value.trim();
      const n = raw === '' ? NaN : Math.trunc(Number(raw));
      if (Number.isFinite(n)) {
        restore();
        onCommit(Math.max(1, Math.min(n, max)));
        return;
      }
    }
    restore();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('blur', () => finish(false));
  input.focus();
  input.select();
  return input;
}

module.exports = { openBadgeEditor };
