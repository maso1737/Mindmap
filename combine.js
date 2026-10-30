/* =========================================================
   COMBINE TRAY — ノードを集めて Claude へ渡すプロンプトにする
   - ノードをトレイへドラッグ / C キー / ＋ SELECTED で追加
   - マップをまたいで集められる（ノードはその時点の写しで持つ）
   - Mindmap のノード＝仮説。実在の作品・進捗の確認は Claude 側
     （STAGE LINK / PROJECT HUB）に任せる文面にする
   Relies on app.js globals: state, CATEGORIES, findNodeById, findParent, el, toast, safeSetItem
   ========================================================= */
(function () {
  const STORE = "tdr-mindmap-combine-v1";
  const MAX_KIDS = 12;
  const cmb = { chips: [], note: "", mode: "broad", kids: true };

  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && typeof saved === "object") {
      if (Array.isArray(saved.chips)) cmb.chips = saved.chips.filter(c => c && c.map && c.id && typeof c.title === "string");
      if (typeof saved.note === "string") cmb.note = saved.note.slice(0, 4000);
      cmb.mode = saved.mode === "concrete" ? "concrete" : "broad";
      cmb.kids = saved.kids !== false;
    }
  } catch {}

  function save() {
    const value = JSON.stringify(cmb);
    if (window.safeSetItem) window.safeSetItem(STORE, value);
    else try { localStorage.setItem(STORE, value); } catch {}
  }

  /* ---------- node → chip (snapshot) ---------- */
  function snapshotNode(node, mapId) {
    const root = state.trees[mapId];
    const cat = CATEGORIES.find(c => c.id === mapId);
    const path = [];
    let p = root && findParent(root, node.id);
    while (p) { path.unshift(p.title); p = findParent(root, p.id); }
    path.shift(); // the root title — the map label already says which map
    // children, each with up to 6 grandchildren: 手持ちの材料（one-rule・Emergence Engine）
    const kidLine = c => {
      const g = (c.children || []).map(x => x.title).filter(Boolean);
      return c.title + (g.length ? "（" + g.slice(0, 6).join("・") + (g.length > 6 ? "…" : "") + "）" : "");
    };
    return {
      map: mapId,
      mapLabel: cat ? cat.label : mapId,
      id: node.id,
      title: node.title || "(untitled)",
      path,
      notes: (node.notes || []).filter(Boolean).slice(0, 3),
      url: node.url || null,
      kids: (node.children || []).filter(c => c.title).slice(0, MAX_KIDS).map(kidLine),
      kidCount: (node.children || []).length,
      rels: window.Relations ? window.Relations.describe(node) : [],
    };
  }
  function addNode(node, mapId = state.active) {
    if (!node) return false;
    if (cmb.chips.some(c => c.map === mapId && c.id === node.id)) {
      toast("COMBINE · ALREADY IN TRAY");
      flash();
      return false;
    }
    cmb.chips.push(snapshotNode(node, mapId));
    save();
    render();
    flash();
    toast("COMBINE · + " + (node.title || "NODE").slice(0, 24));
    return true;
  }
  function addSelected() {
    const root = state.trees[state.active];
    const n = root && state.selected ? findNodeById(root, state.selected) : null;
    if (!n) { toast("COMBINE · SELECT A NODE"); return false; }
    return addNode(n);
  }

  /* ---------- prompt ---------- */
  function buildPrompt() {
    const L = ["# 組み合わせの相談（GEN-EX MINDMAP から）",
      "Mindmap のノードは「発想・仮説」です。実在の作品や進捗の根拠ではありません。", "", "## 素材"];
    cmb.chips.forEach((c, i) => {
      const trail = [...c.path, c.title].join(" › ");
      L.push(`${i + 1}. [${c.mapLabel}] ${trail}`);
      c.notes.forEach(n => L.push(`   - メモ: ${n}`));
      if (cmb.kids && c.kids.length) L.push(`   - 中身: ${c.kids.join(" / ")}${c.kidCount > c.kids.length ? " ほか" : ""}`);
      (c.rels || []).forEach(r => L.push(`   - 関連（${r.kind}）: ${r.title}`));
      if (c.url) L.push(`   - URL: ${c.url}`);
    });
    if (!cmb.chips.length) L.push("素材の指定なし。");
    L.push("", "## 思いつき", cmb.note.trim() || "（未記入）", "", "## お願い",
      "- まず Projects ルートの CLAUDE.md を読み、素材の名前に当たる実在の作品・技を STAGE LINK（ルートの stage.js）と PROJECT HUB から探して、その作品の CLAUDE.md・該当箇所を確かめてから考えてください。",
      "- 見つからない素材は「まだ無いアイデア」として扱ってください（推測で実在扱いしない）。");
    if (cmb.mode === "concrete") {
      L.push("- 「思いつき」を目標、素材を材料として、各素材のどこを活かすかを示す計画を作ってください。",
        "- 最小の試作（1 ラボ＝1 問い）から始める順序と、ルート CLAUDE.md の命名・置き場所に従った配置を提案してください。",
        "- 目標が未記入なら着手前に確認してください。実装はユーザーの OK 後に開始してください。");
    } else {
      L.push("- 素材どうしを組み合わせた派生案を 3〜5 つ。各案に「どの素材のどこを活かすか」「新しく生まれる体験」「最小の試作（1 ラボ＝1 問い）」「置き場所」。",
        "- 素材にない作品で効きそうなものがあれば、2 つまで追加提案。");
    }
    L.push("- 既存ファイルは改変せず、作るなら新規フォルダかコピーで。",
      "- 試すと決めた案は、PROJECT HUB の NEXT に載るよう該当プロジェクトの CLAUDE.md に書く一行も添えてください。");
    return L.join("\n");
  }

  async function copyPrompt() {
    const text = buildPrompt();
    try {
      await navigator.clipboard.writeText(text);
      toast("COMBINE · PROMPT COPIED → CLAUDE");
    } catch {
      const pre = $(".cmb__preview");
      pre.open = true;
      const ta = $(".cmb__prompt");
      ta.value = text;
      ta.focus(); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch {}
      toast(ok ? "COMBINE · PROMPT COPIED → CLAUDE" : "COMBINE · CTRL+C TO COPY");
    }
  }

  /* ---------- UI ---------- */
  let tray = null;
  const $ = (s, r = document) => r.querySelector(s);

  function flash() {
    if (!tray) return;
    tray.classList.remove("is-flash");
    void tray.offsetWidth;
    tray.classList.add("is-flash");
  }

  function build() {
    tray = $(".cmb");
    if (!tray) return;
    tray.replaceChildren(
      el("div", { class: "cmb__hd" },
        el("span", {}, "＋ COMBINE ", el("b", { class: "cmb__count" }, "0")),
        el("span", { class: "cmb__hd-tools" },
          el("button", { type: "button", class: "cmb__add", title: "選択中のノードを追加 (C)", onclick: addSelected }, "＋ SELECTED"),
          el("button", { type: "button", class: "cmb__clear", title: "素材を全部外す", onclick: () => {
            if (!cmb.chips.length) return;
            cmb.chips = []; save(); render(); toast("COMBINE · CLEARED");
          } }, "CLEAR"),
        ),
      ),
      el("div", { class: "cmb__drop" }),
      el("textarea", { class: "cmb__note", rows: "2", maxlength: "4000", spellcheck: "false",
        placeholder: "思いつき — これとこれで、こんな体験にしたい", "aria-label": "思いつき" }),
      el("div", { class: "cmb__opts" },
        el("button", { type: "button", class: "cmb__mode", "data-mode": "broad", title: "派生案を 3〜5 つ出してもらう" }, "広く提案"),
        el("button", { type: "button", class: "cmb__mode", "data-mode": "concrete", title: "思いつきを目標に計画してもらう" }, "これを作りたい"),
        el("label", { class: "cmb__kids", title: "各ノードの子・孫の見出しもプロンプトに入れる" },
          el("input", { type: "checkbox", class: "cmb__kids-cb" }), "子も含める"),
      ),
      el("button", { type: "button", class: "cmb__copy", onclick: copyPrompt }, "COPY PROMPT → CLAUDE"),
      el("details", { class: "cmb__preview" },
        el("summary", {}, "PREVIEW"),
        el("textarea", { class: "cmb__prompt", readonly: "", rows: "8", "aria-label": "生成したプロンプト" }),
      ),
    );
    const note = $(".cmb__note", tray);
    note.value = cmb.note;
    note.addEventListener("input", () => { cmb.note = note.value; save(); refreshPrompt(); });
    tray.querySelectorAll(".cmb__mode").forEach(b => b.addEventListener("click", () => {
      cmb.mode = b.dataset.mode; save(); render();
    }));
    const cb = $(".cmb__kids-cb", tray);
    cb.checked = cmb.kids;
    cb.addEventListener("change", () => { cmb.kids = cb.checked; save(); refreshPrompt(); });
    render();
  }

  function refreshPrompt() {
    const ta = tray && $(".cmb__prompt", tray);
    if (ta) ta.value = buildPrompt();
  }

  function render() {
    if (!tray) return;
    $(".cmb__count", tray).textContent = String(cmb.chips.length);
    const drop = $(".cmb__drop", tray);
    drop.replaceChildren();
    tray.classList.toggle("is-empty", !cmb.chips.length);
    if (!cmb.chips.length) {
      drop.appendChild(el("div", { class: "cmb__empty" },
        el("div", {}, "DRAG NODES HERE"),
        el("div", { class: "cmb__empty-jp" }, "ノードをここへドラッグ · C で選択中を追加 · マップをまたいで集められる"),
      ));
    }
    cmb.chips.forEach((c, i) => {
      drop.appendChild(el("div", { class: "cmb__chip", title: [c.mapLabel, ...c.path, c.title].join(" › ") },
        el("span", { class: "cmb__chip-map" }, c.mapLabel),
        el("span", { class: "cmb__chip-title" }, c.title),
        el("button", { type: "button", class: "cmb__chip-x", title: "外す", onclick: () => {
          cmb.chips.splice(i, 1); save(); render();
        } }, "×"),
      ));
    });
    tray.querySelectorAll(".cmb__mode").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === cmb.mode)));
    refreshPrompt();
  }

  /* ---------- drag hooks (called from app.js node drag) ---------- */
  let ghost = null;
  function isOver(x, y) {
    if (!tray || !tray.offsetParent) return false;
    const r = tray.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function dragMove(e, node, treeMode) {
    const over = isOver(e.clientX, e.clientY);
    tray?.classList.toggle("is-over", over);
    const show = over || treeMode;
    if (show) {
      if (!ghost) { ghost = el("div", { class: "cmb-ghost" }); document.body.appendChild(ghost); }
      ghost.textContent = (over ? "＋ " : "") + (node.title || "NODE");
      ghost.classList.toggle("is-over", over);
      ghost.style.left = e.clientX + 14 + "px";
      ghost.style.top = e.clientY + 12 + "px";
    } else if (ghost) { ghost.remove(); ghost = null; }
  }
  function dragEnd(e, node, x, y, reason) {
    tray?.classList.remove("is-over");
    if (ghost) { ghost.remove(); ghost = null; }
    if (reason !== "release" || x == null) return false;
    if (!isOver(x, y)) return false;
    addNode(node);
    return true;
  }

  window.Combine = { add: addNode, addSelected, buildPrompt, dragMove, dragEnd, get chips() { return cmb.chips; } };

  window.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== "c") return;
    if (e.target && (e.target.isContentEditable || /input|textarea|select/i.test(e.target.tagName))) return;
    if (window.isKeysOpen?.()) return;
    e.preventDefault();
    addSelected();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
