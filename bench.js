const { performance } = require('perf_hooks');

const n = 5000;
const page = { items: [] };
for (let i = 0; i < n; i++) {
    page.items.push({ id: `n${i}`, box: [0, 0, 10, 10] });
}

let start = performance.now();
for (let i = 0; i < n; i++) {
    page.items.find(item => item.id === `n${4999}`);
}
const baselineMs = performance.now() - start;
console.log('baseline:', baselineMs, 'ms');

const pageItemCache = new WeakMap();
function getPageItem(page, id) {
  if (!page || !page.items) return null;
  let cache = pageItemCache.get(page.items);
  if (!cache || cache.length !== page.items.length) {
    const map = new Map();
    for (const item of page.items) {
      map.set(item.id, item);
    }
    cache = { length: page.items.length, map };
    pageItemCache.set(page.items, cache);
  }
  return cache.map.get(id) || null;
}

start = performance.now();
for (let i = 0; i < n; i++) {
    getPageItem(page, `n${4999}`);
}
const optimizedMs = performance.now() - start;
console.log('optimized:', optimizedMs, 'ms');
console.log(`Improvement: ${(baselineMs / optimizedMs).toFixed(2)}x faster`);
