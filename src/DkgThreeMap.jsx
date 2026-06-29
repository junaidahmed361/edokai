import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const worldColor = (hex) => new THREE.Color(hex);
const hash = (str) => Array.from(String(str || "edokai")).reduce((h, ch) => ((h * 33 + ch.charCodeAt(0)) >>> 0), 5381);
const terrainNoise = (seed, i) => {
  const x = Math.sin(seed * 0.013 + i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
function makeTinyPlanet(world, radius, color, progress) {
  // Inspired by https://github.com/flo-bit/tiny-planets: low-poly procedural globe with deterministic random terrain per world.
  const seed = hash(world.id || world.title);
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geo.attributes.position;
  const c = new THREE.Color(color);
  const colors = [];
  for (let i = 0; i < pos.count; i += 1) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const n = terrainNoise(seed, i);
    const mountain = n > 0.72 ? 0.12 : n > 0.42 ? 0.045 : -0.018;
    pos.setXYZ(i, v.x * radius * (1 + mountain), v.y * radius * (1 + mountain), v.z * radius * (1 + mountain));
    const vc = c.clone().offsetHSL(0, n > 0.72 ? -0.08 : 0.02, n > 0.72 ? 0.2 : n * 0.18);
    if (progress > 0.75 && n > 0.55) vc.lerp(new THREE.Color(0x5be0a2), 0.45);
    colors.push(vc.r, vc.g, vc.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02, flatShading: true });
  const planet = new THREE.Mesh(geo, mat);
  planet.rotation.set((seed % 31) / 40, (seed % 73) / 30, 0);
  return planet;
}

export default function DkgThreeMap({ worlds, focusedWorld, mapStats, capturedSet, onFocus, onStudy, T, darkMode }) {
  const mountRef = useRef(null);
  const labelLayerRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [viewHint, setViewHint] = useState("drag empty space to pan · wheel/pinch to zoom · click planet to focus");
  const visibleWorlds = useMemo(() => (worlds || []).filter((w) => (w.regions || []).length), [worlds]);
  const worldKey = visibleWorlds.map((w) => `${w.id}:${(w.regions || []).length}`).join("|");
  const capturedKey = Array.from(capturedSet || []).sort().join("|");
  const focus = focusedWorld || visibleWorlds[0];
  const palette = ["#5B4FD6", "#1F9D6B", "#E8643F", "#C99A2C", "#2C7BE5", "#B15FD6", "#14B8A6", "#F97316"];
  const layout = useMemo(() => {
    const out = new Map();
    const n = Math.max(visibleWorlds.length, 1);
    visibleWorlds.forEach((w, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      out.set(w.id, { x: Math.cos(a) * 3.3, y: Math.sin(a) * 2.05, color: palette[i % palette.length] });
    });
    return out;
  }, [worldKey]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    mount.innerHTML = "";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(darkMode ? 0x070b16 : 0xf7f9ff);
    const width = mount.clientWidth || 620;
    const height = mount.clientHeight || 380;
    const aspect = width / height;
    const camera = new THREE.OrthographicCamera(-4.6 * aspect, 4.6 * aspect, 3.2, -3.2, 0.1, 100);
    camera.position.set(0, 0, 10);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pickables = [];
    const focusPos = focus ? layout.get(focus.id) : null;
    const view = { x: focusPos ? focusPos.x * 0.18 : 0, y: focusPos ? focusPos.y * 0.18 : 0, zoom: 1 };
    camera.position.set(view.x, view.y, 10);
    const ambient = new THREE.AmbientLight(0xffffff, darkMode ? 0.72 : 0.9);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.set(3.5, 5, 8);
    scene.add(sun);

    const stars = new THREE.Group();
    const starGeo = new THREE.CircleGeometry(0.012, 8);
    const starMat = new THREE.MeshBasicMaterial({ color: darkMode ? 0x7dd3fc : 0x9ca3af, transparent: true, opacity: darkMode ? 0.55 : 0.24 });
    for (let i = 0; i < 72; i += 1) {
      const seed = i * 97;
      const star = new THREE.Mesh(starGeo, starMat);
      star.position.set(((seed % 83) / 83) * 8.8 - 4.4, (((seed * 7) % 61) / 61) * 5.7 - 2.85, -0.5);
      stars.add(star);
    }
    scene.add(stars);

    const grid = new THREE.GridHelper(8.8, 10, darkMode ? 0x29324f : 0xcbd5e1, darkMode ? 0x17203f : 0xe2e8f0);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.45;
    grid.material.transparent = true;
    grid.material.opacity = darkMode ? 0.18 : 0.28;
    scene.add(grid);

    if (focus && focusPos) {
      visibleWorlds.forEach((w) => {
        if (w.id === focus.id) return;
        const p = layout.get(w.id);
        if (!p) return;
        const sameSources = new Set((focus.links || []).map((l) => l.url));
        const overlap = (w.links || []).filter((l) => sameSources.has(l.url)).length;
        const points = [new THREE.Vector3(focusPos.x, focusPos.y, -0.2), new THREE.Vector3(p.x, p.y, -0.2)];
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: overlap ? 0xffd166 : 0x8a94b8, transparent: true, opacity: overlap ? 0.55 : 0.22 })
        );
        scene.add(line);
      });
    }

    visibleWorlds.forEach((w) => {
      const p = layout.get(w.id);
      if (!p) return;
      const st = mapStats(w);
      const isFocus = focus && w.id === focus.id;
      const radius = isFocus ? 0.56 : 0.38 + Math.min(st.concepts, 32) * 0.006;
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(radius + 0.32, 64),
        new THREE.MeshBasicMaterial({ color: worldColor(p.color), transparent: true, opacity: isFocus ? 0.18 : 0.08 })
      );
      halo.position.set(p.x, p.y, -0.01);
      scene.add(halo);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius + 0.07, radius + 0.11, 64),
        new THREE.MeshBasicMaterial({ color: isFocus ? 0xff916b : 0xd4dae8, transparent: true, opacity: isFocus ? 0.95 : 0.35, side: THREE.DoubleSide })
      );
      ring.position.set(p.x, p.y, 0.01);
      scene.add(ring);
      const progress = st.concepts ? st.captured / st.concepts : 0;
      const island = makeTinyPlanet(w, radius, p.color, progress);
      island.position.set(p.x, p.y, 0.1);
      island.userData = { worldId: w.id };
      scene.add(island);
      pickables.push(island);

      const ocean = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.94, 24, 16),
        new THREE.MeshStandardMaterial({ color: darkMode ? 0x172554 : 0x93c5fd, transparent: true, opacity: 0.22, roughness: 0.9 })
      );
      ocean.position.set(p.x, p.y, 0.09);
      scene.add(ocean);

      const arc = new THREE.Mesh(
        new THREE.RingGeometry(radius + 0.14, radius + 0.18, 64, 1, Math.PI / 2, Math.max(0.001, progress * Math.PI * 2)),
        new THREE.MeshBasicMaterial({ color: 0x5be0a2, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
      );
      arc.position.set(p.x, p.y, 0.04);
      scene.add(arc);
    });

    if (focus && focusPos) {
      (focus.regions || []).forEach((r, i, arr) => {
        const a = (i / Math.max(arr.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const x = focusPos.x + Math.cos(a) * 1.02;
        const y = focusPos.y + Math.sin(a) * 0.72;
        const done = (r.concepts || []).filter((c) => capturedSet.has(c.id)).length;
        const complete = done === (r.concepts || []).length && r.concepts.length;
        const region = new THREE.Mesh(
          new THREE.CircleGeometry(0.12 + Math.min((r.concepts || []).length, 8) * 0.012, 28),
          new THREE.MeshBasicMaterial({ color: complete ? 0x5be0a2 : 0xffd166, transparent: true, opacity: 0.95 })
        );
        region.position.set(x, y, 0.08);
        scene.add(region);
        const link = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(focusPos.x, focusPos.y, 0.03), new THREE.Vector3(x, y, 0.03)]),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: darkMode ? 0.34 : 0.48 })
        );
        scene.add(link);
      });
    }

    const projectLabels = () => {
      const layer = labelLayerRef.current;
      if (!layer) return;
      visibleWorlds.forEach((w) => {
        const el = layer.querySelector(`[data-world-label="${CSS.escape(w.id)}"]`);
        const p = layout.get(w.id);
        if (!el || !p) return;
        const v = new THREE.Vector3(p.x, p.y, 0.1).project(camera);
        el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
        el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
        el.style.opacity = v.z > 1 ? "0" : "1";
      });
    };
    const render = () => { renderer.render(scene, camera); projectLabels(); };
    const setPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables)[0];
      setHovered(hit?.object?.userData?.worldId || null);
      renderer.domElement.style.cursor = hit ? "pointer" : "grab";
      return hit;
    };
    let dragging = false, moved = false, last = { x: 0, y: 0 };
    const pointerDown = (event) => {
      dragging = true; moved = false; last = { x: event.clientX, y: event.clientY };
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };
    const pointerMove = (event) => {
      const hit = setPointer(event);
      if (!dragging) return;
      const dx = event.clientX - last.x, dy = event.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      last = { x: event.clientX, y: event.clientY };
      const spanX = (camera.right - camera.left) / camera.zoom;
      const spanY = (camera.top - camera.bottom) / camera.zoom;
      view.x -= dx / renderer.domElement.clientWidth * spanX;
      view.y += dy / renderer.domElement.clientHeight * spanY;
      camera.position.set(view.x, view.y, 10);
      setViewHint(hit ? "release without dragging to focus" : "panning atlas…");
      render();
    };
    const pointerUp = (event) => {
      const hit = setPointer(event);
      dragging = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      if (!moved && hit?.object?.userData?.worldId) onFocus(hit.object.userData.worldId);
      setViewHint("drag empty space to pan · wheel/pinch to zoom · click planet to focus");
      render();
    };
    const wheel = (event) => {
      event.preventDefault();
      const next = Math.max(0.72, Math.min(2.4, camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
      camera.zoom = next;
      camera.updateProjectionMatrix();
      setViewHint(`zoom ${(next * 100).toFixed(0)}% · drag to pan`);
      render();
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerUp);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });
    render();

    const resize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      const a = w / h;
      camera.left = -4.6 * a; camera.right = 4.6 * a; camera.top = 3.2; camera.bottom = -3.2; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    return () => {
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", pointerUp);
      renderer.domElement.removeEventListener("wheel", wheel);
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, [darkMode, focus?.id, worldKey, capturedKey]);

  const labels = visibleWorlds.map((w) => {
    const st = mapStats(w);
    return { w, st };
  });

  return (
    <div style={{ position: "relative", height: 430, borderRadius: 22, overflow: "hidden", border: `1px solid ${T.line}`, background: darkMode ? "radial-gradient(circle at 50% 40%, #17203F 0%, #070B16 65%)" : "radial-gradient(circle at 50% 40%, #FFFFFF 0%, #EEF4FF 68%)", boxShadow: darkMode ? "0 18px 55px rgba(0,0,0,0.32)" : "0 18px 48px rgba(91,79,214,0.16)" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />
      <div ref={labelLayerRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {labels.map(({ w, st }) => {
        const active = focus && w.id === focus.id;
        return (
          <button data-world-label={w.id} key={w.id} onClick={() => onFocus(w.id)} title="Focus this territory" style={{ pointerEvents: "auto", position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", maxWidth: 154, textAlign: "center", border: `1px solid ${active ? T.action : T.line}`, background: active ? T.hud : (darkMode ? "rgba(20,27,49,0.78)" : "rgba(255,255,255,0.82)"), color: T.ink, borderRadius: 14, padding: "6px 8px", cursor: "pointer", boxShadow: active ? `0 10px 28px ${T.shadow}` : "none", backdropFilter: "blur(6px)", fontFamily: "inherit" }}>
            <div style={{ fontWeight: 900, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.emoji} {w.title}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: active ? T.action : T.inkSoft }}>{st.concepts} concepts · {w.regions.length} regions</div>
          </button>
        );
      })}
      </div>
      <div style={{ position: "absolute", left: 12, top: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.04em", color: T.inkSoft, background: T.hud, border: `1px solid ${T.line}`, borderRadius: 999, padding: "6px 9px", backdropFilter: "blur(8px)" }}>{viewHint}</div>
      {focus && (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", background: T.hud, border: `1px solid ${T.line}`, borderRadius: 14, padding: 10, backdropFilter: "blur(8px)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>{focus.emoji} {focus.title}</div>
            <div style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.35 }}>Tiny planet = macro world · randomized terrain = world identity · orbiting dots = regions · green arc = captured progress · click/pan focus selects the world.</div>
          </div>
          <button onClick={() => onStudy(focus.id)} style={{ background: T.explore, color: "#fff", border: "none", borderRadius: 10, padding: "8px 11px", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>Study →</button>
        </div>
      )}
      {hovered && <div style={{ position: "absolute", right: 12, top: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.06em", color: T.explore, fontWeight: 700, background: T.hud, border: `1px solid ${T.line}`, borderRadius: 999, padding: "6px 9px" }}>CLICK TO FOCUS</div>}
    </div>
  );
}
