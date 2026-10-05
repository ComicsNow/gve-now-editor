# GVE Now! — User & Developer Wiki

An instructional companion to the [README](../README.md). The README covers
install and ops; this wiki explains **what the app does, how to use it, and how
it works inside**. Start at [Concepts](#concepts) if you're new.

**Contents**

- [Concepts](#concepts) — guided view, sidecars, comics-now, manga vs western
- [The big picture](#the-big-picture) — how the pieces fit together
- [Using the app](#using-the-app)
  - [Library](#library) · [The editor](#the-editor) · [Import](#import) ·
    [Export](#export) · [Settings](#settings)
- [Keyboard & mouse reference](#keyboard--mouse-reference)
- [The sidecar data model](#the-sidecar-data-model)
- [How saving works](#how-saving-works) — merge, regeneration, backups
- [The HTTP API](#the-http-api)
- [Developer guide](#developer-guide) — layout, build, tests
- [Troubleshooting](#troubleshooting)

---

## Concepts

**comics-now** is a separate comic reader app. It keeps a SQLite library
database (`comics`), a library of `.cbz` archives, and a cache of transcoded
WebP page images. GVE Now! is a *companion* to it — it reads the same database
and library and writes files comics-now consumes. It never ships its own
library; it points at an existing comics-now install (`comicsNowRoot`).

**Guided view** is the "step through the page one panel/bubble at a time"
reading mode. For it to work, each page needs to know *where* the panels and
speech bubbles are and *in what order* the reader should visit them.

**A sidecar** is the JSON file that stores that information for one comic. One
comic → one sidecar, named `<comicId>.json`, living in
`comicsNowRoot/guided-view/`. The reader loads it; GVE Now! is the tool for
authoring and fixing it.

**manga vs western** is the sidecar's `type`. It changes reading direction and,
more importantly, how the app derives reading order (see
[the data model](#the-sidecar-data-model)):

- **western** — the reader steps **bubbles** when a page has them; panels are
  only detector scaffold used to order the dialogue and are dropped the moment a
  page gains a bubble. On a page with no bubbles, the reader steps the panels.
- **manga** — the reader steps a single flattened sequence of panels *and*
  bubbles interleaved, right-to-left.

A comic's type defaults from its comics-now "manga mode", but the sidecar's own
`type` wins once set.

---

## The big picture

```
                    comics-now install (comicsNowRoot)
                    ├── comics.db        ← library + guidedViewStatus (read)
                    ├── library/*.cbz    ← page images (read)
                    ├── guided-view/     ← sidecars (read + WRITE)
                    │   └── backups/     ← timestamped pre-save copies
                    └── page-cache/      ← shared WebP cache (read + WRITE)
                              ▲
                              │ reads DB & archives, writes sidecars
                    ┌─────────┴──────────┐
                    │   GVE Now! server  │  Express, port 3100
                    └─────────┬──────────┘
                              │ REST + static bundle
                    ┌─────────┴──────────┐
                    │  Web UI (app.js)   │  Library / Editor / Import / Settings
                    └────────────────────┘
```

The server is read-mostly against comics-now: it only ever *writes* sidecars
(and their backups) and the shared page-cache. It never modifies the library
database rows except flipping a comic's `guidedViewStatus` between `pending`
and `completed` when you save or reset a sidecar.

---

## Using the app

Open `http://<host>:3100/`. The top bar switches between the four views.
Leaving a view (or the editor) with unsaved edits prompts you first.

### Library

The landing view. Search by series or file name, and page through results
(50 per page).

- **Only comics with guided view** is ticked by default — it filters to comics
  the reader already steps (`guidedViewStatus = completed`), because the editor
  usually works on *existing* data. Untick it to see the whole library.
- Each row shows a **status chip** (`completed` / `pending` / …) and a **manga**
  chip when the comic reads right-to-left.
- **Edit** opens the comic in the editor. **Export** downloads its sidecar as a
  portable file (disabled when there's no sidecar).

### The editor

Four panes, left to right:

| Pane | What it is |
| --- | --- |
| **Page list** | Every page in the archive, with its item count. Click to switch pages. |
| **Stage** | The page image with panel/bubble boxes drawn on top. Where you work. |
| **Order panel** | The reading order as a draggable, numbered list. |
| **Inspector** | The selected item's kind, exact box coordinates, and reading-order number. |

The toolbar holds the comic title + a **type chip**, the **mode buttons**, and
the **actions**.

**Modes** (how a press on the stage behaves):

- **Select** — click to select, drag to move, drag a handle to resize, drag
  empty space to pan. Shift-click toggles items into a multi-selection.
- **Draw panel / Draw bubble** — drag a rectangle to add a box of that kind.
- **Free-draw panel / Free-draw bubble** — click to drop polygon vertices;
  click the first vertex (or press Enter) to close. The stored box is the
  polygon's bounding box, with the vertices kept alongside so the shape
  persists. Backspace drops the last vertex; Escape cancels.

> Western comics never author panels, so the panel modes are hidden for them.

New boxes are inserted at the **caret** — the insertion point in the order
panel. Click between two order rows to move the caret there; new items land at
that position instead of the end.

**Setting the reading order:**

- Drag rows in the order panel, or use the per-row up/down controls.
- Type a number directly into an order-row badge, or into an on-page badge, to
  jump that item to that 1-based position.
- **Re-sort by geometry** rebuilds the order from the boxes' positions using the
  same top-to-bottom / reading-direction heuristic the detector uses — a good
  starting point you then hand-tune.

**Actions:** Undo / Redo (unlimited within a session), Re-sort by geometry,
**Save**, **Export**, **Reset sidecar** (deletes the sidecar — a backup is kept
— and marks the comic `pending`), and **← Library**.

The `● unsaved changes` flag in the top bar tracks dirty state; the browser also
warns before you close the tab with unsaved work.

### Import

Bring guided-view data authored elsewhere (another install, an older export)
into a comic here.

1. **Pick an export file** (`.json`). The app scores it against your whole
   library and lists the best candidates, each with a match **score** and a
   **breakdown** (series / number / year / pageCount / fileName). An exact
   source-comic-id match scores 1.0 and is labelled *source id match*.
2. **Confirm the target** — accept the top candidate or use **Choose a different
   comic** to search and score an arbitrary comic manually.
3. **Pick a mode:**
   - **attach** — keep the comic's other pages; only the pages the import covers
     are written.
   - **replace** — wipe the comic's existing sidecar pages first, then write.
4. **Apply import.** You get a summary of how pages were matched to the target
   archive (exact / case-insensitive / basename / positional / dropped / …) plus
   the backup and sidecar paths, and a button to open the result in the editor.

Page matching is by entry name with a positional fallback, and boxes are scaled
to the target page dimensions when they differ.

### Export

**Export** (from a library row or the editor toolbar) downloads the comic's
sidecar as a portable JSON file — the same format Import consumes. The file name
derives from the comic name, and non-ASCII names are handled via RFC 5987
`Content-Disposition`. Exporting a comic with no sidecar is a 404.

### Settings

Reads and edits `config.json` live. The one guard worth knowing: the UI
**refuses to change `comicsNowRoot` while a custom path pin is present** (an
explicit `dbPath`/`guidedViewDir`/etc. in the config), and drops stale pins
automatically, so the derived paths can't silently disagree with the root.

Changing settings rewrites `config.json`; the running server must be restarted
to pick up most changes (`sudo systemctl restart gve-now`).

---

## Keyboard & mouse reference

Keys are ignored while typing in an input/textarea/select.

| Key | Action |
| --- | --- |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` | Redo |
| Arrow keys | Nudge selection 1px |
| `Shift` + Arrow | Nudge selection 10px |
| `Delete` / `Backspace` | Delete selection (or drop last vertex while free-drawing) |
| `Enter` | Close the current free-draw polygon |
| `Escape` | Cancel free-draw; otherwise drop to Select mode and clear selection |

| Mouse (stage) | Action |
| --- | --- |
| Click box | Select it |
| Shift-click box | Toggle it in/out of the selection |
| Drag box | Move it |
| Drag a handle | Resize it |
| Drag empty space (select mode) | Pan |
| Drag (draw mode) | Create a box |
| `Ctrl` + wheel / trackpad pinch | Zoom at the cursor |
| Plain wheel / two-finger scroll | Pan |

Borders, handles, and badges stay a constant screen size at any zoom.

---

## The sidecar data model

A sidecar on disk looks like:

```json
{
  "comicId": "abc123",
  "type": "western",
  "pages": {
    "page-001.jpg": {
      "panels":  [[x, y, w, h], ...],
      "bubbles": [[x, y, w, h], ...],
      "sequence":[[x, y, w, h], ...],
      "panelPoints":  [[[x,y],...] | null, ...],
      "bubblePoints": [[[x,y],...] | null, ...]
    }
  }
}
```

- Boxes are `[x, y, w, h]` in **absolute integer pixels, top-left origin**.
- **`sequence`** encodes reading order as a list of boxes. The reader steps it
  in order. By convention it is:
  - **manga** → the full panels+bubbles interleave;
  - **western** → the bubbles when the page has any, else the panels.
- **`panelPoints` / `bubblePoints`** are parallel arrays of free-draw polygon
  vertices (or `null` for plain rectangles). They are emitted **only** when a
  page actually has a polygon, so rect-only pages stay byte-identical to the
  pre-free-draw format. The reader still zooms the bounding box; the vertices are
  for faithful shape rendering.

**Inside the editor**, a page is instead `{ width, height, items[], order[] }`
where each item is `{ id, kind: 'panel'|'bubble', box, points? }` and `order` is
a permutation of item ids. The server translates between the two shapes:

- **Load** (`GET …/guided`) *normalizes* the sidecar into editor items and a
  display order, surfacing warnings (e.g. `no-sequence`, `dropped-sequence-boxes`,
  `appended-items`, `bare-array`).
- **Save** (`PUT …/guided`) *regenerates* changed pages back into the canonical
  `panels`/`bubbles`/`sequence` shape.

**Why this translation is careful:** legacy sidecars come in several historical
shapes (bare arrays, raw-mixed manga panels, spread-object sequences). Manga
pages without an explicit editor-written bubble list are split into panels vs
bubbles using the legacy heuristic (a box is a bubble when ≥70% of its area sits
inside another box) so the editor matches what the reader actually does.

---

## How saving works

Saving is deliberately conservative so it never silently reshuffles
reader-visible data:

1. The document is **validated** server-side. Structural problems (bad type,
   missing ids, duplicate ids, non-array `order`, a box that isn't four finite
   numbers, non-positive size, an `order` that isn't a permutation of the ids)
   are **errors** → `400`, nothing is written. Out-of-bounds boxes are only
   **warnings** (real sidecars legitimately contain e.g. `y = -22`).
2. The existing sidecar is loaded and the submitted pages are **merged** page by
   page:
   - A page **not present** in the submitted document is kept **verbatim**.
   - A submitted page is compared to the normalized original by a content
     *signature* (kind + box + shape in order). **Unchanged → kept verbatim;
     changed → regenerated** canonically. New pages are regenerated.
   - This is why re-saving a comic you only looked at doesn't churn its file.
3. A **timestamped backup** is written to `guided-view/backups/` before the new
   file lands, old backups are pruned, and the comic is flipped to
   `guidedViewStatus = completed`.

**Reset** (`POST …/guided/reset`) backs up, deletes the sidecar, and flips the
comic back to `pending`.

**Import apply** follows the same backup-then-write discipline; `attach` merges,
`replace` is a full regeneration.

---

## The HTTP API

All JSON. Base path `/api`. The web UI uses nothing the API doesn't expose.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness + app version |
| `GET /api/comics?q=&status=&limit=&offset=` | Search/paginate the library. `limit` 1–100, `offset` ≥0 — bad values give `400`, not `500`. Returns `{comics, total, limit, offset}` |
| `GET /api/comics/:id` | One comic + resolved manga mode |
| `GET /api/comics/:id/pages` | Page names + dimensions + sidecar type |
| `GET /api/comics/:id/page-image?page=` | Page image bytes (full-res WebP from the shared cache when available, original archive bytes otherwise). ETag + `304` support |
| `GET /api/comics/:id/guided` | Normalized editor document + warnings |
| `PUT /api/comics/:id/guided` | Validate + merge-save the editor document |
| `POST /api/comics/:id/guided/reset` | Backup + delete the sidecar |
| `GET /api/comics/:id/export` | Download the portable export file |
| `POST /api/import/score` | Rank the whole library against an export file |
| `POST /api/import/score-against` | Score an export file against one comic |
| `POST /api/import/apply` | Apply an import (`mode: attach \| replace`) |
| `GET /api/settings` | Read resolved config |
| `PUT /api/settings` | Rewrite `config.json` (with the root-pin guard) |

The JSON body limit is 50 MB (import files carry full box data). A malformed
body yields `{ error: 'invalid JSON body' }` with `400`.

---

## Developer guide

**Layout:**

```
bin/gve-now.js         CLI — `check` preflight (resolve config, census, no listen)
server.js              Entry point — load config, open DB, build app, listen
src/server/
  app.js               Express wiring (routers + error handler)
  config.js            Config load/validate + path derivation from comicsNowRoot
  db.js                better-sqlite3 open + guidedViewStatus writes
  comics-repo.js       searchComics / countComics / manga-mode resolver
  archive.js           .cbz entry listing + buffer reads (yauzl)
  page-webp.js         WebP transcode via ffmpeg + shared cache
  page-dims.js         Image dimension probing
  match.js             Import candidate scoring (weighted identity)
  page-map.js          Map import pages onto a target archive
  check.js             Preflight report builder
  routes/              One router per resource (comics, guided, import, export, settings, health)
src/shared/            Code shared by server and browser (sidecar, box, numbering,
                       reading-order, similarity, export-file) — pure, no I/O
src/web/               Browser app, bundled by esbuild into public/app.js
  main.js              App shell: view switching + editor orchestration
  api.js               fetch wrappers
  editor/              store, undo, stage, overlay, interact, view-math,
                       inspector, order-panel, keyboard, badge-edit
  library-view.js import-view.js settings-view.js
public/                index.html, styles.css, and the committed bundle
```

**The shared layer is the invariant core.** `src/shared/*` is pure (no I/O) and
is exercised by both the server and the browser; the hairy guided-view semantics
live in `sidecar.js` and have the densest tests. Change behaviour there, not in
the routes or the UI.

**Build & run:**

```bash
npm ci                     # install
node bin/gve-now.js check  # preflight — resolves config, prints a census, never writes
npm start                  # run the server
npm run build:web          # rebuild public/app.js after editing src/web/**
npm run build:web:watch    # rebuild on change
```

The bundle (`public/app.js`) **is committed** so a fresh clone serves a working
UI with no build step. The server logs a startup warning if the bundle is
missing. After touching anything under `src/web`, rebuild and commit the bundle.

**Tests:**

```bash
npm test          # full Jest suite (server + shared + jsdom web + integration)
npm run test:watch
```

Tests mirror `src/` under `tests/` (`tests/server`, `tests/shared`,
`tests/web`, `tests/integration`). Web tests run in jsdom; integration tests
boot the real Express app against a temp DB and fixture CBZs. There's a bundle
integration test that guards the committed `app.js`.

---

## Troubleshooting

- **Fresh clone shows a blank UI** — the bundle is missing or stale. Run
  `npm run build:web`. (A committed bundle should prevent this.)
- **Server refuses to start on a non-loopback address** — binding anything but
  `127.0.0.1` requires `GVE_NOW_ALLOW_REMOTE=1`. This is a deliberate guard:
  the app has no auth and can rewrite reader content. See the README's Security
  section.
- **`node bin/gve-now.js check` says the database is UNREADABLE** — `dbPath` (or
  the `comicsNowRoot` it derives from) is wrong, or comics-now hasn't created
  the DB yet. The check prints the resolved paths.
- **Guided view dir "not created yet"** — comics-now creates `guided-view/` on
  first detection; it's harmless on a brand-new install.
- **`orphans` / `missing files` in the check report** — orphans are sidecars
  with no matching comics row; missing are `completed` rows whose sidecar file is
  gone. Both are informational.
- **Save returns `400`** — a structural validation error (see
  [How saving works](#how-saving-works)); the response lists each problem.
  Out-of-bounds boxes don't block a save, they come back as warnings.
- **Normalization warnings on open** — the sidecar had a legacy/odd shape
  (`no-sequence`, `dropped-sequence-boxes`, `appended-items`, `bare-array`). The
  editor shows its best interpretation; saving rewrites the page canonically.
- **Settings won't let me change the comics-now root** — a custom path pin is
  present in `config.json`. Remove the explicit `dbPath`/`guidedViewDir`/etc. so
  the paths derive from the root, then change the root.
- **Port already in use** — the server exits with a clear error. Stop whatever
  holds the port, or set a different `port` in `config.json`.
