# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step or package manager. Serve the root directory over HTTP (required because `app.js` uses `fetch()` to load the `maps/*.md` files — `file://` won't work):

```bash
python3 -m http.server 8080
# or
npx serve .
```

Then open `http://localhost:8080`.

## Cache-Busting

`index.html` pins `app.js` and `styles.css` with `?v=N` query strings. **Bump the version number** in `index.html` whenever you edit either file, otherwise browsers may serve stale cached versions:

```html
<link rel="stylesheet" href="styles.css?v=9" />   <!-- bump when styles.css changes -->
<script src="app.js?v=8"></script>                 <!-- bump when app.js changes -->
```

## Architecture

The entire app is three files with no dependencies or framework:

- **`index.html`** — Static shell. Layout: CSS Grid with header (`.hd`), sidebar (`.sb`), canvas stage (`.stg`), and footer (`.foot`). Also holds the `__TWEAK_DEFAULTS` script block used for the embedded edit-mode API.
- **`app.js`** — All logic (~850 lines, vanilla JS). Sections are clearly delimited with banner comments.
- **`styles.css`** — All styles (~1150 lines). Uses CSS custom properties for theming.

### Data Flow

1. On init, `loadAllMaps()` fetches each `maps/*.md` file and calls `parseMarkdown()` to build a node tree, then `layoutTree()` to assign `x/y` positions.
2. If `localStorage` already has saved state under key `tdr-mindmap-v4`, that takes precedence over the `.md` files (so user edits survive reload).
3. Any mutation calls `pushHistory()` (snapshot to undo stack), modifies `state.trees`, then calls `renderStage()` + `saveState()`.
4. `renderStage()` does a **full DOM rebuild** on every call — it clears `.stg__viewport`, then walks the active tree to emit SVG `<path>` edges and `.node` div elements.

### State Shape

```js
state = {
  trees:     { [catId]: rootNode },   // parsed + positioned node trees
  meta:      { [catId]: { count, depth } },
  views:     { [catId]: { x, y, k } }, // pan/zoom per category
  active:    "ZBRUSH",                 // currently displayed category
  selected:  nodeId | null,
  theme:     "light" | "dark",
  accent:    "lime" | "yellow" | "pink" | "orange" | "ink",
  nodeStyle: "block" | "minimal",
  showCoords: bool,
  twPos:     { right, bottom } | { left, top }, // tweaks panel position
}
```

### Node Object Shape

```js
{
  id: string,       // "n_root" for root, "n_<random>" for added nodes, "n_<counter>" for parsed nodes
  title: string,
  url: string | null,
  notes: string[],  // max 3 entries, from markdown bullet lines under the heading
  children: node[],
  level: number,    // heading depth from markdown (1–6)
  _open: bool,      // collapse state
  x: number,        // absolute canvas position (set by layoutTree)
  y: number,
  thumb?: string,   // data URL for attached image (block mode, lvl-1 only)
}
```

### Layout Algorithm

`layoutTree()` uses a simple tidy-tree approach: leaf nodes get sequential row indices, parents center vertically between their first and last child. Constants: `COL = 280` (horizontal gap per depth level), `ROW = 64` (vertical gap between leaves). Positions are snapped to a `SNAP = 8` grid.

## Map Files (`maps/*.md`)

Each `.md` file defines one mindmap category. Format (also documented in the comment block at the top of each file):

```
# Root node title          ← exactly one H1, becomes the root
## Level-1 child
### Level-2 child
- Bullet line              ← becomes a note on the preceding heading node (max 3)
[Label](url)               ← can be embedded in any heading to attach a URL
```

Comments (`<!-- ... -->`) are stripped before parsing. Leading decorations like `■`, `1.` are stripped from heading text.

**To add a new category**, add an entry to the `CATEGORIES` array at the top of `app.js` and create the corresponding `.md` file under `maps/`.

## Theming

CSS custom properties on `:root` / `[data-theme="dark"]` control all colors. The accent color is set dynamically via JS:

```js
document.documentElement.style.setProperty("--acc", ACCENTS[state.accent]);
```

The `ACCENTS` map in `app.js` holds the five accent hex values. To add an accent, extend that map and add a swatch button in `makeSwatch()`.

## External Edit-Mode API

The app communicates with a parent frame via `window.postMessage`:
- Receives `__activate_edit_mode` → opens TWEAKS panel
- Receives `__deactivate_edit_mode` → closes TWEAKS panel  
- Sends `__edit_mode_available` on init
- Sends `__edit_mode_dismissed` when TWEAKS is closed

Default tweak values can be baked into `index.html` via the `__TWEAK_DEFAULTS` script block (the `/*EDITMODE-BEGIN*/` / `/*EDITMODE-END*/` markers are used by an external bundler).

## `_済/` Directory

Archive folder (`済` = "done" in Japanese) for superseded versions. `zbrush-mindmap.html` is the standalone predecessor to the current multi-category app.
