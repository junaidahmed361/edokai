import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export default function DkgThreeMap({ worlds, focusedWorld, mapStats, capturedSet, onFocus, onStudy, T, darkMode }) {
  const mountRef = useRef(null);
  const [hovered, setHovered] = useState(null);
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
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius + 0.07, radius + 0.11, 64),
        new THREE.MeshBasicMaterial({ color: isFocus ? 0xff916b : 0xd4dae8, transparent: true, opacity: isFocus ? 0.95 : 0.35, side: THREE.DoubleSide })
      );
      ring.position.set(p.x, p.y, 0.01);
      scene.add(ring);
      const island = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color), transparent: true, opacity: isFocus ? 0.94 : 0.72 })
      );
      island.position.set(p.x, p.y, 0.02);
      island.userData = { worldId: w.id };
      scene.add(island);
      pickables.push(island);

      const progress = st.concepts ? st.captured / st.concepts : 0;
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

    const setPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables)[0];
      setHovered(hit?.object?.userData?.worldId || null);
      renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    };
    const click = (event) => {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables)[0];
      if (hit?.object?.userData?.worldId) onFocus(hit.object.userData.worldId);
    };
    renderer.domElement.addEventListener("pointermove", setPointer);
    renderer.domElement.addEventListener("click", click);
    renderer.render(scene, camera);

    const resize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      const a = w / h;
      camera.left = -4.6 * a; camera.right = 4.6 * a; camera.top = 3.2; camera.bottom = -3.2; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    return () => {
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", setPointer);
      renderer.domElement.removeEventListener("click", click);
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, [darkMode, focus?.id, worldKey, capturedKey]);

  const labels = visibleWorlds.map((w) => {
    const p = layout.get(w.id) || { x: 0, y: 0, color: T.explore };
    const st = mapStats(w);
    return { w, p, st, left: `${50 + (p.x / 4.6) * 42}%`, top: `${50 - (p.y / 3.1) * 42}%` };
  });

  return (
    <div style={{ position: "relative", height: 390, borderRadius: 18, overflow: "hidden", border: `1px solid ${T.line}`, background: darkMode ? "#070B16" : "#F7F9FF" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      {labels.map(({ w, st, left, top }) => {
        const active = focus && w.id === focus.id;
        return (
          <button key={w.id} onClick={() => onFocus(w.id)} title="Focus this territory" style={{ position: "absolute", left, top, transform: "translate(-50%, -50%)", maxWidth: 154, textAlign: "center", border: `1px solid ${active ? T.action : T.line}`, background: active ? T.hud : (darkMode ? "rgba(20,27,49,0.78)" : "rgba(255,255,255,0.82)"), color: T.ink, borderRadius: 14, padding: "6px 8px", cursor: "pointer", boxShadow: active ? `0 10px 28px ${T.shadow}` : "none", backdropFilter: "blur(6px)", fontFamily: "inherit" }}>
            <div style={{ fontWeight: 900, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.emoji} {w.title}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: active ? T.action : T.inkSoft }}>{st.concepts} concepts · {w.regions.length} regions</div>
          </button>
        );
      })}
      {focus && (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", background: T.hud, border: `1px solid ${T.line}`, borderRadius: 14, padding: 10, backdropFilter: "blur(8px)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>{focus.emoji} {focus.title}</div>
            <div style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.35 }}>Island = macro world · orbiting dots = regions · green arc = captured progress · lines = shared-source proximity.</div>
          </div>
          <button onClick={() => onStudy(focus.id)} style={{ background: T.explore, color: "#fff", border: "none", borderRadius: 10, padding: "8px 11px", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>Study →</button>
        </div>
      )}
      {hovered && <div style={{ position: "absolute", right: 12, top: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.06em", color: T.explore, fontWeight: 700, background: T.hud, border: `1px solid ${T.line}`, borderRadius: 999, padding: "6px 9px" }}>CLICK TO FOCUS</div>}
    </div>
  );
}
