"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/web/api.js
  var require_api = __commonJS({
    "src/web/api.js"(exports, module) {
      "use strict";
      async function request(url, options) {
        const res = await fetch(url, options);
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (!res.ok) {
          const message = data && (data.errors ? data.errors.join("; ") : data.error) || `HTTP ${res.status}`;
          const err = new Error(message);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      }
      var jsonPost = (url, body) => request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      var jsonPut = (url, body) => request(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      var api2 = {
        health: () => request("/api/health"),
        listComics: ({ q = "", status = "", limit = 100, offset = 0 } = {}) => request(
          `/api/comics?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`
        ),
        getComic: (id) => request(`/api/comics/${id}`),
        pages: (id) => request(`/api/comics/${id}/pages`),
        pageImageUrl: (id, page) => `/api/comics/${id}/page-image?page=${encodeURIComponent(page)}`,
        guided: (id) => request(`/api/comics/${id}/guided`),
        saveGuided: (id, doc) => jsonPut(`/api/comics/${id}/guided`, doc),
        resetGuided: (id) => jsonPost(`/api/comics/${id}/guided/reset`, {}),
        exportUrl: (id) => `/api/comics/${id}/export`,
        getSettings: () => request("/api/settings"),
        saveSettings: (body) => jsonPut("/api/settings", body),
        scoreImport: (file) => jsonPost("/api/import/score", { file }),
        scoreAgainst: (file, comicId) => jsonPost("/api/import/score-against", { file, comicId }),
        applyImport: (file, comicId, mode) => jsonPost("/api/import/apply", { file, comicId, mode })
      };
      module.exports = { api: api2 };
    }
  });

  // src/web/editor/store.js
  var require_store = __commonJS({
    "src/web/editor/store.js"(exports, module) {
      "use strict";
      function copyPoints(points) {
        return points.map(([x, y]) => [x, y]);
      }
      function copyItem(item) {
        const copy = { ...item, box: [...item.box] };
        if (item.points) copy.points = copyPoints(item.points);
        return copy;
      }
      function createStore2() {
        let doc = { comicId: null, type: "western", pages: {} };
        let currentPage = null;
        let dirty = false;
        let idCounter = 0;
        const listeners = /* @__PURE__ */ new Set();
        function notify() {
          for (const fn of [...listeners]) fn();
        }
        function page(name = currentPage) {
          return name != null ? doc.pages[name] || null : null;
        }
        function requirePage(name = currentPage) {
          const p = page(name);
          if (!p) throw new Error(`unknown page: ${name}`);
          return p;
        }
        function moveItem(id, toIndex, name = currentPage) {
          const p = requirePage(name);
          const from = p.order.indexOf(id);
          if (from < 0) return false;
          const next = p.order.slice();
          next.splice(from, 1);
          const idx = Math.max(0, Math.min(toIndex, next.length));
          next.splice(idx, 0, id);
          p.order = next;
          dirty = true;
          notify();
          return true;
        }
        return {
          getDoc: () => doc,
          getComicId: () => doc.comicId,
          getType: () => doc.type,
          getPages: () => Object.keys(doc.pages),
          getCurrentPage: () => currentPage,
          getPage: (name = currentPage) => page(name),
          isDirty: () => dirty,
          onChange(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
          },
          load(next) {
            doc = next;
            const names = Object.keys(doc.pages);
            currentPage = names.length ? names[0] : null;
            idCounter = 0;
            dirty = false;
            notify();
          },
          setCurrentPage(name) {
            if (!doc.pages[name]) throw new Error(`unknown page: ${name}`);
            currentPage = name;
            notify();
          },
          // Insert a new item; atIndex < 0 appends to the order. `points` (free-draw
          // vertices) is stored only when given, keeping rect-only saves minimal.
          addItem(kind, box, atIndex = -1, points) {
            const p = requirePage();
            const id = `n${++idCounter}`;
            const item = { id, kind, box: [...box] };
            if (points) item.points = copyPoints(points);
            p.items.push(item);
            const idx = atIndex < 0 || atIndex > p.order.length ? p.order.length : atIndex;
            p.order.splice(idx, 0, id);
            dirty = true;
            notify();
            return id;
          },
          // `points`: undefined keeps the item's shape, an array replaces it, null
          // clears it (back to a plain rect).
          updateItem(id, box, points, name = currentPage) {
            const p = requirePage(name);
            const item = p.items.find((i) => i.id === id);
            if (!item) return false;
            item.box = [...box];
            if (points === null) delete item.points;
            else if (points !== void 0) item.points = copyPoints(points);
            dirty = true;
            notify();
            return true;
          },
          removeItems(ids, name = currentPage) {
            const p = requirePage(name);
            const kill = new Set(ids);
            const before = p.items.length;
            p.items = p.items.filter((i) => !kill.has(i.id));
            p.order = p.order.filter((id) => !kill.has(id));
            const removed = before - p.items.length;
            if (removed) {
              dirty = true;
              notify();
            }
            return removed;
          },
          moveItem,
          moveItemBy(id, delta, name = currentPage) {
            const p = requirePage(name);
            const from = p.order.indexOf(id);
            if (from < 0) return false;
            return moveItem(id, from + delta, name);
          },
          // Replace the whole order; must be a permutation of the current items.
          setOrder(order, name = currentPage) {
            const p = requirePage(name);
            const ids = new Set(p.items.map((i) => i.id));
            const seen = /* @__PURE__ */ new Set();
            for (const id of order) {
              if (!ids.has(id) || seen.has(id)) return false;
              seen.add(id);
            }
            if (seen.size !== ids.size) return false;
            p.order = [...order];
            dirty = true;
            notify();
            return true;
          },
          // Deep copy of the current page (for the undo stack).
          snapshot(name = currentPage) {
            const p = requirePage(name);
            return {
              page: name,
              width: p.width,
              height: p.height,
              items: p.items.map(copyItem),
              order: [...p.order]
            };
          },
          restore(snap) {
            doc.pages[snap.page] = {
              width: snap.width,
              height: snap.height,
              items: snap.items.map(copyItem),
              order: [...snap.order]
            };
            if (!doc.pages[currentPage]) currentPage = snap.page;
            dirty = true;
            notify();
          },
          markSaved() {
            dirty = false;
            notify();
          }
        };
      }
      module.exports = { createStore: createStore2 };
    }
  });

  // src/web/editor/undo.js
  var require_undo = __commonJS({
    "src/web/editor/undo.js"(exports, module) {
      "use strict";
      function createUndoStack2({ limit = 50 } = {}) {
        const undoStack = [];
        const redoStack = [];
        return {
          push(snapshot) {
            undoStack.push(snapshot);
            if (undoStack.length > limit) undoStack.shift();
            redoStack.length = 0;
          },
          undo(current) {
            if (!undoStack.length) return null;
            redoStack.push(current);
            return undoStack.pop();
          },
          redo(current) {
            if (!redoStack.length) return null;
            undoStack.push(current);
            return redoStack.pop();
          },
          canUndo() {
            return undoStack.length > 0;
          },
          canRedo() {
            return redoStack.length > 0;
          },
          clear() {
            undoStack.length = 0;
            redoStack.length = 0;
          }
        };
      }
      module.exports = { createUndoStack: createUndoStack2 };
    }
  });

  // src/web/editor/badge-edit.js
  var require_badge_edit = __commonJS({
    "src/web/editor/badge-edit.js"(exports, module) {
      "use strict";
      function openBadgeEditor(badgeEl, { value, max = Infinity, onCommit } = {}) {
        if (badgeEl.querySelector(".badge-input")) return null;
        const input = document.createElement("input");
        input.className = "badge-input";
        input.type = "text";
        input.inputMode = "numeric";
        input.value = String(value);
        badgeEl.textContent = "";
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
            const n = raw === "" ? NaN : Math.trunc(Number(raw));
            if (Number.isFinite(n)) {
              restore();
              onCommit(Math.max(1, Math.min(n, max)));
              return;
            }
          }
          restore();
        };
        input.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") finish(true);
          else if (e.key === "Escape") finish(false);
        });
        input.addEventListener("pointerdown", (e) => e.stopPropagation());
        input.addEventListener("click", (e) => e.stopPropagation());
        input.addEventListener("blur", () => finish(false));
        input.focus();
        input.select();
        return input;
      }
      module.exports = { openBadgeEditor };
    }
  });

  // src/web/editor/overlay.js
  var require_overlay = __commonJS({
    "src/web/editor/overlay.js"(exports, module) {
      "use strict";
      var { openBadgeEditor } = require_badge_edit();
      var HANDLE_DIRS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
      var SVG_NS = "http://www.w3.org/2000/svg";
      function appendShape(div, item) {
        div.classList.add("has-shape");
        const [x, y, w, h] = item.box;
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "shape-svg");
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute("class", `shape shape-${item.kind}`);
        poly.setAttribute("points", item.points.map(([px, py]) => `${px - x},${py - y}`).join(" "));
        svg.appendChild(poly);
        div.appendChild(svg);
      }
      function renderOverlay(layer, { page, order, selected = /* @__PURE__ */ new Set(), onSelect, onEditNumber } = {}) {
        layer.textContent = "";
        const items = page && page.items ? page.items : [];
        const itemsById = new Map(items.map((i) => [i.id, i]));
        const ids = order || items.map((i) => i.id);
        ids.forEach((id, index) => {
          const item = itemsById.get(id);
          if (!item) return;
          const div = document.createElement("div");
          div.className = `box box-${item.kind}`;
          div.dataset.id = id;
          if (selected.has(id)) div.classList.add("selected");
          div.style.left = `${item.box[0]}px`;
          div.style.top = `${item.box[1]}px`;
          div.style.width = `${item.box[2]}px`;
          div.style.height = `${item.box[3]}px`;
          div.title = `${item.kind} ${item.box.join(", ")}`;
          if (item.points && item.points.length >= 3) appendShape(div, item);
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = String(index + 1);
          if (onEditNumber) {
            badge.title = "Click to set position";
            badge.addEventListener("pointerdown", (e) => e.stopPropagation());
            badge.addEventListener("click", (e) => {
              e.stopPropagation();
              openBadgeEditor(badge, { value: index + 1, max: ids.length, onCommit: (n) => onEditNumber(id, n) });
            });
          }
          div.appendChild(badge);
          if (selected.has(id)) {
            for (const dir of HANDLE_DIRS) {
              const handle = document.createElement("div");
              handle.className = `handle handle-${dir}`;
              handle.dataset.handle = dir;
              div.appendChild(handle);
            }
          }
          div.addEventListener("click", (e) => {
            e.stopPropagation();
            if (onSelect) onSelect(id, { additive: !!e.shiftKey });
          });
          layer.appendChild(div);
        });
      }
      module.exports = { renderOverlay, HANDLE_DIRS };
    }
  });

  // src/web/editor/interact.js
  var require_interact = __commonJS({
    "src/web/editor/interact.js"(exports, module) {
      "use strict";
      var MIN_BOX_SIZE = 4;
      function pointerToNative(clientX, clientY, rect, pageWidth, pageHeight) {
        const sx = rect.width > 0 ? rect.width / pageWidth : 1;
        const sy = rect.height > 0 ? rect.height / pageHeight : 1;
        return { x: (clientX - rect.left) / sx, y: (clientY - rect.top) / sy };
      }
      function boxFromPoints(x1, y1, x2, y2) {
        return [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
      }
      function resizeBox(box, handle, dx, dy, page) {
        let [x, y, w, h] = box;
        const right = x + w;
        const bottom = y + h;
        const maxW = page && Number.isFinite(page.width) ? page.width : Infinity;
        const maxH = page && Number.isFinite(page.height) ? page.height : Infinity;
        if (handle.includes("e")) {
          const newRight = Math.min(right + dx, maxW);
          w = Math.max(MIN_BOX_SIZE, newRight - x);
        }
        if (handle.includes("w")) {
          const newX = Math.max(0, Math.min(x + dx, right - MIN_BOX_SIZE));
          w = right - newX;
          x = newX;
        }
        if (handle.includes("s")) {
          const newBottom = Math.min(bottom + dy, maxH);
          h = Math.max(MIN_BOX_SIZE, newBottom - y);
        }
        if (handle.includes("n")) {
          const newY = Math.max(0, Math.min(y + dy, bottom - MIN_BOX_SIZE));
          h = bottom - newY;
          y = newY;
        }
        return [x, y, w, h];
      }
      function translateBox2(box, dx, dy, page, { clamp = true } = {}) {
        let [x, y, w, h] = box;
        x += dx;
        y += dy;
        if (clamp && page) {
          const maxX = Number.isFinite(page.width) ? Math.max(0, page.width - w) : Infinity;
          const maxY = Number.isFinite(page.height) ? Math.max(0, page.height - h) : Infinity;
          x = Math.max(0, Math.min(x, maxX));
          y = Math.max(0, Math.min(y, maxY));
        }
        return [x, y, w, h];
      }
      function polygonBox(points) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [x, y] of points) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
        return [minX, minY, maxX - minX, maxY - minY];
      }
      function remapPoints2(points, oldBox, newBox) {
        const sx = oldBox[2] > 0 ? newBox[2] / oldBox[2] : 1;
        const sy = oldBox[3] > 0 ? newBox[3] / oldBox[3] : 1;
        return points.map(([px, py]) => [newBox[0] + (px - oldBox[0]) * sx, newBox[1] + (py - oldBox[1]) * sy]);
      }
      module.exports = { MIN_BOX_SIZE, pointerToNative, boxFromPoints, resizeBox, translateBox: translateBox2, polygonBox, remapPoints: remapPoints2 };
    }
  });

  // src/web/editor/view-math.js
  var require_view_math = __commonJS({
    "src/web/editor/view-math.js"(exports, module) {
      "use strict";
      var MIN_ZOOM = 0.1;
      var MAX_ZOOM = 8;
      function clampZoom(scale) {
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
      }
      function fitWidthScale2(viewportWidth, pageWidth) {
        if (!(viewportWidth > 0) || !(pageWidth > 0)) return 1;
        return viewportWidth / pageWidth;
      }
      function zoomAt(view, pointerX, pointerY, factor) {
        const scale = clampZoom(view.scale * factor);
        const nativeX = (pointerX - view.offsetX) / view.scale;
        const nativeY = (pointerY - view.offsetY) / view.scale;
        return {
          scale,
          offsetX: pointerX - nativeX * scale,
          offsetY: pointerY - nativeY * scale
        };
      }
      function containScale(viewportWidth, viewportHeight, pageWidth, pageHeight) {
        if (!(viewportWidth > 0) || !(viewportHeight > 0) || !(pageWidth > 0) || !(pageHeight > 0)) return MIN_ZOOM;
        return Math.min(viewportWidth / pageWidth, viewportHeight / pageHeight);
      }
      function resolveView(view, viewportWidth, viewportHeight, pageWidth, pageHeight) {
        if (!(viewportWidth > 0) || !(viewportHeight > 0) || !(pageWidth > 0) || !(pageHeight > 0) || !(view.scale > 0)) {
          return { ...view };
        }
        const scale = Math.min(MAX_ZOOM, Math.max(containScale(viewportWidth, viewportHeight, pageWidth, pageHeight), view.scale));
        let offsetX = view.offsetX;
        let offsetY = view.offsetY;
        if (scale !== view.scale) {
          const cx = viewportWidth / 2;
          const cy = viewportHeight / 2;
          const nativeX = (cx - offsetX) / view.scale;
          const nativeY = (cy - offsetY) / view.scale;
          offsetX = cx - nativeX * scale;
          offsetY = cy - nativeY * scale;
        }
        const scaledW = pageWidth * scale;
        const scaledH = pageHeight * scale;
        offsetX = scaledW <= viewportWidth ? (viewportWidth - scaledW) / 2 : Math.min(0, Math.max(viewportWidth - scaledW, offsetX));
        offsetY = scaledH <= viewportHeight ? (viewportHeight - scaledH) / 2 : Math.min(0, Math.max(viewportHeight - scaledH, offsetY));
        return { scale, offsetX, offsetY };
      }
      module.exports = { MIN_ZOOM, MAX_ZOOM, clampZoom, fitWidthScale: fitWidthScale2, zoomAt, containScale, resolveView };
    }
  });

  // src/web/editor/stage.js
  var require_stage = __commonJS({
    "src/web/editor/stage.js"(exports, module) {
      "use strict";
      var { renderOverlay } = require_overlay();
      var { pointerToNative, boxFromPoints, resizeBox, translateBox: translateBox2, polygonBox, MIN_BOX_SIZE } = require_interact();
      var { zoomAt, resolveView } = require_view_math();
      var ZOOM_SENSITIVITY = 1.0015;
      var PAN_CLICK_SLOP = 3;
      var FREE_CLOSE_RADIUS = 10;
      var SVG_NS = "http://www.w3.org/2000/svg";
      function createStage2(container, handlers = {}) {
        let page = { width: 0, height: 0, type: "western", items: [], order: [] };
        let view = { scale: 1, offsetX: 0, offsetY: 0 };
        let mode = "select";
        let selected = /* @__PURE__ */ new Set();
        let drag = null;
        let freeDraft = null;
        const viewport = document.createElement("div");
        viewport.className = "stage-viewport";
        const stageEl = document.createElement("div");
        stageEl.className = "stage";
        const img = document.createElement("img");
        img.className = "stage-img";
        img.draggable = false;
        const layer = document.createElement("div");
        layer.className = "stage-overlay";
        const freeLayer = document.createElementNS(SVG_NS, "svg");
        freeLayer.setAttribute("class", "free-layer");
        stageEl.appendChild(img);
        stageEl.appendChild(layer);
        stageEl.appendChild(freeLayer);
        viewport.appendChild(stageEl);
        container.appendChild(viewport);
        function applyView() {
          stageEl.style.transform = `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`;
          if (view.scale > 0) stageEl.style.setProperty("--invpx", `${1 / view.scale}px`);
        }
        function setViewInternal(next) {
          view = resolveView(next, viewport.clientWidth, viewport.clientHeight, page.width, page.height);
          applyView();
        }
        function render() {
          renderOverlay(layer, {
            page,
            order: page.order,
            selected,
            onSelect: (id, opts) => {
              if (mode === "select" && handlers.onSelect) handlers.onSelect(id, opts);
            },
            // Number editing is a select-mode affordance; while drawing, badges stay inert.
            onEditNumber: mode === "select" ? handlers.onEditNumber : void 0
          });
        }
        function getNative(clientX, clientY) {
          return pointerToNative(clientX, clientY, stageEl.getBoundingClientRect(), page.width, page.height);
        }
        function clampFree(p) {
          return [Math.max(0, Math.min(p.x, page.width)), Math.max(0, Math.min(p.y, page.height))];
        }
        function renderFreeDraft() {
          freeLayer.textContent = "";
          if (!freeDraft) return;
          const pts = freeDraft.points;
          if (pts.length >= 2) {
            const line = document.createElementNS(SVG_NS, "polyline");
            line.setAttribute("class", "free-line");
            const chain = pts.map(([x, y]) => `${x},${y}`);
            chain.push(`${freeDraft.cursor[0]},${freeDraft.cursor[1]}`);
            line.setAttribute("points", chain.join(" "));
            freeLayer.appendChild(line);
          }
          pts.forEach(([x, y], i) => {
            const dot = document.createElementNS(SVG_NS, "circle");
            dot.setAttribute("class", i === 0 ? "free-vertex free-vertex-start" : "free-vertex");
            dot.setAttribute("cx", x);
            dot.setAttribute("cy", y);
            freeLayer.appendChild(dot);
          });
        }
        function freePointerDown(start) {
          const p = clampFree(start);
          if (!freeDraft) {
            freeDraft = { kind: mode === "panel-free" ? "panel" : "bubble", points: [p], cursor: p };
            renderFreeDraft();
            return;
          }
          const [fx, fy] = freeDraft.points[0];
          if (freeDraft.points.length >= 3 && Math.hypot(p[0] - fx, p[1] - fy) * view.scale <= FREE_CLOSE_RADIUS) {
            closeFreeDraw();
            return;
          }
          freeDraft.points.push(p);
          freeDraft.cursor = p;
          renderFreeDraft();
        }
        function cancelFreeDraw() {
          if (!freeDraft) return;
          freeDraft = null;
          renderFreeDraft();
        }
        function closeFreeDraw() {
          if (!freeDraft || freeDraft.points.length < 3) return false;
          const kind = freeDraft.kind;
          const points = freeDraft.points.map(([x, y]) => [Math.round(x), Math.round(y)]);
          const box = polygonBox(points);
          cancelFreeDraw();
          if (box[2] >= MIN_BOX_SIZE && box[3] >= MIN_BOX_SIZE && handlers.onAdd) {
            handlers.onAdd(kind, box, points);
          }
          return true;
        }
        function popFreeVertex() {
          if (!freeDraft) return false;
          freeDraft.points.pop();
          if (freeDraft.points.length === 0) {
            freeDraft = null;
          } else {
            freeDraft.cursor = freeDraft.points[freeDraft.points.length - 1];
          }
          renderFreeDraft();
          return true;
        }
        stageEl.addEventListener("pointermove", (e) => {
          if (!freeDraft) return;
          const p = getNative(e.clientX, e.clientY);
          freeDraft.cursor = [p.x, p.y];
          renderFreeDraft();
        });
        function onWindowMove(e) {
          if (!drag) return;
          const p = getNative(e.clientX, e.clientY);
          if (drag.kind === "move") {
            const box = translateBox2(drag.origBox, p.x - drag.start.x, p.y - drag.start.y, page).map(Math.round);
            if (handlers.onUpdateBox) handlers.onUpdateBox(drag.id, box);
          } else if (drag.kind === "resize") {
            const box = resizeBox(drag.origBox, drag.handle, p.x - drag.start.x, p.y - drag.start.y, page).map(Math.round);
            if (handlers.onUpdateBox) handlers.onUpdateBox(drag.id, box);
          } else if (drag.kind === "pan") {
            if (Math.abs(e.clientX - drag.startClientX) > PAN_CLICK_SLOP || Math.abs(e.clientY - drag.startClientY) > PAN_CLICK_SLOP) {
              drag.moved = true;
            }
            view = {
              scale: view.scale,
              offsetX: drag.origView.offsetX + (e.clientX - drag.startClientX),
              offsetY: drag.origView.offsetY + (e.clientY - drag.startClientY)
            };
            applyView();
          } else if (drag.kind === "marquee" && drag.ghost) {
            const rect = viewport.getBoundingClientRect();
            drag.ghost.style.left = `${Math.min(drag.startClientX, e.clientX) - rect.left}px`;
            drag.ghost.style.top = `${Math.min(drag.startClientY, e.clientY) - rect.top}px`;
            drag.ghost.style.width = `${Math.abs(e.clientX - drag.startClientX)}px`;
            drag.ghost.style.height = `${Math.abs(e.clientY - drag.startClientY)}px`;
          }
        }
        function onWindowUp(e) {
          if (!drag) return;
          const finished = drag;
          drag = null;
          window.removeEventListener("pointermove", onWindowMove);
          window.removeEventListener("pointerup", onWindowUp);
          if (finished.kind === "marquee") {
            if (finished.ghost) finished.ghost.remove();
            const p = getNative(e.clientX, e.clientY);
            const box = boxFromPoints(finished.start.x, finished.start.y, p.x, p.y).map(Math.round);
            box[0] = Math.max(0, Math.min(box[0], page.width));
            box[1] = Math.max(0, Math.min(box[1], page.height));
            box[2] = Math.max(0, Math.min(box[2], page.width - box[0]));
            box[3] = Math.max(0, Math.min(box[3], page.height - box[1]));
            if (box[2] >= MIN_BOX_SIZE && box[3] >= MIN_BOX_SIZE && handlers.onAdd) {
              handlers.onAdd(finished.kindOf, box);
            }
          } else if (finished.kind === "pan" && !finished.moved && handlers.onSelect) {
            handlers.onSelect(null, { additive: false });
          }
        }
        stageEl.addEventListener("pointerdown", (e) => {
          if (e.button !== void 0 && e.button !== 0) return;
          const target = e.target;
          const boxEl = target.closest ? target.closest(".box") : null;
          const handleEl = target.closest ? target.closest(".handle") : null;
          const start = getNative(e.clientX, e.clientY);
          if (mode === "panel-free" || mode === "bubble-free") {
            e.preventDefault();
            freePointerDown(start);
            return;
          }
          if (mode === "select") {
            if (boxEl && handleEl) {
              const item = page.items.find((i) => i.id === boxEl.dataset.id);
              if (!item) return;
              e.preventDefault();
              if (handlers.onBeginEdit) handlers.onBeginEdit(item.id);
              drag = { kind: "resize", id: item.id, handle: handleEl.dataset.handle, origBox: [...item.box], start };
            } else if (boxEl) {
              const item = page.items.find((i) => i.id === boxEl.dataset.id);
              if (!item) return;
              e.preventDefault();
              if (handlers.onSelect && !selected.has(item.id) && !e.shiftKey) handlers.onSelect(item.id, { additive: false });
              if (handlers.onBeginEdit) handlers.onBeginEdit(item.id);
              drag = { kind: "move", id: item.id, origBox: [...item.box], start };
            } else {
              drag = {
                kind: "pan",
                startClientX: e.clientX,
                startClientY: e.clientY,
                origView: { ...view },
                moved: false
              };
            }
          } else {
            e.preventDefault();
            const ghost = document.createElement("div");
            ghost.className = "marquee";
            viewport.appendChild(ghost);
            drag = {
              kind: "marquee",
              kindOf: mode,
              start,
              startClientX: e.clientX,
              startClientY: e.clientY,
              ghost
            };
          }
          window.addEventListener("pointermove", onWindowMove);
          window.addEventListener("pointerup", onWindowUp);
        });
        viewport.addEventListener(
          "wheel",
          (e) => {
            e.preventDefault();
            if (e.ctrlKey) {
              const rect = stageEl.getBoundingClientRect();
              setViewInternal(
                zoomAt(view, e.clientX - rect.left + view.offsetX, e.clientY - rect.top + view.offsetY, Math.pow(ZOOM_SENSITIVITY, -e.deltaY))
              );
            } else {
              setViewInternal({
                scale: view.scale,
                offsetX: view.offsetX - e.deltaX,
                offsetY: view.offsetY - e.deltaY
              });
            }
          },
          { passive: false }
        );
        applyView();
        function setPage(next) {
          page = {
            width: next.width,
            height: next.height,
            type: next.type || "western",
            items: next.items || [],
            order: next.order || (next.items || []).map((i) => i.id)
          };
          stageEl.style.width = `${page.width}px`;
          stageEl.style.height = `${page.height}px`;
          freeLayer.setAttribute("viewBox", `0 0 ${page.width} ${page.height}`);
          cancelFreeDraw();
          render();
        }
        return {
          viewport,
          stageEl,
          layerEl: layer,
          freeLayerEl: freeLayer,
          imgEl: img,
          setPage,
          setImage(src) {
            img.src = src;
          },
          setView(next) {
            setViewInternal({ ...next });
          },
          getView: () => ({ ...view }),
          setMode(next) {
            mode = next;
            cancelFreeDraw();
            render();
          },
          getMode: () => mode,
          isFreeDrawing: () => freeDraft !== null,
          cancelFreeDraw,
          popFreeVertex,
          closeFreeDraw,
          setSelected(next) {
            selected = next || /* @__PURE__ */ new Set();
            render();
          },
          render,
          getNative
        };
      }
      module.exports = { createStage: createStage2 };
    }
  });

  // src/web/editor/keyboard.js
  var require_keyboard = __commonJS({
    "src/web/editor/keyboard.js"(exports, module) {
      "use strict";
      function attachKeyboard2(el2, actions = {}) {
        function onKeyDown(e) {
          const target = e.target;
          const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
          if (tag === "input" || tag === "textarea" || tag === "select" || target && target.isContentEditable) return;
          const mod = e.ctrlKey || e.metaKey;
          const key = typeof e.key === "string" ? e.key.toLowerCase() : "";
          if (mod && key === "z" && !e.shiftKey) {
            e.preventDefault();
            if (actions.onUndo) actions.onUndo();
            return;
          }
          if (mod && (key === "z" && e.shiftKey || key === "y")) {
            e.preventDefault();
            if (actions.onRedo) actions.onRedo();
            return;
          }
          const step = e.shiftKey ? 10 : 1;
          switch (e.key) {
            case "ArrowLeft":
              e.preventDefault();
              if (actions.onNudge) actions.onNudge(-1, 0, step);
              break;
            case "ArrowRight":
              e.preventDefault();
              if (actions.onNudge) actions.onNudge(1, 0, step);
              break;
            case "ArrowUp":
              e.preventDefault();
              if (actions.onNudge) actions.onNudge(0, -1, step);
              break;
            case "ArrowDown":
              e.preventDefault();
              if (actions.onNudge) actions.onNudge(0, 1, step);
              break;
            case "Delete":
            case "Backspace":
              e.preventDefault();
              if (actions.onDelete) actions.onDelete();
              break;
            case "Enter":
              e.preventDefault();
              if (actions.onEnter) actions.onEnter();
              break;
            case "Escape":
              if (actions.onEscape) actions.onEscape();
              break;
            default:
          }
        }
        el2.addEventListener("keydown", onKeyDown);
        return () => el2.removeEventListener("keydown", onKeyDown);
      }
      module.exports = { attachKeyboard: attachKeyboard2 };
    }
  });

  // src/web/editor/inspector.js
  var require_inspector = __commonJS({
    "src/web/editor/inspector.js"(exports, module) {
      "use strict";
      var FIELD_INDEX = { x: 0, y: 1, w: 2, h: 3 };
      function renderInspector2(el2, { item, badge, onBoxChange, onDelete } = {}) {
        el2.textContent = "";
        if (!item) {
          const empty = document.createElement("div");
          empty.className = "inspector-empty";
          empty.textContent = "No selection";
          el2.appendChild(empty);
          return;
        }
        const head = document.createElement("div");
        head.className = "inspector-head";
        head.textContent = `${item.kind} #${badge}`;
        el2.appendChild(head);
        for (const field of ["x", "y", "w", "h"]) {
          const row = document.createElement("label");
          row.className = "inspector-row";
          row.textContent = field;
          const input = document.createElement("input");
          input.type = "number";
          input.className = "metric-input";
          input.dataset.field = field;
          input.value = String(item.box[FIELD_INDEX[field]]);
          input.addEventListener("change", () => {
            const raw = input.value.trim();
            const value = Number(raw);
            if (raw === "" || !Number.isFinite(value)) return;
            const box = [...item.box];
            box[FIELD_INDEX[field]] = value;
            if (onBoxChange) onBoxChange(box, field);
          });
          row.appendChild(input);
          el2.appendChild(row);
        }
        const del = document.createElement("button");
        del.type = "button";
        del.className = "inspector-delete";
        del.textContent = "Delete";
        del.title = "Delete selected box (Del)";
        del.addEventListener("click", () => {
          if (onDelete) onDelete();
        });
        el2.appendChild(del);
      }
      module.exports = { renderInspector: renderInspector2, FIELD_INDEX };
    }
  });

  // src/web/editor/order-panel.js
  var require_order_panel = __commonJS({
    "src/web/editor/order-panel.js"(exports, module) {
      "use strict";
      var { openBadgeEditor } = require_badge_edit();
      var DRAG_SLOP = 3;
      var suppressNextRowClick = false;
      if (typeof document !== "undefined") {
        document.addEventListener(
          "pointerdown",
          () => {
            suppressNextRowClick = false;
          },
          true
        );
      }
      function reorderIdList(order, fromIndex, toIndex) {
        const next = order.slice();
        if (fromIndex < 0 || fromIndex >= next.length) return next;
        const [id] = next.splice(fromIndex, 1);
        const idx = Math.max(0, Math.min(toIndex, next.length));
        next.splice(idx, 0, id);
        return next;
      }
      function dropIndex(fromIndex, insertionIndex) {
        return insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex;
      }
      function nextBadgeNumbers(order) {
        const map = {};
        order.forEach((id, i) => {
          map[id] = i + 1;
        });
        return map;
      }
      function insertionIndexFromY(rows, y) {
        let index = 0;
        for (const row of rows) {
          if (y > row.top + row.height / 2) index++;
        }
        return index;
      }
      function renderOrderPanel2(el2, { order = [], items = [], caret = null, onSelect, onMove, onSetCaret, onDrop, onSetNumber } = {}) {
        el2.textContent = "";
        const itemsById = new Map(items.map((i) => [i.id, i]));
        const badges = nextBadgeNumbers(order);
        const list = document.createElement("div");
        list.className = "order-list";
        function beginRowDrag(row, id, fromIndex, startClientX, startClientY) {
          let moved = false;
          let insertion = -1;
          const rowTops = () => [...list.querySelectorAll(".order-row")].map((r) => {
            const b = r.getBoundingClientRect();
            return { top: b.top, height: b.height };
          });
          const paintDrop = (index) => {
            insertion = index;
            list.querySelectorAll(".caret-slot").forEach((slot) => {
              slot.classList.toggle("drop-slot", Number(slot.dataset.index) === index);
            });
          };
          const cleanup = () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerCancel);
            row.classList.remove("dragging");
            list.querySelectorAll(".caret-slot.drop-slot").forEach((slot) => slot.classList.remove("drop-slot"));
          };
          const onPointerMove = (ev) => {
            if (!moved) {
              if (Math.abs(ev.clientX - startClientX) <= DRAG_SLOP && Math.abs(ev.clientY - startClientY) <= DRAG_SLOP) return;
              moved = true;
              row.classList.add("dragging");
            }
            paintDrop(insertionIndexFromY(rowTops(), ev.clientY));
          };
          const onPointerUp = () => {
            cleanup();
            if (!moved || insertion < 0) return;
            const toIndex = dropIndex(fromIndex, insertion);
            if (toIndex === fromIndex) return;
            suppressNextRowClick = true;
            if (onDrop) onDrop(id, toIndex);
          };
          const onPointerCancel = () => cleanup();
          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);
          window.addEventListener("pointercancel", onPointerCancel);
        }
        const caretSlot = (index) => {
          const slot = document.createElement("div");
          slot.className = "caret-slot";
          if (caret === index) slot.classList.add("active");
          slot.dataset.index = String(index);
          slot.title = "New boxes are inserted here";
          slot.addEventListener("click", () => {
            if (onSetCaret) onSetCaret(index);
          });
          return slot;
        };
        list.appendChild(caretSlot(0));
        order.forEach((id, index) => {
          const item = itemsById.get(id);
          if (!item) return;
          const row = document.createElement("div");
          row.className = `order-row row-${item.kind}`;
          row.dataset.id = id;
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = String(badges[id]);
          badge.title = "Click to set position";
          badge.addEventListener("click", (e) => {
            e.stopPropagation();
            if (onSetNumber) {
              openBadgeEditor(badge, { value: badges[id], max: order.length, onCommit: (n) => onSetNumber(id, n) });
            }
          });
          const chip = document.createElement("span");
          chip.className = `chip chip-${item.kind}`;
          const label = document.createElement("span");
          label.className = "order-label";
          label.textContent = `${item.box[0]},${item.box[1]} ${item.box[2]}\xD7${item.box[3]}`;
          const up = document.createElement("button");
          up.className = "move-up";
          up.type = "button";
          up.textContent = "\u25B2";
          up.title = "Move earlier";
          up.addEventListener("click", (e) => {
            e.stopPropagation();
            if (onMove) onMove(id, -1);
          });
          const down = document.createElement("button");
          down.className = "move-down";
          down.type = "button";
          down.textContent = "\u25BC";
          down.title = "Move later";
          down.addEventListener("click", (e) => {
            e.stopPropagation();
            if (onMove) onMove(id, 1);
          });
          row.append(badge, chip, label, up, down);
          row.addEventListener("pointerdown", (e) => {
            if (e.button !== void 0 && e.button !== 0) return;
            if (e.target.closest && e.target.closest(".move-up, .move-down, .badge")) return;
            beginRowDrag(row, id, index, e.clientX, e.clientY);
          });
          row.addEventListener("click", (e) => {
            if (suppressNextRowClick) {
              suppressNextRowClick = false;
              return;
            }
            if (e.target.closest(".move-up, .move-down")) return;
            if (onSelect) onSelect(id, { additive: !!e.shiftKey });
          });
          list.appendChild(row);
          list.appendChild(caretSlot(index + 1));
        });
        el2.appendChild(list);
      }
      module.exports = { reorderIdList, nextBadgeNumbers, insertionIndexFromY, dropIndex, renderOrderPanel: renderOrderPanel2 };
    }
  });

  // src/shared/box.js
  var require_box = __commonJS({
    "src/shared/box.js"(exports, module) {
      "use strict";
      var CHILD_IOA = 0.7;
      var PARENT_IOA = 0.6;
      var WESTERN_BUBBLE_IOA = 0.8;
      function isBox(v) {
        return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));
      }
      function roundBox(b) {
        return b.map((v) => {
          const r = Math.round(v);
          return r === 0 ? 0 : r;
        });
      }
      function boxesEqual(a, b) {
        return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
      }
      function boxKey2(b) {
        return b.join(",");
      }
      function clampBox(box, pageW, pageH) {
        const [x, y, w, h] = box;
        const cx = Math.min(Math.max(0, x), pageW);
        const cy = Math.min(Math.max(0, y), pageH);
        const cw = Math.min(w, Math.max(0, pageW - cx));
        const ch = Math.min(h, Math.max(0, pageH - cy));
        return [cx, cy, cw, ch];
      }
      function intersectionOverArea(a, b) {
        const [ax, ay, aw, ah] = a;
        const [bx, by, bw, bh] = b;
        const x1 = Math.max(ax, bx);
        const y1 = Math.max(ay, by);
        const x2 = Math.min(ax + aw, bx + bw);
        const y2 = Math.min(ay + ah, by + bh);
        const iw = Math.max(0, x2 - x1);
        const ih = Math.max(0, y2 - y1);
        const area = aw * ah;
        return area > 0 ? iw * ih / area : 0;
      }
      function iou(a, b) {
        const [ax, ay, aw, ah] = a;
        const [bx, by, bw, bh] = b;
        const x1 = Math.max(ax, bx);
        const y1 = Math.max(ay, by);
        const x2 = Math.min(ax + aw, bx + bw);
        const y2 = Math.min(ay + ah, by + bh);
        const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const union = aw * ah + bw * bh - inter;
        return union > 0 ? inter / union : 0;
      }
      function isBubbleInPanel(bubble, panel) {
        const [bx, by, bw, bh] = bubble;
        const [px, py, pw, ph] = panel;
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        return cx >= px && cx <= px + pw && cy >= py && cy <= py + ph;
      }
      module.exports = {
        CHILD_IOA,
        PARENT_IOA,
        WESTERN_BUBBLE_IOA,
        isBox,
        roundBox,
        boxesEqual,
        boxKey: boxKey2,
        clampBox,
        intersectionOverArea,
        iou,
        isBubbleInPanel
      };
    }
  });

  // src/shared/reading-order.js
  var require_reading_order = __commonJS({
    "src/shared/reading-order.js"(exports, module) {
      "use strict";
      var { isBubbleInPanel, intersectionOverArea, WESTERN_BUBBLE_IOA, PARENT_IOA } = require_box();
      function sortReadingOrder(boxes, type) {
        if (!Array.isArray(boxes)) return boxes;
        const sorted = boxes.slice();
        if (type === "manga") {
          sorted.sort((a, b) => a[1] * 1.5 - (a[0] + a[2]) - (b[1] * 1.5 - (b[0] + b[2])));
        } else {
          sorted.sort((a, b) => a[1] * 5 + a[0] - (b[1] * 5 + b[0]));
        }
        return sorted;
      }
      function geometryOrder2(panels, bubbles, type) {
        const allPanels = Array.isArray(panels) ? panels : [];
        const allBubbles = Array.isArray(bubbles) ? bubbles : [];
        if (type === "manga") {
          return mangaGeometryOrder(sortReadingOrder(allPanels, "manga"), sortReadingOrder(allBubbles, "manga"));
        }
        return westernGeometryOrder(sortReadingOrder(allPanels, "western"), sortReadingOrder(allBubbles, "western"));
      }
      function westernGeometryOrder(sortedPanels, sortedBubbles) {
        const out = [];
        const assigned = /* @__PURE__ */ new Set();
        for (const panel of sortedPanels) {
          out.push({ kind: "panel", box: panel });
          for (const bubble of sortedBubbles) {
            if (assigned.has(bubble)) continue;
            if (isBubbleInPanel(bubble, panel) || intersectionOverArea(bubble, panel) >= WESTERN_BUBBLE_IOA) {
              assigned.add(bubble);
              out.push({ kind: "bubble", box: bubble });
            }
          }
        }
        for (const bubble of sortedBubbles) {
          if (!assigned.has(bubble)) out.push({ kind: "bubble", box: bubble });
        }
        return out;
      }
      function mangaGeometryOrder(sortedPanels, sortedBubbles) {
        const out = [];
        const owner = /* @__PURE__ */ new Map();
        for (const bubble of sortedBubbles) {
          for (const panel of sortedPanels) {
            if (intersectionOverArea(bubble, panel) >= PARENT_IOA) {
              owner.set(bubble, panel);
              break;
            }
          }
        }
        for (const panel of sortedPanels) {
          for (const bubble of sortedBubbles) {
            if (owner.get(bubble) === panel) out.push({ kind: "bubble", box: bubble });
          }
          out.push({ kind: "panel", box: panel });
        }
        for (const bubble of sortedBubbles) {
          if (!owner.has(bubble)) out.push({ kind: "bubble", box: bubble });
        }
        return out;
      }
      module.exports = { sortReadingOrder, geometryOrder: geometryOrder2 };
    }
  });

  // src/shared/sidecar.js
  var require_sidecar = __commonJS({
    "src/shared/sidecar.js"(exports, module) {
      "use strict";
      var { roundBox, boxesEqual, boxKey: boxKey2, intersectionOverArea, isBubbleInPanel, CHILD_IOA, WESTERN_BUBBLE_IOA } = require_box();
      function normalizeBox(v) {
        if (Array.isArray(v)) {
          return v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? roundBox(v) : null;
        }
        if (v && typeof v === "object") {
          const vals = [v[0], v[1], v[2], v[3]];
          if (vals.every((n) => typeof n === "number" && Number.isFinite(n))) return roundBox(vals);
        }
        return null;
      }
      function normalizePoints(v) {
        if (!Array.isArray(v) || v.length < 3) return null;
        const out = [];
        for (const p of v) {
          if (!Array.isArray(p) || p.length !== 2) return null;
          const [x, y] = p;
          if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) return null;
          out.push([Math.round(x), Math.round(y)]);
        }
        return out;
      }
      function classifyMangaChild(box, boxes) {
        return boxes.some((other) => other !== box && intersectionOverArea(box, other) >= CHILD_IOA);
      }
      function matchSequence(items, seqBoxes) {
        const used = /* @__PURE__ */ new Set();
        const seqPos = /* @__PURE__ */ new Map();
        let dropped = 0;
        for (let s = 0; s < seqBoxes.length; s++) {
          let hit = null;
          for (const item of items) {
            if (used.has(item.id)) continue;
            if (boxesEqual(item.box, seqBoxes[s])) {
              hit = item;
              break;
            }
          }
          if (hit) {
            used.add(hit.id);
            seqPos.set(hit.id, s);
          } else {
            dropped++;
          }
        }
        return { seqPos, dropped };
      }
      function westernBubbleOrder(items, seqBoxes, warnings) {
        if (seqBoxes.length === 0) {
          warnings.push("no-sequence");
          return items.map((i) => i.id);
        }
        const m = matchSequence(items, seqBoxes);
        if (m.dropped > 0) warnings.push("dropped-sequence-boxes");
        const out = [...m.seqPos.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
        let appended = 0;
        for (const item of items) {
          if (!m.seqPos.has(item.id)) {
            out.push(item.id);
            appended++;
          }
        }
        if (appended > 0) warnings.push("appended-items");
        return out;
      }
      function westernDisplayOrder(items, seqBoxes, warnings) {
        const panels = items.filter((i) => i.kind === "panel");
        const bubbles = items.filter((i) => i.kind === "bubble");
        const stored = new Map(items.map((i, idx) => [i.id, idx]));
        let seqPos = /* @__PURE__ */ new Map();
        if (seqBoxes.length === 0) {
          warnings.push("no-sequence");
        } else {
          const m = matchSequence(items, seqBoxes);
          seqPos = m.seqPos;
          if (m.dropped > 0) warnings.push("dropped-sequence-boxes");
        }
        const key = (item) => seqPos.has(item.id) ? seqPos.get(item.id) : Number.MAX_SAFE_INTEGER;
        const bySeq = (a, b) => key(a) - key(b) || stored.get(a.id) - stored.get(b.id);
        const out = [];
        const assigned = /* @__PURE__ */ new Set();
        for (const panel of panels.slice().sort(bySeq)) {
          out.push(panel.id);
          const children = [];
          for (const bubble of bubbles) {
            if (assigned.has(bubble.id)) continue;
            if (isBubbleInPanel(bubble.box, panel.box) || intersectionOverArea(bubble.box, panel.box) >= WESTERN_BUBBLE_IOA) {
              children.push(bubble);
              assigned.add(bubble.id);
            }
          }
          children.sort(bySeq);
          for (const child of children) out.push(child.id);
        }
        let appended = 0;
        for (const orphan of bubbles.filter((b) => !assigned.has(b.id)).sort(bySeq)) {
          out.push(orphan.id);
          if (!seqPos.has(orphan.id)) appended++;
        }
        if (appended > 0) warnings.push("appended-items");
        return out;
      }
      function mangaDisplayOrder(items, seqBoxes, warnings) {
        if (seqBoxes.length === 0) {
          warnings.push("no-sequence");
          return items.map((i) => i.id);
        }
        const m = matchSequence(items, seqBoxes);
        const entries = [...m.seqPos.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
        const matched = new Set(entries);
        const appended = items.map((i) => i.id).filter((id) => !matched.has(id));
        if (m.dropped > 0) warnings.push("dropped-sequence-boxes");
        if (appended.length > 0) warnings.push("appended-items");
        return entries.concat(appended);
      }
      function normalizeSidecarPage(value, type) {
        const warnings = [];
        const items = [];
        const push = (kind, box, points) => {
          const item = { id: "i" + items.length, kind, box };
          if (points) item.points = points;
          items.push(item);
        };
        if (Array.isArray(value)) {
          warnings.push("bare-array");
          for (const raw of value) {
            const box = normalizeBox(raw);
            if (box) push("panel", box);
          }
          return { items, order: items.map((i) => i.id), warnings };
        }
        const page = value && typeof value === "object" ? value : {};
        const rawPanels = Array.isArray(page.panels) ? page.panels : [];
        const rawBubbles = Array.isArray(page.bubbles) ? page.bubbles : [];
        const rawPanelPoints = Array.isArray(page.panelPoints) ? page.panelPoints : [];
        const rawBubblePoints = Array.isArray(page.bubblePoints) ? page.bubblePoints : [];
        const seqBoxes = (Array.isArray(page.sequence) ? page.sequence : []).map(normalizeBox).filter(Boolean);
        if (type === "manga") {
          const boxes = [];
          const boxPoints = [];
          const bubbles = [];
          const bubblePoints = [];
          for (let i = 0; i < rawPanels.length; i++) {
            const box = normalizeBox(rawPanels[i]);
            if (box) {
              boxes.push(box);
              boxPoints.push(normalizePoints(rawPanelPoints[i]));
            }
          }
          for (let i = 0; i < rawBubbles.length; i++) {
            const box = normalizeBox(rawBubbles[i]);
            if (box) {
              bubbles.push(box);
              bubblePoints.push(normalizePoints(rawBubblePoints[i]));
            }
          }
          const seqKeys = new Set(seqBoxes.map(boxKey2));
          const editorWritten = bubbles.length > 0 && bubbles.every((b) => seqKeys.has(boxKey2(b)));
          if (editorWritten) {
            for (let i = 0; i < boxes.length; i++) push("panel", boxes[i], boxPoints[i]);
            for (let i = 0; i < bubbles.length; i++) push("bubble", bubbles[i], bubblePoints[i]);
          } else {
            for (let i = 0; i < boxes.length; i++) push(classifyMangaChild(boxes[i], boxes) ? "bubble" : "panel", boxes[i], boxPoints[i]);
            for (let i = 0; i < bubbles.length; i++) push("bubble", bubbles[i], bubblePoints[i]);
          }
          return { items, order: mangaDisplayOrder(items, seqBoxes, warnings), warnings };
        }
        for (let i = 0; i < rawPanels.length; i++) {
          const box = normalizeBox(rawPanels[i]);
          if (box) push("panel", box, normalizePoints(rawPanelPoints[i]));
        }
        for (let i = 0; i < rawBubbles.length; i++) {
          const box = normalizeBox(rawBubbles[i]);
          if (box) push("bubble", box, normalizePoints(rawBubblePoints[i]));
        }
        const bubblesOnly = items.filter((i) => i.kind === "bubble");
        if (bubblesOnly.length > 0) {
          return { items: bubblesOnly, order: westernBubbleOrder(bubblesOnly, seqBoxes, warnings), warnings };
        }
        return { items, order: westernDisplayOrder(items, seqBoxes, warnings), warnings };
      }
      function pruneWesternPanels2(page, type) {
        if (type !== "western") return page;
        const items = Array.isArray(page.items) ? page.items : [];
        if (!items.some((i) => i.kind === "bubble") || !items.some((i) => i.kind === "panel")) return page;
        const kept = items.filter((i) => i.kind === "bubble");
        const keptIds = new Set(kept.map((i) => i.id));
        return { ...page, items: kept, order: (page.order || []).filter((id) => keptIds.has(id)) };
      }
      function normalizeSidecar(sidecar) {
        const type = sidecar && sidecar.type === "manga" ? "manga" : "western";
        const out = { comicId: sidecar ? sidecar.comicId : null, type, pages: {}, warnings: [] };
        const pagesIn = sidecar && sidecar.pages || {};
        for (const name of Object.keys(pagesIn)) {
          const { items, order, warnings } = normalizeSidecarPage(pagesIn[name], type);
          out.pages[name] = { width: null, height: null, items, order };
          for (const w of warnings) out.warnings.push(`${name}: ${w}`);
        }
        return out;
      }
      function regeneratePage(page, type) {
        const byId = new Map(page.items.map((i) => [i.id, i]));
        const ordered = page.order.map((id) => byId.get(id)).filter(Boolean);
        const roundPoints = (item) => item.points ? item.points.map(([x, y]) => [Math.round(x), Math.round(y)]) : null;
        const panelItems = ordered.filter((i) => i.kind === "panel");
        const bubbleItems = ordered.filter((i) => i.kind === "bubble");
        const panels = panelItems.map((i) => i.box);
        const bubbles = bubbleItems.map((i) => i.box);
        const out = {
          panels,
          bubbles,
          sequence: type === "manga" ? ordered.map((i) => i.box) : bubbles.length > 0 ? bubbles : panels
        };
        const panelPoints = panelItems.map(roundPoints);
        if (panelPoints.some(Boolean)) out.panelPoints = panelPoints;
        const bubblePoints = bubbleItems.map(roundPoints);
        if (bubblePoints.some(Boolean)) out.bubblePoints = bubblePoints;
        return out;
      }
      function regenerateSidecar(doc) {
        const pages = {};
        for (const [name, page] of Object.entries(doc.pages || {})) pages[name] = regeneratePage(page, doc.type);
        return { comicId: doc.comicId, type: doc.type, pages };
      }
      function pageSignature(items, order) {
        const byId = new Map(items.map((i) => [i.id, i]));
        return JSON.stringify(order.map((id) => {
          const item = byId.get(id);
          const points = item.points ? item.points.map(([x, y]) => [Math.round(x), Math.round(y)]) : null;
          return [item.kind, item.box[0], item.box[1], item.box[2], item.box[3], points];
        }));
      }
      function mergeSidecar(doc, original) {
        const originalPages = original && original.pages || {};
        const docPages = doc.pages || {};
        const pages = {};
        for (const [name, page] of Object.entries(originalPages)) {
          if (!Object.prototype.hasOwnProperty.call(docPages, name)) {
            pages[name] = page;
            continue;
          }
          const submitted = docPages[name];
          const normalized = normalizeSidecarPage(page, doc.type);
          const changed = pageSignature(submitted.items || [], submitted.order || []) !== pageSignature(normalized.items, normalized.order);
          pages[name] = changed ? regeneratePage(submitted, doc.type) : page;
        }
        for (const [name, page] of Object.entries(docPages)) {
          if (!Object.prototype.hasOwnProperty.call(pages, name)) pages[name] = regeneratePage(page, doc.type);
        }
        return { comicId: doc.comicId, type: doc.type, pages };
      }
      function validateEditorDocument(doc) {
        const errors = [];
        const warnings = [];
        if (!doc || typeof doc !== "object") {
          errors.push("document must be an object");
          return { errors, warnings };
        }
        if (doc.type !== "western" && doc.type !== "manga") errors.push(`invalid type: ${JSON.stringify(doc.type)}`);
        const pages = doc.pages || {};
        for (const [name, page] of Object.entries(pages)) {
          if (!page || typeof page !== "object") {
            errors.push(`${name}: page must be an object`);
            continue;
          }
          const items = Array.isArray(page.items) ? page.items : null;
          if (!items) {
            errors.push(`${name}: items must be an array`);
            continue;
          }
          const ids = /* @__PURE__ */ new Set();
          for (const item of items) {
            if (!item || typeof item.id !== "string" || item.id === "") {
              errors.push(`${name}: item missing id`);
              continue;
            }
            if (ids.has(item.id)) errors.push(`${name}: duplicate item id ${item.id}`);
            ids.add(item.id);
            if (item.kind !== "panel" && item.kind !== "bubble") {
              errors.push(`${name}: item ${item.id} has invalid kind ${JSON.stringify(item.kind)}`);
            }
            const box = item.box;
            if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number" && Number.isFinite(n))) {
              errors.push(`${name}: box for ${item.id} must be four finite numbers`);
              continue;
            }
            if (box[2] <= 0 || box[3] <= 0) errors.push(`${name}: box for ${item.id} has non-positive size`);
            if (item.points != null) {
              const pts = item.points;
              const valid = Array.isArray(pts) && pts.length >= 3 && pts.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n)));
              if (!valid) errors.push(`${name}: points for ${item.id} must be at least 3 [x, y] finite-number pairs`);
            }
            const W = page.width;
            const H = page.height;
            if (Number.isFinite(W) && Number.isFinite(H) && (box[0] < 0 || box[1] < 0 || box[0] + box[2] > W || box[1] + box[3] > H)) {
              warnings.push(`${name}: box for ${item.id} is out of bounds`);
            }
          }
          const order = Array.isArray(page.order) ? page.order : null;
          if (!order) {
            errors.push(`${name}: order must be an array`);
            continue;
          }
          if (order.length !== items.length || new Set(order).size !== order.length || !order.every((id) => ids.has(id))) {
            errors.push(`${name}: order must be a permutation of item ids`);
          }
        }
        return { errors, warnings };
      }
      module.exports = {
        normalizeBox,
        normalizeSidecarPage,
        normalizeSidecar,
        regeneratePage,
        regenerateSidecar,
        mergeSidecar,
        pruneWesternPanels: pruneWesternPanels2,
        validateEditorDocument
      };
    }
  });

  // src/web/library-view.js
  var require_library_view = __commonJS({
    "src/web/library-view.js"(exports, module) {
      "use strict";
      var PAGE_SIZE = 50;
      function createLibraryView2(el2, { api: api2, onOpen, onExport }) {
        el2.textContent = "";
        let page = 0;
        let total = 0;
        const form = document.createElement("form");
        form.className = "library-search";
        const input = document.createElement("input");
        input.className = "search-input";
        input.type = "search";
        input.placeholder = "Search series or file name\u2026";
        const button = document.createElement("button");
        button.type = "submit";
        button.textContent = "Search";
        form.append(input, button);
        const filterLabel = document.createElement("label");
        filterLabel.className = "library-filter";
        const onlyGuided = document.createElement("input");
        onlyGuided.type = "checkbox";
        onlyGuided.className = "library-only-guided";
        onlyGuided.checked = true;
        const filterText = document.createElement("span");
        filterText.textContent = "Only comics with guided view";
        filterLabel.append(onlyGuided, filterText);
        const status = document.createElement("div");
        status.className = "library-status";
        const list = document.createElement("div");
        list.className = "comic-list";
        const pager = document.createElement("div");
        pager.className = "pager";
        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "pager-prev";
        prevBtn.textContent = "\u2190 Prev";
        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "pager-next";
        nextBtn.textContent = "Next \u2192";
        const pageInfo = document.createElement("span");
        pageInfo.className = "pager-info";
        pager.append(prevBtn, pageInfo, nextBtn);
        el2.append(form, filterLabel, status, list, pager);
        function renderList(comics) {
          list.textContent = "";
          for (const comic of comics) {
            const row = document.createElement("div");
            row.className = "comic-row";
            row.dataset.id = comic.id;
            const title = document.createElement("div");
            title.className = "comic-title";
            title.textContent = comic.series ? `${comic.series} \u2014 ${comic.name}` : comic.name;
            const statusChip = document.createElement("span");
            const state = comic.guidedViewStatus || "unknown";
            statusChip.className = `chip status status-${state}`;
            statusChip.textContent = state;
            row.append(title, statusChip);
            if (comic.mangaMode) {
              const manga = document.createElement("span");
              manga.className = "chip chip-manga";
              manga.textContent = "manga";
              row.appendChild(manga);
            }
            const open = document.createElement("button");
            open.className = "open";
            open.type = "button";
            open.textContent = "Edit";
            open.addEventListener("click", () => onOpen(comic.id));
            const exportBtn = document.createElement("button");
            exportBtn.className = "export";
            exportBtn.type = "button";
            exportBtn.textContent = "Export";
            exportBtn.disabled = !comic.guidedViewPath;
            exportBtn.addEventListener("click", () => onExport(comic.id));
            row.append(open, exportBtn);
            list.appendChild(row);
          }
        }
        function renderPager() {
          const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
          prevBtn.disabled = page <= 0;
          nextBtn.disabled = page >= pages - 1;
          pageInfo.textContent = `Page ${page + 1} of ${pages}`;
        }
        async function refresh() {
          status.textContent = "Searching\u2026";
          try {
            const data = await api2.listComics({
              q: input.value.trim(),
              status: onlyGuided.checked ? "completed" : "",
              limit: PAGE_SIZE,
              offset: page * PAGE_SIZE
            });
            const comics = data.comics || [];
            total = typeof data.total === "number" ? data.total : comics.length;
            renderList(comics);
            renderPager();
            status.textContent = `${total} comic(s)`;
          } catch (err) {
            status.textContent = `Search failed: ${err.message}`;
          }
        }
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          page = 0;
          refresh();
        });
        onlyGuided.addEventListener("change", () => {
          page = 0;
          refresh();
        });
        prevBtn.addEventListener("click", () => {
          if (page > 0) {
            page -= 1;
            refresh();
          }
        });
        nextBtn.addEventListener("click", () => {
          page += 1;
          refresh();
        });
        refresh();
        return { refresh, input };
      }
      module.exports = { createLibraryView: createLibraryView2 };
    }
  });

  // src/web/import-view.js
  var require_import_view = __commonJS({
    "src/web/import-view.js"(exports, module) {
      "use strict";
      function createImportView2(el2, { api: api2, onOpenEditor } = {}) {
        const state = { fileData: null, candidates: [], selectedId: null, mode: "attach" };
        el2.textContent = "";
        const fileRow = document.createElement("div");
        fileRow.className = "import-file-row";
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json,application/json";
        fileInput.className = "import-file";
        fileRow.appendChild(fileInput);
        const status = document.createElement("div");
        status.className = "import-status";
        const content = document.createElement("div");
        content.className = "import-content";
        el2.append(fileRow, status, content);
        function candidateLabel(candidate) {
          const c = candidate.comic;
          return c.series ? `${c.series} \u2014 ${c.name}` : c.name;
        }
        function renderCandidates() {
          const listDiv = document.createElement("div");
          listDiv.className = "candidate-list";
          state.candidates.forEach((candidate) => {
            const row = document.createElement("div");
            row.className = "candidate-row";
            row.dataset.id = candidate.comic.id;
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "candidate";
            radio.value = candidate.comic.id;
            radio.checked = state.selectedId === candidate.comic.id;
            radio.addEventListener("change", () => {
              if (radio.checked) state.selectedId = candidate.comic.id;
            });
            const label = document.createElement("span");
            label.className = "candidate-label";
            label.textContent = candidateLabel(candidate);
            const score = document.createElement("span");
            score.className = "candidate-score";
            score.textContent = Number(candidate.score).toFixed(2);
            row.append(radio, label, score);
            if (candidate.sourceComicIdMatch) {
              const match = document.createElement("span");
              match.className = "source-match";
              match.textContent = "source id match";
              row.appendChild(match);
            }
            const breakdown = document.createElement("span");
            breakdown.className = "breakdown";
            breakdown.textContent = Object.entries(candidate.breakdown || {}).map(([key, value]) => `${key} ${Number(value).toFixed(2)}`).join(" \xB7 ");
            row.appendChild(breakdown);
            listDiv.appendChild(row);
          });
          return listDiv;
        }
        function renderModes() {
          const modes = document.createElement("div");
          modes.className = "mode-row";
          for (const mode of ["attach", "replace"]) {
            const label = document.createElement("label");
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "import-mode";
            radio.value = mode;
            radio.checked = state.mode === mode;
            radio.addEventListener("change", () => {
              if (radio.checked) state.mode = mode;
            });
            label.append(radio, document.createTextNode(mode === "attach" ? " attach (keep other pages)" : " replace (wipe existing sidecar pages)"));
            modes.appendChild(label);
          }
          return modes;
        }
        function renderManualSearch() {
          const wrap = document.createElement("div");
          wrap.className = "manual-search";
          const input = document.createElement("input");
          input.className = "manual-input";
          input.type = "search";
          input.placeholder = "Choose a different comic\u2026";
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Search";
          const results = document.createElement("div");
          results.className = "manual-results";
          button.addEventListener("click", async () => {
            results.textContent = "";
            try {
              const data = await api2.listComics({ q: input.value.trim() });
              for (const comic of data.comics || []) {
                const row = document.createElement("div");
                row.className = "manual-row";
                const label = document.createElement("span");
                label.textContent = comic.series ? `${comic.series} \u2014 ${comic.name}` : comic.name;
                const pick = document.createElement("button");
                pick.type = "button";
                pick.className = "pick";
                pick.textContent = "Score & select";
                pick.addEventListener("click", async () => {
                  try {
                    const res = await api2.scoreAgainst(state.fileData, comic.id);
                    const entry = {
                      comic: { ...comic, mangaMode: res.mangaMode },
                      score: res.score,
                      sourceComicIdMatch: res.sourceComicIdMatch,
                      breakdown: res.breakdown
                    };
                    state.candidates = [entry, ...state.candidates.filter((c) => c.comic.id !== comic.id)];
                    state.selectedId = comic.id;
                    renderConfirm();
                  } catch (err) {
                    status.textContent = err.message;
                  }
                });
                row.append(label, pick);
                results.appendChild(row);
              }
            } catch (err) {
              status.textContent = err.message;
            }
          });
          wrap.append(input, button, results);
          return wrap;
        }
        function renderConfirm() {
          content.textContent = "";
          const source = document.createElement("div");
          source.className = "import-source";
          source.textContent = `Import file: ${state.fileData.comic.fileName || state.fileData.comic.series || "(unnamed)"} (${state.fileData.type})`;
          const apply = document.createElement("button");
          apply.className = "apply";
          apply.type = "button";
          apply.textContent = "Apply import";
          apply.addEventListener("click", doApply);
          content.append(source, renderCandidates(), renderModes(), apply, renderManualSearch());
        }
        function renderResult(res) {
          content.textContent = "";
          const result = document.createElement("div");
          result.className = "import-result";
          const s = res.summary || {};
          const line = document.createElement("div");
          line.textContent = `Done. exact: ${s.exact || 0} \xB7 case-insensitive: ${s.ci || 0} \xB7 basename: ${s.basename || 0} \xB7 positional: ${s.positional || 0} \xB7 dropped: ${s.dropped || 0} \xB7 empty targets: ${s.emptyTarget || 0} \xB7 scaled: ${s.scaled || 0} \xB7 clamped: ${s.clamped || 0}`;
          result.appendChild(line);
          if (res.backupPath) {
            const backup = document.createElement("div");
            backup.textContent = `Backup: ${res.backupPath}`;
            result.appendChild(backup);
          }
          if (res.sidecarPath) {
            const sidecar = document.createElement("div");
            sidecar.textContent = `Sidecar: ${res.sidecarPath}`;
            result.appendChild(sidecar);
          }
          for (const warning of res.warnings || []) {
            const w = document.createElement("div");
            w.className = "import-warning";
            w.textContent = warning;
            result.appendChild(w);
          }
          if (onOpenEditor && state.selectedId) {
            const open = document.createElement("button");
            open.type = "button";
            open.textContent = "Open in editor";
            open.addEventListener("click", () => onOpenEditor(state.selectedId));
            result.appendChild(open);
          }
          content.appendChild(result);
        }
        async function doApply() {
          const checked = el2.querySelector('input[name="candidate"]:checked');
          if (checked) state.selectedId = checked.value;
          const modeEl = el2.querySelector('input[name="import-mode"]:checked');
          if (modeEl) state.mode = modeEl.value;
          if (!state.fileData || !state.selectedId) return;
          status.textContent = "Applying\u2026";
          try {
            const res = await api2.applyImport(state.fileData, state.selectedId, state.mode);
            status.textContent = "";
            renderResult(res);
          } catch (err) {
            status.textContent = `Apply failed: ${err.message}`;
          }
        }
        async function loadFile(data) {
          state.fileData = data;
          content.textContent = "";
          status.textContent = "Scoring against library\u2026";
          try {
            const scored = await api2.scoreImport(data);
            state.candidates = scored.candidates || [];
            state.selectedId = state.candidates.length ? state.candidates[0].comic.id : null;
            state.mode = "attach";
            status.textContent = "";
            renderConfirm();
          } catch (err) {
            status.textContent = err.message;
          }
        }
        fileInput.addEventListener("change", async () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          try {
            const data = JSON.parse(await file.text());
            await loadFile(data);
          } catch (err) {
            status.textContent = `Could not read file: ${err.message}`;
          }
        });
        return { loadFile };
      }
      module.exports = { createImportView: createImportView2 };
    }
  });

  // src/web/settings-view.js
  var require_settings_view = __commonJS({
    "src/web/settings-view.js"(exports, module) {
      "use strict";
      var RESOLVED_ROWS = [
        ["comicsNowRoot", "Comics Now! root"],
        ["dbPath", "Database"],
        ["guidedViewDir", "Guided view dir"],
        ["backupDir", "Backup dir"],
        ["pageCacheDir", "Page cache dir"],
        ["port", "Port"],
        ["bind", "Bind address"]
      ];
      function createSettingsView2(el2, { api: api2 }) {
        el2.textContent = "";
        const title = document.createElement("div");
        title.className = "settings-title";
        title.textContent = "Settings";
        const intro = document.createElement("p");
        intro.className = "settings-intro";
        intro.textContent = "Where GVE Now! finds the comics-now install (its database, guided-view sidecars and page cache).";
        const form = document.createElement("form");
        form.className = "settings-form";
        const field = document.createElement("label");
        field.className = "settings-field";
        const fieldText = document.createElement("span");
        fieldText.className = "settings-field-label";
        fieldText.textContent = "Comics Now! install location";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "settings-path-input";
        input.placeholder = "/opt/comics-now";
        input.spellcheck = false;
        field.append(fieldText, input);
        const save2 = document.createElement("button");
        save2.type = "button";
        save2.className = "settings-save";
        save2.textContent = "Save";
        form.append(field, save2);
        const status = document.createElement("div");
        status.className = "settings-status";
        const envNotice = document.createElement("div");
        envNotice.className = "settings-env-notice";
        envNotice.hidden = true;
        const restart = document.createElement("div");
        restart.className = "settings-restart";
        restart.hidden = true;
        const resolved = document.createElement("div");
        resolved.className = "settings-resolved";
        el2.append(title, intro, form, status, envNotice, restart, resolved);
        function setStatus(message, kind) {
          status.textContent = message;
          status.className = kind ? `settings-status settings-status-${kind}` : "settings-status";
        }
        function renderResolved(settings) {
          resolved.textContent = "";
          for (const [key, label] of RESOLVED_ROWS) {
            if (settings[key] === void 0) continue;
            const row = document.createElement("div");
            row.className = "settings-row";
            row.dataset.key = key;
            const name = document.createElement("span");
            name.className = "settings-row-label";
            name.textContent = label;
            const value = document.createElement("span");
            value.className = "settings-row-value";
            value.textContent = String(settings[key]);
            row.append(name, value);
            resolved.appendChild(row);
          }
        }
        function showEnvNotice() {
          envNotice.hidden = false;
          envNotice.textContent = "COMICS_NOW_ROOT is set in the service environment and overrides config.json \u2014 the app keeps using that value until the variable is unset.";
        }
        function showRestart(message) {
          restart.hidden = false;
          restart.textContent = message || "Restart GVE Now! to apply (sudo systemctl restart gve-now)";
        }
        async function refresh() {
          setStatus("Loading\u2026");
          try {
            const data = await api2.getSettings();
            if (data.settings) {
              renderResolved(data.settings);
              input.value = data.settings.comicsNowRoot || "";
            }
            if (data.env && data.env.comicsNowRoot) showEnvNotice();
            const errors = data.validation && data.validation.errors || [];
            const warnings = data.validation && data.validation.warnings || [];
            if (errors.length) setStatus(errors.join("\n"), "error");
            else if (warnings.length) setStatus(warnings.join("\n"), "warn");
            else setStatus(`Config file: ${data.configPath}`, "ok");
            return data;
          } catch (err) {
            setStatus(`Failed to load settings: ${err.message}`, "error");
            return null;
          }
        }
        async function saveSettings() {
          const comicsNowRoot = input.value.trim();
          if (!comicsNowRoot) {
            setStatus("Enter the comics-now install path first.", "error");
            return;
          }
          restart.hidden = true;
          setStatus("Saving\u2026");
          try {
            const res = await api2.saveSettings({ comicsNowRoot });
            if (res.settings) renderResolved(res.settings);
            const warnings = res.warnings || [];
            if (warnings.some((warning) => warning.includes("COMICS_NOW_ROOT"))) showEnvNotice();
            setStatus(warnings.length ? warnings.join("\n") : "Saved.", warnings.length ? "warn" : "ok");
            showRestart(res.message);
          } catch (err) {
            setStatus(`Save failed: ${err.message}`, "error");
          }
        }
        save2.addEventListener("click", saveSettings);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          saveSettings();
        });
        refresh();
        return { refresh, input, saveSettings };
      }
      module.exports = { createSettingsView: createSettingsView2 };
    }
  });

  // src/web/main.js
  var { api } = require_api();
  var { createStore } = require_store();
  var { createUndoStack } = require_undo();
  var { createStage } = require_stage();
  var { attachKeyboard } = require_keyboard();
  var { renderInspector } = require_inspector();
  var { renderOrderPanel } = require_order_panel();
  var { translateBox, remapPoints } = require_interact();
  var { fitWidthScale } = require_view_math();
  var { boxKey } = require_box();
  var { geometryOrder } = require_reading_order();
  var { pruneWesternPanels } = require_sidecar();
  var { createLibraryView } = require_library_view();
  var { createImportView } = require_import_view();
  var { createSettingsView } = require_settings_view();
  var $ = (id) => document.getElementById(id);
  var el = {
    library: $("library-view"),
    import: $("import-view"),
    settings: $("settings-view"),
    editor: $("editor-view"),
    toolbar: $("editor-toolbar"),
    pageList: $("page-list"),
    stageContainer: $("stage-container"),
    orderPanel: $("order-panel"),
    inspector: $("inspector"),
    toast: $("toast"),
    dirtyFlag: $("dirty-flag"),
    navLibrary: $("nav-library"),
    navImport: $("nav-import"),
    navSettings: $("nav-settings")
  };
  var store = createStore();
  var undo = createUndoStack();
  var session = null;
  var stage = null;
  var toastTimer = null;
  function showView(name) {
    el.library.hidden = name !== "library";
    el.import.hidden = name !== "import";
    el.settings.hidden = name !== "settings";
    el.editor.hidden = name !== "editor";
    el.navLibrary.classList.toggle("active", name === "library");
    el.navImport.classList.toggle("active", name === "import");
    el.navSettings.classList.toggle("active", name === "settings");
  }
  function toast(message, kind = "info") {
    el.toast.textContent = message;
    el.toast.className = `toast toast-${kind}`;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, 6e3);
  }
  function updateDirty() {
    el.dirtyFlag.hidden = !store.isDirty();
  }
  function pushSnapshot() {
    if (!session) return;
    undo.push(store.snapshot());
    updateUndoButtons();
  }
  function applySnapshot(snap) {
    if (store.getCurrentPage() !== snap.page) store.setCurrentPage(snap.page);
    store.restore(snap);
    const page = store.getPage();
    const ids = new Set(page.items.map((i) => i.id));
    session.selection = new Set([...session.selection].filter((id) => ids.has(id)));
    stage.setSelected(session.selection);
    updateUndoButtons();
  }
  function doUndo() {
    if (!session) return;
    const snap = undo.undo(store.snapshot());
    if (snap) applySnapshot(snap);
  }
  function doRedo() {
    if (!session) return;
    const snap = undo.redo(store.snapshot());
    if (snap) applySnapshot(snap);
  }
  function updateUndoButtons() {
    const undoTarget = el.toolbar.querySelector(".undo");
    const redoTarget = el.toolbar.querySelector(".redo");
    if (undoTarget) undoTarget.disabled = !undo.canUndo();
    if (redoTarget) redoTarget.disabled = !undo.canRedo();
  }
  function handleSelect(id, { additive } = {}) {
    if (!session) return;
    if (!id) session.selection.clear();
    else if (additive) {
      if (session.selection.has(id)) session.selection.delete(id);
      else session.selection.add(id);
    } else {
      session.selection = /* @__PURE__ */ new Set([id]);
    }
    stage.setSelected(session.selection);
    renderInspectorPanel();
  }
  function shapeFor(item, box) {
    return item && item.points ? remapPoints(item.points, item.box, box) : void 0;
  }
  function handleAdd(kind, box, points) {
    if (!session) return;
    pushSnapshot();
    const at = session.caret;
    const id = store.addItem(kind, box, at, points);
    const page = store.getPage();
    const pruned = pruneWesternPanels(page, store.getType());
    if (pruned !== page) {
      const keep = new Set(pruned.items.map((i) => i.id));
      store.removeItems(page.items.filter((i) => !keep.has(i.id)).map((i) => i.id));
    }
    session.caret = store.getPage().order.indexOf(id) + 1;
    session.selection = /* @__PURE__ */ new Set([id]);
    stage.setSelected(session.selection);
    renderInspectorPanel();
  }
  function handleUpdateBox(id, box) {
    const page = store.getPage();
    const item = page && page.items.find((i) => i.id === id);
    store.updateItem(id, box, shapeFor(item, box));
  }
  function handleBeginEdit() {
    pushSnapshot();
  }
  function handleSetNumber(id, number) {
    if (!session) return;
    pushSnapshot();
    store.moveItem(id, number - 1);
  }
  function setMode(mode) {
    if (!session) return;
    session.mode = mode;
    stage.setMode(mode);
    for (const btn of el.toolbar.querySelectorAll(".mode-btn")) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    }
  }
  function nudgeSelection(dx, dy, step) {
    const page = store.getPage();
    if (!session || !page || !session.selection.size) return;
    pushSnapshot();
    for (const id of session.selection) {
      const item = page.items.find((i) => i.id === id);
      if (item) {
        const box = translateBox(item.box, dx * step, dy * step, page, { clamp: false });
        store.updateItem(id, box, shapeFor(item, box));
      }
    }
  }
  function deleteSelection() {
    if (!session || !session.selection.size) return;
    pushSnapshot();
    store.removeItems([...session.selection]);
    session.selection.clear();
    stage.setSelected(session.selection);
    renderInspectorPanel();
  }
  function autoSort() {
    const page = store.getPage();
    if (!page || !page.items.length) return;
    pushSnapshot();
    const panels = page.items.filter((i) => i.kind === "panel").map((i) => i.box);
    const bubbles = page.items.filter((i) => i.kind === "bubble").map((i) => i.box);
    const grouped = geometryOrder(panels, bubbles, store.getType());
    const byKey = new Map(page.items.map((i) => [boxKey(i.box), i.id]));
    const next = [];
    for (const entry of grouped) {
      const id = byKey.get(boxKey(entry.box));
      if (id && !next.includes(id)) next.push(id);
    }
    for (const item of page.items) if (!next.includes(item.id)) next.push(item.id);
    store.setOrder(next);
  }
  function renderAll() {
    if (!session || !stage) return;
    const page = store.getPage();
    if (page) {
      const width = page.width || 1e3;
      const height = page.height || 1500;
      stage.setPage({ width, height, type: store.getType(), items: page.items, order: page.order });
      stage.setSelected(session.selection);
    }
    renderOrder();
    renderInspectorPanel();
    updateDirty();
  }
  function renderOrder() {
    const page = store.getPage();
    renderOrderPanel(el.orderPanel, {
      order: page ? page.order : [],
      items: page ? page.items : [],
      caret: session && session.caret >= 0 ? session.caret : null,
      onSelect: handleSelect,
      onMove: (id, delta) => {
        pushSnapshot();
        store.moveItemBy(id, delta);
      },
      onDrop: (id, toIndex) => {
        pushSnapshot();
        store.moveItem(id, toIndex);
      },
      onSetNumber: handleSetNumber,
      onSetCaret: (index) => {
        if (session) session.caret = index;
        renderOrder();
      }
    });
  }
  function renderInspectorPanel() {
    const page = store.getPage();
    const ids = session ? [...session.selection] : [];
    const item = page && ids.length === 1 ? page.items.find((i) => i.id === ids[0]) : null;
    const badge = item && page ? page.order.indexOf(item.id) + 1 : null;
    renderInspector(el.inspector, {
      item,
      badge,
      onBoxChange: (box) => {
        if (!item) return;
        pushSnapshot();
        store.updateItem(item.id, box, shapeFor(item, box));
      },
      onDelete: deleteSelection
    });
  }
  function renderPageList() {
    el.pageList.textContent = "";
    const head = document.createElement("div");
    head.className = "pane-head";
    head.textContent = `Pages (${session.pageNames.length})`;
    el.pageList.appendChild(head);
    session.pageNames.forEach((name, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-btn" + (name === store.getCurrentPage() ? " current" : "");
      const page = store.getPage(name);
      const count = page ? page.items.length : 0;
      btn.textContent = `${index + 1}. ${name} (${count})`;
      btn.addEventListener("click", () => showPage(name));
      el.pageList.appendChild(btn);
    });
  }
  function fitView(page) {
    const viewportWidth = el.stageContainer.clientWidth || 1e3;
    const scale = Math.min(1.5, fitWidthScale(viewportWidth - 24, page.width || 1e3));
    stage.setView({ scale, offsetX: 12, offsetY: 12 });
  }
  function showPage(name) {
    store.setCurrentPage(name);
    const page = store.getPage();
    stage.setImage(api.pageImageUrl(session.comicId, name));
    fitView(page);
    renderPageList();
    renderAll();
  }
  function buildToolbar() {
    el.toolbar.textContent = "";
    const title = document.createElement("div");
    title.className = "editor-title";
    const c = session.comic || {};
    title.textContent = c.series ? `${c.series} \u2014 ${c.name}` : c.name || session.comicId;
    const typeChip = document.createElement("span");
    typeChip.className = `chip type-${store.getType()}`;
    typeChip.textContent = store.getType();
    title.appendChild(typeChip);
    const modes = document.createElement("div");
    modes.className = "mode-group";
    const modeDefs = [
      ["select", "Select"],
      ["panel", "Draw panel"],
      ["bubble", "Draw bubble"],
      ["panel-free", "Free-draw panel"],
      ["bubble-free", "Free-draw bubble"]
    ].filter(([mode]) => store.getType() !== "western" || !mode.startsWith("panel"));
    for (const [mode, label] of modeDefs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mode-btn";
      btn.dataset.mode = mode;
      btn.textContent = label;
      if (mode === "select") btn.classList.add("active");
      btn.addEventListener("click", () => setMode(mode));
      modes.appendChild(btn);
    }
    const actions = document.createElement("div");
    actions.className = "action-group";
    const make = (cls, label, onClick, titleText) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = cls;
      btn.textContent = label;
      if (titleText) btn.title = titleText;
      btn.addEventListener("click", onClick);
      return btn;
    };
    actions.append(
      make("undo", "Undo", doUndo),
      make("redo", "Redo", doRedo),
      make("autosort", "Re-sort by geometry", autoSort),
      make("save", "Save", save),
      make("export", "Export", () => window.open(api.exportUrl(session.comicId), "_blank")),
      make("reset", "Reset sidecar", resetSidecar),
      make("back", "\u2190 Library", () => {
        if (confirmLeave()) showView("library");
      })
    );
    el.toolbar.append(title, modes, actions);
    updateUndoButtons();
  }
  async function save() {
    if (!session) return;
    const pages = {};
    for (const [name, page] of Object.entries(store.getDoc().pages)) {
      pages[name] = {
        width: page.width,
        height: page.height,
        items: page.items.map((i) => {
          const out = { id: i.id, kind: i.kind, box: i.box.map(Math.round) };
          if (i.points) out.points = i.points.map(([x, y]) => [Math.round(x), Math.round(y)]);
          return out;
        }),
        order: [...page.order]
      };
    }
    try {
      const res = await api.saveGuided(session.comicId, {
        comicId: store.getComicId(),
        type: store.getType(),
        pages
      });
      store.markSaved();
      toast(`Saved. Backup: ${res.backupPath || "(none)"}`, "info");
      for (const warning of res.warnings || []) toast(warning, "warn");
    } catch (err) {
      toast(`Save failed: ${err.message}`, "error");
    }
  }
  async function resetSidecar() {
    if (!session) return;
    if (!window.confirm("Delete the guided-view sidecar for this comic? (a backup is kept)")) return;
    try {
      await api.resetGuided(session.comicId);
      toast("Sidecar removed (backup kept).", "info");
      await openComic(session.comicId);
    } catch (err) {
      toast(`Reset failed: ${err.message}`, "error");
    }
  }
  function ensureStage() {
    if (stage) return;
    stage = createStage(el.stageContainer, {
      onAdd: handleAdd,
      onSelect: handleSelect,
      onUpdateBox: handleUpdateBox,
      onBeginEdit: handleBeginEdit,
      onEditNumber: handleSetNumber
    });
    stage.imgEl.addEventListener("load", () => {
      const page = store.getPage();
      if (page && (!page.width || !page.height) && stage.imgEl.naturalWidth) {
        page.width = stage.imgEl.naturalWidth;
        page.height = stage.imgEl.naturalHeight;
        renderAll();
      }
    });
    window.addEventListener("resize", () => {
      const page = store.getPage();
      if (session && page) fitView(page);
    });
  }
  async function openComic(id) {
    try {
      const [doc, info] = await Promise.all([api.guided(id), api.getComic(id)]);
      ensureStage();
      session = {
        comicId: id,
        comic: info.comic,
        pageNames: Object.keys(doc.pages),
        selection: /* @__PURE__ */ new Set(),
        caret: -1,
        mode: "select"
      };
      store.load({ comicId: doc.comicId, type: doc.type, pages: doc.pages });
      undo.clear();
      stage.setMode("select");
      showView("editor");
      buildToolbar();
      showPage(store.getCurrentPage());
      if (doc.warnings && doc.warnings.length) {
        toast(`${doc.warnings.length} normalization warning(s) on load \u2014 first: ${doc.warnings[0]}`, "warn");
      }
    } catch (err) {
      toast(`Open failed: ${err.message}`, "error");
    }
  }
  function confirmLeave() {
    return !store.isDirty() || window.confirm("Discard unsaved changes?");
  }
  function boot() {
    createLibraryView(el.library, {
      api,
      onOpen: openComic,
      onExport: (id) => window.open(api.exportUrl(id), "_blank")
    });
    createImportView(el.import, { api, onOpenEditor: openComic });
    const settingsView = createSettingsView(el.settings, { api });
    el.navLibrary.addEventListener("click", () => {
      if (confirmLeave()) showView("library");
    });
    el.navImport.addEventListener("click", () => {
      if (confirmLeave()) showView("import");
    });
    el.navSettings.addEventListener("click", () => {
      if (!confirmLeave()) return;
      showView("settings");
      settingsView.refresh();
    });
    attachKeyboard(document.body, {
      onNudge: nudgeSelection,
      onDelete: () => {
        if (stage && stage.isFreeDrawing()) stage.popFreeVertex();
        else deleteSelection();
      },
      onEnter: () => {
        if (stage && stage.isFreeDrawing()) stage.closeFreeDraw();
      },
      onUndo: doUndo,
      onRedo: doRedo,
      onEscape: () => {
        if (stage && stage.isFreeDrawing()) {
          stage.cancelFreeDraw();
          return;
        }
        if (!session) return;
        setMode("select");
        session.selection.clear();
        stage.setSelected(session.selection);
        renderInspectorPanel();
      }
    });
    store.onChange(() => {
      if (session) renderAll();
    });
    window.addEventListener("beforeunload", (e) => {
      if (store.isDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    showView("library");
  }
  boot();
})();
//# sourceMappingURL=app.js.map
