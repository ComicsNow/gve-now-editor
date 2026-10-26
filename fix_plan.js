// A safer cache:
// Instead of WeakMap on `page.items` with a length check, we can just use a Symbol or a non-enumerable property on the `page` or `page.items` object to store the Map, OR we can compute it on the fly and cache it, clearing the cache when `notify()` is called or when an item is added/removed!
// Wait! We can just use `dirty` flag? No, `dirty` flag is global.
// Wait! Why cache on array length when we can just cache the Map and update it explicitly?
// In `store.js`, we control all mutations. We can just maintain a `page._itemMap` internally.
// However, `getPageItem` is exported and takes `page`.
// What if we just use a WeakMap from `page` or `page.items`, but instead of length, we check... what?
// How about we just don't cache on length. Since `store.js` manages all additions/removals, we can just maintain a `Map` inside the `page` object itself!
// BUT wait, `page` objects might come from outside (e.g. `doc = next;`).
// We could do a WeakMap on `page.items`, and check if `page.items === cache.items` is enough IF WE NEVER MUTATE THE ARRAY IN PLACE.
// Wait! `p.items.push(item);` mutates the array in place!
// If we change `p.items.push(item)` to `p.items = [...p.items, item]`, then every time the items change, the array reference changes!
// Then a simple `WeakMap` on `page.items` would be 100% sound because the array reference is immutable!
// Let's check where `items` is mutated in place.
