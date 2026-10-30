/* =========================================================
   DEEP LINKS — #map=<category id>&node=<node id>&t=<title>
   - opening such a URL selects the node, opens collapsed parents and centres it
   - node ids come from the saved map; a map loaded fresh from .md renumbers them,
     so the title (t=) is the fallback when the id no longer matches
   - the entry point PROJECT HUB will use later (see _dev/SPEC_HUB_ADAPTER.md)
   Relies on app.js globals: state, CATEGORIES, findNodeById, toast, el, jumpToNode
   ========================================================= */
(function () {
  function parse(hash) {
    const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    return { map: p.get("map"), node: p.get("node"), t: p.get("t") };
  }
  function findByTitle(root, title) {
    let hit = null;
    (function w(x) { if (hit) return; if (x.title === title) { hit = x; return; } (x.children || []).forEach(w); })(root);
    return hit;
  }
  function resolve({ map, node, t }) {
    if (!map) return null;
    if (!CATEGORIES.find(c => c.id === map) || !state.trees[map]) return { error: "MAP NOT FOUND · " + map };
    const root = state.trees[map];
    let n = node ? findNodeById(root, node) : null;
    if (n && t && n.title !== t) n = null;           // id was reused by another node
    if (!n && t) n = findByTitle(root, t);
    if (!n && !node && !t) return { map };
    if (!n) return { map, error: "NODE NOT FOUND" };
    return { map, n };
  }
  function open(hash) {
    const r = resolve(parse(hash));
    if (!r) return false;
    if (r.error && !r.map) { toast("LINK · " + r.error); return false; }
    if (r.n) { window.jumpToNode(r.map, r.n.id); return true; }
    if (state.active !== r.map) { state.active = r.map; state.selected = null; window.renderAll?.(); }
    if (r.error) toast("LINK · " + r.error + " · OPENED THE MAP");
    return true;
  }
  function linkFor(n) {
    const base = location.href.split("#")[0];
    const q = new URLSearchParams({ map: state.active, node: n.id, t: n.title || "" });
    return base + "#" + q.toString();
  }
  async function copyLink(n) {
    const url = linkFor(n);
    try { await navigator.clipboard.writeText(url); toast("LINK · COPIED"); }
    catch {
      const ta = el("textarea", { style: "position:fixed;left:-9999px;top:0" });
      ta.value = url; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch {}
      ta.remove();
      toast(ok ? "LINK · COPIED" : "LINK · " + url);
    }
    return url;
  }

  function inspector(panel, n) {
    const row = el("section", { class: "insp__row" }, el("div", { class: "lbl" }, "LINK TO THIS NODE"));
    row.appendChild(el("button", { type: "button", class: "insp__parent", title: linkFor(n), onclick: () => copyLink(n) }, "COPY LINK · #" + state.active + " / " + n.id));
    panel.appendChild(row);
  }

  window.addEventListener("mindmap:ready", () => { if (location.hash.length > 1) open(location.hash); });
  window.addEventListener("hashchange", () => open(location.hash));

  window.Links = { open, linkFor, copyLink, inspector, parse };
})();
