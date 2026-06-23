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

/* Load custom cats + ordering at startup */
(function bootstrapCats() {
  try {
    const customs = JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY) || "[]");
    customs.forEach(c => {
      if (!CATEGORIES.find(x => x.id === c.id)) CATEGORIES.push(c);
    });
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
})();

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
      if (cur && cur.notes.length < 3) cur.notes.push(stripLinks(text));
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
function shortUrl(u) {
  try {
    const url = new URL(u);
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
  active: "ZBRUSH",
  selected: null,
  theme: "light",
  showCoords: false,
  nodeStyle: "block",
  accent: "yellow",
  twPos: { right: 16, bottom: 48 },
};
const state = window.state;
const ACCENTS = { yellow: "#ffd400", lime: "#c8ff1a", pink: "#ff3da6", orange: "#ff5a1a", ink: "#0a0a0a" };
function getView() {
  if (!state.views[state.active]) state.views[state.active] = { x: 600, y: 400, k: 0.85 };
  return state.views[state.active];
}

/* =========================================================
   PERSIST
   ========================================================= */
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({
    trees: state.trees, views: state.views, active: state.active,
    theme: state.theme, showCoords: state.showCoords, nodeStyle: state.nodeStyle, accent: state.accent,
    twPos: state.twPos,
  })); } catch {}
}
function loadStateRaw() { try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }

/* =========================================================
   UNDO / REDO  (snapshots of trees+views)
   ========================================================= */
const history = { past: [], future: [] };
const HIST_MAX = 60;
function snapshot() {
  return JSON.stringify({ trees: state.trees, views: state.views });
}
function restoreSnap(s) {
  const o = JSON.parse(s);
  state.trees = o.trees;
  state.views = o.views;
}
function pushHistory() {
  history.past.push(snapshot());
  if (history.past.length > HIST_MAX) history.past.shift();
  history.future.length = 0;
}
function undo() {
  if (!history.past.length) return;
  const cur = snapshot();
  const prev = history.past.pop();
  history.future.push(cur);
  restoreSnap(prev);
  renderStage(); updateCrumbs(); saveState();
  toast("UNDO");
}
function redo() {
  if (!history.future.length) return;
  const cur = snapshot();
  const nxt = history.future.pop();
  history.past.push(cur);
  restoreSnap(nxt);
  renderStage(); updateCrumbs(); saveState();
  toast("REDO");
}

/* =========================================================
   LOAD MAPS
   ========================================================= */
async function loadAllMaps() {
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
    state.theme = (stored.theme === "dark" ? "white" : stored.theme) || "light";
    state.showCoords = !!stored.showCoords;
    state.nodeStyle = stored.nodeStyle || "block";
    state.accent = stored.accent || "yellow";
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
      onclick: () => { state.active = cat.id; state.selected = null; renderAll(); },
    },
      el("div", { class: "cat__idx" }, String(i).padStart(2, "0")),
      el("div", { class: "cat__body" },
        el("div", { class: "cat__t" }, cat.label),
        el("div", { class: "cat__sub" }, cat.sub),
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
function renderStage() {
  const root = state.trees[state.active];
  const vp = $(".stg__viewport");
  if (!vp) return;
  vp.innerHTML = "";
  if (!root) return;

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

  // visible flat (skip children of collapsed nodes)
  const flat = [];
  (function walk(n, parent) {
    flat.push({ n, parent });
    if (n._open !== false) (n.children || []).forEach(c => walk(c, n));
  })(root, null);

  // edges
  flat.forEach(({ n, parent }) => {
    if (!parent) return;
    const x1 = parent.x, y1 = parent.y;
    const x2 = n.x, y2 = n.y;
    const isAccent = (parent === root);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const midX = (x1 + x2) / 2;
    path.setAttribute("d", `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`);
    if (isAccent) path.setAttribute("class", "edge-acc");
    path.setAttribute("data-edge-from", parent.id);
    path.setAttribute("data-edge-to", n.id);
    svg.appendChild(path);
  });

  // nodes
  flat.forEach(({ n, parent }, i) => {
    const isRoot = !parent;
    const lvl = computeLevel(n, root);
    const isMin = state.nodeStyle === "minimal";
    const node = el("div", {
      class: "node lvl-" + lvl + (isRoot ? " is-root" : "") + (state.selected === n.id ? " is-selected" : "") + (isMin ? " is-minimal" : "") + (n._open === false ? " is-collapsed" : ""),
      "data-id": n.id,
      style: `left:${n.x}px; top:${n.y}px; transform: translate(-50%, -50%);`,
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
      contenteditable: "true",
      spellcheck: "false",
    }, n.title || "Untitled");
    title.addEventListener("focus", () => pushHistory());
    title.addEventListener("blur", () => { n.title = title.textContent.trim(); saveState(); });
    title.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); title.blur(); } });
    body.appendChild(title);

    if (!isMin) {
      const notes = el("div", { class: "node__notes" });
      const noteCount = Math.max(1, Math.min(3, (n.notes || []).length || 1));
      for (let ni = 0; ni < noteCount; ni++) {
        const noteText = (n.notes && n.notes[ni]) || "";
        const noteEl = el("div", {
          class: "n" + (noteText ? "" : " is-empty"),
          contenteditable: "true",
          spellcheck: "false",
          "data-placeholder": "+ NOTE",
          "data-note-idx": String(ni),
        }, noteText);
        noteEl.addEventListener("focus", () => { pushHistory(); noteEl.classList.remove("is-empty"); });
        noteEl.addEventListener("input", () => {
          const v = noteEl.textContent;
          if (!n.notes) n.notes = [];
          n.notes[ni] = v;
        });
        noteEl.addEventListener("blur", () => {
          const v = noteEl.textContent.trim();
          if (!n.notes) n.notes = [];
          n.notes[ni] = v;
          // trim trailing empties
          while (n.notes.length && !n.notes[n.notes.length - 1]) n.notes.pop();
          if (!v) noteEl.classList.add("is-empty");
          saveState();
        });
        noteEl.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            // move to next note slot or add new one if room
            const next = noteEl.parentElement.querySelector(`[data-note-idx="${ni + 1}"]`);
            if (next) next.focus();
            else if (ni < 2) {
              noteEl.blur();
              renderStage();
              // focus newly-rendered last note
              setTimeout(() => {
                const dom = $(`.node[data-id="${n.id}"] [data-note-idx="${ni + 1}"]`);
                if (dom) dom.focus();
              }, 0);
            } else {
              noteEl.blur();
            }
          }
        });
        notes.appendChild(noteEl);
      }
      body.appendChild(notes);
    }
    if (!isMin && (n.url || !isRoot)) {
      const urlRow = el("div", { class: "node__url" });
      urlRow.appendChild(el("span", { class: "lbl" }, "URL"));
      const a = n.url ? el("a", { href: n.url, target: "_blank", rel: "noreferrer noopener" }, shortUrl(n.url))
                       : el("span", { style: "color:var(--mute);font-style:italic;" }, "—");
      urlRow.appendChild(a);
      body.appendChild(urlRow);
    }
    node.appendChild(body);
    node.appendChild(el("div", { class: "node__coord" }, fmtCoord(n.x, n.y)));

    const actions = el("div", { class: "node__actions" },
      el("button", { onclick: (e) => { e.stopPropagation(); editURL(n); } }, "URL"),
      el("button", { onclick: (e) => { e.stopPropagation(); pickThumb(n); } }, "IMG"),
      el("button", { onclick: (e) => { e.stopPropagation(); addChild(n); } }, "+ CHILD"),
      el("button", { class: "del", onclick: (e) => { e.stopPropagation(); delNode(n); } }, "DEL"),
    );
    node.appendChild(actions);

    attachNodeDrag(node, n);
    node.addEventListener("click", (ev) => {
      if (ev.target.closest(".node__title")) return;
      if (ev.target.closest(".node__notes")) return;
      if (ev.target.closest(".node__url a")) return;
      if (ev.target.closest(".node__tog")) return;
      ev.stopPropagation();
      state.selected = n.id;
      $$(".node.is-selected").forEach(el => el.classList.remove("is-selected"));
      node.classList.add("is-selected");
      markSelectedEdges(n);
      updateCrumbs();
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

  applyTransform();
  $(".stg")?.classList.toggle("show-coords", state.showCoords);
}
function computeLevel(node, root) {
  if (node === root) return 0;
  let lvl = -1;
  (function w(n, l) { if (lvl !== -1) return; if (n === node) { lvl = l; return; } (n.children || []).forEach(c => w(c, l + 1)); })(root, 0);
  return lvl < 0 ? 0 : lvl;
}
function padIdx(i, lvl) { const a = "0123456789ABCDEF"; return String(lvl) + a[i % 16]; }

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
function applyTransform(smooth) {
  const v = getView();
  const vp = $(".stg__viewport");
  if (vp) {
    if (smooth) {
      vp.classList.add("is-smooth");
      clearTimeout(applyTransform._t);
      applyTransform._t = setTimeout(() => vp.classList.remove("is-smooth"), 400);
    } else {
      vp.classList.remove("is-smooth");
    }
    vp.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  }
  const lvl = $(".zoom .lvl");
  if (lvl) lvl.textContent = Math.round(v.k * 100) + "%";
}
function attachStagePanZoom() {
  const stg = $(".stg");
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

  function startPan(e) {
    // allow pan from anywhere on the stage that's NOT a node, button, panel
    if (e.target.closest(".node")) return;
    if (e.target.closest(".tw")) return;
    if (e.target.closest(".zoom")) return;
    if (e.target.closest(".hint")) return;
    if (e.target.closest(".stg__axis")) return;
    if (e.button !== 0) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    const v = getView(); ox = v.x; oy = v.y;
    stg.classList.add("is-panning");
    state.selected = null;
    $$(".node.is-selected").forEach(el => el.classList.remove("is-selected"));
  }
  stg.addEventListener("mousedown", startPan);
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const v = getView();
    v.x = ox + (e.clientX - sx);
    v.y = oy + (e.clientY - sy);
    applyTransform();
  });
  window.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; stg.classList.remove("is-panning"); saveState(); }
  });

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
    saveState();
  }, { passive: false });
}

/* =========================================================
   NODE DRAG
   ========================================================= */
function attachNodeDrag(elNode, n) {
  let dragging = false, started = false, sx = 0, sy = 0, ox = 0, oy = 0;
  elNode.addEventListener("mousedown", (e) => {
    if (e.target.closest(".node__title")) return;
    if (e.target.closest(".node__notes")) return;
    if (e.target.closest(".node__url a")) return;
    if (e.target.closest(".node__actions")) return;
    if (e.target.closest(".node__tog")) return;
    if (e.button !== 0) return;
    dragging = true; started = false;
    sx = e.clientX; sy = e.clientY;
    ox = n.x; oy = n.y;
    e.stopPropagation();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const k = getView().k;
    const dx = (e.clientX - sx) / k;
    const dy = (e.clientY - sy) / k;
    if (!started && Math.hypot(dx, dy) < 3) return;
    if (!started) { started = true; pushHistory(); elNode.classList.add("dragging"); }
    n.x = Math.round((ox + dx) / 10) * 10;
    n.y = Math.round((oy + dy) / 10) * 10;
    elNode.style.left = n.x + "px";
    elNode.style.top = n.y + "px";
    const cd = elNode.querySelector(".node__coord"); if (cd) cd.textContent = fmtCoord(n.x, n.y);
    updateEdgesForNode(n);
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
      elNode.classList.remove("dragging");
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
    const midX = (a.x + b.x) / 2;
    p.setAttribute("d", `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`);
  });
}

/* =========================================================
   NODE OPS
   ========================================================= */
function addChild(parent) {
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
  // auto-focus + select the new title so the user can immediately rename
  setTimeout(() => {
    const titleEl = document.querySelector(`.node[data-id="${id}"] .node__title`);
    if (titleEl) {
      titleEl.focus();
      const range = document.createRange();
      range.selectNodeContents(titleEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, 30);
}
function delNode(n) {
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
  if (window.exModal && window.exModal.prompt) {
    window.exModal.prompt({ title: "URL", label: "URL", value: n.url || "https://" }).then((u) => {
      if (u === null) return;
      pushHistory();
      n.url = u.trim() || null;
      renderStage(); saveState();
    });
    return;
  }
  const u = prompt("URL:", n.url || "https://");
  if (u === null) return;
  pushHistory();
  n.url = u.trim() || null;
  renderStage(); saveState();
}
function pickThumb(n) {
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
  let dragging = false, sx = 0, sy = 0, ol = 0, ot = 0;
  handle.style.cursor = "move";
  handle.addEventListener("mousedown", (e) => {
    if (e.target.closest(".x")) return;
    const tw = $(".tw");
    const r = tw.getBoundingClientRect();
    dragging = true; sx = e.clientX; sy = e.clientY;
    ol = r.left; ot = r.top;
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const tw = $(".tw");
    const nx = ol + (e.clientX - sx);
    const ny = ot + (e.clientY - sy);
    tw.style.left = Math.max(8, Math.min(window.innerWidth - 100, nx)) + "px";
    tw.style.right = "auto";
    tw.style.top = Math.max(8, Math.min(window.innerHeight - 60, ny)) + "px";
    tw.style.bottom = "auto";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    const tw = $(".tw");
    const r = tw.getBoundingClientRect();
    state.twPos = { left: r.left, top: r.top };
    saveState();
  });
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
function exportJSON() {
  const out = JSON.stringify({ version: 1, trees: state.trees }, null, 2);
  download(out, "mindmap-" + Date.now() + ".json", "application/json");
  toast("EXPORTED · JSON");
}
function exportMD() {
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

  $("#btn-add").addEventListener("click", () => {
    const root = state.trees[state.active];
    const parent = state.selected ? findNodeById(root, state.selected) : root;
    addChild(parent || root);
  });
  $("#btn-fit").addEventListener("click", () => {
    const v = getView();
    v.x = window.innerWidth / 2 - 140; v.y = window.innerHeight / 2 - 80; v.k = 0.7;
    applyTransform(true); saveState();
  });
  $("#btn-export").addEventListener("click", exportJSON);
  $("#btn-export-md").addEventListener("click", exportMD);
  $("#btn-import").addEventListener("click", importJSON);
  $("#btn-import-md").addEventListener("click", importMD);
  $("#btn-tweaks").addEventListener("click", () => openTweaks());

  $(".zoom .zin").addEventListener("click", () => { const v=getView(); v.k=Math.min(2.5,v.k*1.15); applyTransform(true); saveState(); updateCrumbs(); });
  $(".zoom .zout").addEventListener("click", () => { const v=getView(); v.k=Math.max(0.25,v.k/1.15); applyTransform(true); saveState(); updateCrumbs(); });
  $(".zoom .zfit").addEventListener("click", () => $("#btn-fit").click());

  // initial center
  const stg = $(".stg");
  const v0 = getView();
  if (v0.x === 600 && v0.y === 400) { v0.x = stg.clientWidth / 2 - 140; v0.y = stg.clientHeight / 2 - 60; }
  applyTransform();

  // keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.isContentEditable || /input|textarea/i.test(e.target.tagName))) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (meta && (e.shiftKey && e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) { e.preventDefault(); redo(); }
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
window.toast = toast;
window.findNodeById = findNodeById;
window.getView = getView;
