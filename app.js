/* =========================================================
   tDR-INSPIRED MINDMAP — APP  (build v3 — root fix + brand fonts)
   ========================================================= */

const CATEGORIES = [
  { id: "ZBRUSH",       file: "maps/ZBRUSH.md",       label: "ZBRUSH",        sub: "FLEE / ANIMATION",       jp: "" },
  { id: "3dsmax",       file: "maps/3dsmax.md",       label: "3DS · MAX",     sub: "MODEL / LAYOUT / RIG",   jp: "" },
  { id: "design",       file: "maps/design.md",       label: "DESIGN",        sub: "SHAPE / COLOR / MOTION", jp: "" },
  { id: "hud",          file: "maps/hud.md",          label: "HUD",           sub: "UI / SCI-FI / SPECS",    jp: "" },
  { id: "music-video",  file: "maps/music-video.md",  label: "MUSIC · VIDEO", sub: "AE / 3D / REFERENCE",    jp: "" },
  { id: "prepro",       file: "maps/prepro.md",       label: "PRE · PROD",    sub: "CONCEPT / STORYBOARD",   jp: "プリプロダクション" },
];

const STORE_KEY = "tdr-mindmap-v3";

/* ---------- markdown parsing ---------- */
function parseMarkdown(md) {
  // Strip HTML comments
  md = md.replace(/<!--[\s\S]*?-->/g, "");
  const lines = md.split(/\r?\n/);

  let root = null;
  const stack = [];
  let counter = 1;
  const mkId = () => `n_${counter++}`;

  const headRe = /^(#{1,6})\s+(.+)$/;
  const bullRe = /^(\s*)[-*]\s+(.+)$/;

  for (let raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const h = line.match(headRe);
    if (h) {
      const lvl = h[1].length;
      const text = h[2].trim();
      // first #-heading becomes the root
      if (!root && lvl === 1) {
        const r = makeNode(text, 0, "n_root");
        r.id = "n_root";
        root = r;
        stack.push(root);
        continue;
      }
      // if the very first heading is deeper (no #), synthesize a root
      if (!root) {
        root = { id: "n_root", title: "ROOT", url: null, notes: [], children: [], level: 0 };
        stack.push(root);
      }
      const node = makeNode(text, lvl, mkId());
      // pop until parent has level < this
      while (stack.length && stack[stack.length - 1].level >= lvl) stack.pop();
      const parent = stack[stack.length - 1] || root;
      parent.children.push(node);
      stack.push(node);
      continue;
    }
    const b = line.match(bullRe);
    if (b) {
      const text = b[2].trim();
      const cur = stack[stack.length - 1];
      if (cur) {
        if (cur.notes.length < 3) cur.notes.push(stripLinks(text));
      }
    }
  }
  if (!root) {
    root = { id: "n_root", title: "ROOT", url: null, notes: [], children: [], level: 0 };
  }
  return root;
}

function makeNode(text, level, id) {
  // first link in text becomes node.url
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/;
  let url = null, title = text;
  const m = text.match(linkRe);
  if (m) {
    title = m[1];
    url = m[2];
  }
  // strip remaining markdown links
  title = title.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  // strip wrapping brackets like [【...】]
  title = title.trim();
  return { id, title, url, notes: [], children: [], level, _open: true };
}

function stripLinks(text) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").trim();
}

/* ---------- layout (tidy tree, non-overlapping) ---------- */
function layoutTree(root) {
  // Reingold–Tilford-ish: assign each leaf a slot, then center parents.
  // Right-extending horizontal layout: x by depth, y by accumulated leaf index.
  const COL = 280;       // horizontal distance per depth
  const ROW = 64;        // vertical distance per leaf slot
  const SNAP = 8;
  let leafCounter = 0;

  function assign(node, depth) {
    node._depth = depth;
    if (!node.children || node.children.length === 0) {
      node._row = leafCounter++;
      node._minRow = node._row;
      node._maxRow = node._row;
      return;
    }
    node.children.forEach(c => assign(c, depth + 1));
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    node._minRow = first._minRow;
    node._maxRow = last._maxRow;
    node._row = (first._row + last._row) / 2;
  }
  assign(root, 0);

  const totalRows = Math.max(1, leafCounter);
  const yCenter = ((totalRows - 1) * ROW) / 2;

  function place(node) {
    node.x = Math.round((node._depth * COL) / SNAP) * SNAP;
    node.y = Math.round((node._row * ROW - yCenter) / SNAP) * SNAP;
    delete node._depth; delete node._row; delete node._minRow; delete node._maxRow;
    (node.children || []).forEach(place);
  }
  // shift root so root x is 0
  place(root);

  // collect for return
  const out = [];
  (function w(n) { out.push(n); (n.children || []).forEach(w); })(root);
  return out;
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
function shortUrl(u) {
  try {
    const url = new URL(u);
    return url.host.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname.slice(0, 24));
  } catch { return u.slice(0, 28); }
}

/* ---------- counts ---------- */
function countNodes(root) {
  let n = 0;
  (function w(x) { n++; (x.children || []).forEach(w); })(root);
  return n;
}
function maxDepth(root) {
  let d = 0;
  (function w(x, l) { d = Math.max(d, l); (x.children || []).forEach(c => w(c, l + 1)); })(root, 0);
  return d;
}

/* =========================================================
   STATE
   ========================================================= */
const state = {
  trees: {},          // id -> root node
  meta: {},           // id -> {counts, depth}
  active: "ZBRUSH",
  selected: null,
  view: { x: 600, y: 400, k: 0.85 },
  theme: "light",
  showCoords: false,
  nodeStyle: "block",   // 'block' | 'minimal'
  accent: "lime",
};

const ACCENTS = {
  lime:    "#c8ff1a",
  yellow:  "#fff700",
  pink:    "#ff3da6",
  orange:  "#ff5a1a",
  ink:     "#0a0a0a",
};

/* =========================================================
   PERSISTENCE
   ========================================================= */
function saveState() {
  const payload = {
    trees: state.trees,
    active: state.active,
    view: state.view,
    theme: state.theme,
    showCoords: state.showCoords,
    nodeStyle: state.nodeStyle,
    accent: state.accent,
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/* =========================================================
   LOAD MAPS
   ========================================================= */
async function loadAllMaps() {
  const stored = loadState();
  for (const cat of CATEGORIES) {
    if (stored && stored.trees && stored.trees[cat.id]) {
      state.trees[cat.id] = stored.trees[cat.id];
    } else {
      try {
        const res = await fetch(cat.file);
        const txt = await res.text();
        const root = parseMarkdown(txt);
        layoutTree(root);
        state.trees[cat.id] = root;
      } catch (e) {
        console.warn("failed to load", cat.file, e);
        state.trees[cat.id] = { id: "n_root", title: cat.label, url: null, notes: [], children: [], level: 0, x: 0, y: 0 };
      }
    }
    state.meta[cat.id] = {
      count: countNodes(state.trees[cat.id]),
      depth: maxDepth(state.trees[cat.id]),
    };
  }
  if (stored) {
    state.active = stored.active || "ZBRUSH";
    state.view = stored.view || state.view;
    state.theme = stored.theme || "light";
    state.showCoords = !!stored.showCoords;
    state.nodeStyle = stored.nodeStyle || "block";
    state.accent = stored.accent || "lime";
  }
}

/* =========================================================
   RENDER — SIDEBAR
   ========================================================= */
function renderSidebar() {
  const list = $(".sb__list");
  list.innerHTML = "";
  CATEGORIES.forEach((cat, i) => {
    const meta = state.meta[cat.id];
    const btn = el("button", {
      class: "cat" + (cat.id === state.active ? " is-active" : ""),
      "data-id": cat.id,
      onclick: () => { state.active = cat.id; state.selected = null; renderAll(); },
    },
      el("div", { class: "cat__idx" }, String(i).padStart(2, "0")),
      el("div", { class: "cat__body" },
        el("div", { class: "cat__t" + (hasJP(cat.label + (cat.jp || "")) ? " jp" : "") }, cat.label),
        el("div", { class: "cat__sub" }, cat.sub),
      ),
      el("div", { class: "cat__meta" },
        el("span", { class: "n" }, "N=" + meta.count),
        el("span", {}, "D" + meta.depth),
      ),
    );
    list.appendChild(btn);
  });
  // foot meta
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
  const r = el("div", { class: "row" }, el("span", {}, k), el("span", { class: "v" }, v));
  return r;
}

/* =========================================================
   RENDER — STAGE
   ========================================================= */
function renderStage() {
  const root = state.trees[state.active];
  const vp = $(".stg__viewport");
  vp.innerHTML = "";

  // update decor giant numerals from category index
  const idx = CATEGORIES.findIndex(c => c.id === state.active);
  const num1 = $(".gh-num1");
  const num2 = $(".gh-num2");
  if (num1) num1.textContent = String(idx).padStart(2, "0");
  if (num2) num2.textContent = (idx + 1) + "A";

  // SVG edges
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "edges");
  svg.style.position = "absolute";
  svg.style.left = "-3000px";
  svg.style.top = "-3000px";
  svg.style.width = "9000px";
  svg.style.height = "9000px";
  svg.setAttribute("viewBox", "-3000 -3000 9000 9000");
  vp.appendChild(svg);

  // gather nodes flat
  const flat = [];
  (function walk(n, parent) { flat.push({ n, parent }); (n.children || []).forEach(c => walk(c, n)); })(root, null);

  // edges
  flat.forEach(({ n, parent }) => {
    if (!parent) return;
    const x1 = parent.x, y1 = parent.y;
    const x2 = n.x, y2 = n.y;
    const isAccent = (parent === root);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    // right-angle path: from parent right edge to node, with elbow
    const midX = (x1 + x2) / 2;
    const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    path.setAttribute("d", d);
    if (isAccent) path.setAttribute("class", "edge-acc");
    path.setAttribute("data-edge-from", parent.id);
    path.setAttribute("data-edge-to", n.id);
    svg.appendChild(path);
  });

  // nodes
  flat.forEach(({ n, parent }, i) => {
    const isRoot = !parent;
    const lvl = computeLevel(n, root);
    const node = el("div", {
      class: "node lvl-" + lvl + (isRoot ? " is-root" : "") + (state.selected === n.id ? " is-selected" : ""),
      "data-id": n.id,
      style: `left:${n.x}px; top:${n.y}px; transform: translate(-50%, -50%);`,
    });
    // header
    const idxStr = isRoot ? "ROOT" : padIdx(i, lvl);
    node.appendChild(el("div", { class: "node__head" },
      el("span", { class: "node__idx" }, idxStr),
      el("span", { class: "node__lvl" }, "L" + lvl),
    ));
    // thumb (only on lvl 1 under root, only if image set)
    if (lvl === 1 && state.nodeStyle === "block" && n.thumb) {
      const t = el("div", { class: "node__thumb" });
      t.style.backgroundImage = `url(${n.thumb})`;
      node.appendChild(t);
    }
    // body
    const body = el("div", { class: "node__body" });
    const title = el("div", {
      class: "node__title" + (hasJP(n.title) ? " has-jp" : ""),
      contenteditable: "true",
      spellcheck: "false",
    }, n.title || "Untitled");
    title.addEventListener("blur", () => {
      n.title = title.textContent.trim();
      saveState();
    });
    title.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); title.blur(); }
    });
    body.appendChild(title);

    if (n.notes && n.notes.length) {
      const notes = el("div", { class: "node__notes" });
      n.notes.slice(0, 2).forEach(t => notes.appendChild(el("div", { class: "n" }, t)));
      body.appendChild(notes);
    }

    if (n.url || isRoot === false) {
      const urlRow = el("div", { class: "node__url" });
      urlRow.appendChild(el("span", { class: "lbl" }, "URL"));
      const a = n.url ? el("a", { href: n.url, target: "_blank", rel: "noreferrer noopener" }, shortUrl(n.url))
                       : el("span", { style: "color:var(--mute);font-style:italic;" }, "—");
      urlRow.appendChild(a);
      body.appendChild(urlRow);
    }
    node.appendChild(body);

    // coord
    node.appendChild(el("div", { class: "node__coord" }, fmtCoord(n.x, n.y)));

    // actions
    const actions = el("div", { class: "node__actions" },
      el("button", { onclick: (e) => { e.stopPropagation(); editURL(n); } }, "URL"),
      el("button", { onclick: (e) => { e.stopPropagation(); pickThumb(n); } }, "IMG"),
      el("button", { onclick: (e) => { e.stopPropagation(); addChild(n); } }, "+ CHILD"),
      el("button", { class: "del", onclick: (e) => { e.stopPropagation(); delNode(n); } }, "DEL"),
    );
    node.appendChild(actions);

    // node interactions
    attachNodeDrag(node, n);
    node.addEventListener("click", (ev) => {
      if (ev.target.closest(".node__title")) return;
      if (ev.target.closest(".node__url a")) return;
      ev.stopPropagation();
      state.selected = n.id;
      // toggle selected without full re-render
      $$(".node.is-selected").forEach(el => el.classList.remove("is-selected"));
      node.classList.add("is-selected");
      updateCrumbs();
    });

    // image drop
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
        const url = await fileToDataURL(f);
        n.thumb = url;
        renderStage();
        saveState();
        toast("IMAGE ATTACHED");
      }
    });

    vp.appendChild(node);
  });

  applyTransform();
  $(".stg")?.classList.toggle("show-coords", state.showCoords);
}

function computeLevel(node, root) {
  // BFS find depth
  if (node === root) return 0;
  let lvl = -1;
  (function w(n, l) {
    if (lvl !== -1) return;
    if (n === node) { lvl = l; return; }
    (n.children || []).forEach(c => w(c, l + 1));
  })(root, 0);
  return lvl < 0 ? 0 : lvl;
}

function padIdx(i, lvl) {
  // produce tDR-ish indices: 00, 01, 1A, 2B...
  const a = "0123456789ABCDEF";
  return String(lvl) + a[i % 16];
}

/* =========================================================
   TRANSFORM (pan / zoom)
   ========================================================= */
function applyTransform() {
  const { x, y, k } = state.view;
  const vp = $(".stg__viewport");
  if (vp) vp.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  const lvl = $(".zoom .lvl");
  if (lvl) lvl.textContent = Math.round(k * 100) + "%";
}
function attachStagePanZoom() {
  const stg = $(".stg");
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  stg.addEventListener("mousedown", (e) => {
    if (e.target !== stg && !e.target.classList.contains("regmarks") && !e.target.closest(".regmarks")) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    ox = state.view.x; oy = state.view.y;
    stg.classList.add("is-panning");
    state.selected = null;
    $$(".node.is-selected").forEach(el => el.classList.remove("is-selected"));
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    state.view.x = ox + (e.clientX - sx);
    state.view.y = oy + (e.clientY - sy);
    applyTransform();
  });
  window.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; stg.classList.remove("is-panning"); saveState(); }
  });
  stg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const newK = Math.min(2.5, Math.max(0.25, state.view.k * (1 + delta)));
    const rect = stg.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    // zoom toward cursor
    const dx = (cx - state.view.x) / state.view.k;
    const dy = (cy - state.view.y) / state.view.k;
    state.view.k = newK;
    state.view.x = cx - dx * newK;
    state.view.y = cy - dy * newK;
    applyTransform();
    saveState();
  }, { passive: false });
}

/* =========================================================
   NODE DRAG (reposition + reparent)
   ========================================================= */
function attachNodeDrag(el, n) {
  let dragging = false, started = false, sx = 0, sy = 0, ox = 0, oy = 0;
  el.addEventListener("mousedown", (e) => {
    if (e.target.closest(".node__title")) return;
    if (e.target.closest(".node__url a")) return;
    if (e.target.closest(".node__actions")) return;
    if (e.button !== 0) return;
    dragging = true; started = false;
    sx = e.clientX; sy = e.clientY;
    ox = n.x; oy = n.y;
    e.stopPropagation();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const k = state.view.k;
    const dx = (e.clientX - sx) / k;
    const dy = (e.clientY - sy) / k;
    if (!started && Math.hypot(dx, dy) < 3) return;
    if (!started) { started = true; el.classList.add("dragging"); }
    n.x = Math.round((ox + dx) / 10) * 10;
    n.y = Math.round((oy + dy) / 10) * 10;
    el.style.left = n.x + "px";
    el.style.top = n.y + "px";
    el.querySelector(".node__coord").textContent = fmtCoord(n.x, n.y);
    updateEdgesForNode(n);
    // hover detect for reparent
    if (e.shiftKey) {
      const target = pickNodeAt(e.clientX, e.clientY, n);
      $$(".node.drop-target").forEach(x => x.classList.remove("drop-target"));
      if (target) target.dom.classList.add("drop-target");
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    if (started && e.shiftKey) {
      const target = pickNodeAt(e.clientX, e.clientY, n);
      if (target && target.node !== n) reparent(n, target.node);
    }
    dragging = false;
    if (started) {
      el.classList.remove("dragging");
      $$(".node.drop-target").forEach(x => x.classList.remove("drop-target"));
      saveState();
    }
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
  for (const c of root.children || []) {
    const f = findNodeById(c, id);
    if (f) return f;
  }
  return null;
}
function findParent(root, id) {
  for (const c of root.children || []) {
    if (c.id === id) return root;
    const f = findParent(c, id);
    if (f) return f;
  }
  return null;
}
function isDescendant(a, b) {
  // is b a descendant of a?
  for (const c of a.children || []) {
    if (c === b) return true;
    if (isDescendant(c, b)) return true;
  }
  return false;
}
function reparent(node, newParent) {
  const root = state.trees[state.active];
  if (node === root) return;
  if (newParent === node) return;
  if (isDescendant(node, newParent)) { toast("CIRCULAR · BLOCKED"); return; }
  const oldParent = findParent(root, node.id);
  if (!oldParent) return;
  oldParent.children = oldParent.children.filter(c => c !== node);
  newParent.children.push(node);
  toast("RE · PARENTED");
  renderStage();
  saveState();
}

function updateEdgesForNode(n) {
  const root = state.trees[state.active];
  const svg = $(".stg__viewport .edges");
  if (!svg) return;
  // update edges where this node is endpoint or origin
  $$(`path[data-edge-to="${n.id}"], path[data-edge-from="${n.id}"]`, svg).forEach(p => {
    const fromId = p.getAttribute("data-edge-from");
    const toId = p.getAttribute("data-edge-to");
    const a = findNodeById(root, fromId);
    const b = findNodeById(root, toId);
    if (!a || !b) return;
    const midX = (a.x + b.x) / 2;
    p.setAttribute("d", `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`);
  });
}

/* =========================================================
   NODE OPS
   ========================================================= */
function addChild(parent) {
  const id = "n_" + Math.random().toString(36).slice(2, 8);
  const newNode = {
    id, title: "NEW NODE", url: null, notes: [], children: [],
    x: (parent.x || 0) + 240, y: (parent.y || 0) + 60,
  };
  parent.children.push(newNode);
  state.selected = id;
  renderStage();
  saveState();
  toast("NODE ADDED");
}
function delNode(n) {
  const root = state.trees[state.active];
  if (n === root) { toast("CANNOT DELETE ROOT"); return; }
  if (!confirm("Delete this node and all children?")) return;
  const p = findParent(root, n.id);
  if (!p) return;
  p.children = p.children.filter(c => c !== n);
  state.selected = null;
  renderStage();
  saveState();
  toast("DELETED");
}
function editURL(n) {
  const u = prompt("URL:", n.url || "https://");
  if (u === null) return;
  n.url = u.trim() || null;
  renderStage();
  saveState();
}
function pickThumb(n) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    n.thumb = await fileToDataURL(f);
    renderStage();
    saveState();
    toast("IMAGE ATTACHED");
  };
  inp.click();
}
function fileToDataURL(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

/* =========================================================
   CRUMBS / META
   ========================================================= */
function updateCrumbs() {
  const cat = CATEGORIES.find(c => c.id === state.active);
  const root = state.trees[state.active];
  const meta = state.meta[state.active];
  const sel = state.selected ? findNodeById(root, state.selected) : null;
  $(".hd__crumbs").innerHTML = "";
  const c = $(".hd__crumbs");
  c.appendChild(el("span", { class: "coord" }, "M/" + String(CATEGORIES.indexOf(cat)).padStart(2, "0")));
  c.appendChild(el("span", { class: "sep" }, "/"));
  c.appendChild(el("span", {}, cat.label));
  c.appendChild(el("span", { class: "sep" }, "—"));
  c.appendChild(el("span", { class: "coord" }, "N=" + meta.count + " · D=" + meta.depth));
  c.appendChild(el("span", { class: "sep" }, "—"));
  c.appendChild(el("span", { class: "pin" }, sel ? "SEL: " + (sel.title || "").slice(0, 30) : "—"));
  // status bar value mirrors
  $$(".foot .v").forEach((e, i) => {
    if (i === 0) e.textContent = cat.label;
    if (i === 1) e.textContent = "N=" + meta.count;
    if (i === 2) e.textContent = "Z=" + Math.round(state.view.k * 100) + "%";
  });
}

/* =========================================================
   TWEAKS
   ========================================================= */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  document.documentElement.style.setProperty("--acc", ACCENTS[state.accent] || ACCENTS.lime);
  if (state.accent === "ink") {
    document.documentElement.style.setProperty("--acc-ink", "#ffffff");
  } else {
    document.documentElement.style.setProperty("--acc-ink", "#0a0a0a");
  }
}

function renderTweaks() {
  const tw = $(".tw");
  tw.innerHTML = "";
  tw.appendChild(el("div", { class: "tw__hd" },
    el("span", {}, "TWEAKS"),
    el("button", { class: "x", onclick: () => closeTweaks() }, "×"),
  ));
  const body = el("div", { class: "tw__body" });

  body.appendChild(makeSeg("THEME", ["light", "dark"], state.theme, v => { state.theme = v; applyTheme(); saveState(); renderTweaks(); }));
  body.appendChild(makeSwatch("ACCENT", state.accent, v => { state.accent = v; applyTheme(); saveState(); renderTweaks(); renderStage(); }));
  body.appendChild(makeSeg("COORDS", ["off", "on"], state.showCoords ? "on" : "off", v => { state.showCoords = (v === "on"); saveState(); $(".stg")?.classList.toggle("show-coords", state.showCoords); renderTweaks(); }));
  body.appendChild(makeSeg("NODE", ["block", "minimal"], state.nodeStyle, v => { state.nodeStyle = v; saveState(); renderStage(); renderTweaks(); }));

  // Reset
  const resetBtn = el("button", {
    style: "appearance:none;background:var(--bg);border:1px solid var(--line);padding:8px;font-family:inherit;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink);cursor:pointer;",
    onclick: () => { if (confirm("Reset all maps to source markdown?")) { localStorage.removeItem(STORE_KEY); location.reload(); } },
  }, "RESET ALL DATA");
  body.appendChild(resetBtn);

  tw.appendChild(body);
}
function makeSeg(label, opts, current, onPick) {
  const row = el("div", { class: "tw__row" });
  row.appendChild(el("div", { class: "lbl" }, el("span", {}, label), el("span", { style: "color:var(--ink);" }, current.toUpperCase())));
  const seg = el("div", { class: "tw__seg" });
  opts.forEach(o => {
    const b = el("button", {
      class: o === current ? "on" : "",
      onclick: () => onPick(o),
    }, o.toUpperCase());
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
    const b = el("button", {
      class: k === current ? "on" : "",
      style: `--c:${ACCENTS[k]}`,
      onclick: () => onPick(k),
      title: k,
    });
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
function exportJSON() {
  const out = JSON.stringify({ version: 1, trees: state.trees }, null, 2);
  download(out, "mindmap-" + Date.now() + ".json", "application/json");
  toast("EXPORTED · JSON");
}
function exportMD() {
  // export current active map
  const root = state.trees[state.active];
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
  download(out, state.active + "-" + Date.now() + ".md", "text/markdown");
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
function renderAll() {
  applyTheme();
  renderSidebar();
  renderStage();
  updateCrumbs();
  saveState();
}

async function init() {
  await loadAllMaps();
  renderAll();
  attachStagePanZoom();

  // header buttons
  $("#btn-add").addEventListener("click", () => {
    const root = state.trees[state.active];
    addChild(root);
  });
  $("#btn-fit").addEventListener("click", () => {
    state.view = { x: window.innerWidth/2 - 140, y: window.innerHeight/2 - 80, k: 0.7 };
    applyTransform(); saveState();
  });
  $("#btn-export").addEventListener("click", exportJSON);
  $("#btn-export-md").addEventListener("click", exportMD);
  $("#btn-tweaks").addEventListener("click", () => openTweaks());

  // zoom
  $(".zoom .zin").addEventListener("click", () => { state.view.k = Math.min(2.5, state.view.k * 1.15); applyTransform(); saveState(); updateCrumbs(); });
  $(".zoom .zout").addEventListener("click", () => { state.view.k = Math.max(0.25, state.view.k / 1.15); applyTransform(); saveState(); updateCrumbs(); });
  $(".zoom .zfit").addEventListener("click", () => $("#btn-fit").click());

  // initial center: fit map roughly into viewport
  const stg = $(".stg");
  state.view.x = stg.clientWidth / 2 - 140;
  state.view.y = stg.clientHeight / 2 - 60;
  applyTransform();

  // edit mode protocol
  window.addEventListener("message", (ev) => {
    if (!ev.data) return;
    if (ev.data.type === "__activate_edit_mode") openTweaks();
    if (ev.data.type === "__deactivate_edit_mode") $(".tw").classList.remove("is-open");
  });
  window.parent.postMessage({ type: "__edit_mode_available" }, "*");
}

document.addEventListener("DOMContentLoaded", init);
