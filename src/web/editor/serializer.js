'use strict';

// Serialize editor document pages into canonical format for the API.
function serializeEditorPages(pages) {
  const out = {};
  for (const [name, page] of Object.entries(pages || {})) {
    out[name] = {
      width: page.width,
      height: page.height,
      items: (page.items || []).map((i) => {
        const itemOut = { id: i.id, kind: i.kind, box: i.box.map(Math.round) };
        if (i.points) itemOut.points = i.points.map(([x, y]) => [Math.round(x), Math.round(y)]);
        return itemOut;
      }),
      order: [...(page.order || [])]
    };
  }
  return out;
}

module.exports = { serializeEditorPages };
