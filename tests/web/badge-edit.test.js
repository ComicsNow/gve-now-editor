/**
 * @jest-environment jsdom
 */
const { openBadgeEditor } = require('../../src/web/editor/badge-edit');

function setup(badgeText = '3', opts = {}) {
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = badgeText;
  document.body.appendChild(badge);
  const onCommit = jest.fn();
  const input = openBadgeEditor(badge, { value: 3, max: 5, onCommit, ...opts });
  return { badge, input, onCommit };
}

const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('web/badge-edit', () => {
  it('replaces the badge content with a focused input holding the current number', () => {
    const { badge, input } = setup();
    expect(input.className).toBe('badge-input');
    expect(input.value).toBe('3');
    expect(badge.querySelector('.badge-input')).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it('commits the parsed number on Enter and restores the badge', () => {
    const { badge, input, onCommit } = setup();
    input.value = '2';
    key(input, 'Enter');
    expect(onCommit).toHaveBeenCalledWith(2);
    expect(badge.querySelector('.badge-input')).toBeNull();
    expect(badge.textContent).toBe('3');
  });

  it('clamps to [1, max]', () => {
    let s = setup('3', { max: 5 });
    s.input.value = '9';
    key(s.input, 'Enter');
    expect(s.onCommit).toHaveBeenCalledWith(5);

    s = setup('3', { max: 5 });
    s.input.value = '0';
    key(s.input, 'Enter');
    expect(s.onCommit).toHaveBeenCalledWith(1);

    s = setup('3', { max: 5 });
    s.input.value = '2.7'; // truncated, then clamped nowhere
    key(s.input, 'Enter');
    expect(s.onCommit).toHaveBeenCalledWith(2);
  });

  it('cancels on Escape without committing', () => {
    const { badge, input, onCommit } = setup();
    input.value = '1';
    key(input, 'Escape');
    expect(onCommit).not.toHaveBeenCalled();
    expect(badge.querySelector('.badge-input')).toBeNull();
    expect(badge.textContent).toBe('3');
  });

  it('cancels on blur', () => {
    const { badge, input, onCommit } = setup();
    input.value = '1';
    input.blur();
    expect(onCommit).not.toHaveBeenCalled();
    expect(badge.querySelector('.badge-input')).toBeNull();
    expect(badge.textContent).toBe('3');
  });

  it('ignores empty or non-numeric input', () => {
    let s = setup();
    s.input.value = '';
    key(s.input, 'Enter');
    expect(s.onCommit).not.toHaveBeenCalled();

    s = setup();
    s.input.value = 'abc';
    key(s.input, 'Enter');
    expect(s.onCommit).not.toHaveBeenCalled();
  });

  it('keeps keydowns local to the input (no global keymap leaks)', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    const { input } = setup();
    key(input, 'Delete');
    key(input, 'Escape');
    key(input, 'z');
    expect(seen).not.toHaveBeenCalled();
    window.removeEventListener('keydown', seen);
  });

  it('is a no-op when the badge is already being edited', () => {
    const { badge } = setup();
    expect(openBadgeEditor(badge, { value: 1, onCommit: jest.fn() })).toBeNull();
  });
});
