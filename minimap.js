/* =========================================================
   MINIMAP — the whole drawn map in a small box, with the visible area as a frame
   - click / drag inside it to move the view there; M shows / hides it
   - floating panel (floating-panel-kit feel): drag the header to move it, ▾ folds it to the header;
     where it sits and whether it is folded are remembered
   - draws what is on the stage (so in BRANCH it shows the branch)
   Relies on app.js globals: state, getView, applyTransform, saveState, updateCrumbs, el
   ========================================================= */
(function () {
  const KEY = "tdr-mindmap-minimap-v1";
  const W = 150, H = 100, PAD = 6;
  let box, cv, ctx, frame = 0, last = "", bounds = null, dragging = false;
  // saved as JSON { on, left, top, mini }; older builds saved "on" / "off"
  let pref = { on: true, left: null, top: null, mini: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "off") pref.on = false;
    else if (raw && raw.startsWith("{")) pref = { ...pref, ...JSON.parse(raw) };
  } catch {}
  let shown = pref.on !== false;
  function savePref() { try { localStorage.setItem(KEY, JSON.stringify({ ...pref, on: shown })); } catch {} }

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000"; }

  function collect() {
    const cards = document.querySelectorAll(".stg__viewport .node");
    const out = [];
    cards.forEach(c => {
      const x = parseFloat(c.style.left), y = parseFloat(c.style.top);
      if (!isFinite(x) || !isFinite(y)) return;
      out.push({ x, y, w: c.offsetWidth, h: c.offsetHeight, sel: c.classList.contains("is-selected") });
    });
    return out;
  }

  function draw() {
    const stg = document.querySelector(".stg");
    if (!stg || !ctx) return;
    const v = getView();
    const nodes = collect();
    const sig = v.x.toFixed(1) + "," + v.y.toFixed(1) + "," + v.k.toFixed(3) + "|" + nodes.length + "|" + nodes.map(n => n.x + ":" + n.y + (n.sel ? "*" : "")).join(",");
    if (sig === last) return;
    last = sig;
    ctx.clearRect(0, 0, W, H);
    if (!nodes.length) return;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    nodes.forEach(n => { l = Math.min(l, n.x - n.w / 2); r = Math.max(r, n.x + n.w / 2); t = Math.min(t, n.y - n.h / 2); b = Math.max(b, n.y + n.h / 2); });
    const sr = stg.getBoundingClientRect();
    // include the visible area so the frame is never outside the box
    const vl = -v.x / v.k, vt = -v.y / v.k, vw = sr.width / v.k, vh = sr.height / v.k;
    l = Math.min(l, vl); t = Math.min(t, vt); r = Math.max(r, vl + vw); b = Math.max(b, vt + vh);
    const s = Math.min((W - PAD * 2) / (r - l), (H - PAD * 2) / (b - t));
    const ox = (W - (r - l) * s) / 2 - l * s, oy = (H - (b - t) * s) / 2 - t * s;
    bounds = { s, ox, oy };
    const ink = css("--ink"), acc = css("--acc");
    nodes.forEach(n => {
      ctx.fillStyle = n.sel ? acc : ink;
      ctx.globalAlpha = n.sel ? 1 : 0.55;
      ctx.fillRect(ox + (n.x - n.w / 2) * s, oy + (n.y - n.h / 2) * s, Math.max(2, n.w * s), Math.max(1.5, n.h * s));
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + vl * s, oy + vt * s, vw * s, vh * s);
    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(ox + vl * s, oy + vt * s, vw * s, vh * s);
    ctx.globalAlpha = 1;
  }

  function moveTo(e) {
    if (!bounds) return;
    const stg = document.querySelector(".stg");
    const rr = cv.getBoundingClientRect();
    const wx = (e.clientX - rr.left - bounds.ox) / bounds.s;
    const wy = (e.clientY - rr.top - bounds.oy) / bounds.s;
    const v = getView();
    const sr = stg.getBoundingClientRect();
    v.x = sr.width / 2 - wx * v.k;
    v.y = sr.height / 2 - wy * v.k;
    applyTransform();
    window.updateCrumbs?.();
  }

  // default: right under the zoom buttons; once moved, where the user left it (kept inside the stage)
  function place() {
    const stg = document.querySelector(".stg");
    const zoom = document.querySelector(".stg .zoom");
    if (!box || !stg) return;
    if (pref.left == null || pref.top == null) {
      box.style.left = "auto"; box.style.right = "16px";
      box.style.top = zoom ? (zoom.offsetTop + zoom.offsetHeight + 10) + "px" : "260px";
      return;
    }
    const maxL = Math.max(0, stg.clientWidth - box.offsetWidth);
    const maxT = Math.max(0, stg.clientHeight - box.offsetHeight);
    box.style.right = "auto";
    box.style.left = Math.max(0, Math.min(maxL, pref.left)) + "px";
    box.style.top = Math.max(0, Math.min(maxT, pref.top)) + "px";
  }
  function makeHeadDraggable(head) {
    let drag = null;
    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      drag = { sx: e.clientX, sy: e.clientY, ox: box.offsetLeft, oy: box.offsetTop };
      try { head.setPointerCapture(e.pointerId); } catch {}
      box.classList.add("is-moving");
    });
    head.addEventListener("pointermove", (e) => {
      if (!drag) return;
      pref.left = drag.ox + e.clientX - drag.sx;
      pref.top = drag.oy + e.clientY - drag.sy;
      place();
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      box.classList.remove("is-moving");
      pref.left = box.offsetLeft; pref.top = box.offsetTop;
      savePref();
    };
    head.addEventListener("pointerup", end);
    head.addEventListener("pointercancel", end);
    // double-click the header: back to the default spot
    head.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      pref.left = pref.top = null; savePref(); place();
    });
  }
  function setMini(on) {
    pref.mini = on;
    box?.classList.toggle("is-mini", on);
    const b = box?.querySelector(".mini__fold");
    if (b) b.textContent = on ? "▸" : "▾";
    savePref();
    if (!on) { last = ""; draw(); }
  }

  function setShown(on) {
    shown = on;
    if (box) box.hidden = !on;
    savePref();
  }

  function build() {
    const stg = document.querySelector(".stg");
    if (!stg || box) return;
    box = el("div", { class: "mini" });
    cv = el("canvas", { class: "mini__cv", width: String(W * 2), height: String(H * 2) });
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx = cv.getContext("2d");
    ctx.scale(2, 2);
    cv.title = "クリック / ドラッグでその場所へ";
    const head = el("div", { class: "mini__hd", title: "ドラッグで移動 · ダブルクリックで元の位置 · M で表示切替" },
      el("span", {}, "MAP"),
      el("button", { type: "button", class: "mini__fold", title: "畳む / 開く", onclick: () => setMini(!pref.mini) }, "▾"));
    box.appendChild(head);
    box.appendChild(cv);
    stg.appendChild(box);
    box.hidden = !shown;
    makeHeadDraggable(head);
    if (pref.mini) setMini(true);
    place();
    window.addEventListener("resize", place);
    cv.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      dragging = true;
      try { cv.setPointerCapture(e.pointerId); } catch {}
      moveTo(e);
    });
    cv.addEventListener("pointermove", (e) => { if (dragging) moveTo(e); });
    const end = () => { if (dragging) { dragging = false; window.saveState?.(); } };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    box.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    (function loop() {
      if (shown && !pref.mini && (++frame % 3 === 0)) draw();
      requestAnimationFrame(loop);
    })();
  }

  window.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== "m") return;
    if (e.target && (e.target.isContentEditable || /input|textarea|select/i.test(e.target.tagName))) return;
    if (window.isKeysOpen?.()) return;
    e.preventDefault();
    setShown(!shown);
    if (shown) { last = ""; draw(); }
  });

  window.addEventListener("mindmap:ready", build);
  window.Minimap = { draw: () => { last = ""; draw(); }, setShown, get shown() { return shown; } };
})();
