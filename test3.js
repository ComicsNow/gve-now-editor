// Wait! `src/shared/sidecar.js` mutates `items.push(item)`.
// But `src/shared/sidecar.js` is the one parsing the raw document from the backend!
// It creates a new page object with a new `items` array. So the array reference is new when it arrives in store anyway.
// `pageItemCache` is a WeakMap. It keys on `page.items` (the array object).
// If `sidecar.js` does `items.push()`, it is building a brand new array. Once finished, it returns the page.
// The store then gets the page. The array reference never changes unless it goes through `store.js` mutation methods.

// What if an item is MUTATED in place?
// `updateItem(id, box, points, name)` does `item.box = [...box]`.
// It mutates the item, but NOT the array.
// Does mutating the item invalidate the cache?
// No, the cache is `Map<id, item>`. Since we mutate the `item` object properties, the reference stays the same. The caller of `getPageItem` gets the SAME object reference, and sees the mutated `.box` properties.
// So this is perfectly sound!

// The only issue is `p.items.push(item)` in `store.js:addItem`.
// Since we used `pageItemCache.get(page.items)` and a length check, `p.items.push(item)` changes length.
// The length check triggers a rebuild of the Map!
// BUT wait, why did the reviewer say "implements an unsound WeakMap cache keyed on array length"?
// Because it's keyed on the array, and validated by length.
// What if we did:
// `p.items[0] = newItem`?
// The length is the same, but the array contents changed. The cache would NOT be rebuilt!
// We know `store.js` never does this. But maybe the reviewer thinks it's fragile (unsound in principle).
// If we change `p.items.push(item)` to `p.items = [...p.items, item]`, we can REMOVE the length check entirely.
// Then the cache is perfectly sound: if the array reference is the same, the array contents are the same.
