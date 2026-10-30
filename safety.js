/* =========================================================
   SAVE SAFETY — full backup + "what will change" preview before any import
   - BACKUP · ALL : every tdr-mindmap* key in one JSON
                    (same format as _dev/BACKUP_RESTORE.md's bookmarklet: schema mindmap-ls-backup/1)
   - IMPORT.JSON  : full backup → restore everything (page reloads)
                    trees-only JSON (EXPORT.JSON) → overwrite the maps it contains
   - IMPORT.MD    : replace the open map
   Nothing changes until the preview is confirmed. The preview offers a backup download first (on by default).
   Relies on app.js globals: state, CATEGORIES, pushHistory, renderAll, saveState, toast, countNodes, maxDepth,
   parseMarkdown, layoutTree, download, blockReadonly; extras.js: exModal.panel / exModal.esc
   ========================================================= */
(function () {
  const PREFIX = "tdr-mindmap";
  const SCHEMA = "mindmap-ls-backup/1";
  const STORE_KEY = "tdr-mindmap-v4";
  const esc = s => (window.exModal?.esc ? window.exModal.esc(s) : String(s));
  const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const label = id => CATEGORIES.find(c => c.id === id)?.label || id;

  /* ---------- backup ---------- */
  function collectKeys() {
    const keys = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys[k] = localStorage.getItem(k);
    }
    return keys;
  }
  function backupAll({ quiet = false } = {}) {
    // write what is on screen first, so the file matches what the user sees
    if (!document.body.classList.contains("is-readonly")) window.saveState?.();
    let keys;
    try { keys = collectKeys(); } catch (e) { toast("BACKUP FAILED · " + (e.name || e)); return false; }
    const n = Object.keys(keys).length;
    const data = { schema: SCHEMA, origin: location.origin, savedAt: new Date().toISOString(), keys };
    download(JSON.stringify(data, null, 1), "mindmap-ALL_backup_" + (window.fileStamp ? window.fileStamp() : stamp()) + ".json", "application/json");
    if (!quiet) toast("BACKUP · ALL · " + n + " KEYS");
    return true;
  }

  /* ---------- helpers ---------- */
  function pickFile(accept) {
    return new Promise(resolve => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = accept;
      inp.onchange = () => resolve(inp.files[0] || null);
      inp.click();
    });
  }
  function treeStats(t) {
    try { return { n: countNodes(t), d: maxDepth(t), title: t.title || "" }; } catch { return null; }
  }
  function row(cells, cls = "") {
    return `<tr class="${cls}">${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
  }
  function table(head, rows) {
    return `<table class="sf-table"><thead>${row(head.map(esc))}</thead><tbody>${rows.join("")}</tbody></table>`;
  }
  async function confirmPreview({ title, intro, body, okLabel, danger = true, warn = "" }) {
    const html = `<p class="sf-intro">${intro}</p>${body}${warn ? `<p class="sf-warn">${warn}</p>` : ""}`;
    const res = await window.exModal.panel({
      title, html, okLabel, danger,
      check: { label: "先に今の全データをバックアップ（ダウンロード）", checked: true },
    });
    if (!res) { toast("IMPORT · CANCELLED"); return false; }
    if (res.checked && !backupAll({ quiet: true })) return false;
    return true;
  }

  /* ---------- IMPORT.JSON ---------- */
  async function importJSON() {
    if (blockReadonly()) return;
    const f = await pickFile(".json,application/json");
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { toast("ERROR · NOT JSON"); return; }
    if (data && data.schema === SCHEMA && data.keys && typeof data.keys === "object") return restoreFull(data, f.name);
    if (data && data.trees && typeof data.trees === "object") return mergeTrees(data.trees, f.name, Array.isArray(data.cats) ? data.cats : []);
    toast("INVALID JSON FORMAT");
  }

  async function mergeTrees(trees, fileName, catDefs = []) {
    const rows = [];
    const apply = [];
    const skipped = [];
    const create = []; // categories the file brings along (EXPORT.JSON of one map) that this browser lacks
    Object.keys(trees).forEach(id => {
      const t = trees[id];
      const inc = t && typeof t === "object" ? treeStats(t) : null;
      if (!inc) { skipped.push(id); return; }
      const def = catDefs.find(c => c && c.id === id && c.label);
      if (!CATEGORIES.find(c => c.id === id) && def && /^[A-Za-z0-9_-]+$/.test(id)) {
        create.push({ id, label: String(def.label), sub: String(def.sub || ""), jp: String(def.jp || ""), custom: true });
        apply.push(id);
        rows.push(row([esc(def.label), "—", "N=" + inc.n, "<b>新しいカテゴリとして追加</b>（一番上）"]));
        return;
      }
      if (!CATEGORIES.find(c => c.id === id)) {
        skipped.push(id);
        rows.push(row([esc(id), "—", "N=" + inc.n, "未登録のマップ・読み込まない"], "is-skip"));
        return;
      }
      const cur = state.trees[id] ? treeStats(state.trees[id]) : null;
      apply.push(id);
      rows.push(row([esc(label(id)), cur ? "N=" + cur.n : "—", "N=" + inc.n,
        cur ? "<b>上書き</b>" : "新しく入る"], cur && inc.n < cur.n ? "is-shrink" : ""));
    });
    if (!apply.length) { toast("IMPORT · NO MATCHING MAPS"); return; }
    const shrink = apply.some(id => state.trees[id] && countNodes(trees[id]) < countNodes(state.trees[id]));
    const ok = await confirmPreview({
      title: "IMPORT.JSON · PREVIEW",
      intro: `<b>${esc(fileName)}</b> の中身を、下の ${apply.length} マップに入れます。ほかのマップ・カテゴリ・並び順はそのまま。`,
      body: table(["MAP", "いま", "読み込む", "どうなる"], rows),
      warn: shrink ? "ノードが減るマップがあります（黄色の行）。" : "",
      okLabel: "IMPORT " + apply.length,
    });
    if (!ok) return;
    pushHistory();
    create.slice().reverse().forEach(c => CATEGORIES.unshift(c));
    if (create.length) {
      window.safeSetItem("tdr-mindmap-custom-cats-v1", JSON.stringify(CATEGORIES.filter(c => c.custom)));
      window.safeSetItem("tdr-mindmap-cat-order-v1", JSON.stringify(CATEGORIES.map(c => c.id)));
      state.active = create[0].id;
    }
    apply.forEach(id => {
      state.trees[id] = trees[id];
      state.meta[id] = { count: countNodes(trees[id]), depth: maxDepth(trees[id]) };
    });
    renderAll();
    saveState();
    toast("IMPORTED · " + apply.length + " MAPS · CTRL+Z TO UNDO");
  }

  async function restoreFull(data, fileName) {
    const keys = data.keys;
    const names = Object.keys(keys).filter(k => k.startsWith(PREFIX));
    let incTrees = {};
    try { incTrees = (JSON.parse(keys[STORE_KEY] || "{}").trees) || {}; } catch {}
    let customs = [];
    try { customs = JSON.parse(keys["tdr-mindmap-custom-cats-v1"] || "[]"); } catch {}
    const ids = new Set([...CATEGORIES.map(c => c.id), ...Object.keys(incTrees)]);
    const rows = [];
    ids.forEach(id => {
      const cur = state.trees[id] ? treeStats(state.trees[id]) : null;
      const inc = incTrees[id] ? treeStats(incTrees[id]) : null;
      const name = label(id) !== id ? label(id) : (customs.find(c => c.id === id)?.label || id);
      const what = !inc ? (cur ? "ファイルに無い → 最初の .md から" : "—")
        : !cur ? "新しく入る" : cur.n === inc.n ? "置き換え（数は同じ）" : "<b>置き換え</b>";
      rows.push(row([esc(name), cur ? "N=" + cur.n : "—", inc ? "N=" + inc.n : "—", what],
        cur && inc && inc.n < cur.n ? "is-shrink" : !inc && cur ? "is-skip" : ""));
    });
    const when = data.savedAt ? new Date(data.savedAt).toLocaleString() : "?";
    const otherOrigin = data.origin && data.origin !== location.origin;
    const ok = await confirmPreview({
      title: "RESTORE · FULL BACKUP",
      intro: `<b>${esc(fileName)}</b>（${esc(when)} に保存・${names.length} キー）で<b>全部</b>を置き換えます。` +
        `マップ・カテゴリ・並び順・既定レイアウト・視点・COMBINE トレイが対象。終わるとページを読み直します。`,
      body: table(["MAP", "いま", "復元後", "どうなる"], rows),
      warn: otherOrigin ? `別の場所（${esc(data.origin)}）で取ったバックアップです。` : "",
      okLabel: "RESTORE ALL",
    });
    if (!ok) return;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
      }
      names.forEach(k => localStorage.setItem(k, keys[k]));
    } catch (e) {
      toast("RESTORE FAILED · " + (e.name || e) + " · USE THE BACKUP FILE");
      return;
    }
    location.reload();
  }

  /* ---------- IMPORT.MD ---------- */
  async function importMD() {
    if (blockReadonly()) return;
    const f = await pickFile(".md,.markdown,text/markdown,text/plain");
    if (!f) return;
    let text;
    try { text = await f.text(); } catch { toast("ERROR · INVALID FILE"); return; }
    return replaceWithMarkdown(text, f.name);
  }
  // the browser keeps its own saved copy of each map, so edits to data/*.md only show after this
  async function reloadFromFile() {
    if (blockReadonly()) return;
    const cat = CATEGORIES.find(c => c.id === state.active);
    if (!cat || !cat.file) { toast("RELOAD · THIS MAP HAS NO .MD FILE"); return; }
    let text;
    try {
      const res = await fetch(cat.file, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      text = await res.text();
    } catch { toast("RELOAD · CAN'T READ " + cat.file); return; }
    return replaceWithMarkdown(text, cat.file.split("/").pop() + "（元のファイル）");
  }
  async function replaceWithMarkdown(text, sourceName) {
    const f = { name: sourceName };
    let root;
    try { root = parseMarkdown(text); } catch { toast("ERROR · INVALID FILE"); return; }
    const inc = treeStats(root);
    const cur = state.trees[state.active] ? treeStats(state.trees[state.active]) : null;
    if (!inc || inc.n <= 1) { toast("IMPORT · NO HEADINGS FOUND"); return; }
    const ok = await confirmPreview({
      title: "IMPORT.MD · PREVIEW",
      intro: `開いているマップ <b>${esc(label(state.active))}</b> を <b>${esc(f.name)}</b> の内容で置き換えます。` +
        `手で動かした配置もこのマップだけ初期化されます。`,
      body: table(["", "タイトル", "ノード", "深さ"], [
        row(["いま", esc(cur?.title || "—"), cur ? "N=" + cur.n : "—", cur ? "D=" + cur.d : "—"]),
        row(["読み込む", esc(inc.title), "N=" + inc.n, "D=" + inc.d], cur && inc.n < cur.n ? "is-shrink" : ""),
      ]),
      warn: cur && inc.n < cur.n ? "ノードが減ります。" : "",
      okLabel: "REPLACE MAP",
    });
    if (!ok) return;
    pushHistory();
    layoutTree(root);
    state.trees[state.active] = root;
    state.meta[state.active] = { count: countNodes(root), depth: maxDepth(root) };
    state.views[state.active] = { x: 600, y: 400, k: 0.85 };
    window.clearBranch?.({ fit: false });
    renderAll();
    saveState();
    toast("IMPORTED · MARKDOWN · CTRL+Z TO UNDO");
  }

  window.Safety = { backupAll, importJSON, importMD, reloadFromFile };
})();
