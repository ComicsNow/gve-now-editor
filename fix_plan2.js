// If we change:
// `p.items.push(item);`
// to:
// `p.items = [...p.items, item];`
// Then the items array becomes immutable (replaced entirely on addition/removal/load).
// Wait, is there any other place?
// `items: snap.items.map(copyItem)` creates a new array.
// `p.items = p.items.filter()` creates a new array.
// Thus, if we make `items` array immutable, we don't need a length check at all!
// The cache key is simply `page.items`. Since the array is never mutated in place (once we change push),
// if `page.items` is the same reference, the items are exactly the same!

// Let's verify this.
