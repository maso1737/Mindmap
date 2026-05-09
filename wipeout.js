/* =========================================================
   WIPEOUT / tDR UI integration
   - bg canvas: drifting measurement grid (always-on subtle motion)
   - fx canvas: state-driven edge lines (glow + persistence/trails)
   - state: { t, hoverId, activeId, nodes, edges, settings }
   - syncs node positions from DOM (existing layout intact)
   - hides existing SVG edges (renders them via canvas instead)
   ========================================================= */

(function () {
  "use strict";

  const wState = {
    t: 0,
    hoverId: null,
    activeId: null,
    selectedChain: new Set(),
    nodes: {},   // id -> {id, el, x, y, lvl, isRoot}
    edges: [],   // {from, to, lvl}
    settings: {
      enabled: true,
      grid: true,
      scan: true,
      trail: true,
      glow: true,
      gridDensity: 40,
      accent: "#c8ff1a",
      ink: "#0a0a0a",
      bgFade: "rgba(242,242,239,0.18)",
    },
  };
  window.__wState = wState;

  let bgCanvas, fxCanvas, bgCtx, fxCtx, dpr = 1;
  let rafId = null;

  function ensureCanvases() {
    bgCanvas = document.getElementById("w-bg");
    fxCanvas = document.getElementById("w-fx");
    if (!bgCanvas) {
      bgCanvas = document.createElement("canvas");
      bgCanvas.id = "w-bg";
      bgCanvas.className = "w-canvas w-canvas--bg";
      document.body.insertBefore(bgCanvas, document.body.firstChild);
    }
    if (!fxCanvas) {
      fxCanvas = document.createElement("canvas");
      fxCanvas.id = "w-fx";
      fxCanvas.className = "w-canvas w-canvas--fx";
      // append fx into the stage so it sits over the plate but under nodes
      const stg = document.querySelector(".stg");
      if (stg) stg.appendChild(fxCanvas);
      else document.body.appendChild(fxCanvas);
    }
    bgCtx = bgCanvas.getContext("2d");
    fxCtx = fxCanvas.getContext("2d");
    resize();
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    [bgCanvas, fxCanvas].forEach((c) => {
      if (!c) return;
      const r = c === fxCanvas
        ? (document.querySelector(".stg") || document.body).getBoundingClientRect()
        : { width: window.innerWidth, height: window.innerHeight };
      c.width = Math.floor(r.width * dpr);
      c.height = Math.floor(r.height * dpr);
      c.style.width = r.width + "px";
      c.style.height = r.height + "px";
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  /* ---------------- background: drifting grid + crosses --------------- */
  function drawBG() {
    if (!wState.settings.enabled || !wState.settings.grid) {
      bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
      return;
    }
    const W = bgCanvas.width / dpr;
    const H = bgCanvas.height / dpr;
    const ctx = bgCtx;

    // gentle wash so previous frame is felt but doesn't blur into mush
    ctx.clearRect(0, 0, W, H);

    const s = wState.settings.gridDensity;
    const tt = wState.t;

    // minor grid (subtle drift)
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(10,10,10,0.045)";
    ctx.beginPath();
    for (let x = -s; x < W + s; x += s) {
      const ox = Math.sin((x * 0.01) + tt * 0.6) * 1.2;
      ctx.moveTo(x + ox, 0);
      ctx.lineTo(x, H);
    }
    for (let y = -s; y < H + s; y += s) {
      const oy = Math.cos((y * 0.01) + tt * 0.5) * 1.2;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + oy);
    }
    ctx.stroke();

    // major grid (every 5 units)
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(10,10,10,0.085)";
    ctx.beginPath();
    const M = s * 5;
    for (let x = 0; x < W; x += M) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 0; y < H; y += M) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();

    // sweep band — slow horizontal scan
    const sweepY = ((tt * 38) % (H + 200)) - 100;
    const grad = ctx.createLinearGradient(0, sweepY - 80, 0, sweepY + 80);
    grad.addColorStop(0, "rgba(200,255,26,0)");
    grad.addColorStop(0.5, "rgba(200,255,26,0.07)");
    grad.addColorStop(1, "rgba(200,255,26,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, sweepY - 80, W, 160);

    // vignette / noise edges — light corner darkening
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.06)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- fx: connection lines with glow + trails ----------- */
  function drawFX() {
    if (!fxCtx || !fxCanvas) return;
    const ctx = fxCtx;
    const W = fxCanvas.width / dpr;
    const H = fxCanvas.height / dpr;

    if (!wState.settings.enabled) {
      ctx.clearRect(0, 0, W, H);
      return;
    }

    // trail / persistence
    if (wState.settings.trail) {
      ctx.fillStyle = "rgba(242,242,239,0.22)";
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.clearRect(0, 0, W, H);
    }

    const hover = wState.hoverId;
    const sel = wState.selectedChain;
    const acc = wState.settings.accent;
    const ink = wState.settings.ink;

    // draw edges
    for (const e of wState.edges) {
      const a = wState.nodes[e.from];
      const b = wState.nodes[e.to];
      if (!a || !b) continue;

      const isHoverRel = hover && (e.from === hover || e.to === hover);
      const isSel = sel.has(e.from) && sel.has(e.to);
      const isRoot = e.lvl === 1;

      // alpha
      let alpha;
      if (hover) alpha = isHoverRel ? 1 : 0.16;
      else if (sel.size) alpha = isSel ? 1 : 0.32;
      else alpha = 0.55;

      // stroke style
      let stroke = ink;
      let width = 1;
      if (isSel || isHoverRel) { stroke = acc; width = 2; }
      else if (isRoot) { width = 1.25; }

      // glow (only when active/hovered)
      if (wState.settings.glow && (isSel || isHoverRel)) {
        ctx.shadowColor = acc;
        ctx.shadowBlur = 10;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;

      // orthogonal routing through midX (matches existing svg path)
      const midX = (a.x + b.x) / 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(midX, a.y);
      ctx.lineTo(midX, b.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // node-end pip on the active edge
      if (isSel || isHoverRel) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = acc;
        ctx.globalAlpha = 1;
        ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
      }
    }

    // pulse on activeId
    if (wState.activeId && wState.nodes[wState.activeId]) {
      const n = wState.nodes[wState.activeId];
      const phase = (Math.sin(wState.t * 4) + 1) * 0.5;
      ctx.globalAlpha = 0.4 + phase * 0.5;
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1;
      ctx.shadowColor = acc;
      ctx.shadowBlur = 14;
      const r = 14 + phase * 8;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;
  }

  /* ---------------- sync nodes from DOM ------------------------------ */
  function syncNodesFromDOM() {
    const stg = document.querySelector(".stg");
    if (!stg) return;
    const stgRect = stg.getBoundingClientRect();
    const nodeEls = stg.querySelectorAll(".node");
    const seen = new Set();
    nodeEls.forEach((el) => {
      const id = el.getAttribute("data-id");
      if (!id) return;
      seen.add(id);
      const r = el.getBoundingClientRect();
      const x = r.left - stgRect.left + r.width / 2;
      const y = r.top - stgRect.top + r.height / 2;
      const lvlMatch = el.className.match(/lvl-(\d)/);
      wState.nodes[id] = {
        id, el,
        x, y,
        lvl: lvlMatch ? +lvlMatch[1] : 0,
        isRoot: el.classList.contains("is-root"),
      };
    });
    // prune missing
    Object.keys(wState.nodes).forEach((id) => { if (!seen.has(id)) delete wState.nodes[id]; });
  }

  /* ---------------- rebuild edge list from existing SVG paths --------- */
  function rebuildEdgesFromSVG() {
    const paths = document.querySelectorAll(".edges path");
    wState.edges = [];
    paths.forEach((p) => {
      const f = p.getAttribute("data-edge-from");
      const t = p.getAttribute("data-edge-to");
      if (!f || !t) return;
      // root-level child edges have class edge-acc
      const lvl = p.classList.contains("edge-acc") ? 1 : 2;
      wState.edges.push({ from: f, to: t, lvl });
    });
  }

  /* ---------------- attach hover/click hooks to nodes ---------------- */
  function attachNodeHooks() {
    const stg = document.querySelector(".stg");
    if (!stg) return;
    if (stg.__wHooked) return;
    stg.__wHooked = true;
    stg.addEventListener("mouseover", (e) => {
      const node = e.target.closest(".node");
      if (!node) return;
      const id = node.getAttribute("data-id");
      if (id) wState.hoverId = id;
    });
    stg.addEventListener("mouseout", (e) => {
      const node = e.target.closest(".node");
      if (!node) return;
      // only clear if leaving stage entirely (related target outside)
      if (!stg.contains(e.relatedTarget)) wState.hoverId = null;
    });
    stg.addEventListener("mouseleave", () => { wState.hoverId = null; });

    stg.addEventListener("click", (e) => {
      const node = e.target.closest(".node");
      if (!node) {
        wState.activeId = null;
        wState.selectedChain.clear();
        return;
      }
      const id = node.getAttribute("data-id");
      if (!id) return;
      activate(id);
    });
  }

  function activate(id) {
    wState.activeId = id;
    // build selected chain (ancestors + self) from edge list
    const chain = new Set([id]);
    let cur = id;
    let safety = 64;
    while (safety-- > 0) {
      const parentEdge = wState.edges.find((e) => e.to === cur);
      if (!parentEdge) break;
      chain.add(parentEdge.from);
      cur = parentEdge.from;
    }
    wState.selectedChain = chain;
    // pulse pulse pulse — cleared after a moment if it's not 'still selected'
    clearTimeout(activate._t);
    activate._t = setTimeout(() => { wState.activeId = null; }, 1400);
  }

  /* ---------------- main loop ---------------------------------------- */
  let lastSync = 0;
  function loop(ts) {
    wState.t += 0.016;

    // throttle DOM sync (60fps is overkill; 20fps for positions is fine)
    if (!lastSync || ts - lastSync > 50) {
      syncNodesFromDOM();
      lastSync = ts;
    }

    drawBG();
    drawFX();
    rafId = requestAnimationFrame(loop);
  }

  /* ---------------- public API: rebuild after renderStage ------------ */
  function rebuild() {
    rebuildEdgesFromSVG();
    syncNodesFromDOM();
    attachNodeHooks();
    // hide native SVG edges (we draw via canvas now)
    document.querySelectorAll(".edges").forEach((svg) => {
      svg.style.opacity = wState.settings.enabled ? "0" : "";
    });
  }
  window.__wRebuild = rebuild;

  function setEnabled(v) {
    wState.settings.enabled = !!v;
    document.body.classList.toggle("w-on", wState.settings.enabled);
    document.querySelectorAll(".edges").forEach((svg) => {
      svg.style.opacity = wState.settings.enabled ? "0" : "";
    });
  }
  window.__wSetEnabled = setEnabled;

  /* ---------------- boot ---------------------------------------------- */
  function boot() {
    ensureCanvases();
    document.body.classList.add("w-on");

    // hook into existing app: when renderStage runs, the SVG is rebuilt.
    // Patch a MutationObserver to detect new .edges nodes and rebuild.
    const stg = document.querySelector(".stg");
    if (stg) {
      const mo = new MutationObserver(() => {
        rebuild();
      });
      mo.observe(stg, { childList: true, subtree: true });
    }

    window.addEventListener("resize", resize);
    rebuild();
    if (rafId == null) rafId = requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    setTimeout(boot, 0);
  }
})();
