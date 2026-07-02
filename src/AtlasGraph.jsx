import React, { useMemo, useState } from "react";
import ForceGraph from "./ForceGraph.jsx";
import { hueFor, withAlpha, tint, starShadows } from "./uiTheme.js";

/* ============================================================
   AtlasGraph — the world atlas as a living constellation.
   Worlds are glowing hubs sized by concept count with capture
   rings; their regions orbit as satellites; dashed golden
   threads join worlds that share sources. Replaces the old
   tiny-planets placeholder.
   ============================================================ */

export default function AtlasGraph({
  worlds, focusedWorld, mapStats, capturedSet, onFocus, onStudy,
  T, height = 540,
}) {
  const [hint, setHint] = useState(null);
  const worldKey = worlds.map((w, i) => `${w.id}:${(w.regions || []).length}`).join("|");
  const capturedKey = capturedSet ? capturedSet.size : 0;

  const { nodes, links } = useMemo(() => {
    const ns = []; const ls = [];
    const visible = worlds.filter((w) => (w.regions || []).length);
    visible.forEach((w, i) => {
      const st = mapStats(w);
      const color = hueFor(i);
      ns.push({
        id: w.id, kind: "hub", label: w.title, emoji: w.emoji, color,
        r: 24 + Math.min(st.concepts, 48) * 0.36,
        progress: st.concepts ? st.captured / st.concepts : 0,
        sub: `${st.captured}/${st.concepts} · ${w.regions.length} region${w.regions.length === 1 ? "" : "s"}`,
      });
      (w.regions || []).forEach((r) => {
        const done = (r.concepts || []).filter((c) => capturedSet.has(c.id)).length;
        const total = (r.concepts || []).length;
        ns.push({
          id: `${w.id}::${r.id}`, kind: "leaf", label: r.name, emoji: r.emoji, color,
          r: 9 + Math.min(total, 10) * 0.7,
          progress: total ? done / total : 0,
          sub: `${done}/${total}`,
        });
        ls.push({ source: w.id, target: `${w.id}::${r.id}`, w: 0.85, kind: "tree" });
      });
    });
    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const au = new Set((visible[i].links || []).map((l) => l.url));
        const overlap = (visible[j].links || []).filter((l) => au.has(l.url)).length;
        if (overlap) ls.push({ source: visible[i].id, target: visible[j].id, w: Math.min(1, overlap / 3), kind: "overlap" });
      }
    }
    return { nodes: ns, links: ls };
  }, [worldKey, capturedKey]);

  const focus = focusedWorld && (focusedWorld.regions || []).length ? focusedWorld : worlds.find((w) => (w.regions || []).length);
  const focusStats = focus ? mapStats(focus) : null;
  const focusHue = focus ? hueFor(worlds.filter((w) => (w.regions || []).length).findIndex((w) => w.id === focus.id)) : "#6885F6";

  const glass = {
    background: "rgba(9,13,30,0.66)", border: "1px solid rgba(148,163,214,0.22)",
    backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderRadius: 16,
  };
  const mono = (size, color) => ({ fontFamily: "'JetBrains Mono', monospace", fontSize: size, letterSpacing: "0.07em", color, fontWeight: 700 });
  const stars1 = useMemo(() => starShadows(70, 1400, 900, 11), []);
  const stars2 = useMemo(() => starShadows(45, 1400, 900, 29), []);

  return (
    <div style={{
      position: "relative", height, borderRadius: 26, overflow: "hidden",
      border: "1px solid rgba(148,163,214,0.20)",
      background: "radial-gradient(120% 90% at 50% 0%, #1B2450 0%, #121A3C 38%, #0B102A 72%, #070B1D 100%)",
      boxShadow: "0 24px 70px rgba(3,6,18,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}>
      {/* aurora wash + starfield */}
      <div aria-hidden style={{ position: "absolute", inset: "-20%", pointerEvents: "none", opacity: 0.85, background: "radial-gradient(40% 34% at 22% 24%, rgba(104,133,246,0.20), transparent 70%), radial-gradient(36% 30% at 78% 18%, rgba(62,214,196,0.13), transparent 70%), radial-gradient(44% 36% at 62% 88%, rgba(208,95,175,0.12), transparent 70%)", animation: "auroraDrift 26s ease-in-out infinite alternate" }} />
      <div aria-hidden style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, borderRadius: "50%", boxShadow: stars1, animation: "starTwinkle 5.5s ease-in-out infinite" }} />
      <div aria-hidden style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, borderRadius: "50%", boxShadow: stars2, animation: "starTwinkle 7.5s ease-in-out 1.6s infinite" }} />

      <ForceGraph
        nodes={nodes}
        links={links}
        height={height}
        focusId={focus ? focus.id : null}
        style={{ position: "absolute", inset: 0, height: "100%" }}
        onNodeClick={(id) => {
          const worldId = id.includes("::") ? id.split("::")[0] : id;
          if (!id.includes("::") && focus && id === focus.id) { onStudy(worldId); return; }
          onFocus(worldId);
          setHint(id.includes("::") ? null : "click again to enter this world");
        }}
      />

      <div style={{ position: "absolute", left: 14, top: 14, ...glass, borderRadius: 999, padding: "7px 12px", ...mono(9.5, "#A5B1D6"), pointerEvents: "none" }}>
        {hint || "drag to explore · scroll to zoom · click a world to focus"}
      </div>
      <div className="hideSm" style={{ position: "absolute", right: 14, top: 14, ...glass, borderRadius: 999, padding: "7px 12px", ...mono(9, "#A5B1D6"), pointerEvents: "none", display: "flex", gap: 10 }}>
        <span>⬤ world</span><span>• region</span><span style={{ color: "#5BE0A2" }}>◠ captured</span>
      </div>

      {focus && focusStats && (
        <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, ...glass, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 24, background: `linear-gradient(160deg, ${withAlpha(tint(focusHue, 0.25), 0.35)}, ${withAlpha(focusHue, 0.16)})`, border: `1px solid ${withAlpha(focusHue, 0.45)}`, boxShadow: `0 0 22px ${withAlpha(focusHue, 0.35)}` }}>{focus.emoji}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#EEF2FF", fontFamily: "'Sora','Space Grotesk',sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{focus.title}</div>
              <div style={{ ...mono(9.5, "#A5B1D6"), marginTop: 3 }}>
                {focusStats.captured}/{focusStats.concepts} CAPTURED · {focus.regions.length} REGIONS{focusStats.sources ? ` · ${focusStats.sources} SOURCES` : ""}
              </div>
              <div style={{ height: 4, width: 180, maxWidth: "40vw", background: "rgba(255,255,255,0.10)", borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${focusStats.concepts ? Math.round((focusStats.captured / focusStats.concepts) * 100) : 0}%`, borderRadius: 4, background: `linear-gradient(90deg, ${tint(focusHue, 0.15)}, ${tint(focusHue, 0.5)})`, boxShadow: `0 0 10px ${withAlpha(focusHue, 0.7)}`, transition: "width .6s ease" }} />
              </div>
            </div>
          </div>
          <button onClick={() => onStudy(focus.id)} style={{ flexShrink: 0, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13, color: "#0B102A", padding: "11px 18px", borderRadius: 12, background: `linear-gradient(180deg, ${tint(focusHue, 0.55)}, ${tint(focusHue, 0.2)})`, boxShadow: `0 6px 22px ${withAlpha(focusHue, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.4)` }}>
            Enter world →
          </button>
        </div>
      )}
    </div>
  );
}
