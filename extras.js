/* =========================================================
   EXTRAS — addons applied alongside app.js
   - Unified MODAL (prompt / confirm / form) — exposed as window.exModal
   - Sidebar: + NEW CATEGORY + reorder up/down + delete custom cat
   - Notes: Enter -> newline, resizable column
   - IMG: 90x90 thumb, hover popup with original-resolution image, DEL-IMG button
   - Header: SAVE / LOAD DEFAULT (per-category layout)
   ========================================================= */

(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const escHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  /* =====================================================
     UNIFIED MODAL
     window.exModal.prompt({title,label,value,placeholder})  -> Promise<string|null>
     window.exModal.confirm({title,message,okLabel,cancelLabel,danger}) -> Promise<bool>
     window.exModal.form({title,fields:[{name,label,value}]}) -> Promise<{...}|null>
     ===================================================== */
  const modal = document.createElement("div");
  modal.className = "ex-modal";
  modal.innerHTML = `
    <div class="ex-modal__bg"></div>
    <div class="ex-modal__panel" role="dialog" aria-modal="true">
      <div class="ex-modal__hd">
        <span class="ex-modal__title">DIALOG</span>
        <button class="ex-modal__x" aria-label="Close" type="button">×</button>
      </div>
      <form class="ex-modal__body"></form>
      <div class="ex-modal__ft">
        <button class="ex-modal__cancel" type="button">CANCEL</button>
        <button class="ex-modal__ok" type="button">OK</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let resolver = null;
  function close(result) {
    modal.classList.remove("is-open");
    if (resolver) { const r = resolver; resolver = null; r(result); }
  }
  $(".ex-modal__bg", modal).addEventListener("click", () => close(null));
  $(".ex-modal__x", modal).addEventListener("click", () => close(null));
  $(".ex-modal__cancel", modal).addEventListener("click", () => close(null));
  $(".ex-modal__ok", modal).addEventListener("click", () => submitOk());
  $(".ex-modal__body", modal).addEventListener("submit", (e) => { e.preventDefault(); submitOk(); });
  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("is-open")) return;
    if (e.key === "Escape") close(null);
  });
  let _submit = () => true; // returns the result value
  function submitOk() {
    const v = _submit();
    close(v);
  }

  function openConfirm({ title = "CONFIRM", message = "", okLabel = "OK", cancelLabel = "CANCEL", danger = false } = {}) {
    return new Promise((resolve) => {
      resolver = resolve;
      $(".ex-modal__title", modal).textContent = title;
      $(".ex-modal__body", modal).innerHTML = `<div class="ex-modal__msg">${escHtml(message)}</div>`;
      $(".ex-modal__ok", modal).textContent = okLabel;
      $(".ex-modal__cancel", modal).textContent = cancelLabel;
      $(".ex-modal__ok", modal).classList.toggle("is-danger", !!danger);
      _submit = () => true;
      modal.classList.add("is-open");
      setTimeout(() => $(".ex-modal__ok", modal).focus(), 30);
    });
  }
  function openPrompt({ title = "INPUT", label = "VALUE", value = "", placeholder = "" } = {}) {
    return new Promise((resolve) => {
      resolver = resolve;
      $(".ex-modal__title", modal).textContent = title;
      $(".ex-modal__body", modal).innerHTML = `
        <label class="ex-label">${escHtml(label)}</label>
        <input type="text" class="ex-input" value="${escHtml(value)}" placeholder="${escHtml(placeholder)}" />`;
      $(".ex-modal__ok", modal).textContent = "SAVE";
      $(".ex-modal__cancel", modal).textContent = "CANCEL";
      $(".ex-modal__ok", modal).classList.remove("is-danger");
      _submit = () => $(".ex-input", modal).value;
      modal.classList.add("is-open");
      setTimeout(() => { const i = $(".ex-input", modal); i.focus(); i.select(); }, 30);
    });
  }
  function openForm({ title = "FORM", okLabel = "OK", fields = [] } = {}) {
    return new Promise((resolve) => {
      resolver = resolve;
      $(".ex-modal__title", modal).textContent = title;
      $(".ex-modal__body", modal).innerHTML = fields.map(f => `
        <label class="ex-label">${escHtml(f.label || f.name)}</label>
        <input type="text" class="ex-input" data-name="${escHtml(f.name)}" value="${escHtml(f.value || "")}" placeholder="${escHtml(f.placeholder || "")}" />`).join("");
      $(".ex-modal__ok", modal).textContent = okLabel;
      $(".ex-modal__cancel", modal).textContent = "CANCEL";
      $(".ex-modal__ok", modal).classList.remove("is-danger");
      _submit = () => {
        const out = {};
        $$(".ex-input", modal).forEach(i => { out[i.getAttribute("data-name")] = i.value; });
        return out;
      };
      modal.classList.add("is-open");
      setTimeout(() => { const i = $(".ex-input", modal); if (i) { i.focus(); i.select(); } }, 30);
    });
  }
  window.exModal = { prompt: openPrompt, confirm: openConfirm, form: openForm };

  /* =====================================================
     CATEGORY: + NEW + reorder + delete custom
     Relies on window.CATEGORIES (exposed by app.js) and window.state
     ===================================================== */
  const CUSTOM_CATS_KEY = "tdr-mindmap-custom-cats-v1";
  const CAT_ORDER_KEY = "tdr-mindmap-cat-order-v1";

  function persistCustoms() {
    const customs = window.CATEGORIES.filter(c => c.custom);
    try { localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(customs)); } catch {}
  }
  function persistOrder() {
    try { localStorage.setItem(CAT_ORDER_KEY, JSON.stringify(window.CATEGORIES.map(c => c.id))); } catch {}
  }

  async function addCategoryFlow() {
    const r = await openForm({
      title: "NEW CATEGORY",
      okLabel: "CREATE",
      fields: [
        { name: "label", label: "LABEL", placeholder: "MY · CATEGORY" },
        { name: "sub",   label: "SUB",   placeholder: "TAGS / DESCRIPTION" },
      ],
    });
    if (!r || !r.label || !r.label.trim()) return;
    const id = "cat_" + Math.random().toString(36).slice(2, 8);
    const cat = { id, label: r.label.trim().toUpperCase(), sub: (r.sub || "").trim().toUpperCase(), jp: "", custom: true };
    window.CATEGORIES.push(cat);
    const root = { id: "n_root", title: cat.label, url: null, notes: [], children: [], level: 0, _open: true, x: 0, y: 0 };
    window.state.trees[id] = root;
    window.state.meta[id] = { count: 1, depth: 0 };
    window.state.active = id;
    window.state.selected = null;
    persistCustoms();
    persistOrder();
    window.saveState && window.saveState();
    window.renderAll && window.renderAll();
    setTimeout(decorateSidebar, 30);
    window.toast && window.toast("CATEGORY ADDED");
  }

  function moveCat(idx, dir) {
    const j = idx + dir;
    const C = window.CATEGORIES;
    if (j < 0 || j >= C.length) return;
    [C[idx], C[j]] = [C[j], C[idx]];
    persistOrder();
    window.renderSidebar && window.renderSidebar();
    setTimeout(decorateSidebar, 10);
  }

  async function delCustomCat(idx) {
    const C = window.CATEGORIES;
    const cat = C[idx];
    if (!cat || !cat.custom) return;
    const ok = await openConfirm({
      title: "DELETE CATEGORY",
      message: `Category “${cat.label}” and its mind map will be removed.`,
      okLabel: "DELETE",
      danger: true,
    });
    if (!ok) return;
    C.splice(idx, 1);
    delete window.state.trees[cat.id];
    delete window.state.meta[cat.id];
    if (window.state.active === cat.id) window.state.active = C[0]?.id || "ZBRUSH";
    persistCustoms();
    persistOrder();
    window.saveState && window.saveState();
    window.renderAll && window.renderAll();
    setTimeout(decorateSidebar, 30);
  }

  function decorateSidebar() {
    const list = $(".sb__list");
    if (!list) return;

    // Add "+ NEW CATEGORY" once at top of list
    if (!$(".sb__add")) {
      const add = document.createElement("button");
      add.className = "sb__add";
      add.type = "button";
      add.innerHTML = `<span class="dot"></span>+ NEW CATEGORY`;
      add.addEventListener("click", addCategoryFlow);
      list.parentNode.insertBefore(add, list);
    }

    // Inject reorder/delete controls into each .cat
    $$(".cat", list).forEach((row, i) => {
      if (row.querySelector(".cat__ord")) return;
      const cat = window.CATEGORIES[i];
      const ord = document.createElement("div");
      ord.className = "cat__ord";
      ord.innerHTML = `
        <button class="ord-up" type="button" title="Move up">▲</button>
        <button class="ord-dn" type="button" title="Move down">▼</button>
        ${cat && cat.custom ? `<button class="ord-del" type="button" title="Delete category">×</button>` : ""}`;
      ord.addEventListener("click", e => e.stopPropagation());
      ord.addEventListener("mousedown", e => e.stopPropagation());
      $(".ord-up", ord).addEventListener("click", () => moveCat(i, -1));
      $(".ord-dn", ord).addEventListener("click", () => moveCat(i, +1));
      const delBtn = $(".ord-del", ord);
      if (delBtn) delBtn.addEventListener("click", () => delCustomCat(i));
      row.appendChild(ord);
    });
  }

  function syncNoteBlocks(noteEl) {
    // Determine whether this note has any block-level children.
    let hasBlock = false;
    for (const k of noteEl.children) {
      const t = k.tagName;
      if (t === "DIV" || t === "P") { hasBlock = true; break; }
    }
    if (!hasBlock) {
      noteEl.removeAttribute("data-has-blocks");
      return;
    }
    // Wrap any leading bare text nodes / <br>s into a <div> so the FIRST
    // line also gets the leading "—" dash.
    const firstBlockIdx = [...noteEl.childNodes].findIndex(
      n => n.nodeType === 1 && (n.tagName === "DIV" || n.tagName === "P")
    );
    if (firstBlockIdx > 0) {
      const wrap = document.createElement("div");
      const before = [...noteEl.childNodes].slice(0, firstBlockIdx);
      // Drop trailing <br> immediately before the first block (it's the
      // separator the browser inserted)
      while (before.length && before[before.length - 1].nodeName === "BR") {
        before.pop().remove();
      }
      before.forEach(n => wrap.appendChild(n));
      if (wrap.childNodes.length) {
        noteEl.insertBefore(wrap, noteEl.firstChild);
      }
    }
    noteEl.setAttribute("data-has-blocks", "1");
  }

  function enhanceNotes() {
    $$(".node__notes .n").forEach((n) => {
      // re-sync block flag on every render pass
      syncNoteBlocks(n);
      if (n.__exEnh) return;
      n.__exEnh = true;
      n.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter") return;
        if (ev.shiftKey) return; // existing app.js: Shift+Enter -> next slot
        ev.stopImmediatePropagation();
        ev.preventDefault();
        // If the note has no block children yet, wrap current content first
        // so that the first line also gets a dash.
        if (!n.getAttribute("data-has-blocks")) {
          const txt = n.textContent;
          // wipe and rebuild as: <div>{existing}</div><div><br></div>
          n.innerHTML = "";
          const a = document.createElement("div");
          a.textContent = txt;
          const b = document.createElement("div");
          b.appendChild(document.createElement("br"));
          n.appendChild(a);
          n.appendChild(b);
          n.setAttribute("data-has-blocks", "1");
          // place caret at start of new empty block
          const range = document.createRange();
          range.setStart(b, 0);
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          // dispatch input so app.js persists
          n.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        document.execCommand("insertParagraph");
        // re-sync after the browser mutates the DOM
        setTimeout(() => syncNoteBlocks(n), 0);
      }, true);
      n.addEventListener("input", () => {
        // if user deletes back to flat text, drop the flag
        let hasBlock = false;
        for (const k of n.children) {
          const t = k.tagName;
          if (t === "DIV" || t === "P") { hasBlock = true; break; }
        }
        if (!hasBlock) n.removeAttribute("data-has-blocks");
        else n.setAttribute("data-has-blocks", "1");
      });
    });
  }

  /* =====================================================
     IMG: 90x90 thumb, hover popup, DEL-IMG button
     ===================================================== */
  let popupEl;
  function ensurePopup() {
    if (popupEl) return popupEl;
    popupEl = document.createElement("div");
    popupEl.className = "ex-imgpop";
    popupEl.innerHTML = `<img alt="" />`;
    document.body.appendChild(popupEl);
    return popupEl;
  }

  function attachThumbHover(t) {
    if (t.__exImgHover) return;
    t.__exImgHover = true;
    t.addEventListener("mouseenter", () => {
      const m = (t.style.backgroundImage || "").match(/url\(["']?(.+?)["']?\)/);
      const src = m && m[1];
      if (!src) return;
      const p = ensurePopup();
      const img = p.querySelector("img");
      img.onload = () => {
        const r = t.getBoundingClientRect();
        const pr = p.getBoundingClientRect();
        let x = r.right + 16;
        let y = r.top - 12;
        if (x + pr.width > window.innerWidth - 16) x = r.left - pr.width - 16;
        if (y + pr.height > window.innerHeight - 16) y = window.innerHeight - pr.height - 16;
        if (y < 16) y = 16;
        if (x < 16) x = 16;
        p.style.left = x + "px";
        p.style.top = y + "px";
      };
      img.src = src;
      p.classList.add("show");
    });
    t.addEventListener("mouseleave", () => {
      if (popupEl) popupEl.classList.remove("show");
    });
  }

  function injectImgDelete() {
    $$(".node__actions").forEach((act) => {
      if (act.__exImgDel) return;
      act.__exImgDel = true;
      const node = act.closest(".node");
      const id = node && node.getAttribute("data-id");
      if (!id) return;
      const hasThumb = !!node.querySelector(".node__thumb");
      if (!hasThumb) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "del-img";
      btn.textContent = "DEL · IMG";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const root = window.state && window.state.trees[window.state.active];
        if (!root) return;
        const n = window.findNodeById(root, id);
        if (!n) return;
        window.pushHistory && window.pushHistory();
        delete n.thumb;
        window.renderStage && window.renderStage();
        window.saveState && window.saveState();
        window.toast && window.toast("IMAGE REMOVED");
      });
      // place after IMG button if found
      const imgBtn = [...act.children].find(b => b.textContent && b.textContent.trim() === "IMG");
      if (imgBtn) act.insertBefore(btn, imgBtn.nextSibling);
      else act.appendChild(btn);
    });
  }

  function enhanceThumbs() {
    $$(".node__thumb").forEach(attachThumbHover);
    injectImgDelete();
  }

  /* =====================================================
     SAVE / LOAD DEFAULT layout per category
     ===================================================== */
  const DEFAULT_LAYOUTS_KEY = "tdr-mindmap-default-layouts-v1";
  function loadLayouts() { try { return JSON.parse(localStorage.getItem(DEFAULT_LAYOUTS_KEY) || "{}"); } catch { return {}; } }
  function saveLayouts(l) { try { localStorage.setItem(DEFAULT_LAYOUTS_KEY, JSON.stringify(l)); } catch {} }

  function snapshotLayout(tree) {
    const m = {};
    (function w(n) {
      if (!n) return;
      m[n.id] = { x: n.x, y: n.y, _open: n._open !== false };
      (n.children || []).forEach(w);
    })(tree);
    return m;
  }
  function applyLayout(tree, m) {
    if (!m) return;
    (function w(n) {
      if (m[n.id]) { n.x = m[n.id].x; n.y = m[n.id].y; n._open = m[n.id]._open; }
      (n.children || []).forEach(w);
    })(tree);
  }

  function saveCurrentDefault() {
    if (!window.state) return;
    const cat = window.state.active;
    const tree = window.state.trees[cat];
    if (!tree) return;
    const view = window.state.views && window.state.views[cat];
    const layouts = loadLayouts();
    layouts[cat] = { layout: snapshotLayout(tree), view: view ? { ...view } : null, ts: Date.now() };
    saveLayouts(layouts);
    window.toast && window.toast("LAYOUT · SAVED · DEFAULT");
  }
  async function restoreDefault() {
    if (!window.state) return;
    const cat = window.state.active;
    const tree = window.state.trees[cat];
    if (!tree) return;
    const layouts = loadLayouts();
    const saved = layouts[cat];
    if (!saved) { window.toast && window.toast("NO DEFAULT SAVED"); return; }
    const ok = await openConfirm({
      title: "LOAD DEFAULT LAYOUT",
      message: "Apply the saved default layout for this category? Current node positions will be replaced.",
      okLabel: "LOAD",
    });
    if (!ok) return;
    window.pushHistory && window.pushHistory();
    applyLayout(tree, saved.layout);
    if (saved.view && window.state.views) window.state.views[cat] = { ...saved.view };
    window.renderStage && window.renderStage();
    window.applyTransform && window.applyTransform(true);
    window.saveState && window.saveState();
    window.toast && window.toast("LAYOUT · RESTORED");
  }

  function injectHeaderButtons() {
    const tools = $(".hd__tools");
    if (!tools || $("#btn-save-default", tools)) return;
    const tweaks = $("#btn-tweaks", tools);
    const mk = (id, label, dotColor, onclick, title) => {
      const b = document.createElement("button");
      b.id = id;
      b.type = "button";
      b.title = title;
      b.innerHTML = `<span class="dot" style="background:${dotColor}"></span>${label}`;
      b.addEventListener("click", onclick);
      return b;
    };
    tools.insertBefore(mk("btn-save-default", "SAVE · DEFAULT", "var(--acc)", saveCurrentDefault, "Save current layout as default for this category"), tweaks);
    tools.insertBefore(mk("btn-load-default", "LOAD · DEFAULT", "var(--ink)", restoreDefault, "Restore saved default layout"), tweaks);
  }

  /* =====================================================
     WHITE-PLATE HUD (per "白地問題" spec)
     - Scattered low-opacity noise glyphs (~50, deterministic per session)
     - Live readout: hovered ID, active ID, cursor coords
     - Ticking timecode + REC dot
     ===================================================== */
  const HUD_NOISE_TOKENS = [
    "X", "Y", "Z", "ID", "REV", "SET", "TC", "FR", "PT",
    "L1", "L2", "L3", "L4", "L5",
    "AR", "ISO", "BTM", "TOP", "MM", "PX",
    "01", "02", "03", "04", "05", "06", "07", "08", "09",
    "0A", "1B", "2C", "3D", "4E", "5F",
    "OK", "NUL", "SET-A", "SET-B", "REF",
    "//", "—", "·", "▣", "▢",
  ];
  function rand(seed) {
    // mulberry32
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function buildHud() {
    const stg = $(".stg");
    if (!stg) return null;
    let hud = $(".stg__hud", stg);
    if (hud) return hud;
    hud = document.createElement("div");
    hud.className = "stg__hud";
    hud.setAttribute("aria-hidden", "true");

    // corner crosses
    ["tl","tr","bl","br"].forEach(c => {
      const x = document.createElement("div");
      x.className = "hud-crx " + c;
      hud.appendChild(x);
    });

    // timecode + REC
    const tc = document.createElement("div");
    tc.className = "hud-tc";
    tc.textContent = "00:00:00:00";
    hud.appendChild(tc);
    const rec = document.createElement("div");
    rec.className = "hud-rec";
    rec.textContent = "REC · ACTIVE";
    hud.appendChild(rec);

    // sector + scale
    const sec = document.createElement("div");
    sec.className = "hud-sector";
    sec.textContent = "SECTOR · 04 · DAILY";
    hud.appendChild(sec);
    const scale = document.createElement("div");
    scale.className = "hud-scale";
    hud.appendChild(scale);

    // live readout
    const rd = document.createElement("div");
    rd.className = "hud-readout";
    rd.innerHTML = `
      <span class="k">HOV</span><span class="v hud-hov">—</span>
      <span class="k">SEL</span><span class="v hud-sel">—</span>
      <span class="k">CUR</span><span class="v hud-cur">+0000 +0000</span>
      <span class="k">N·D</span><span class="v hud-nd">— · —</span>`;
    hud.appendChild(rd);

    // scatter noise
    const r = rand(0xC8FF1A);
    const N = 56;
    for (let i = 0; i < N; i++) {
      const s = document.createElement("div");
      const cls = (i % 11 === 0) ? "hud-noise acc" : (i % 3 === 0 ? "hud-noise" : "hud-noise dim");
      s.className = cls;
      const tok = HUD_NOISE_TOKENS[Math.floor(r() * HUD_NOISE_TOKENS.length)];
      const num = String(Math.floor(r() * 9999)).padStart(4, "0");
      s.textContent = (i % 5 === 0) ? `${tok}·${num}` : (i % 4 === 0 ? num : `${tok}.${String(Math.floor(r()*99)).padStart(2,"0")}`);
      // keep a ~12% margin from each edge so noise sits "around" content
      s.style.left = (4 + r() * 92).toFixed(2) + "%";
      s.style.top = (8 + r() * 84).toFixed(2) + "%";
      // small rotation on a few for texture
      if (i % 9 === 0) s.style.transform = "rotate(-90deg)";
      hud.appendChild(s);
    }

    // insert AFTER plate, BEFORE viewport (so nodes draw over noise)
    const plate = $(".stg__plate", stg);
    const vp = $(".stg__viewport", stg);
    if (vp) stg.insertBefore(hud, vp);
    else if (plate && plate.nextSibling) stg.insertBefore(hud, plate.nextSibling);
    else stg.appendChild(hud);
    return hud;
  }

  function startHudClock() {
    const start = Date.now();
    function pad(n, w=2) { return String(n).padStart(w, "0"); }
    setInterval(() => {
      const tcEl = document.querySelector(".stg__hud .hud-tc");
      if (!tcEl) return;
      const t = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = t % 60;
      const f = Math.floor(((Date.now() - start) % 1000) / 1000 * 24);
      tcEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
    }, 1000 / 12);
  }

  function wireHudReadout() {
    const stg = $(".stg");
    if (!stg || stg.__exHudWired) return;
    stg.__exHudWired = true;

    function setText(sel, txt) {
      const el = document.querySelector(".stg__hud " + sel);
      if (el) el.textContent = txt;
    }
    function fmtCoord(n) {
      const sign = n < 0 ? "-" : "+";
      return sign + String(Math.abs(Math.round(n))).padStart(4, "0");
    }

    stg.addEventListener("mousemove", (e) => {
      const rect = stg.getBoundingClientRect();
      setText(".hud-cur", `${fmtCoord(e.clientX - rect.left - rect.width/2)} ${fmtCoord(e.clientY - rect.top - rect.height/2)}`);
      const overNode = e.target.closest && e.target.closest(".node");
      if (overNode) {
        const id = overNode.getAttribute("data-id") || "—";
        const ttl = (overNode.querySelector(".node__title")?.textContent || "").trim().slice(0, 18) || id;
        setText(".hud-hov", ttl.toUpperCase());
      } else {
        setText(".hud-hov", "—");
      }
    });

    // update SEL + N·D periodically (simpler than hooking app.js events)
    setInterval(() => {
      const sel = document.querySelector(".node.is-selected");
      const selTxt = sel ? ((sel.querySelector(".node__title")?.textContent || sel.getAttribute("data-id") || "—").trim().slice(0,18)) : "—";
      setText(".hud-sel", selTxt.toUpperCase());
      const nodes = document.querySelectorAll(".stg__viewport .node").length;
      const depth = (window.state && window.state.meta && window.state.active && window.state.meta[window.state.active]?.depth) ?? "—";
      setText(".hud-nd", `${nodes} · ${depth}`);
    }, 600);
  }

  /* =====================================================
     BOOT
     ===================================================== */
  function tick() {
    decorateSidebar();
    enhanceNotes();
    enhanceThumbs();
    injectHeaderButtons();
    wireRelax();
    if (!document.querySelector(".stg__hud")) {
      const h = buildHud();
      if (h) { startHudClock(); wireHudReadout(); }
    }
  }

  /* =====================================================
     AUTO COLLISION AVOIDANCE
     After expand/collapse, push overlapping nodes
     vertically so expanded blocks don't sit on top of others.
     ===================================================== */
  const RELAX_GAP = 24;        // px vertical gap between nodes (data coords)
  const RELAX_MAX_PASS = 8;
  const RELAX_COL_BIN = 160;   // group nodes into column buckets of this width

  function relaxOverlaps() {
    if (!window.state) return false;
    const root = window.state.trees[window.state.active];
    if (!root) return false;
    const view = (window.state.views && window.state.views[window.state.active]) || {};
    const k = view.k || 1;

    // Collect rendered nodes (skip root)
    const items = [];
    document.querySelectorAll(".stg__viewport .node").forEach(elN => {
      const id = elN.getAttribute("data-id");
      if (!id) return;
      const node = window.findNodeById(root, id);
      if (!node) return;
      if (!node.level && node.id === root.id) return; // skip root
      const r = elN.getBoundingClientRect();
      if (r.height < 2) return; // not visible yet
      const hData = r.height / k;
      items.push({ node, el: elN, hData });
    });
    if (items.length < 2) return false;

    // Group by approximate x-column
    const cols = new Map();
    items.forEach(it => {
      const key = Math.round(it.node.x / RELAX_COL_BIN);
      const arr = cols.get(key) || [];
      arr.push(it);
      cols.set(key, arr);
    });

    let moved = false;
    cols.forEach(col => {
      if (col.length < 2) return;
      col.sort((a, b) => a.node.y - b.node.y);
      for (let i = 1; i < col.length; i++) {
        const prev = col[i - 1];
        const cur = col[i];
        // node center is at node.y; top/bottom = center ± h/2
        const prevBottom = prev.node.y + prev.hData / 2;
        const curTop = cur.node.y - cur.hData / 2;
        if (curTop < prevBottom + RELAX_GAP) {
          const newY = Math.round((prevBottom + RELAX_GAP + cur.hData / 2) / 8) * 8;
          if (Math.abs(newY - cur.node.y) > 1) {
            cur.node.y = newY;
            cur.el.style.top = newY + "px";
            moved = true;
          }
        }
      }
    });
    return moved;
  }

  function relaxLoop() {
    let pass = 0;
    let anyMoved = false;
    while (pass++ < RELAX_MAX_PASS) {
      if (!relaxOverlaps()) break;
      anyMoved = true;
    }
    if (anyMoved) {
      // Redraw edges + persist; don't re-render entire stage (avoids flicker)
      window.renderStage && window.renderStage();
      window.saveState && window.saveState();
    }
  }

  // Hook into toggleCollapse: after animation completes, relax
  function wireRelax() {
    const stg = $(".stg");
    if (!stg || stg.__exRelaxWired) return;
    stg.__exRelaxWired = true;
    stg.addEventListener("click", (e) => {
      if (!e.target.closest(".node__tog")) return;
      // Wait for animation to finish: stagger is 30 + i*24ms + 260ms transition
      // Be safe: fire at 500ms and again at 900ms for cascading pushes
      setTimeout(relaxLoop, 500);
      setTimeout(relaxLoop, 900);
    }, true);
    window.relaxOverlaps = relaxLoop;
  }

  /* =====================================================
     READONLY MODE — URL ?readonly or ?readonly=1
     Disables all editing; shows VIEW ONLY badge
     ===================================================== */
  function applyReadonly() {
    const params = new URLSearchParams(window.location.search);
    const isRO = params.has("readonly") || params.get("mode") === "view";
    if (!isRO) return;

    document.body.classList.add("is-readonly");

    // badge
    const badge = document.createElement("div");
    badge.className = "ro-badge";
    badge.textContent = "VIEW ONLY — EDITING DISABLED";
    document.body.appendChild(badge);

    // kill contenteditable on existing + future nodes
    function disableEdits() {
      document.querySelectorAll("[contenteditable='true']").forEach(el => {
        el.setAttribute("contenteditable", "false");
        el.style.cursor = "default";
      });
    }
    disableEdits();
    const roObs = new MutationObserver(disableEdits);
    roObs.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    applyReadonly();
    const obs = new MutationObserver(() => {
      clearTimeout(boot._t);
      boot._t = setTimeout(tick, 30);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(tick, 60);
    setTimeout(tick, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
