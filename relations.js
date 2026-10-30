/* =========================================================
   RELATIONS — lines between nodes that are not parent/child
   - stored on the source node: n.refs = [{ to: "<node id>", kind: "idea" | "fact" }]
     (same map only; travels with EXPORT.JSON / BACKUP · ALL; undo covers it)
   - idea = 仮説（破線） / fact = 確定（実線）. Click the line's tag in the inspector to switch.
   - L (or + LINK in the inspector) → click the other node. Esc cancels.
   Relies on app.js globals: state, findNodeById, posOf, pushHistory, saveState, renderStage, toast, el, blockReadonly
   ========================================================= */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const KIND_LABEL = { idea: "仮説", fact: "確定" };
  let pickFrom = null;

  function refsOf(n) { return Array.isArray(n.refs) ? n.refs : []; }
  function allNodes(root) {
    const out = [];
    (function w(x) { out.push(x); (x.children || []).forEach(w); })(root);
    return out;
  }
  // an arc that swings out sideways, so it clears the cards (and the square parent edges)
  // even when both nodes sit in the same column
  function arc(a, b) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(340, Math.max(80, len * 0.5));
    const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
    return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
  }

  function draw(svg, root, visible) {
    if (!svg || !root) return;
    allNodes(root).forEach(n => {
      if (!visible.has(n.id)) return;
      refsOf(n).forEach(r => {
        const b = findNodeById(root, r.to);
        if (!b || !visible.has(b.id)) return;
        const p = document.createElementNS(NS, "path");
        p.setAttribute("class", "rel rel--" + (r.kind === "fact" ? "fact" : "idea"));
        p.setAttribute("data-rel-from", n.id);
        p.setAttribute("data-rel-to", b.id);
        p.setAttribute("d", arc(posOf(n), posOf(b)));
        svg.appendChild(p);
      });
    });
  }
  function update(svg, root, onlyId) {
    if (!svg || !root) return;
    const sel = onlyId ? `path.rel[data-rel-from="${onlyId}"], path.rel[data-rel-to="${onlyId}"]` : "path.rel";
    svg.querySelectorAll(sel).forEach(p => {
      const a = findNodeById(root, p.getAttribute("data-rel-from"));
      const b = findNodeById(root, p.getAttribute("data-rel-to"));
      if (a && b) p.setAttribute("d", arc(posOf(a), posOf(b)));
    });
  }

  /* ---------- editing ---------- */
  function add(fromId, toId) {
    const root = state.trees[state.active];
    const a = findNodeById(root, fromId), b = findNodeById(root, toId);
    if (!a || !b) return false;
    if (a === b) { toast("LINK · PICK ANOTHER NODE"); return false; }
    if (refsOf(a).some(r => r.to === b.id) || refsOf(b).some(r => r.to === a.id)) { toast("LINK · ALREADY LINKED"); return false; }
    pushHistory();
    a.refs = [...refsOf(a), { to: b.id, kind: "idea" }];
    saveState();
    renderStage();
    toast("LINK · " + (a.title || "").slice(0, 14) + " ⇢ " + (b.title || "").slice(0, 14) + " · 仮説");
    return true;
  }
  function remove(owner, toId) {
    if (blockReadonly()) return;
    pushHistory();
    owner.refs = refsOf(owner).filter(r => r.to !== toId);
    if (!owner.refs.length) delete owner.refs;
    saveState();
    renderStage();
  }
  function toggleKind(owner, toId) {
    if (blockReadonly()) return;
    pushHistory();
    owner.refs = refsOf(owner).map(r => r.to === toId ? { ...r, kind: r.kind === "fact" ? "idea" : "fact" } : r);
    saveState();
    renderStage();
  }

  /* ---------- pick mode ---------- */
  function startPick(fromId) {
    if (blockReadonly()) return;
    const root = state.trees[state.active];
    const a = fromId && findNodeById(root, fromId);
    if (!a) { toast("LINK · SELECT A NODE"); return; }
    pickFrom = a.id;
    document.body.classList.add("is-linking");
    toast("LINK · CLICK THE OTHER NODE · ESC TO CANCEL");
  }
  function endPick() {
    pickFrom = null;
    document.body.classList.remove("is-linking");
  }
  // capture phase: the click belongs to linking, not to selection
  document.addEventListener("click", (e) => {
    if (!pickFrom) return;
    const nodeEl = e.target.closest(".stg__viewport .node");
    if (!nodeEl) return;
    e.preventDefault();
    e.stopPropagation();
    const from = pickFrom;
    endPick();
    add(from, nodeEl.dataset.id);
  }, true);
  window.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (pickFrom && e.key === "Escape") {
      e.preventDefault(); e.stopImmediatePropagation();
      endPick(); toast("LINK · CANCELLED");
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== "l") return;
    if (e.target && (e.target.isContentEditable || /input|textarea|select/i.test(e.target.tagName))) return;
    if (window.isKeysOpen?.()) return;
    e.preventDefault();
    const partner = window.getLinkPartner?.();
    if (partner && state.selected) { window.setLinkPartner(null); add(state.selected, partner); return; }
    startPick(state.selected);
  }, true);

  /* ---------- inspector section ---------- */
  function inspector(panel, n, ro) {
    const root = state.trees[state.active];
    const out = refsOf(n).map(r => ({ owner: n, other: findNodeById(root, r.to), id: r.to, kind: r.kind, dir: "→" }));
    allNodes(root).forEach(x => refsOf(x).forEach(r => {
      if (r.to === n.id) out.push({ owner: x, other: x, id: n.id, kind: r.kind, dir: "←" });
    }));
    const row = el("section", { class: "insp__row" },
      el("div", { class: "lbl" }, "RELATIONS (" + out.length + ")"));
    const list = el("div", { class: "rel-list" });
    out.forEach(item => {
      const kind = item.kind === "fact" ? "fact" : "idea";
      list.appendChild(el("div", { class: "rel-item" },
        el("button", {
          type: "button", class: "rel-item__kind rel-item__kind--" + kind,
          title: ro ? "" : "仮説 ⇄ 確定", disabled: ro ? "" : null,
          onclick: () => toggleKind(item.owner, item.id),
        }, KIND_LABEL[kind]),
        el("span", { class: "rel-item__dir" }, item.dir),
        item.other
          ? el("button", { type: "button", class: "rel-item__t", onclick: () => window.selectNode?.(item.other) }, item.other.title || "Untitled")
          : el("span", { class: "rel-item__t is-missing" }, "(消えたノード)"),
        ro ? null : el("button", { type: "button", class: "rel-item__x insp__action", title: "外す", onclick: () => remove(item.owner, item.id) }, "×"),
      ));
    });
    if (!out.length) list.appendChild(el("div", { class: "insp__none" }, "—"));
    row.appendChild(list);
    if (!ro) row.appendChild(el("button", { type: "button", class: "insp__action rel-add", onclick: () => startPick(n.id) }, "+ LINK (L)"));
    panel.appendChild(row);
  }

  // used by the COMBINE prompt: "関連（仮説）: other title"
  function describe(n) {
    const root = state.trees[state.active];
    return refsOf(n).map(r => {
      const b = findNodeById(root, r.to);
      return b ? { kind: KIND_LABEL[r.kind === "fact" ? "fact" : "idea"], title: b.title } : null;
    }).filter(Boolean);
  }

  window.Relations = { draw, update, inspector, startPick, describe, add };
})();
