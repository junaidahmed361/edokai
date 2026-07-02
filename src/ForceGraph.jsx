import React, { useEffect, useRef } from "react";
import { withAlpha, tint } from "./uiTheme.js";

/* ============================================================
   ForceGraph — smooth force-directed graph on <canvas>.
   nodes: { id, label, sub, emoji, color, r, kind: "hub"|"leaf",
            progress (0..1), ghost (undiscovered) }
   links: { source, target, w (0..1), kind: "tree"|"overlap" }
   The sim never fully freezes: a low alpha floor plus per-node
   drift keeps the layout gently alive, Elysium-style.
   ============================================================ */

const hashStr = (s) => Array.from(String(s)).reduce((h, c) => ((h * 33 + c.charCodeAt(0)) >>> 0), 5381);

export default function ForceGraph({
  nodes = [], links = [], focusId = null, onNodeClick = null,
  height = 480, labelColor = "#EEF2FF", subColor = "#A5B1D6",
  minZoom = 0.4, maxZoom = 2.6, style = {},
}) {
  const canvasRef = useRef(null);
  const simRef = useRef({ nodes: new Map(), links: [], alpha: 1, fitted: false, userMoved: false });
  const camRef = useRef({ x: 0, y: 0, k: 1, tx: null, ty: null, tk: null });
  const hoverRef = useRef(null);
  const focusRef = useRef(focusId);
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;

  const dataKey = nodes.map((n) => `${n.id}:${n.r}:${n.ghost ? 1 : 0}:${(n.progress || 0).toFixed(2)}`).join("|")
    + "§" + links.map((l) => `${l.source}>${l.target}:${l.kind || ""}`).join("|");

  /* ---------- sync incoming data into the live simulation ---------- */
  useEffect(() => {
    const sim = simRef.current;
    const prev = sim.nodes;
    const next = new Map();
    const isNew = prev.size === 0;
    const hubs = nodes.filter((n) => n.kind !== "leaf");
    nodes.forEach((spec, i) => {
      const old = prev.get(spec.id);
      if (old) { next.set(spec.id, Object.assign(old, spec)); return; }
      let x; let y;
      let anchor = null;
      for (const l of links) {
        const other = l.source === spec.id ? l.target : l.target === spec.id ? l.source : null;
        if (!other) continue;
        const found = next.get(other) || prev.get(other);
        if (found) { anchor = found; break; }
      }
      const h = hashStr(spec.id);
      if (anchor) {
        const a = ((h % 360) / 360) * Math.PI * 2;
        const d = (anchor.r || 20) + (spec.r || 10) + 46 + (h % 30);
        x = anchor.x + Math.cos(a) * d; y = anchor.y + Math.sin(a) * d;
      } else {
        const hi = Math.max(hubs.findIndex((n) => n.id === spec.id), 0);
        const a = (hi / Math.max(hubs.length, 1)) * Math.PI * 2 + ((h % 100) / 100 - 0.5) * 0.5;
        const d = spec.kind === "leaf" ? 120 + (h % 160) : 190 + (h % 60);
        x = Math.cos(a) * d; y = Math.sin(a) * d;
      }
      next.set(spec.id, { ...spec, x, y, vx: 0, vy: 0, phase: (h % 628) / 100 });
    });
    const carried = [...next.keys()].filter((id) => prev.has(id)).length;
    sim.nodes = next;
    sim.links = links.filter((l) => next.has(l.source) && next.has(l.target));
    sim.alpha = Math.max(sim.alpha, isNew ? 1 : 0.5);
    if (isNew || carried === 0) {
      for (let i = 0; i < 160; i += 1) tick(sim, 1);
      sim.alpha = 0.25;
      sim.fitted = false; // (re)fit on next frame, once canvas size is known
    }
  }, [dataKey]);

  useEffect(() => {
    focusRef.current = focusId;
    const n = simRef.current.nodes.get(focusId);
    const cam = camRef.current;
    if (n && simRef.current.fitted) { cam.tx = n.x; cam.ty = n.y; cam.tk = Math.max(cam.k, 1); }
  }, [focusId]);

  /* ---------- physics ---------- */
  function tick(sim, alpha) {
    sim.t = (sim.t || 0) + 0.016;
    const ns = [...sim.nodes.values()];
    const n = ns.length;
    for (let i = 0; i < n; i += 1) { ns[i].fx = 0; ns[i].fy = 0; }
    for (let i = 0; i < n; i += 1) {
      const a = ns[i];
      for (let j = i + 1; j < n; j += 1) {
        const b = ns[j];
        let dx = a.x - b.x; let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (hashStr(a.id) % 10) / 10 - 0.5; dy = 0.3; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        // repulsion, scaled by node size so big worlds claim space
        let f = (36 * (a.r + 6) * (b.r + 6)) / d2;
        f = Math.min(f, 14);
        // hard collision pad
        const pad = a.r + b.r + 18;
        if (d < pad) f += (pad - d) * 0.42;
        const ux = dx / d; const uy = dy / d;
        a.fx += ux * f; a.fy += uy * f;
        b.fx -= ux * f; b.fy -= uy * f;
      }
      // gentle gravity toward origin (hubs slightly stronger)
      const g = a.kind === "leaf" ? 0.010 : 0.018;
      a.fx -= a.x * g; a.fy -= a.y * g;
      // organic drift so the constellation never dies
      a.fx += Math.sin(sim.t * 0.5 + a.phase) * 0.05;
      a.fy += Math.cos(sim.t * 0.4 + a.phase * 1.7) * 0.05;
    }
    for (const l of sim.links) {
      const a = sim.nodes.get(l.source); const b = sim.nodes.get(l.target);
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = l.kind === "overlap" ? a.r + b.r + 210 : a.r + b.r + 52;
      const k = (l.kind === "overlap" ? 0.012 : 0.06) * (0.5 + (l.w ?? 0.5));
      const f = (d - rest) * k;
      const ux = dx / d; const uy = dy / d;
      a.fx += ux * f; a.fy += uy * f;
      b.fx -= ux * f; b.fy -= uy * f;
    }
    for (const a of ns) {
      if (a.dragging) { a.vx = 0; a.vy = 0; continue; }
      a.vx = (a.vx + a.fx * alpha) * 0.8;
      a.vy = (a.vy + a.fy * alpha) * 0.8;
      a.x += a.vx; a.y += a.vy;
    }
  }

  /* ---------- mount: renderer + interaction ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const sim = simRef.current;
    const cam = camRef.current;
    let raf = 0; let dpr = 1; let W = 0; let H = 0;

    const fit = (smooth = false) => {
      const ns = [...sim.nodes.values()];
      if (!ns.length || !W) return;
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const a of ns) {
        x0 = Math.min(x0, a.x - a.r - 34); y0 = Math.min(y0, a.y - a.r - 34);
        x1 = Math.max(x1, a.x + a.r + 34); y1 = Math.max(y1, a.y + a.r + 34);
      }
      const k = Math.max(minZoom, Math.min(maxZoom, Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.94));
      const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2 + 10 / k;
      if (smooth) { cam.tx = cx; cam.ty = cy; cam.tk = k; }
      else { cam.k = k; cam.x = cx; cam.y = cy; cam.tx = cam.ty = cam.tk = null; }
      sim.fitted = true;
    };

    // Debounced, tweened reframe: while the container animates (e.g. the dex
    // drawer condensing) the observer fires every frame — snapping the camera
    // each tick reads as flicker, so wait for quiet, then glide to the new fit.
    let refitT = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      if (sim.fitted && !sim.userMoved) {
        clearTimeout(refitT);
        refitT = setTimeout(() => fit(true), 160);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const toWorld = (px, py) => ({ x: (px - W / 2) / cam.k + cam.x, y: (py - H / 2) / cam.k + cam.y });
    const pick = (px, py) => {
      const p = toWorld(px, py);
      let hit = null; let best = Infinity;
      for (const a of sim.nodes.values()) {
        const dx = a.x - p.x; const dy = a.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const hitR = Math.max(a.r + 7, 15 / cam.k);
        if (d < hitR && d < best) { best = d; hit = a; }
      }
      return hit;
    };

    const neighbors = (id) => {
      const set = new Set([id]);
      for (const l of sim.links) { if (l.source === id) set.add(l.target); if (l.target === id) set.add(l.source); }
      return set;
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2);
      ctx.scale(cam.k, cam.k);
      ctx.translate(-cam.x, -cam.y);
      const t = sim.t || 0;
      const hover = hoverRef.current;
      const near = hover ? neighbors(hover) : null;
      const dimOf = (id) => (near && !near.has(id) ? 0.24 : 1);

      /* links */
      for (const l of sim.links) {
        const a = sim.nodes.get(l.source); const b = sim.nodes.get(l.target);
        const lit = near && near.has(l.source) && near.has(l.target);
        const fade = near && !lit ? 0.25 : 1;
        const w = l.w ?? 0.5;
        const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const bow = (hashStr(l.source + l.target) % 2 ? 1 : -1) * d * 0.09;
        const cx = mx - (dy / d) * bow; const cy = my + (dx / d) * bow;
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        const base = l.kind === "overlap" ? 0.16 + w * 0.3 : 0.15 + w * 0.22;
        const al = (lit ? base + 0.3 : base) * fade;
        grad.addColorStop(0, withAlpha(a.color || "#8FA3D6", al));
        grad.addColorStop(1, withAlpha(b.color || "#8FA3D6", al));
        ctx.strokeStyle = grad;
        ctx.lineWidth = (l.kind === "overlap" ? 1 : 1.1 + w * 1.3) / cam.k;
        ctx.setLineDash(l.kind === "overlap" ? [4 / cam.k, 7 / cam.k] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
      }
      ctx.setLineDash([]);

      /* glows (additive) */
      ctx.globalCompositeOperation = "lighter";
      for (const a of sim.nodes.values()) {
        if (a.ghost) continue;
        const hov = hover === a.id;
        const glowR = a.r * (a.kind === "leaf" ? 2.1 : 2.5);
        const g = ctx.createRadialGradient(a.x, a.y, a.r * 0.4, a.x, a.y, glowR);
        g.addColorStop(0, withAlpha(a.color, (hov ? 0.42 : a.kind === "leaf" ? 0.16 : 0.24) * dimOf(a.id)));
        g.addColorStop(1, withAlpha(a.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(a.x, a.y, glowR, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      /* nodes */
      for (const a of sim.nodes.values()) {
        const hov = hover === a.id;
        const dim = dimOf(a.id);
        const r = a.r * (hov ? 1.07 : 1);
        ctx.globalAlpha = a.ghost ? 0.45 * dim : dim;
        if (a.ghost) {
          ctx.fillStyle = "rgba(126,140,180,0.20)";
          ctx.strokeStyle = "rgba(150,165,205,0.4)";
          ctx.setLineDash([3 / cam.k, 4 / cam.k]);
          ctx.lineWidth = 1 / cam.k;
          ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(190,202,235,0.75)";
          ctx.font = `700 ${Math.max(r * 1.0, 8)}px 'Sora','Space Grotesk',sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("?", a.x, a.y + 0.5);
        } else {
          const body = ctx.createRadialGradient(a.x - r * 0.35, a.y - r * 0.4, r * 0.1, a.x, a.y, r * 1.05);
          body.addColorStop(0, tint(a.color, 0.4));
          body.addColorStop(0.55, a.color);
          body.addColorStop(1, withAlpha(a.color, 0.92));
          ctx.fillStyle = body;
          ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${hov ? 0.55 : 0.3})`;
          ctx.lineWidth = 1.25 / cam.k;
          ctx.stroke();
          if (a.progress != null) {
            const ringR = r + 4.5;
            ctx.lineWidth = 2.6 / Math.sqrt(cam.k);
            ctx.strokeStyle = "rgba(255,255,255,0.14)";
            ctx.beginPath(); ctx.arc(a.x, a.y, ringR, 0, Math.PI * 2); ctx.stroke();
            if (a.progress > 0) {
              ctx.strokeStyle = a.progress >= 1 ? "#5BE0A2" : tint(a.color, 0.55);
              ctx.lineCap = "round";
              ctx.beginPath(); ctx.arc(a.x, a.y, ringR, -Math.PI / 2, -Math.PI / 2 + a.progress * Math.PI * 2); ctx.stroke();
              ctx.lineCap = "butt";
            }
          }
          if (a.emoji) {
            ctx.font = `${Math.max(r * 1.05, 9)}px sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(a.emoji, a.x, a.y + r * 0.06);
          }
        }
        /* focus halo */
        if (focusRef.current === a.id) {
          ctx.strokeStyle = withAlpha(a.color || "#8FA3D6", 0.5);
          ctx.lineWidth = 1.6 / cam.k;
          ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 11 + Math.sin(t * 2.4) * 2.4, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = withAlpha(a.color || "#8FA3D6", 0.22);
          ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 8, 0, Math.PI * 2); ctx.stroke();
        }
        /* labels */
        const showLabel = a.kind !== "leaf" || cam.k >= 0.95 || hov || focusRef.current === a.id;
        if (showLabel && a.label) {
          const fs = (a.kind === "leaf" ? 10 : 11.5) / Math.sqrt(cam.k);
          ctx.font = `${a.kind === "leaf" ? 600 : 700} ${fs}px 'Sora','Space Grotesk',sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "top";
          ctx.shadowColor = "rgba(4,7,18,0.9)"; ctx.shadowBlur = 7;
          ctx.fillStyle = a.ghost ? withAlpha("#B4C0E4", 0.6 * dim) : withAlpha(labelColor, 0.95 * dim);
          const ly = a.y + a.r + 9 / Math.sqrt(cam.k);
          ctx.fillText(a.label, a.x, ly);
          if (a.sub && (a.kind !== "leaf" || hov) && cam.k > 0.55) {
            ctx.font = `600 ${8.5 / Math.sqrt(cam.k)}px 'JetBrains Mono',monospace`;
            ctx.fillStyle = withAlpha(subColor, 0.9 * dim);
            ctx.fillText(a.sub, a.x, ly + fs + 3.5 / Math.sqrt(cam.k));
          }
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      }
    };

    let hidden = document.visibilityState === "hidden";
    const onVis = () => { hidden = document.visibilityState === "hidden"; };
    document.addEventListener("visibilitychange", onVis);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (hidden || !W) return;
      if (!sim.fitted && sim.nodes.size) fit();
      sim.alpha = Math.max(0.045, sim.alpha * 0.985);
      tick(sim, sim.alpha);
      // camera tween toward focus target
      if (cam.tx != null) {
        cam.x += (cam.tx - cam.x) * 0.08; cam.y += (cam.ty - cam.y) * 0.08;
        if (cam.tk != null) cam.k += (cam.tk - cam.k) * 0.08;
        if (Math.abs(cam.tx - cam.x) < 0.5 && Math.abs(cam.ty - cam.y) < 0.5) { cam.tx = cam.ty = cam.tk = null; }
      }
      draw();
    };
    raf = requestAnimationFrame(frame);

    /* pointer interaction */
    let down = null; let dragNode = null; let moved = 0;
    const pos = (e) => { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
    const onDown = (e) => {
      const p = pos(e);
      down = { ...p, camX: cam.x, camY: cam.y }; moved = 0;
      dragNode = pick(p.x, p.y);
      if (dragNode) { dragNode.dragging = true; sim.alpha = Math.max(sim.alpha, 0.3); }
      cam.tx = cam.ty = cam.tk = null;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      const p = pos(e);
      if (!down) {
        const h = pick(p.x, p.y);
        hoverRef.current = h ? h.id : null;
        canvas.style.cursor = h ? "pointer" : "grab";
        return;
      }
      moved += Math.abs(p.x - down.x) + Math.abs(p.y - down.y);
      if (dragNode) {
        const wpt = toWorld(p.x, p.y);
        dragNode.x = wpt.x; dragNode.y = wpt.y;
        sim.alpha = Math.max(sim.alpha, 0.22);
      } else {
        cam.x = down.camX - (p.x - down.x) / cam.k;
        cam.y = down.camY - (p.y - down.y) / cam.k;
        sim.userMoved = true;
        canvas.style.cursor = "grabbing";
      }
    };
    const onUp = (e) => {
      canvas.releasePointerCapture?.(e.pointerId);
      if (dragNode) { dragNode.dragging = false; }
      if (moved < 6 && clickRef.current) {
        const hit = dragNode || pick(pos(e).x, pos(e).y);
        if (hit) clickRef.current(hit.id, hit);
      }
      down = null; dragNode = null;
      canvas.style.cursor = "grab";
    };
    const onWheel = (e) => {
      e.preventDefault();
      const p = pos(e);
      const before = toWorld(p.x, p.y);
      cam.k = Math.max(minZoom, Math.min(maxZoom, cam.k * (e.deltaY > 0 ? 0.92 : 1.09)));
      const after = toWorld(p.x, p.y);
      cam.x += before.x - after.x; cam.y += before.y - after.y;
      cam.tx = cam.ty = cam.tk = null;
      sim.userMoved = true;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(refitT);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ display: "block", width: "100%", height, touchAction: "none", cursor: "grab", ...style }} />;
}
