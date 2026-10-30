/* =========================================================
   tDR-INSPIRED MINDMAP — APP  (build v8)
   - per-category view state
   - undo/redo
   - collapse toggle
   - draggable tweaks panel
   - layout-only reset
   - high-DPI zoom (no pixelation)
   ========================================================= */

window.CATEGORIES = [
  { id: "ZBRUSH",       file: "data/ZBRUSH.md",       label: "ZBRUSH",        sub: "FLEE / ANIMATION",       jp: "" },
  { id: "3dsmax",       file: "data/3dsmax.md",       label: "3DS · MAX",     sub: "MODEL / LAYOUT / RIG",   jp: "" },
  { id: "design",       file: "data/design.md",       label: "DESIGN",        sub: "SHAPE / COLOR / MOTION", jp: "" },
  { id: "hud",          file: "data/hud.md",          label: "HUD",           sub: "UI / SCI-FI / SPECS",    jp: "" },
  { id: "music-video",  file: "data/music-video.md",  label: "MUSIC · VIDEO", sub: "AE / 3D / REFERENCE",    jp: "" },
  { id: "prepro",       file: "data/prepro.md",       label: "PRE · PROD",    sub: "CONCEPT / STORYBOARD",   jp: "プリプロダクション" },
];
const CATEGORIES = window.CATEGORIES;
window.state = null;

const STORE_KEY = "tdr-mindmap-v4";
const CUSTOM_CATS_KEY = "tdr-mindmap-custom-cats-v1";
const CAT_ORDER_KEY = "tdr-mindmap-cat-order-v1";
const DEFAULT_LAYOUTS_KEY = "tdr-mindmap-default-layouts-v1";
// new names for built-in / private maps (added categories keep theirs in CUSTOM_CATS_KEY)
const CAT_LABELS_KEY = "tdr-mindmap-cat-labels-v1";
function applyCatLabels() {
  try {
    const o = JSON.parse(localStorage.getItem(CAT_LABELS_KEY) || "{}");
    CATEGORIES.forEach(c => {
      if (c.custom || !o[c.id]) return;
      c.label = o[c.id].label || c.label;
      c.sub = o[c.id].sub ?? c.sub;
      c.renamed = true;
    });
  } catch {}
}
function persistCatLabels() {
  const o = {};
  CATEGORIES.forEach(c => { if (!c.custom && c.renamed) o[c.id] = { label: c.label, sub: c.sub }; });
  return safeSetItem(CAT_LABELS_KEY, JSON.stringify(o));
}

/* Load custom cats + ordering at startup */
function applyCatOrder() {
  try {
    const order = JSON.parse(localStorage.getItem(CAT_ORDER_KEY) || "null");
    if (Array.isArray(order)) {
      const map = new Map(CATEGORIES.map(c => [c.id, c]));
      const reordered = [];
      order.forEach(id => { if (map.has(id)) { reordered.push(map.get(id)); map.delete(id); } });
      map.forEach(c => reordered.push(c));
      CATEGORIES.length = 0;
      reordered.forEach(c => CATEGORIES.push(c));
    }
  } catch {}
}
(function bootstrapCats() {
  try {
    const customs = JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY) || "[]");
    customs.forEach(c => {
      if (!CATEGORIES.find(x => x.id === c.id)) CATEGORIES.push(c);
    });
  } catch {}
  applyCatOrder();
  applyCatLabels();
})();

/* Private maps: data/private/index.json exists only on this PC (never in the public repo),
   so the public site shows no trace of them — not even their names. */
async function loadPrivateCats() {
  let list;
  try {
    const res = await fetch("data/private/index.json", { cache: "no-store" });
    if (!res.ok) return 0;
    list = await res.json();
  } catch { return 0; }
  if (!Array.isArray(list)) return 0;
  let added = 0;
  list.forEach(c => {
    if (!c || !/^[a-z0-9-]+$/.test(c.id || "") || !c.file || CATEGORIES.find(x => x.id === c.id)) return;
    CATEGORIES.push({ id: c.id, file: c.file, label: c.label || c.id.toUpperCase(), sub: c.sub || "", jp: c.jp || "", private: true });
    added++;
  });
  if (added) { applyCatOrder(); applyCatLabels(); }
  return added;
}

/* ---------- markdown parsing ---------- */
function parseMarkdown(md) {
  md = md.replace(/<!--[\s\S]*?-->/g, "");
  const lines = md.split(/\r?\n/);
  let root = null;
  const stack = [];
  let counter = 1;
  const mkId = () => `n_${counter++}`;
  const headRe = /^(#{1,6})\s+(.+)$/;
  const bullRe = /^(\s*)[-*]\s+(.+)$/;
  const numRe = /^(\s*)\d+\.\s+(.+)$/;
  const quoteRe = /^>\s*(.+)$/;
  for (let raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const h = line.match(headRe);
    if (h) {
      const lvl = h[1].length;
      let text = h[2].trim();
      // strip leading "1. " "■ " "1) " decorations from heading text
      text = text.replace(/^[■●◆▪︎▸►]\s*/, "").replace(/^\d+[\.\)]\s*/, "").trim();
      if (!root && lvl === 1) {
        const r = makeNode(text, 0, "n_root");
        r.id = "n_root";
        root = r;
        stack.push(root);
        continue;
      }
      if (!root) {
        root = { id: "n_root", title: "ROOT", url: null, notes: [], children: [], level: 0, _open: true };
        stack.push(root);
      }
      const node = makeNode(text, lvl, mkId());
      while (stack.length && stack[stack.length - 1].level >= lvl) stack.pop();
      const parent = stack[stack.length - 1] || root;
      parent.children.push(node);
      stack.push(node);
      continue;
    }
    const b = line.match(bullRe) || line.match(numRe) || line.match(quoteRe);
    if (b) {
      const text = (b[2] || b[1]).trim();
      const cur = stack[stack.length - 1];
      if (cur && cur.notes.length < 12) cur.notes.push(stripLinks(text));
    }
  }
  if (!root) root = { id: "n_root", title: "ROOT", url: null, notes: [], children: [], level: 0, _open: true };
  return root;
}
function makeNode(text, level, id) {
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/;
  let url = null, title = text;
  const m = text.match(linkRe);
  if (m) { title = m[1]; url = m[2]; }
  title = title.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").trim();
  return { id, title, url, notes: [], children: [], level, _open: true };
}
function stripLinks(text) { return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").trim(); }

/* ---------- layout (tidy tree) ---------- */
function layoutTree(root) {
  const COL = 280, ROW = 64, SNAP = 8;
  let leafCounter = 0;
  function assign(node, depth) {
    node._depth = depth;
    const visKids = (node._open !== false ? (node.children || []) : []);
    if (visKids.length === 0) {
      node._row = leafCounter++;
      return;
    }
    visKids.forEach(c => assign(c, depth + 1));
    const first = visKids[0], last = visKids[visKids.length - 1];
    node._row = (first._row + last._row) / 2;
  }
  assign(root, 0);
  const totalRows = Math.max(1, leafCounter);
  const yCenter = ((totalRows - 1) * ROW) / 2;
  function place(node) {
    node.x = Math.round((node._depth * COL) / SNAP) * SNAP;
    node.y = Math.round((node._row * ROW - yCenter) / SNAP) * SNAP;
    delete node._depth; delete node._row;
    (node.children || []).forEach(place);
  }
  place(root);
}

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "style") e.style.cssText = attrs[k];
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  for (const c of children) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}
function hasJP(s) { return /[\u3000-\u9fff\uff00-\uffef]/.test(s || ""); }
function fmtCoord(x, y) {
  const sign = (n) => (n >= 0 ? "+" : "-") + Math.abs(Math.round(n)).toString().padStart(4, "0");
  return `[ X${sign(x)} · Y${sign(y)} ]`;
}
const OBSIDIAN_VAULT = "Projects";
// "[[Note]]" / "[[folder/Note]]" → obsidian://open?vault=Projects&file=folder%2FNote ; anything else unchanged
function normalizeLink(value) {
  const v = (value || "").trim();
  const m = v.match(/^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/);
  if (!m) return v;
  return "obsidian://open?vault=" + encodeURIComponent(OBSIDIAN_VAULT) + "&file=" + encodeURIComponent(m[1].trim().replace(/\.md$/i, ""));
}
function shortUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol === "obsidian:") return "obsidian · " + (url.searchParams.get("file") || "").split("/").pop().slice(0, 24);
    return url.host.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname.slice(0, 24));
  } catch { return u.slice(0, 28); }
}
function countNodes(root) { let n = 0; (function w(x){ n++; (x.children||[]).forEach(w); })(root); return n; }
function maxDepth(root) { let d=0; (function w(x,l){ d=Math.max(d,l); (x.children||[]).forEach(c=>w(c,l+1));})(root,0); return d; }

/* =========================================================
   STATE  (per-category views)
   ========================================================= */
window.state = {
  trees: {},
  meta: {},
  views: {},          // { catId: {x,y,k} }
  layoutMode: {},     // { catId: "tree" | "free" }
  active: "ZBRUSH",
  selected: null,
  theme: "light",
  showCoords: false,
  nodeStyle: "block",
  density: "auto",
  accent: "yellow",
  snap: true,
  inspector: true,
  twPos: { right: 16, bottom: 48 },
};
const state = window.state;
const ACCENTS = { yellow: "#ffd400", lime: "#c8ff1a", pink: "#ff3da6", orange: "#ff5a1a", ink: "#0a0a0a" };
function getView() {
  if (!state.views[state.active]) state.views[state.active] = { x: 600, y: 400, k: 0.85 };
  return state.views[state.active];
}

const treePos = new Map();
const TREE_GAP_X = 64;
const TREE_GAP_Y = 16;
function isTreeMode() { return state.layoutMode[state.active] === "tree"; }
function posOf(n) {
  if (isTreeMode()) return treePos.get(n.id) || { x: n.x, y: n.y };
  return { x: n.x, y: n.y };
}

/* ---------- BRANCH: show one node and its descendants only (view filter, never saved) ---------- */
let branchFocus = null; // { map, id }
function viewRoot(root) {
  if (!branchFocus || !root) return root;
  const n = branchFocus.map === state.active ? findNodeById(root, branchFocus.id) : null;
  if (!n || n === root) { branchFocus = null; updateBranchUI(); return root; }
  return n;
}
function isInBranch(id) {
  const root = state.trees[state.active];
  const top = viewRoot(root);
  if (top === root) return true;
  return top.id === id || !!findNodeById(top, id);
}
function setBranch(id) {
  const root = state.trees[state.active];
  const n = root && id ? findNodeById(root, id) : null;
  if (!n) { toast("BRANCH · SELECT A NODE"); return false; }
  if (n === root) { clearBranch(); toast("BRANCH · ROOT = WHOLE MAP"); return false; }
  if (n._open === false) n._open = true;
  branchFocus = { map: state.active, id: n.id };
  renderStage();
  updateBranchUI();
  requestAnimationFrame(() => fitView());
  toast("BRANCH · " + (n.title || "NODE").slice(0, 24) + " · ESC / B TO EXIT");
  return true;
}
function clearBranch({ fit = true } = {}) {
  if (!branchFocus) return false;
  const id = branchFocus.id;
  branchFocus = null;
  renderStage();
  updateBranchUI();
  if (fit) requestAnimationFrame(() => { fitView(); if (state.selected === id) focusNode(id); });
  return true;
}
// ← parent / → first child (opens a folded node); stays inside BRANCH
function stepNode(dir) {
  const root = state.trees[state.active];
  const n = root && findNodeById(root, state.selected);
  if (!n) return;
  let next = null;
  if (dir === "parent") {
    if (n === viewRoot(root)) { clearSelection(); return; } // top of the map → back to the category list
    next = findParent(root, n.id);
  } else if (dir === "child") {
    if (!(n.children || []).length) return;
    if (n._open === false) { n._open = true; renderStage(); }
    next = n.children[0];
  } else {
    // same depth, in drawing order (siblings first, then the next branch's node at that depth)
    const top = viewRoot(root);
    const row = [];
    const depth = computeLevel(n, root);
    (function w(x) {
      if (computeLevel(x, root) === depth) row.push(x);
      if (x._open !== false) (x.children || []).forEach(w);
    })(top);
    const i = row.indexOf(n);
    next = row[i + (dir === "next" ? 1 : -1)] || null;
  }
  if (!next) return;
  selectNode(next);
  const card = $(`.node[data-id="${next.id}"]`), stg = $(".stg");
  if (card && stg) {
    const r = card.getBoundingClientRect(), s = stg.getBoundingClientRect();
    if (r.left < s.left + 20 || r.right > s.right - 20 || r.top < s.top + 20 || r.bottom > s.bottom - 20) focusNode(next.id);
  }
}
function clearSelection() {
  state.selected = null;
  linkPartner = null;
  $$(".node.is-selected, .node.is-partner").forEach(x => x.classList.remove("is-selected", "is-partner"));
  markSelectedEdges(null);
  updateCrumbs();
  renderInspector();
}
// Shift+click a second node: the partner for L (relation line)
let linkPartner = null;
function setLinkPartner(id) {
  linkPartner = id;
  $$(".node.is-partner").forEach(x => x.classList.remove("is-partner"));
  if (id) $(`.node[data-id="${id}"]`)?.classList.add("is-partner");
}
function toggleBranch() {
  if (branchFocus && branchFocus.map === state.active) return clearBranch();
  return setBranch(state.selected);
}
function updateBranchUI() {
  const bar = $(".branch-bar");
  const btn = $(".zoom .zbranch");
  const root = state.trees[state.active];
  const n = branchFocus && branchFocus.map === state.active && root ? findNodeById(root, branchFocus.id) : null;
  btn?.classList.toggle("is-on", !!n);
  $(".stg")?.classList.toggle("is-branch", !!n);
  if (!bar) return;
  bar.hidden = !n;
  if (!n) return;
  const path = [];
  let p = findParent(root, n.id);
  while (p) { path.unshift(p.title); p = findParent(root, p.id); }
  bar.replaceChildren(
    el("span", { class: "branch-bar__tag" }, "BRANCH"),
    el("span", { class: "branch-bar__path" }, path.join(" › ") + (path.length ? " › " : "")),
    el("b", { class: "branch-bar__title" }, n.title || "NODE"),
    el("button", { type: "button", class: "branch-bar__x", title: "この枝を Markdown でコピー", onclick: () => copyBranchMD() }, "COPY .MD"),
    el("button", { type: "button", class: "branch-bar__x", onclick: () => clearBranch() }, "× WHOLE MAP"),
  );
}

/* =========================================================
   PERSIST
   ========================================================= */
let saveFailureToastAt = 0;
function setSaveStatus(ok, key, err) {
  const at = Date.now();
  const name = String((err && err.name) || err || "ERROR");
  window.__mindmapSaveStatus = ok ? { ok: true, at } : { ok: false, at, key, error: name };

  const tools = $(".hd__tools");
  let badge = $(".save-error-badge");
  if (!badge && tools) {
    badge = el("div", { class: "save-error-badge", role: "status" });
    tools.appendChild(badge);
  }
  if (badge) {
    badge.textContent = ok ? "" : "SAVE ERROR · " + name;
    badge.hidden = ok;
  }
  const saved = $(".foot > div:nth-child(4)");
  if (saved) saved.hidden = !ok;

  if (ok) {
    saveFailureToastAt = 0;
  } else if (at - saveFailureToastAt >= 5000) {
    saveFailureToastAt = at;
    toast("SAVE FAILED · " + name);
  }
}
/* VIEW ONLY (?readonly): entry points refuse edits, and map data never reaches storage */
const COMBINE_KEY = "tdr-mindmap-combine-v1";
function isReadonly() { return document.body.classList.contains("is-readonly"); }
function blockReadonly() {
  if (!isReadonly()) return false;
  toast("VIEW ONLY · EDITING DISABLED");
  return true;
}
function safeSetItem(key, value) {
  if (isReadonly() && key !== COMBINE_KEY) return true;
  try {
    localStorage.setItem(key, value);
    setSaveStatus(true);
    return true;
  } catch (err) {
    setSaveStatus(false, key, err);
    return false;
  }
}
function saveState() {
  try {
    return safeSetItem(STORE_KEY, JSON.stringify({
      trees: state.trees, views: state.views, active: state.active, layoutMode: state.layoutMode,
      theme: state.theme, showCoords: state.showCoords, nodeStyle: state.nodeStyle, accent: state.accent,
      snap: state.snap, inspector: state.inspector, density: state.density, twPos: state.twPos,
    }));
  } catch (err) {
    setSaveStatus(false, STORE_KEY, err);
    return false;
  }
}
function loadStateRaw() { try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }

/* =========================================================
   UNDO / REDO  (snapshots of trees+views)
   ========================================================= */
const history = { past: [], future: [] };
const HIST_MAX = 60;
let editSession = null;
let inspectorEdit = null;
let inspectorRenderedId = null;
let inspectorCancelBlur = false;
let inspectorRenderingLocked = false;
const editNoteSlots = new Map();
function snapshot() {
  return JSON.stringify({ trees: state.trees, views: state.views, cats: CATEGORIES.map(c => ({ ...c })) });
}
function restoreSnap(s) {
  const o = JSON.parse(s);
  state.trees = o.trees;
  state.views = o.views;
  if (Array.isArray(o.cats)) {
    CATEGORIES.length = 0;
    o.cats.forEach(c => CATEGORIES.push(c));
    safeSetItem(CUSTOM_CATS_KEY, JSON.stringify(CATEGORIES.filter(c => c.custom)));
    safeSetItem(CAT_ORDER_KEY, JSON.stringify(CATEGORIES.map(c => c.id)));
    persistCatLabels();
    if (!CATEGORIES.find(c => c.id === state.active)) { state.active = CATEGORIES[0]?.id; state.selected = null; }
  }
  Object.keys(state.trees).forEach(id => {
    state.meta[id] = { count: countNodes(state.trees[id]), depth: maxDepth(state.trees[id]) };
  });
}
function pushHistory() {
  history.past.push(snapshot());
  if (history.past.length > HIST_MAX) history.past.shift();
  history.future.length = 0;
}
function selectNode(n) {
  state.selected = n.id;
  $$(".node.is-selected").forEach(x => x.classList.remove("is-selected"));
  const node = $(`.node[data-id="${n.id}"]`);
  if (node) node.classList.add("is-selected");
  markSelectedEdges(n);
  updateCrumbs();
  renderInspector();
}
function commitEdit() {
  const edit = editSession;
  if (!edit) return;
  editSession = null;
  const { id, field, noteIdx, before, snap, el: target } = edit;
  const n = findNodeById(state.trees[state.active], id);
  const value = target.textContent.trim();
  if (n) {
    if (field === "title") n.title = value;
    else {
      if (!n.notes) n.notes = [];
      n.notes[noteIdx] = value;
      while (n.notes.length && !n.notes[n.notes.length - 1]) n.notes.pop();
      target.classList.toggle("is-empty", !value);
    }
  }
  editNoteSlots.delete(id);
  target.setAttribute("contenteditable", "false");
  target.closest(".node")?.classList.remove("is-editing");
  if (value !== before) {
    history.past.push(snap);
    if (history.past.length > HIST_MAX) history.past.shift();
    history.future.length = 0;
  }
  saveState();
  if (isTreeMode()) renderStage();
  renderInspector();
}
function cancelEdit() {
  const edit = editSession;
  if (!edit) return;
  editSession = null;
  const { id, field, noteIdx, before, el: target } = edit;
  const n = findNodeById(state.trees[state.active], id);
  if (n) {
    if (field === "title") n.title = before;
    else {
      if (!n.notes) n.notes = [];
      n.notes[noteIdx] = before;
      while (n.notes.length && !n.notes[n.notes.length - 1]) n.notes.pop();
      target.classList.toggle("is-empty", !before);
    }
  }
  editNoteSlots.delete(id);
  target.textContent = before;
  target.setAttribute("contenteditable", "false");
  target.closest(".node")?.classList.remove("is-editing");
  target.blur();
  if (n) selectNode(n);
  saveState();
  if (isTreeMode()) renderStage();
}
function beginEdit(nodeId, field = "title", noteIdx = 0) {
  if (document.body.classList.contains("is-readonly")) return false;
  const n = findNodeById(state.trees[state.active], nodeId);
  if (!n) return false;
  if (editSession) commitEdit();
  let target = field === "title"
    ? $(`.node[data-id="${nodeId}"] .node__title`)
    : $(`.node[data-id="${nodeId}"] [data-note-idx="${noteIdx}"]`);
  if (!target && field === "note" && noteIdx < 3) {
    editNoteSlots.set(nodeId, noteIdx + 1);
    renderStage();
    target = $(`.node[data-id="${nodeId}"] [data-note-idx="${noteIdx}"]`);
  }
  if (!target) return false;
  selectNode(n);
  const before = field === "title" ? n.title : ((n.notes && n.notes[noteIdx]) || "");
  editSession = { id: nodeId, field, noteIdx, before, snap: snapshot(), el: target };
  target.setAttribute("contenteditable", "true");
  target.closest(".node")?.classList.add("is-editing");
  target.classList.remove("is-empty");
  target.focus();
  const range = document.createRange();
  range.selectNodeContents(target);
  if (field === "note") range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}
function undo() {
  if (blockReadonly()) return;
  if (!history.past.length) return;
  const cur = snapshot();
  const prev = history.past.pop();
  history.future.push(cur);
  restoreSnap(prev);
  renderStage(); renderSidebar(); updateCrumbs(); saveState();
  toast("UNDO");
}
function redo() {
  if (blockReadonly()) return;
  if (!history.future.length) return;
  const cur = snapshot();
  const nxt = history.future.pop();
  history.past.push(cur);
  restoreSnap(nxt);
  renderStage(); renderSidebar(); updateCrumbs(); saveState();
  toast("REDO");
}

/* =========================================================
   LOAD MAPS
   ========================================================= */
async function loadAllMaps() {
  await loadPrivateCats();
  const stored = loadStateRaw();
  // Drop any orphaned trees from old/removed categories
  if (stored && stored.trees) {
    const ids = new Set(CATEGORIES.map(c => c.id));
    Object.keys(stored.trees).forEach(k => { if (!ids.has(k)) delete stored.trees[k]; });
  }
  for (const cat of CATEGORIES) {
    if (stored && stored.trees && stored.trees[cat.id]) {
      state.trees[cat.id] = stored.trees[cat.id];
    } else if (cat.file) {
      try {
        const res = await fetch(cat.file);
        const txt = await res.text();
        const root = parseMarkdown(txt);
        layoutTree(root);
        state.trees[cat.id] = root;
      } catch (e) {
        state.trees[cat.id] = { id: "n_root", title: cat.label, url: null, notes: [], children: [], level: 0, _open: true, x: 0, y: 0 };
      }
    } else {
      state.trees[cat.id] = { id: "n_root", title: cat.label, url: null, notes: [], children: [], level: 0, _open: true, x: 0, y: 0 };
    }
    state.meta[cat.id] = { count: countNodes(state.trees[cat.id]), depth: maxDepth(state.trees[cat.id]) };
  }
  if (stored) {
    state.active = stored.active || "ZBRUSH";
    // guard: if saved active no longer matches a registered category, fall back
    if (!CATEGORIES.find(c => c.id === state.active)) state.active = "ZBRUSH";
    state.views = stored.views || {};
    state.layoutMode = stored.layoutMode || {};
    state.theme = (stored.theme === "dark" ? "white" : stored.theme) || "light";
    state.showCoords = !!stored.showCoords;
    state.nodeStyle = stored.nodeStyle || "block";
    state.density = stored.density === "detail" ? "detail" : "auto";
    state.accent = stored.accent || "yellow";
    state.snap = stored.snap !== false;
    state.inspector = stored.inspector !== false;
    state.twPos = stored.twPos || state.twPos;
  }
}

/* =========================================================
   SIDEBAR
   ========================================================= */
function renderSidebar() {
  const list = $(".sb__list");
  list.innerHTML = "";
  CATEGORIES.forEach((cat, i) => {
    const meta = state.meta[cat.id];
    const btn = el("button", {
      class: "cat" + (cat.id === state.active ? " is-active" : ""),
      "data-id": cat.id,
      onclick: () => { state.active = cat.id; state.selected = null; branchFocus = null; updateBranchUI(); renderAll(); },
    },
      el("div", { class: "cat__idx" }, String(i).padStart(2, "0")),
      el("div", { class: "cat__body" },
        el("div", { class: "cat__t" }, cat.label),
        el("div", { class: "cat__sub" }, cat.sub, cat.private ? el("span", { class: "cat__private", title: "このPCだけ・公開版には出ない" }, "PRIVATE") : null),
      ),
      el("div", { class: "cat__meta" },
        el("span", { class: "n" }, "N=" + meta.count),
        el("span", {}, "D" + meta.depth),
      ),
    );
    list.appendChild(btn);
  });
  const foot = $(".sb__foot");
  if (foot) {
    const total = Object.values(state.meta).reduce((s, m) => s + m.count, 0);
    foot.innerHTML = "";
    foot.appendChild(makeFootRow("DOC", "MINDMAP/2026"));
    foot.appendChild(makeFootRow("NODES", "T=" + total));
    foot.appendChild(makeFootRow("REV", "A2 · ISO 216"));
  }
}
function makeFootRow(k, v) {
  return el("div", { class: "row" }, el("span", {}, k), el("span", { class: "v" }, v));
}

/* =========================================================
   STAGE
   ========================================================= */
function updateLayoutControls() {
  const tree = isTreeMode();
  $("#btn-tree")?.classList.toggle("is-on", tree);
  $("#btn-free")?.classList.toggle("is-on", !tree);
  const bake = $("#btn-tree-bake");
  if (bake) bake.hidden = !tree;
}
function updateAllEdges() {
  const root = state.trees[state.active];
  const svg = $(".stg__viewport .edges");
  if (!root || !svg) return;
  $$("path[data-edge-from][data-edge-to]", svg).forEach(path => {
    const a = findNodeById(root, path.getAttribute("data-edge-from"));
    const b = findNodeById(root, path.getAttribute("data-edge-to"));
    if (!a || !b) return;
    const from = posOf(a), to = posOf(b);
    const midX = (from.x + to.x) / 2;
    path.setAttribute("d", `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`);
  });
  window.Relations?.update(svg, root);
}
function recomputeTreeLayout() {
  if (!isTreeMode()) return;
  const root = state.trees[state.active];
  const cards = $$(".stg__viewport .node");
  if (!root || !cards.length) return;
  const k = getView().k || 1;
  const sizes = new Map();
  cards.forEach(card => {
    const rect = card.getBoundingClientRect();
    sizes.set(card.dataset.id, { width: rect.width / k, height: rect.height / k });
  });

  function makeBlock(n) {
    const own = sizes.get(n.id) || { width: 0, height: 0 };
    const kids = n._open === false ? [] : (n.children || []).filter(child => sizes.has(child.id));
    if (!kids.length) {
      return {
        points: [{ n, depth: 0, y: 0 }],
        top: new Map([[0, -own.height / 2]]),
        bottom: new Map([[0, own.height / 2]]),
      };
    }

    const points = [];
    const top = new Map();
    const bottom = new Map();
    const childRoots = [];
    kids.forEach((child, index) => {
      const block = makeBlock(child);
      let shift = 0;
      if (index) {
        block.top.forEach((edge, depth) => {
          const prior = bottom.get(depth + 1);
          if (prior != null) shift = Math.max(shift, prior + TREE_GAP_Y - edge);
        });
      }
      childRoots.push(shift);
      block.points.forEach(point => points.push({ n: point.n, depth: point.depth + 1, y: point.y + shift }));
      block.top.forEach((edge, depth) => {
        const d = depth + 1;
        top.set(d, Math.min(top.get(d) ?? Infinity, edge + shift));
      });
      block.bottom.forEach((edge, depth) => {
        const d = depth + 1;
        bottom.set(d, Math.max(bottom.get(d) ?? -Infinity, edge + shift));
      });
    });
    const parentY = (childRoots[0] + childRoots[childRoots.length - 1]) / 2;
    points.push({ n, depth: 0, y: parentY });
    top.set(0, parentY - own.height / 2);
    bottom.set(0, parentY + own.height / 2);
    points.forEach(point => { point.y -= parentY; });
    top.forEach((edge, depth) => top.set(depth, edge - parentY));
    bottom.forEach((edge, depth) => bottom.set(depth, edge - parentY));
    return { points, top, bottom };
  }

  const block = makeBlock(viewRoot(root));
  const widths = [];
  let top = Infinity, bottom = -Infinity;
  block.points.forEach(point => {
    const size = sizes.get(point.n.id);
    widths[point.depth] = Math.max(widths[point.depth] || 0, size.width);
    top = Math.min(top, point.y - size.height / 2);
    bottom = Math.max(bottom, point.y + size.height / 2);
  });
  const columns = [0];
  for (let depth = 1; depth < widths.length; depth++) {
    const specifiedStep = widths[depth - 1] + TREE_GAP_X;
    const clearStep = widths[depth - 1] / 2 + widths[depth] / 2 + TREE_GAP_X;
    columns[depth] = columns[depth - 1] + Math.max(specifiedStep, clearStep);
  }
  const centreY = (top + bottom) / 2;
  treePos.clear();
  block.points.forEach(point => treePos.set(point.n.id, { x: columns[point.depth], y: point.y - centreY }));
  cards.forEach(card => {
    const n = findNodeById(root, card.dataset.id);
    if (!n) return;
    const pos = posOf(n);
    card.style.left = pos.x + "px";
    card.style.top = pos.y + "px";
    const coord = $(".node__coord", card);
    if (coord) coord.textContent = fmtCoord(pos.x, pos.y);
  });
  updateAllEdges();
  const selected = state.selected && findNodeById(root, state.selected);
  const inspectorCoord = $(".insp__coord");
  if (selected && inspectorCoord) {
    const pos = posOf(selected);
    inspectorCoord.textContent = fmtCoord(pos.x, pos.y);
  }
}
function setLayoutMode(mode) {
  if (mode !== "tree" && mode !== "free") return false;
  if (mode === (isTreeMode() ? "tree" : "free")) { updateLayoutControls(); return true; }
  state.layoutMode[state.active] = mode;
  treePos.clear();
  renderStage();
  updateLayoutControls();
  saveState();
  return true;
}
function bakeTreeToFree() {
  if (blockReadonly()) return;
  if (!isTreeMode() || !treePos.size) return;
  if (viewRoot(state.trees[state.active]) !== state.trees[state.active]) { toast("BRANCH · EXIT BEFORE TREE → FREE"); return; }
  pushHistory();
  const root = state.trees[state.active];
  treePos.forEach((pos, id) => {
    const n = findNodeById(root, id);
    if (!n) return;
    n.x = state.snap !== false ? Math.round(pos.x / 10) * 10 : pos.x;
    n.y = state.snap !== false ? Math.round(pos.y / 10) * 10 : pos.y;
  });
  state.layoutMode[state.active] = "free";
  treePos.clear();
  renderStage();
  updateLayoutControls();
  saveState();
  toast("LAYOUT · TREE COPIED TO FREE");
}
function renderStage() {
  const root = state.trees[state.active];
  const vp = $(".stg__viewport");
  if (!vp) return;
  vp.innerHTML = "";
  if (!root) { renderInspector(); return; }
  if (isTreeMode()) treePos.clear();

  const idx = CATEGORIES.findIndex(c => c.id === state.active);
  const num1 = $(".gh-num1"), num2 = $(".gh-num2");
  if (num1) num1.textContent = String(idx).padStart(2, "0");
  if (num2) num2.textContent = (idx + 1) + "A";

  // SVG edges (rendered FIRST so nodes layer above)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "edges");
  svg.style.position = "absolute";
  svg.style.left = "-3000px"; svg.style.top = "-3000px";
  svg.style.width = "9000px"; svg.style.height = "9000px";
  svg.setAttribute("viewBox", "-3000 -3000 9000 9000");
  vp.appendChild(svg);

  // visible flat (skip children of collapsed nodes; BRANCH starts below the root)
  const flat = [];
  (function walk(n, parent) {
    flat.push({ n, parent });
    if (n._open !== false) (n.children || []).forEach(c => walk(c, n));
  })(viewRoot(root), null);

  // edges
  flat.forEach(({ n, parent }) => {
    if (!parent) return;
    const from = posOf(parent), to = posOf(n);
    const x1 = from.x, y1 = from.y;
    const x2 = to.x, y2 = to.y;
    const isAccent = (parent === root);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const midX = (x1 + x2) / 2;
    path.setAttribute("d", `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`);
    if (isAccent) path.setAttribute("class", "edge-acc");
    path.setAttribute("data-edge-from", parent.id);
    path.setAttribute("data-edge-to", n.id);
    svg.appendChild(path);
  });
  window.Relations?.draw(svg, root, new Set(flat.map(f => f.n.id)));

  // nodes
  flat.forEach(({ n, parent }, i) => {
    const isRoot = n === root;
    const lvl = computeLevel(n, root);
    const isMin = state.nodeStyle === "minimal";
    const pos = posOf(n);
    const node = el("div", {
      class: "node lvl-" + lvl + (isRoot ? " is-root" : "") + (state.selected === n.id ? " is-selected" : "") + (isMin ? " is-minimal" : "") + (n._open === false ? " is-collapsed" : ""),
      "data-id": n.id,
      style: `left:${pos.x}px; top:${pos.y}px; transform: translate(-50%, -50%);`,
    });
    const idxStr = isRoot ? "ROOT" : padIdx(i, lvl);
    const head = el("div", { class: "node__head" },
      el("span", { class: "node__idx" }, idxStr),
      el("span", { class: "node__lvl" }, "L" + lvl),
    );
    node.appendChild(head);

    // collapse toggle: if node has children
    if ((n.children || []).length > 0 && !isRoot) {
      const tog = el("button", {
        class: "node__tog",
        title: n._open === false ? "Expand" : "Collapse",
        onclick: (e) => { e.stopPropagation(); toggleCollapse(n); },
      }, n._open === false ? "+" : "−");
      node.appendChild(tog);
    }
    if (isRoot && (n.children || []).length > 0) {
      const tog = el("button", {
        class: "node__tog node__tog--root",
        title: n._open === false ? "Expand" : "Collapse",
        onclick: (e) => { e.stopPropagation(); toggleCollapse(n); },
      }, n._open === false ? "+" : "−");
      node.appendChild(tog);
    }

    if (state.nodeStyle === "block" && n.thumb) {
      const t = el("div", { class: "node__thumb" });
      t.style.backgroundImage = `url(${n.thumb})`;
      node.appendChild(t);
    }
    const body = el("div", { class: "node__body" });
    const title = el("div", {
      class: "node__title" + (hasJP(n.title) ? " has-jp" : ""),
      contenteditable: "false",
      spellcheck: "false",
    }, n.title || "Untitled");
    title.addEventListener("blur", () => { if (editSession?.el === title) commitEdit(); });
    title.addEventListener("keydown", (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return;
      // commit directly: blur events are not delivered while the window lacks focus
      if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); commitEdit(); title.blur(); }
    });
    body.appendChild(title);

    if (!isMin) {
      const notes = el("div", { class: "node__notes" });
      // up to 3 slots: existing notes, or one more while a new slot is being edited
      const noteCount = Math.min(3, Math.max(1, (n.notes || []).length, editNoteSlots.get(n.id) || 0));
      for (let ni = 0; ni < noteCount; ni++) {
        const noteText = (n.notes && n.notes[ni]) || "";
        const noteEl = el("div", {
          class: "n" + (noteText ? "" : " is-empty"),
          contenteditable: "false",
          spellcheck: "false",
          "data-placeholder": "+ NOTE",
          "data-note-idx": String(ni),
        }, noteText);
        noteEl.addEventListener("input", () => {
          const v = noteEl.textContent;
          if (!n.notes) n.notes = [];
          n.notes[ni] = v;
        });
        noteEl.addEventListener("blur", () => { if (editSession?.el === noteEl) commitEdit(); });
        noteEl.addEventListener("keydown", (ev) => {
          if (ev.isComposing || ev.keyCode === 229) return;
          if (ev.key === "Enter") {
            ev.preventDefault();
            ev.stopPropagation();
            // move to next note slot or add new one if room
            const next = noteEl.parentElement.querySelector(`[data-note-idx="${ni + 1}"]`);
            commitEdit();
            if (next) beginEdit(n.id, "note", ni + 1);
            else if (ni < 2) beginEdit(n.id, "note", ni + 1);
          }
        });
        notes.appendChild(noteEl);
      }
      const more = (n.notes || []).length - 3;
      if (more > 0) notes.appendChild(el("div", { class: "node__more" }, "+" + more));
      body.appendChild(notes);
    }
    if (!isMin && (n.url || !isRoot)) {
      const urlRow = el("div", { class: "node__url" });
      urlRow.appendChild(el("span", { class: "lbl" }, "URL"));
      const a = n.url && isWebURL(n.url) ? el("a", { href: n.url, target: "_blank", rel: "noreferrer noopener" }, shortUrl(n.url))
                       : el("span", { style: "color:var(--mute);font-style:italic;" }, "—");
      urlRow.appendChild(a);
      body.appendChild(urlRow);
    }
    node.appendChild(body);
    node.appendChild(el("div", { class: "node__coord" }, fmtCoord(pos.x, pos.y)));

    const actions = el("div", { class: "node__actions" },
      el("button", { onclick: (e) => { e.stopPropagation(); editURL(n); } }, "URL"),
      el("button", { onclick: (e) => { e.stopPropagation(); pickThumb(n); } }, "IMG"),
      el("button", { onclick: (e) => { e.stopPropagation(); addChild(n); } }, "+ CHILD"),
      el("button", { class: "del", onclick: (e) => { e.stopPropagation(); delNode(n); } }, "DEL"),
    );
    node.appendChild(actions);

    node.addEventListener("click", (ev) => {
      if (editSession?.el === ev.target || editSession?.el.contains(ev.target)) return;
      if (ev.target.closest(".node__url a")) return;
      if (ev.target.closest(".node__tog")) return;
      if (ev.target.closest(".node__actions")) return;
      ev.stopPropagation();
      if (ev.shiftKey && state.selected && state.selected !== n.id) {
        setLinkPartner(linkPartner === n.id ? null : n.id);
        if (linkPartner) toast("2 NODES · L = LINK");
        return;
      }
      setLinkPartner(null);
      selectNode(n);
    });
    node.addEventListener("dblclick", (ev) => {
      // pointer capture (node drag) reports the card itself as the target, so look at what is under the cursor;
      // a double-click anywhere on the card edits the title unless it lands on a note
      const hit = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
      if (hit.closest(".node__actions, .node__tog, .node__url a")) return;
      const note = hit.closest(".node__notes .n");
      ev.preventDefault();
      ev.stopPropagation();
      beginEdit(n.id, note ? "note" : "title", note ? Number(note.dataset.noteIdx) : 0);
    });

    // hover: fade non-related, highlight ancestors+descendants+self
    node.addEventListener("mouseenter", () => {
      if (node.classList.contains("dragging")) return;
      const stg = $(".stg");
      stg.classList.add("is-hovering");
      const related = collectRelatedIds(state.trees[state.active], n);
      $$(".node").forEach(el => {
        const id = el.getAttribute("data-id");
        el.classList.toggle("is-related", related.has(id));
        el.classList.toggle("is-hovered", id === n.id);
      });
      // edges: highlight related
      $$(".edges path").forEach(p => {
        const f = p.getAttribute("data-edge-from");
        const t = p.getAttribute("data-edge-to");
        p.classList.toggle("edge-related", related.has(f) && related.has(t));
      });
    });
    node.addEventListener("mouseleave", () => {
      const stg = $(".stg");
      stg.classList.remove("is-hovering");
      $$(".node").forEach(el => el.classList.remove("is-related", "is-hovered"));
      $$(".edges path").forEach(p => p.classList.remove("edge-related"));
    });

    node.addEventListener("dragover", (ev) => {
      if (ev.dataTransfer && ev.dataTransfer.types && ev.dataTransfer.types.includes("Files")) {
        ev.preventDefault(); node.classList.add("drop-target");
      }
    });
    node.addEventListener("dragleave", () => node.classList.remove("drop-target"));
    node.addEventListener("drop", async (ev) => {
      ev.preventDefault(); node.classList.remove("drop-target");
      const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f && f.type.startsWith("image/")) {
        pushHistory();
        const url = await fileToDataURL(f);
        n.thumb = url; renderStage(); saveState(); toast("IMAGE ATTACHED");
      }
    });

    vp.appendChild(node);
  });

  const selected = state.selected && flat.find(({ n }) => n.id === state.selected);
  if (selected) markSelectedEdges(selected.n);
  const bandChanged = applyTransform();
  if (isTreeMode() && !bandChanged) recomputeTreeLayout();
  updateLayoutControls();
  updateSearchMatches($(".srch")?.value || "");
  $(".stg")?.classList.toggle("show-coords", state.showCoords);
  renderInspector();
}
function computeLevel(node, root) {
  if (node === root) return 0;
  let lvl = -1;
  (function w(n, l) { if (lvl !== -1) return; if (n === node) { lvl = l; return; } (n.children || []).forEach(c => w(c, l + 1)); })(root, 0);
  return lvl < 0 ? 0 : lvl;
}
function padIdx(i, lvl) { const a = "0123456789ABCDEF"; return String(lvl) + a[i % 16]; }

/* =========================================================
   INSPECTOR
   ========================================================= */
function isWebURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "obsidian:";
  } catch { return false; }
}
function pushInspectorSnap(snap) {
  history.past.push(snap);
  if (history.past.length > HIST_MAX) history.past.shift();
  history.future.length = 0;
}
function commitInspectorField(target) {
  const edit = inspectorEdit;
  if (!edit || edit.el !== target) return;
  inspectorEdit = null;
  const root = state.trees[state.active];
  const n = root && findNodeById(root, edit.id);
  if (!n) return;

  let changed = false;
  if (edit.field === "title") {
    const value = target.value.trim();
    changed = value !== (n.title || "");
    target.value = value;
    if (changed) n.title = value;
  } else if (edit.field === "url") {
    const value = normalizeLink(target.value) || null;
    changed = value !== (n.url || null);
    target.value = value || "";
    if (changed) n.url = value;
  } else {
    const values = $$(".insp__note", target.closest(".insp")).map(x => x.value);
    while (values.length && !values[values.length - 1]) values.pop();
    changed = JSON.stringify(values) !== JSON.stringify(n.notes || []);
    if (changed) n.notes = values;
  }
  if (!changed) return;

  pushInspectorSnap(edit.snap);
  saveState();
  inspectorRenderingLocked = true;
  renderStage();
  inspectorRenderingLocked = false;
  setTimeout(() => renderInspector(), 0);
}
function bindInspectorField(field, kind, noteIdx) {
  field.addEventListener("focus", () => {
    inspectorEdit = { id: state.selected, field: kind, noteIdx, before: field.value, snap: snapshot(), el: field };
  });
  field.addEventListener("blur", () => {
    if (inspectorCancelBlur) { inspectorCancelBlur = false; return; }
    commitInspectorField(field);
  });
  field.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (inspectorEdit?.el === field) field.value = inspectorEdit.before;
      inspectorEdit = null;
      inspectorCancelBlur = true;
      field.blur();
      return;
    }
    if (e.key === "Enter" && kind !== "note" && (kind === "url" || !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      commitInspectorField(field);
      field.blur();
      renderInspector(true);
    }
  });
}
function makeInspectorRow(label) {
  return el("section", { class: "insp__row" }, el("div", { class: "lbl" }, label));
}
function renderInspector(force = false) {
  const panel = $(".insp");
  if (!panel || inspectorRenderingLocked) return;
  const active = document.activeElement;
  const selectedChanged = inspectorRenderedId !== state.selected;
  if (!force && !selectedChanged && active && panel.contains(active) && /input|textarea/i.test(active.tagName)) return;

  inspectorEdit = null;
  inspectorRenderedId = state.selected;
  panel.replaceChildren();
  const root = state.trees[state.active];
  const cat = CATEGORIES.find(c => c.id === state.active);
  const meta = state.meta[state.active] || { count: root ? countNodes(root) : 0, depth: root ? maxDepth(root) : 0 };
  const n = root && state.selected ? findNodeById(root, state.selected) : null;
  const ro = document.body.classList.contains("is-readonly");

  panel.appendChild(el("div", { class: "insp__hd" },
    el("span", {}, "INSPECTOR"),
    el("span", { class: "insp__map" }, cat ? cat.label : "MAP"),
  ));
  if (!n) {
    panel.appendChild(el("div", { class: "insp__empty" },
      el("div", { class: "insp__empty-map" }, cat ? cat.label : "MAP"),
      el("div", { class: "insp__empty-meta" }, "N=" + meta.count + " / D=" + meta.depth),
      el("div", { class: "insp__hint" }, "CLICK A NODE · DOUBLE-CLICK TO EDIT"),
    ));
    return;
  }

  const all = [];
  (function walk(x) { all.push(x); (x.children || []).forEach(walk); })(root);
  const lvl = computeLevel(n, root);
  const pos = posOf(n);
  panel.appendChild(el("div", { class: "insp__meta" },
    el("span", {}, String(all.indexOf(n)).padStart(2, "0") + " / L" + lvl),
    el("span", { class: "insp__id" }, n.id),
    el("span", { class: "insp__coord" }, fmtCoord(pos.x, pos.y)),
  ));

  const titleRow = makeInspectorRow("TITLE");
  const title = el("textarea", { class: "insp__title", rows: "2", spellcheck: "false" });
  title.value = n.title || "";
  title.readOnly = ro;
  bindInspectorField(title, "title");
  titleRow.appendChild(title);
  panel.appendChild(titleRow);

  const notesRow = makeInspectorRow("NOTES");
  const notes = el("div", { class: "insp__notes" });
  (n.notes || []).forEach((value, i) => {
    const line = el("div", { class: "insp__note-row" });
    const note = el("textarea", { class: "insp__note", "data-idx": String(i), rows: "2", spellcheck: "false" });
    note.value = value;
    note.readOnly = ro;
    bindInspectorField(note, "note", i);
    line.appendChild(note);
    // a note holding a Windows folder path gets a copy button (browsers can't open folders; paste it into Explorer)
    const path = (value || "").match(/[A-Za-z]:\\[^\n]*/);
    if (path) line.appendChild(el("button", {
      class: "insp__copy-path", type: "button", title: "フォルダのアドレスをコピー（エクスプローラーに貼る）",
      onclick: () => copyText(path[0].trim(), "PATH · COPIED"),
    }, "COPY"));
    line.appendChild(el("button", {
      class: "insp__remove-note insp__action", type: "button", title: "Remove note",
      onclick: () => {
        pushHistory();
        n.notes.splice(i, 1);
        saveState();
        renderStage();
      },
    }, "×"));
    notes.appendChild(line);
  });
  notesRow.appendChild(notes);
  notesRow.appendChild(el("button", {
    class: "insp__add-note insp__action", type: "button",
    onclick: () => {
      pushHistory();
      if (!n.notes) n.notes = [];
      n.notes.push("");
      saveState();
      renderStage();
      const fields = $$(".insp__note");
      fields[fields.length - 1]?.focus();
    },
  }, "+ NOTE"));
  panel.appendChild(notesRow);

  const urlRow = makeInspectorRow("URL");
  const urlLine = el("div", { class: "insp__url-row" });
  const url = el("input", { class: "insp__url", type: "url", spellcheck: "false" });
  url.value = n.url || "";
  url.readOnly = ro;
  bindInspectorField(url, "url");
  urlLine.appendChild(url);
  if (isWebURL(n.url)) urlLine.appendChild(el("a", { class: "insp__open", href: n.url, target: "_blank", rel: "noreferrer noopener" }, "OPEN ↗"));
  urlRow.appendChild(urlLine);
  panel.appendChild(urlRow);

  const imageRow = makeInspectorRow("IMAGE");
  if (n.thumb) {
    const img = el("img", { class: "insp__thumb", alt: "", title: "ホバーで大きく" });
    img.src = n.thumb;
    img.addEventListener("mouseenter", () => showImageZoom(n.thumb));
    img.addEventListener("mouseleave", hideImageZoom);
    imageRow.appendChild(img);
  }
  imageRow.appendChild(el("div", { class: "insp__actions" },
    el("button", { class: "insp__action", type: "button", onclick: () => pickThumb(n) }, "IMG…"),
    el("button", {
      class: "insp__action", type: "button", disabled: n.thumb ? null : "",
      onclick: () => {
        if (!n.thumb) return;
        pushHistory();
        delete n.thumb;
        saveState();
        renderStage();
      },
    }, "REMOVE"),
  ));
  panel.appendChild(imageRow);

  const parent = findParent(root, n.id);
  const parentRow = makeInspectorRow("PARENT");
  if (parent) parentRow.appendChild(el("button", { class: "insp__parent", type: "button", onclick: () => selectNode(parent) }, parent.title || "Untitled"));
  else parentRow.appendChild(el("div", { class: "insp__none" }, "—"));
  panel.appendChild(parentRow);

  const childRow = makeInspectorRow("CHILDREN (" + (n.children || []).length + ")");
  const children = el("div", { class: "insp__children" });
  (n.children || []).forEach(child => children.appendChild(el("button", {
    class: "insp__child", type: "button", "data-id": child.id, onclick: () => selectNode(child),
  }, child.title || "Untitled")));
  if (!(n.children || []).length) children.appendChild(el("div", { class: "insp__none" }, "—"));
  childRow.appendChild(children);
  panel.appendChild(childRow);
  window.Relations?.inspector(panel, n, ro);
  window.Links?.inspector(panel, n);
}
let imageZoomEl = null;
function showImageZoom(src) {
  if (!imageZoomEl) {
    imageZoomEl = el("div", { class: "img-zoom" }, el("img", { alt: "" }));
    document.body.appendChild(imageZoomEl);
  }
  imageZoomEl.firstChild.src = src;
  imageZoomEl.classList.add("show");
}
function hideImageZoom() { imageZoomEl?.classList.remove("show"); }
function applyInspectorState() {
  const open = state.inspector !== false;
  $(".shell")?.classList.toggle("no-insp", !open);
  $("#btn-insp")?.classList.toggle("is-on", open);
  applyTransform();
}
function toggleInspector() {
  state.inspector = state.inspector === false;
  applyInspectorState();
  saveState();
  renderInspector();
}

function toggleCollapse(n) {
  pushHistory();
  const wasOpen = (n._open !== false);
  n._open = wasOpen ? false : true;
  renderStage(); saveState();
  // Time-staggered reveal on expand: 30~80ms apart
  if (!wasOpen) {
    const root = state.trees[state.active];
    const order = [];
    (function w(node, depth) {
      (node.children || []).forEach((c, i) => {
        order.push({ id: c.id, depth });
        w(c, depth + 1);
      });
    })(n, 0);
    order.forEach((o, i) => {
      const dom = $(`.node[data-id="${o.id}"]`);
      if (!dom) return;
      dom.style.opacity = "0";
      dom.style.transform = (dom.style.transform || "") + " translateY(-4px)";
      // base transform from inline style is "translate(-50%, -50%)"
      const base = `translate(-50%, -50%)`;
      dom.style.transform = base + " translateY(-4px)";
      setTimeout(() => {
        dom.style.transition = "opacity 220ms var(--ez), transform 260ms var(--ez)";
        dom.style.opacity = "1";
        dom.style.transform = base;
      }, 30 + i * 24);
    });
  }
  toast(wasOpen ? "COLLAPSED" : "EXPANDED");
}

/* =========================================================
   TRANSFORM
   ========================================================= */
const DENSITY_OUTLINE_MAX = 0.55;
const DENSITY_DETAIL_MIN = 1.15;
const DENSITY_CLASSES = ["is-dens-outline", "is-dens-structure", "is-dens-detail"];
function densityBand(k) {
  if (state.density === "detail") return "detail";
  if (k < DENSITY_OUTLINE_MAX) return "outline";
  if (k < DENSITY_DETAIL_MIN) return "structure";
  return "detail";
}
function applyTransform(smooth) {
  const v = getView();
  const vp = $(".stg__viewport");
  const stg = $(".stg");
  const band = densityBand(v.k);
  const bandClass = "is-dens-" + band;
  const bandChanged = !!stg && !stg.classList.contains(bandClass);
  if (vp) {
    if (smooth) {
      vp.classList.add("is-smooth");
      clearTimeout(applyTransform._t);
      applyTransform._t = setTimeout(() => vp.classList.remove("is-smooth"), 400);
    } else {
      vp.classList.remove("is-smooth");
    }
    vp.style.setProperty("--k", v.k);
    vp.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  }
  if (bandChanged) {
    stg.classList.remove(...DENSITY_CLASSES);
    stg.classList.add(bandClass);
    if (isTreeMode()) recomputeTreeLayout();
  }
  const lvl = $(".zoom .lvl");
  if (lvl) {
    lvl.replaceChildren(
      el("span", {}, Math.round(v.k * 100) + "%"),
      el("small", {}, band === "structure" ? "STRUCT" : band.toUpperCase()),
    );
  }
  return bandChanged;
}
function fitView(smooth = true) {
  const stg = $(".stg");
  let nodes = $$(".stg__viewport .node");
  if (!stg || !nodes.length) return;
  const stgRect = stg.getBoundingClientRect();
  if (stgRect.width < 50 || stgRect.height < 50) return; // hidden/zero-size tab: don't save a bogus 25% view
  const v = getView();
  const availW = Math.max(1, stgRect.width - 96);
  const availH = Math.max(1, stgRect.height - 96);
  let boundsW = 1, boundsH = 1;
  for (let pass = 0; pass < 2; pass++) {
    const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    nodes.forEach(node => {
      const r = node.getBoundingClientRect();
      bounds.left = Math.min(bounds.left, (r.left - stgRect.left - v.x) / v.k);
      bounds.top = Math.min(bounds.top, (r.top - stgRect.top - v.y) / v.k);
      bounds.right = Math.max(bounds.right, (r.right - stgRect.left - v.x) / v.k);
      bounds.bottom = Math.max(bounds.bottom, (r.bottom - stgRect.top - v.y) / v.k);
    });
    boundsW = Math.max(1, bounds.right - bounds.left);
    boundsH = Math.max(1, bounds.bottom - bounds.top);
    const fitK = Math.min(availW / boundsW, availH / boundsH);
    v.k = Math.min(1, Math.max(0.25, fitK));
    v.x = stgRect.width / 2 - ((bounds.left + bounds.right) / 2) * v.k;
    v.y = stgRect.height / 2 - ((bounds.top + bounds.bottom) / 2) * v.k;
    const willChangeBand = !stg.classList.contains("is-dens-" + densityBand(v.k));
    const bandChanged = applyTransform(willChangeBand && pass === 0 ? false : smooth);
    if (!bandChanged || pass === 1) break;
    nodes = $$(".stg__viewport .node");
  }
  saveState();
  updateCrumbs();
  if (boundsW * v.k > availW + 0.5 || boundsH * v.k > availH + 0.5) toast("FIT · MIN ZOOM LIMIT");
}
function focusNode(id, { smooth = true } = {}) {
  const root = state.trees[state.active];
  const n = root && findNodeById(root, id);
  const stg = $(".stg");
  if (!n || !stg) return false;
  const r = stg.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const v = getView();
  v.k = Math.min(2.5, Math.max(0.25, v.k >= 0.8 ? v.k : 1));
  const targetBand = "is-dens-" + densityBand(v.k);
  if (!stg.classList.contains(targetBand)) applyTransform(false);
  const pos = posOf(n);
  v.x = r.width / 2 - pos.x * v.k;
  v.y = r.height / 2 - pos.y * v.k;
  applyTransform(smooth);
  if (!document.body.classList.contains("is-readonly")) saveState();
  updateCrumbs();
  return true;
}

/* =========================================================
   SEARCH
   ========================================================= */
let searchResults = [];
let searchIndex = -1;
let searchTimer = 0;
let searchOpen = false;
function searchNodes(query) {
  const q = String(query || "").trim().toLocaleLowerCase();
  if (!q) return [];
  const ordered = [
    ...CATEGORIES.filter(c => c.id === state.active),
    ...CATEGORIES.filter(c => c.id !== state.active),
  ];
  const results = [];
  ordered.forEach(cat => {
    const root = state.trees[cat.id];
    if (!root) return;
    (function walk(n) {
      let field = "";
      if (String(n.title || "").toLocaleLowerCase().includes(q)) field = "title";
      else if ((n.notes || []).some(note => String(note || "").toLocaleLowerCase().includes(q))) field = "note";
      else if (String(n.url || "").toLocaleLowerCase().includes(q)) field = "url";
      if (field) results.push({ cat: cat.id, id: n.id, title: n.title || "Untitled", field });
      (n.children || []).forEach(walk);
    })(root);
  });
  return results;
}
function searchSnippet(n, query) {
  const q = query.toLocaleLowerCase();
  const note = (n.notes || []).find(text => String(text || "").toLocaleLowerCase().includes(q));
  if (!note) return "";
  const at = note.toLocaleLowerCase().indexOf(q);
  const start = Math.max(0, at - 28);
  const end = Math.min(note.length, at + query.length + 40);
  return (start ? "…" : "") + note.slice(start, end) + (end < note.length ? "…" : "");
}
function updateSearchMatches(query, show = searchOpen) {
  const q = String(query || "").trim().toLocaleLowerCase();
  $$(".stg__viewport .node").forEach(dom => {
    const n = findNodeById(state.trees[state.active], dom.dataset.id);
    const match = !!(show && q && n && [n.title, ...(n.notes || []), n.url || ""]
      .some(text => String(text || "").toLocaleLowerCase().includes(q)));
    dom.classList.toggle("is-match", match);
  });
}
function closeSearch({ clear = false, focusStage = false } = {}) {
  const input = $(".srch");
  const list = $(".srch__list");
  searchOpen = false;
  searchIndex = -1;
  searchResults = [];
  clearTimeout(searchTimer);
  if (clear && input) input.value = "";
  if (list) { list.replaceChildren(); list.hidden = true; }
  updateSearchMatches("", false);
  if (focusStage) $(".stg")?.focus({ preventScroll: true });
}
function renderSearch() {
  const input = $(".srch");
  const list = $(".srch__list");
  if (!input || !list) return;
  const query = input.value.trim();
  if (!query) { closeSearch(); return; }
  searchResults = searchNodes(query).slice(0, 30);
  searchIndex = -1;
  searchOpen = true;
  list.replaceChildren();
  searchResults.forEach((result) => {
    const cat = CATEGORIES.find(c => c.id === result.cat);
    const n = findNodeById(state.trees[result.cat], result.id);
    const row = el("button", { class: "srch__row", type: "button", role: "option" });
    const map = el("span", { class: "srch__map" });
    const body = el("span", { class: "srch__body" });
    const title = el("span", { class: "srch__title" });
    map.textContent = cat?.label || result.cat;
    title.textContent = result.title;
    body.appendChild(title);
    if (result.field === "note" && n) {
      const snippet = el("span", { class: "srch__snippet" });
      snippet.textContent = searchSnippet(n, query);
      body.appendChild(snippet);
    }
    row.append(map, body);
    row.addEventListener("click", () => jumpToSearchResult(result));
    list.appendChild(row);
  });
  list.hidden = false;
  updateSearchMatches(query);
}
function setSearchIndex(next) {
  if (!searchResults.length) return;
  searchIndex = (next + searchResults.length) % searchResults.length;
  $$(".srch__row", $(".srch__list")).forEach((row, i) => {
    row.classList.toggle("is-active", i === searchIndex);
    row.setAttribute("aria-selected", i === searchIndex ? "true" : "false");
    if (i === searchIndex) row.scrollIntoView({ block: "nearest" });
  });
}
function openCollapsedAncestors(root, id, readonly) {
  const path = [];
  function find(n) {
    if (n.id === id) return true;
    for (const child of n.children || []) {
      path.push(n);
      if (find(child)) return true;
      path.pop();
    }
    return false;
  }
  if (!find(root)) return false;
  const closed = path.filter(n => n._open === false);
  if (!closed.length) return false;
  if (!readonly) pushHistory();
  closed.forEach(n => { n._open = true; });
  return true;
}
function jumpToSearchResult(result) {
  if (!result) return;
  const readonly = document.body.classList.contains("is-readonly");
  if (state.active !== result.cat) {
    state.active = result.cat;
    state.selected = null;
    if (readonly) getView();
    renderAll({ save: !readonly });
  }
  const root = state.trees[state.active];
  const node = root && findNodeById(root, result.id);
  if (!node) { closeSearch(); return; }
  if (!isInBranch(node.id)) { branchFocus = null; updateBranchUI(); }
  openCollapsedAncestors(root, node.id, readonly);
  renderStage();
  selectNode(node);
  focusNode(node.id);
  closeSearch();
}

const dragState = { kind: null };
function capturePointer(target, e) {
  dragState.captureEl = target;
  dragState.pointerId = e.pointerId;
  try { target.setPointerCapture(e.pointerId); } catch {}
}
function clearDropTarget() {
  $$(".node.drop-target").forEach(x => x.classList.remove("drop-target"));
}
function resetDragState() {
  const captureEl = dragState.captureEl;
  const pointerId = dragState.pointerId;
  Object.keys(dragState).forEach(k => delete dragState[k]);
  dragState.kind = null;
  if (captureEl && pointerId != null) {
    try { captureEl.releasePointerCapture(pointerId); } catch {}
  }
}
function moveActiveDrag(e) {
  if (!dragState.kind) return;
  if (dragState.pointerId != null && e.pointerId != null && e.pointerId !== dragState.pointerId) return;
  if (dragState.kind === "pan") {
    const v = getView();
    v.x = dragState.ox + (e.clientX - dragState.sx);
    v.y = dragState.oy + (e.clientY - dragState.sy);
    applyTransform();
    return;
  }
  if (dragState.kind !== "node") return;
  const dxScreen = e.clientX - dragState.sx;
  const dyScreen = e.clientY - dragState.sy;
  if (!dragState.started && Math.hypot(dxScreen, dyScreen) < 4) return;
  dragState.moved = true;
  window.Combine?.dragMove(e, dragState.node, dragState.treeMode && (!e.shiftKey || dragState.ro));
  if (dragState.treeMode) {
    dragState.lastX = e.clientX;
    dragState.lastY = e.clientY;
    dragState.lastShift = e.shiftKey;
    if (!e.shiftKey || dragState.ro) {
      if (!dragState.warned) {
        dragState.warned = true;
        toast(dragState.ro ? "VIEW ONLY · DRAG → COMBINE" : "TREE · DRAG → COMBINE · SHIFT = RE-PARENT · T = FREE");
      }
      clearDropTarget();
      return;
    }
    if (!dragState.started) {
      dragState.started = true;
      dragState.future = history.future.slice();
      pushHistory();
      dragState.el.classList.add("dragging");
    }
    clearDropTarget();
    const target = pickNodeAt(e.clientX, e.clientY, dragState.node);
    if (target) target.dom.classList.add("drop-target");
    return;
  }
  if (!dragState.started) {
    dragState.started = true;
    dragState.future = history.future.slice();
    pushHistory();
    dragState.el.classList.add("dragging");
  }
  const k = getView().k;
  dragState.node.x = Math.round(dragState.ox + dxScreen / k);
  dragState.node.y = Math.round(dragState.oy + dyScreen / k);
  dragState.el.style.left = dragState.node.x + "px";
  dragState.el.style.top = dragState.node.y + "px";
  const cd = dragState.el.querySelector(".node__coord");
  if (cd) cd.textContent = fmtCoord(dragState.node.x, dragState.node.y);
  updateEdgesForNode(dragState.node);
  dragState.lastX = e.clientX;
  dragState.lastY = e.clientY;
  dragState.lastAlt = e.altKey;
  dragState.lastShift = e.shiftKey;
  clearDropTarget();
  if (e.shiftKey) {
    const target = pickNodeAt(e.clientX, e.clientY, dragState.node);
    if (target) target.dom.classList.add("drop-target");
  }
}
function endActiveDrag(e, reason = "release") {
  if (!dragState.kind) return;
  const kind = dragState.kind;
  if (kind === "pan") {
    const v = getView();
    if (reason === "escape") { v.x = dragState.ox; v.y = dragState.oy; applyTransform(); }
    $(".stg")?.classList.remove("is-panning");
    resetDragState();
    if (reason !== "escape") saveState();
    return;
  }
  if (kind === "tweak") {
    const tw = $(".tw");
    resetDragState();
    if (tw) {
      const r = tw.getBoundingClientRect();
      state.twPos = { left: r.left, top: r.top };
      saveState();
    }
    return;
  }
  // dropped on the COMBINE tray: add it and put the node back where it was
  if (dragState.moved && window.Combine) {
    const dx = e ? e.clientX : dragState.lastX;
    const dy = e ? e.clientY : dragState.lastY;
    if (window.Combine.dragEnd(e, dragState.node, dx, dy, reason)) reason = "escape";
  }
  const { node, el: nodeEl, ox, oy, started, future } = dragState;
  const restore = reason === "escape" || reason === "cancel";
  const allowReparent = reason === "release" && !!(e && e.shiftKey) && !dragState.ro;
  if (dragState.treeMode) {
    nodeEl.classList.remove("dragging");
    clearDropTarget();
    const cx = e ? e.clientX : dragState.lastX;
    const cy = e ? e.clientY : dragState.lastY;
    const target = started && allowReparent ? pickNodeAt(cx, cy, node) : null;
    if (started && (!target || restore)) {
      history.past.pop();
      history.future = future;
    }
    resetDragState();
    if (target && !restore && target.node !== node) reparent(node, target.node);
    return;
  }
  if (started && restore) {
    node.x = ox;
    node.y = oy;
    history.past.pop();
    history.future = future;
  } else if (started) {
    const free = e ? e.altKey : dragState.lastAlt;
    if (state.snap !== false && !free) {
      node.x = Math.round(node.x / 10) * 10;
      node.y = Math.round(node.y / 10) * 10;
    }
  }
  if (started) {
    nodeEl.style.left = node.x + "px";
    nodeEl.style.top = node.y + "px";
    const cd = nodeEl.querySelector(".node__coord");
    if (cd) cd.textContent = fmtCoord(node.x, node.y);
    updateEdgesForNode(node);
  }
  nodeEl.classList.remove("dragging");
  clearDropTarget();
  const cx = e ? e.clientX : dragState.lastX;
  const cy = e ? e.clientY : dragState.lastY;
  const target = started && allowReparent ? pickNodeAt(cx, cy, node) : null;
  resetDragState();
  if (target && target.node !== node) reparent(node, target.node);
  else if (started && !restore) { saveState(); renderInspector(); }
}
function attachStagePanZoom() {
  const stg = $(".stg");
  function startPan(e) {
    // allow pan from anywhere on the stage that's NOT a node, button, panel
    if (e.target.closest(".node")) return;
    if (e.target.closest(".tw")) return;
    if (e.target.closest(".zoom")) return;
    if (e.target.closest(".hint")) return;
    if (e.target.closest(".stg__axis")) return;
    if (e.target.closest(".branch-bar, .mini")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const focused = document.activeElement;
    if (focused && $(".insp")?.contains(focused)) commitInspectorField(focused);
    const v = getView();
    Object.assign(dragState, { kind: "pan", sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y });
    capturePointer(stg, e);
    stg.classList.add("is-panning");
    state.selected = null;
    $$(".node.is-selected").forEach(el => el.classList.remove("is-selected"));
    markSelectedEdges(null);
    updateCrumbs();
    renderInspector();
  }
  stg.addEventListener("pointerdown", startPan);
  stg.addEventListener("pointermove", moveActiveDrag);
  stg.addEventListener("pointerup", e => endActiveDrag(e));
  stg.addEventListener("pointercancel", e => endActiveDrag(e, dragState.kind === "node" ? "cancel" : "release"));
  stg.addEventListener("lostpointercapture", e => endActiveDrag(e, "lost"));

  // Synthetic pointer events cannot acquire capture; keep one non-render fallback for probes.
  window.addEventListener("pointermove", e => { if (e.target === window || e.target === document) moveActiveDrag(e); });
  window.addEventListener("pointerup", e => { if (e.target === window || e.target === document) endActiveDrag(e); });
  window.addEventListener("pointercancel", e => { if (e.target === window || e.target === document) endActiveDrag(e, dragState.kind === "node" ? "cancel" : "release"); });
  window.addEventListener("blur", () => endActiveDrag(null, "blur"));

  let wheelSaveT;
  stg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const v = getView();
    const delta = -e.deltaY * 0.0015;
    const newK = Math.min(2.5, Math.max(0.25, v.k * (1 + delta)));
    const rect = stg.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const dx = (cx - v.x) / v.k;
    const dy = (cy - v.y) / v.k;
    v.k = newK;
    v.x = cx - dx * newK;
    v.y = cy - dy * newK;
    applyTransform();
    clearTimeout(wheelSaveT);
    wheelSaveT = setTimeout(saveState, 250);
  }, { passive: false });
}

/* =========================================================
   NODE DRAG
   ========================================================= */
function attachNodeDrag() {
  const vp = $(".stg__viewport");
  vp.addEventListener("pointerdown", (e) => {
    const elNode = e.target.closest(".node");
    if (!elNode || !vp.contains(elNode)) return;
    if (editSession?.el === e.target || editSession?.el.contains(e.target)) return;
    if (e.target.closest(".node__url a")) return;
    if (e.target.closest(".node__actions")) return;
    if (e.target.closest(".node__tog")) return;
    if (e.button !== 0) return;
    const n = findNodeById(state.trees[state.active], elNode.dataset.id);
    if (!n) return;
    Object.assign(dragState, {
      kind: "node", node: n, el: elNode, started: false,
      sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y,
      lastX: e.clientX, lastY: e.clientY, lastAlt: false, lastShift: false,
      treeMode: isTreeMode() || isReadonly(), ro: isReadonly(), warned: false,
    });
    capturePointer(elNode, e);
    e.stopPropagation();
  });
}
function pickNodeAt(cx, cy, exclude) {
  const els = document.elementsFromPoint(cx, cy);
  for (const e of els) {
    if (!e.classList || !e.classList.contains("node")) continue;
    const id = e.getAttribute("data-id");
    if (!id) continue;
    const node = findNodeById(state.trees[state.active], id);
    if (node && node !== exclude) return { dom: e, node };
  }
  return null;
}
function findNodeById(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const c of root.children || []) { const f = findNodeById(c, id); if (f) return f; }
  return null;
}

/* collect ancestors + descendants + self for hover fade */
function collectRelatedIds(root, target) {
  const set = new Set();
  // descendants
  (function w(n) { set.add(n.id); (n.children || []).forEach(w); })(target);
  // ancestors
  (function w(n, path) {
    if (n === target) { path.forEach(p => set.add(p.id)); return true; }
    for (const c of n.children || []) {
      if (w(c, [...path, n])) return true;
    }
    return false;
  })(root, []);
  return set;
}

/* highlight edges from root → selected node path */
function markSelectedEdges(target) {
  const root = state.trees[state.active];
  $$(".edges path").forEach(p => p.classList.remove("edge-selected"));
  // find ancestor chain
  const chain = [];
  (function w(n, path) {
    if (n === target) { chain.push(...path, n); return true; }
    for (const c of n.children || []) {
      if (w(c, [...path, n])) return true;
    }
    return false;
  })(root, []);
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i], b = chain[i + 1];
    $$(`.edges path[data-edge-from="${a.id}"][data-edge-to="${b.id}"]`).forEach(p => p.classList.add("edge-selected"));
  }
}
function findParent(root, id) {
  for (const c of root.children || []) {
    if (c.id === id) return root;
    const f = findParent(c, id); if (f) return f;
  }
  return null;
}
function isDescendant(a, b) {
  for (const c of a.children || []) {
    if (c === b) return true;
    if (isDescendant(c, b)) return true;
  }
  return false;
}
function reparent(node, newParent) {
  if (blockReadonly()) return;
  const root = state.trees[state.active];
  if (node === root || newParent === node) return;
  if (isDescendant(node, newParent)) { toast("CIRCULAR · BLOCKED"); return; }
  const oldParent = findParent(root, node.id);
  if (!oldParent) return;
  oldParent.children = oldParent.children.filter(c => c !== node);
  newParent.children.push(node);
  toast("RE · PARENTED");
  renderStage(); saveState();
}
function updateEdgesForNode(n) {
  const root = state.trees[state.active];
  const svg = $(".stg__viewport .edges");
  if (!svg) return;
  $$(`path[data-edge-to="${n.id}"], path[data-edge-from="${n.id}"]`, svg).forEach(p => {
    const fromId = p.getAttribute("data-edge-from");
    const toId = p.getAttribute("data-edge-to");
    const a = findNodeById(root, fromId);
    const b = findNodeById(root, toId);
    if (!a || !b) return;
    const from = posOf(a), to = posOf(b);
    const midX = (from.x + to.x) / 2;
    p.setAttribute("d", `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`);
  });
  window.Relations?.update(svg, root, n.id);
}

/* =========================================================
   NODE OPS
   ========================================================= */
function addChild(parent) {
  if (document.body.classList.contains("is-readonly")) return;
  pushHistory();
  const id = "n_" + Math.random().toString(36).slice(2, 8);
  const newNode = { id, title: "NEW NODE", url: null, notes: [], children: [], _open: true,
    x: (parent.x || 0) + 240, y: (parent.y || 0) + 60 };
  parent.children.push(newNode);
  parent._open = true;
  state.selected = id;
  state.meta[state.active].count = countNodes(state.trees[state.active]);
  state.meta[state.active].depth = maxDepth(state.trees[state.active]);
  renderStage(); renderSidebar(); saveState();
  toast("NODE ADDED");
  beginEdit(id);
}
function delNode(n) {
  if (blockReadonly()) return;
  const root = state.trees[state.active];
  if (n === root) { toast("CANNOT DELETE ROOT"); return; }
  const proceed = () => {
    pushHistory();
    const p = findParent(root, n.id);
    if (!p) return;
    p.children = p.children.filter(c => c !== n);
    state.selected = null;
    state.meta[state.active].count = countNodes(root);
    state.meta[state.active].depth = maxDepth(root);
    renderStage(); renderSidebar(); saveState();
    toast("DELETED");
  };
  if (window.exModal && window.exModal.confirm) {
    window.exModal.confirm({
      title: "DELETE NODE",
      message: `“${(n.title || "Untitled").slice(0, 40)}” and all children will be removed.`,
      okLabel: "DELETE",
      danger: true,
    }).then((ok) => { if (ok) proceed(); });
    return;
  }
  if (!confirm("Delete this node and all children?")) return;
  proceed();
}
function editURL(n) {
  if (blockReadonly()) return;
  if (window.exModal && window.exModal.prompt) {
    window.exModal.prompt({ title: "URL", label: "URL", value: n.url || "https://" }).then((u) => {
      if (u === null) return;
      pushHistory();
      n.url = normalizeLink(u) || null;
      renderStage(); saveState();
    });
    return;
  }
  const u = prompt("URL:", n.url || "https://");
  if (u === null) return;
  pushHistory();
  n.url = normalizeLink(u) || null;
  renderStage(); saveState();
}
function pickThumb(n) {
  if (blockReadonly()) return;
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    pushHistory();
    n.thumb = await fileToDataURL(f);
    renderStage(); saveState(); toast("IMAGE ATTACHED");
  };
  inp.click();
}
function fileToDataURL(f) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
}

/* =========================================================
   CRUMBS
   ========================================================= */
function updateCrumbs() {
  const cat = CATEGORIES.find(c => c.id === state.active);
  const root = state.trees[state.active];
  const meta = state.meta[state.active];
  const sel = state.selected ? findNodeById(root, state.selected) : null;
  const c = $(".hd__crumbs"); c.innerHTML = "";
  c.appendChild(el("span", { class: "coord" }, "M/" + String(CATEGORIES.indexOf(cat)).padStart(2, "0")));
  c.appendChild(el("span", { class: "sep" }, "/"));
  c.appendChild(el("span", {}, cat.label));
  c.appendChild(el("span", { class: "sep" }, "—"));
  c.appendChild(el("span", { class: "coord" }, "N=" + meta.count + " · D=" + meta.depth));
  c.appendChild(el("span", { class: "sep" }, "—"));
  c.appendChild(el("span", { class: "pin" }, sel ? "SEL: " + (sel.title || "").slice(0, 30) : "—"));
  $$(".foot .v").forEach((e, i) => {
    if (i === 0) e.textContent = cat.label;
    if (i === 1) e.textContent = "N=" + meta.count;
    if (i === 2) e.textContent = "Z=" + Math.round(getView().k * 100) + "%";
  });
}

/* =========================================================
   TWEAKS  (draggable panel)
   ========================================================= */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  document.documentElement.style.setProperty("--acc", ACCENTS[state.accent] || ACCENTS.lime);
  document.documentElement.style.setProperty("--acc-ink", state.accent === "ink" ? "#ffffff" : "#0a0a0a");
  // accent color for use ON the dark root slab — falls back to light when accent itself is ink
  document.documentElement.style.setProperty("--acc-link", state.accent === "ink" ? "#f2f2ef" : (ACCENTS[state.accent] || ACCENTS.lime));
}
function renderTweaks() {
  const tw = $(".tw");
  tw.innerHTML = "";
  // position from state
  if (state.twPos.left != null) { tw.style.left = state.twPos.left + "px"; tw.style.right = "auto"; }
  else { tw.style.right = (state.twPos.right ?? 16) + "px"; tw.style.left = "auto"; }
  if (state.twPos.top != null) { tw.style.top = state.twPos.top + "px"; tw.style.bottom = "auto"; }
  else { tw.style.bottom = (state.twPos.bottom ?? 48) + "px"; tw.style.top = "auto"; }

  const hd = el("div", { class: "tw__hd" },
    el("span", { class: "tw__grip" }, "··· TWEAKS"),
    el("button", { class: "x", onclick: () => closeTweaks() }, "×"),
  );
  tw.appendChild(hd);
  attachTwDrag(hd);

  const body = el("div", { class: "tw__body" });
  body.appendChild(makeSeg("THEME", ["light", "white"], state.theme, v => { state.theme = v; applyTheme(); saveState(); renderTweaks(); }));
  body.appendChild(makeSwatch("ACCENT", state.accent, v => { state.accent = v; applyTheme(); saveState(); renderTweaks(); }));
  body.appendChild(makeSeg("COORDS", ["off", "on"], state.showCoords ? "on" : "off", v => { state.showCoords = (v === "on"); saveState(); $(".stg")?.classList.toggle("show-coords", state.showCoords); renderTweaks(); }));
  body.appendChild(makeSeg("NODE", ["block", "minimal"], state.nodeStyle, v => { state.nodeStyle = v; saveState(); renderStage(); renderTweaks(); }));
  body.appendChild(makeSeg("SNAP 10 · ALT = FREE", ["on", "off"], state.snap === false ? "off" : "on", v => { state.snap = (v === "on"); saveState(); renderTweaks(); }));

  body.appendChild(makeSeg("DENSITY · AUTO BY ZOOM", ["auto", "detail"], state.density, v => { state.density = v; applyTransform(); saveState(); renderTweaks(); }));

  // full reset (with confirm)
  const resetAllBtn = el("button", {
    style: "appearance:none;background:transparent;border:1px dashed var(--mute);padding:8px;font-family:inherit;font-size:9px;letter-spacing:0.08em;text-transform:uppercase;color:var(--mute);cursor:pointer;",
    onclick: () => {
      const proceed = () => { localStorage.removeItem(STORE_KEY); localStorage.removeItem(CUSTOM_CATS_KEY); localStorage.removeItem(CAT_ORDER_KEY); localStorage.removeItem(DEFAULT_LAYOUTS_KEY); location.reload(); };
      if (window.exModal && window.exModal.confirm) {
        window.exModal.confirm({
          title: "RESET ALL DATA",
          message: "All maps, custom categories and saved defaults will be erased. This cannot be undone.",
          okLabel: "RESET",
          danger: true,
        }).then((ok) => { if (ok) proceed(); });
      } else {
        if (confirm("Reset all maps and lose all edits?")) proceed();
      }
    },
  }, "RESET ALL DATA");
  body.appendChild(resetAllBtn);

  tw.appendChild(body);
}
function attachTwDrag(handle) {
  handle.style.cursor = "move";
  handle.style.touchAction = "none";
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".x")) return;
    if (e.button !== 0) return;
    const tw = $(".tw");
    const r = tw.getBoundingClientRect();
    Object.assign(dragState, {
      kind: "tweak", sx: e.clientX, sy: e.clientY,
      ox: r.left, oy: r.top,
    });
    capturePointer(handle, e);
    e.preventDefault();
  });
  handle.addEventListener("pointermove", (e) => {
    if (dragState.kind !== "tweak") return;
    if (dragState.pointerId != null && e.pointerId !== dragState.pointerId) return;
    const tw = $(".tw");
    const nx = dragState.ox + (e.clientX - dragState.sx);
    const ny = dragState.oy + (e.clientY - dragState.sy);
    tw.style.left = Math.max(8, Math.min(window.innerWidth - 100, nx)) + "px";
    tw.style.right = "auto";
    tw.style.top = Math.max(8, Math.min(window.innerHeight - 60, ny)) + "px";
    tw.style.bottom = "auto";
  });
  handle.addEventListener("pointerup", e => endActiveDrag(e));
  handle.addEventListener("pointercancel", e => endActiveDrag(e, "cancel"));
  handle.addEventListener("lostpointercapture", e => endActiveDrag(e, "lost"));
}
function makeSeg(label, opts, current, onPick) {
  const row = el("div", { class: "tw__row" });
  row.appendChild(el("div", { class: "lbl" }, el("span", {}, label), el("span", { style: "color:var(--ink);" }, current.toUpperCase())));
  const seg = el("div", { class: "tw__seg" });
  opts.forEach(o => {
    const b = el("button", { class: o === current ? "on" : "", onclick: () => onPick(o) }, o.toUpperCase());
    seg.appendChild(b);
  });
  row.appendChild(seg);
  return row;
}
function makeSwatch(label, current, onPick) {
  const row = el("div", { class: "tw__row" });
  row.appendChild(el("div", { class: "lbl" }, el("span", {}, label), el("span", { style: "color:var(--ink);" }, current.toUpperCase())));
  const sw = el("div", { class: "tw__sw" });
  Object.keys(ACCENTS).forEach(k => {
    const b = el("button", { class: k === current ? "on" : "", style: `--c:${ACCENTS[k]}`, onclick: () => onPick(k), title: k });
    sw.appendChild(b);
  });
  row.appendChild(sw);
  return row;
}
function openTweaks() { $(".tw").classList.add("is-open"); renderTweaks(); }
function closeTweaks() {
  $(".tw").classList.remove("is-open");
  window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*");
}

/* =========================================================
   IMPORT / EXPORT
   ========================================================= */
function fileStamp(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
// "DNA · CROSS" → "DNA-CROSS" ; keeps Japanese, drops characters a file name can't hold
function fileLabel(text) {
  return String(text || "map").replace(/[\\/:*?"<>|]+/g, "").replace(/[\s·・]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "map";
}
function catLabel(id = state.active) { return CATEGORIES.find(c => c.id === id)?.label || id; }
// one map with everything (layout, images, relations, ids) + its category, so another browser can add it
function exportJSON() {
  const id = state.active;
  const cat = CATEGORIES.find(c => c.id === id);
  const out = JSON.stringify({ version: 2, trees: { [id]: state.trees[id] }, cats: cat ? [{ ...cat }] : [] }, null, 2);
  download(out, "mindmap-" + fileLabel(catLabel(id)) + "_" + fileStamp() + ".json", "application/json");
  toast("EXPORTED · JSON · " + catLabel(id));
}
function branchMarkdown() {
  const full = state.trees[state.active];
  const root = viewRoot(full);
  let out = "";
  function walk(n, lvl) {
    const hashes = "#".repeat(Math.min(6, lvl + 1));
    const ttl = n.url ? `[${n.title}](${n.url})` : n.title;
    out += `${hashes} ${ttl}\n`;
    (n.notes || []).forEach(t => out += `- ${t}\n`);
    if (lvl === 0) out += "\n";
    (n.children || []).forEach(c => walk(c, lvl + 1));
  }
  walk(root, 0);
  return out;
}
async function copyText(text, okMsg = "COPIED") {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; }
  catch {
    const ta = el("textarea", { style: "position:fixed;left:-9999px;top:0" });
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    toast(ok ? okMsg : "COPY FAILED");
    return ok;
  }
}
async function copyBranchMD() {
  const text = branchMarkdown();
  try { await navigator.clipboard.writeText(text); toast("BRANCH · MARKDOWN COPIED"); return true; }
  catch {
    const ta = el("textarea", { style: "position:fixed;left:-9999px;top:0" });
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    toast(ok ? "BRANCH · MARKDOWN COPIED" : "COPY FAILED · USE EXPORT.MD");
    return ok;
  }
}
function exportMD() {
  const root = state.trees[state.active];
  if (viewRoot(root) !== root) {
    const top = viewRoot(root);
    download(branchMarkdown(), "mindmap-" + fileLabel(catLabel()) + "_branch-" + fileLabel(top.title) + "_" + fileStamp() + ".md", "text/markdown");
    toast("EXPORTED · BRANCH MARKDOWN");
    return;
  }
  let out = "";
  function walk(n, lvl) {
    if (lvl > 0) {
      const hashes = "#".repeat(Math.min(6, lvl));
      const ttl = n.url ? `[${n.title}](${n.url})` : n.title;
      out += `${hashes} ${ttl}\n`;
      (n.notes || []).forEach(t => out += `- ${t}\n`);
    } else {
      const ttl = n.url ? `[${n.title}](${n.url})` : n.title;
      out += `# ${ttl}\n\n`;
    }
    (n.children || []).forEach(c => walk(c, lvl + 1));
  }
  walk(root, 0);
  download(out, "mindmap-" + fileLabel(catLabel()) + "_" + fileStamp() + ".md", "text/markdown");
  toast("EXPORTED · MARKDOWN");
}
function download(content, name, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* =========================================================
   IMPORT
   ========================================================= */
function importJSON() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json,application/json";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const txt = await f.text();
      const data = JSON.parse(txt);
      if (!data.trees) { toast("INVALID JSON FORMAT"); return; }
      pushHistory();
      // merge imported trees into state, keeping existing cats intact
      Object.assign(state.trees, data.trees);
      // recalc meta for all cats
      CATEGORIES.forEach(cat => {
        if (state.trees[cat.id]) {
          state.meta[cat.id] = { count: countNodes(state.trees[cat.id]), depth: maxDepth(state.trees[cat.id]) };
        }
      });
      renderAll();
      saveState();
      toast("IMPORTED · JSON");
    } catch (e) {
      toast("ERROR · INVALID FILE");
    }
  };
  inp.click();
}

function importMD() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".md,.markdown,text/markdown,text/plain";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const txt = await f.text();
      pushHistory();
      const root = parseMarkdown(txt);
      layoutTree(root);
      state.trees[state.active] = root;
      state.meta[state.active] = { count: countNodes(root), depth: maxDepth(root) };
      // reset view for fresh import
      state.views[state.active] = { x: 600, y: 400, k: 0.85 };
      renderAll();
      saveState();
      toast("IMPORTED · MARKDOWN");
    } catch (e) {
      toast("ERROR · INVALID FILE");
    }
  };
  inp.click();
}

/* =========================================================
   TOAST
   ========================================================= */
let toastT;
function toast(msg) {
  const t = $(".toast");
  t.innerHTML = `<span class="acc">●</span>${msg}`;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 1600);
}

/* =========================================================
   INIT
   ========================================================= */
function renderAll({ save = true } = {}) {
  const shouldFit = !state.views[state.active];
  applyTheme();
  applyInspectorState();
  renderSidebar();
  renderStage();
  if (shouldFit) {
    if (save) fitView(false);
    else { getView(); applyTransform(); updateCrumbs(); }
  } else {
    updateCrumbs();
    if (save) saveState();
  }
}

async function init() {
  await loadAllMaps();
  renderAll();
  setTimeout(() => window.dispatchEvent(new Event("mindmap:ready")), 0);
  attachStagePanZoom();
  attachNodeDrag();

  $("#btn-add").addEventListener("click", () => {
    const root = state.trees[state.active];
    const parent = state.selected ? findNodeById(root, state.selected) : root;
    addChild(parent || root);
  });
  $("#btn-fit").addEventListener("click", () => fitView());
  $("#btn-tree").addEventListener("click", () => setLayoutMode("tree"));
  $("#btn-free").addEventListener("click", () => setLayoutMode("free"));
  $("#btn-tree-bake").addEventListener("click", bakeTreeToFree);
  $("#btn-insp").addEventListener("click", toggleInspector);
  $("#btn-export").addEventListener("click", exportJSON);
  $("#btn-export-md").addEventListener("click", exportMD);
  $("#btn-import").addEventListener("click", () => window.Safety ? window.Safety.importJSON() : importJSON());
  $("#btn-import-md").addEventListener("click", () => window.Safety ? window.Safety.importMD() : importMD());
  $("#btn-backup")?.addEventListener("click", () => window.Safety?.backupAll());
  $("#btn-reload-md")?.addEventListener("click", () => window.Safety?.reloadFromFile());
  // FILE menu: toggle on its button, close after a pick, on outside press or Esc
  const fileMenu = $(".hd__menu");
  const setFileMenu = (open) => {
    $(".hd__menu-list", fileMenu).hidden = !open;
    $(".hd__menu-btn", fileMenu).setAttribute("aria-expanded", String(open));
  };
  $(".hd__menu-btn", fileMenu).addEventListener("click", () => setFileMenu($(".hd__menu-list", fileMenu).hidden));
  $(".hd__menu-list", fileMenu).addEventListener("click", (e) => { if (e.target.closest("button")) setFileMenu(false); });
  document.addEventListener("pointerdown", (e) => { if (!fileMenu.contains(e.target)) setFileMenu(false); });
  fileMenu.addEventListener("keydown", (e) => { if (e.key === "Escape") { setFileMenu(false); $(".hd__menu-btn", fileMenu).focus(); } });
  $("#btn-tweaks").addEventListener("click", () => openTweaks());

  $(".zoom .zin").addEventListener("click", () => { const v=getView(); v.k=Math.min(2.5,v.k*1.15); applyTransform(true); saveState(); updateCrumbs(); });
  $(".zoom .zout").addEventListener("click", () => { const v=getView(); v.k=Math.max(0.25,v.k/1.15); applyTransform(true); saveState(); updateCrumbs(); });
  $(".zoom .zfit").addEventListener("click", () => fitView());
  $(".zoom .zbranch").addEventListener("click", () => toggleBranch());
  $(".zoom .zfocus").addEventListener("click", () => {
    if (!state.selected) { toast("FOCUS · SELECT A NODE"); return; }
    focusNode(state.selected);
  });

  const searchInput = $(".srch");
  searchInput.addEventListener("input", (e) => {
    if (e.isComposing) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderSearch, 80);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSearchIndex(searchIndex + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSearchIndex(searchIndex < 0 ? searchResults.length - 1 : searchIndex - 1); }
    else if (e.key === "Enter" && searchIndex >= 0) { e.preventDefault(); jumpToSearchResult(searchResults[searchIndex]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSearch({ clear: true, focusStage: true }); }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!(e.target instanceof Element && e.target.closest(".srch-wrap"))) closeSearch();
  });

  // keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape" && window.cancelCategoryDrag?.()) { e.preventDefault(); return; }
    if (window.isKeysOpen?.()) {
      if (e.key === "Escape" || (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "?")) {
        e.preventDefault();
        window.closeKeys?.();
      }
      return;
    }
    if (e.key === "Escape" && dragState.kind) { e.preventDefault(); endActiveDrag(e, "escape"); return; }
    if (editSession) {
      if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
      return;
    }
    if (e.target && (e.target.isContentEditable || /input|textarea/i.test(e.target.tagName))) return;
    const meta = e.ctrlKey || e.metaKey;
    if (!meta && !e.altKey && e.key === "?") {
      e.preventDefault(); window.openKeys?.();
    }
    else if ((!meta && !e.altKey && !e.shiftKey && e.key === "/") || (meta && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k")) {
      e.preventDefault(); searchInput.focus(); searchInput.select();
    }
    else if (meta && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (meta && (e.shiftKey && e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) { e.preventDefault(); redo(); }
    else if (!meta && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "t") { e.preventDefault(); setLayoutMode(isTreeMode() ? "free" : "tree"); }
    else if (!meta && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); fitView(); }
    else if (!meta && !e.altKey && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      if (!state.selected) toast("FOCUS · SELECT A NODE");
      else focusNode(state.selected);
    }
    else if (!meta && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); toggleInspector(); }
    else if (!meta && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); toggleBranch(); }
    else if (meta && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); window.Safety ? window.Safety.importMD() : importMD(); }
    // keyboard zones: no node selected = the category list (↑↓ maps, → into the map);
    // a node selected = the map (← parent / back to the list at the top, → first child, ↑↓ same level)
    else if (!meta && !e.altKey && !e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      if (state.selected) stepNode("child");
      else { const top = viewRoot(state.trees[state.active]); if (top) { selectNode(top); focusNode(top.id); } }
    }
    else if (!meta && !e.altKey && !e.shiftKey && e.key === "ArrowLeft" && state.selected) {
      e.preventDefault(); stepNode("parent");
    }
    else if (!meta && !e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && state.selected) {
      e.preventDefault(); stepNode(e.key === "ArrowUp" ? "prev" : "next");
    }
    else if (!meta && !e.altKey && !e.shiftKey && (e.key === "Enter" || e.key === "F2") && state.selected) {
      e.preventDefault(); beginEdit(state.selected);
    }
    else if (!meta && !e.altKey && !e.shiftKey && e.key === "Tab" && state.selected && !document.body.classList.contains("is-readonly")) {
      e.preventDefault();
      const n = findNodeById(state.trees[state.active], state.selected);
      if (n) addChild(n);
    }
    else if (!meta && !e.altKey && !e.shiftKey && e.key === "Escape" && branchFocus) {
      e.preventDefault(); clearBranch();
    }
    else if (!meta && !e.altKey && !e.shiftKey && e.key === "Escape") {
      setLinkPartner(null);
      state.selected = null;
      $$(".node.is-selected").forEach(x => x.classList.remove("is-selected"));
      markSelectedEdges(null);
      updateCrumbs();
      renderInspector();
    }
  });

  // edit mode protocol
  window.addEventListener("message", (ev) => {
    if (!ev.data) return;
    if (ev.data.type === "__activate_edit_mode") openTweaks();
    if (ev.data.type === "__deactivate_edit_mode") $(".tw").classList.remove("is-open");
  });
  window.parent.postMessage({ type: "__edit_mode_available" }, "*");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* expose for extras.js */
window.renderAll = renderAll;
window.renderStage = renderStage;
window.renderSidebar = renderSidebar;
window.updateCrumbs = updateCrumbs;
window.applyTransform = applyTransform;
window.pushHistory = pushHistory;
window.saveState = saveState;
window.safeSetItem = safeSetItem;
window.toast = toast;
window.findNodeById = findNodeById;
window.blockReadonly = blockReadonly;
window.countNodes = countNodes;
window.maxDepth = maxDepth;
window.parseMarkdown = parseMarkdown;
window.layoutTree = layoutTree;
window.download = download;
window.getView = getView;
window.fitView = fitView;
window.focusNode = focusNode;
window.setBranch = setBranch;
window.jumpToNode = (cat, id) => jumpToSearchResult({ cat, id });
window.isInBranch = isInBranch;
window.branchMarkdown = branchMarkdown;
window.copyBranchMD = copyBranchMD;
window.selectNode = selectNode;
window.persistCatLabels = persistCatLabels;
window.getLinkPartner = () => linkPartner;
window.setLinkPartner = setLinkPartner;
window.fileStamp = fileStamp;
window.fileLabel = fileLabel;
window.catLabel = catLabel;
window.clearBranch = clearBranch;
window.searchNodes = searchNodes;
window.beginEdit = beginEdit;
window.renderInspector = renderInspector;
window.posOf = posOf;
window.setLayoutMode = setLayoutMode;
