const { performance } = require('perf_hooks');

// In src/web/main.js, there is a global WeakMap for page item caching to replace `.find()` array traversals for item lookup.
const pageItemCache = new WeakMap();

function getPageItem(page, id) {
  if (!page || !page.items) return null;
  let cache = pageItemCache.get(page.items);
  if (!cache || cache.length !== page.items.length) {
    const map = new Map();
    for (let i = 0; i < page.items.length; i++) {
      const item = page.items[i];
      map.set(item.id, item);
    }
    cache = { length: page.items.length, map };
    pageItemCache.set(page.items, cache);
  }
  return cache.map.get(id) || null;
}
