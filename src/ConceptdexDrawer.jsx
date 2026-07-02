import React, { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph from "./ForceGraph.jsx";
import { hueFor, withAlpha, tint, starShadows } from "./uiTheme.js";
import RichText from "./RichText.jsx";

/* ============================================================
   ConceptdexDrawer — the field guide as a slide-in panel from
   the right, available from every screen. Each world's dex is a
   small constellation: region hubs with captured concepts in
   full colour and undiscovered ones as ghost "?" stars.
   ============================================================ */

const INK = "#EEF2FF";
const INK_SOFT = "#A5B1D6";
const LINE = "rgba(148,163,214,0.18)";
const mono = (size, color = INK_SOFT) => ({ fontFamily: "'JetBrains Mono', monospace", fontSize: size, letterSpacing: "0.07em", color, fontWeight: 700 });

export default function ConceptdexDrawer({
  open, onClose, worlds, dexWorld, setDexWorld, capturedSet,
  savedQuestions = [], onRemoveQuestion, deepLore = {}, onDeepen, busy,
  conceptNote,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [deckOpen, setDeckOpen] = useState(false);
  // The constellation is the hero; it condenses when you shift focus to the
  // list below (scroll) and can be pinned open/closed with the toggle.
  const [graphBig, setGraphBig] = useState(true);
  const manualRef = useRef(false);
  const lastToggleRef = useRef(0);
  const graphH = graphBig ? "min(68vh, 580px)" : 128;
  // Wide hysteresis + a cooldown so the height animation can finish without
  // the scroll position re-crossing a threshold and flickering the graph.
  const onBodyScroll = (e) => {
    if (manualRef.current) return;
    const now = Date.now();
    if (now - lastToggleRef.current < 700) return;
    const top = e.currentTarget.scrollTop;
    if (top > 140 && graphBig) { lastToggleRef.current = now; setGraphBig(false); }
    else if (top <= 2 && !graphBig) { lastToggleRef.current = now; setGraphBig(true); }
  };

  const world = worlds.find((w) => w.id === dexWorld) || worlds[0];
  const worldIdx = Math.max(worlds.findIndex((w) => w.id === (world && world.id)), 0);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const capturedKey = capturedSet ? capturedSet.size : 0;
  const { nodes, links, total, got } = useMemo(() => {
    if (!world) return { nodes: [], links: [], total: 0, got: 0 };
    const ns = []; const ls = []; let tot = 0; let cap = 0;
    ns.push({ id: `w:${world.id}`, kind: "hub", label: world.title, emoji: world.emoji, color: hueFor(worldIdx), r: 20, sub: "conceptdex" });
    (world.regions || []).forEach((r, ri) => {
      const hue = hueFor(ri % 8);
      const done = (r.concepts || []).filter((c) => capturedSet.has(c.id)).length;
      ns.push({ id: `r:${r.id}`, kind: "hub", label: r.name, emoji: r.emoji, color: hue, r: 13.5, progress: (r.concepts || []).length ? done / r.concepts.length : 0, sub: `${done}/${(r.concepts || []).length}` });
      ls.push({ source: `w:${world.id}`, target: `r:${r.id}`, w: 0.7, kind: "tree" });
      (r.concepts || []).forEach((c) => {
        tot += 1;
        const isCap = capturedSet.has(c.id);
        if (isCap) cap += 1;
        ns.push({ id: c.id, kind: "leaf", label: isCap ? c.name : "undiscovered", emoji: isCap ? c.sprite : null, color: hue, r: isCap ? 8 : 6, ghost: !isCap });
        ls.push({ source: `r:${r.id}`, target: c.id, w: 0.5, kind: "tree" });
      });
    });
    return { nodes: ns, links: ls, total: tot, got: cap };
  }, [world && world.id, capturedKey, worldIdx]);

  const findConcept = (id) => {
    for (const r of (world && world.regions) || []) {
      const c = (r.concepts || []).find((x) => x.id === id);
      if (c) return { ...c, regionName: r.name };
    }
    return null;
  };
  const selected = selectedId ? findConcept(selectedId) : null;
  const selectedCaptured = selected && capturedSet.has(selected.id);
  const note = selected && selectedCaptured && conceptNote ? conceptNote(selected, deepLore[selected.id]) : null;
  const stars = useMemo(() => starShadows(46, 640, 420, 17), []);

  const chip = (on, hue = "#8D9BFF") => ({
    border: `1px solid ${on ? withAlpha(hue, 0.65) : LINE}`,
    background: on ? withAlpha(hue, 0.16) : "rgba(255,255,255,0.04)",
    color: on ? tint(hue, 0.45) : INK_SOFT,
    borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  });

  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 68, background: "rgba(4,7,18,0.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", animation: "fadeIn .3s ease" }} />
      )}
      <aside role="dialog" aria-label="Conceptdex" style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 69,
        width: "min(660px, calc(100vw - 16px))",
        transform: open ? "translateX(0)" : "translateX(103%)",
        transition: "transform .42s cubic-bezier(.3,.75,.22,1)",
        background: "linear-gradient(200deg, rgba(19,26,54,0.97) 0%, rgba(9,13,30,0.97) 55%)",
        borderLeft: `1px solid ${LINE}`,
        boxShadow: "-32px 0 80px rgba(3,6,18,0.6)",
        display: "flex", flexDirection: "column",
        color: INK, fontFamily: "'Sora','Space Grotesk',system-ui,sans-serif",
      }}>
        <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 18, background: "rgba(141,155,255,0.14)", border: "1px solid rgba(141,155,255,0.4)", boxShadow: "0 0 18px rgba(141,155,255,0.25)" }}>📖</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>Conceptdex</div>
            <div style={{ ...mono(9) }}>{got}/{total} CAPTURED · {savedQuestions.length} SAVED QUESTION{savedQuestions.length === 1 ? "" : "S"}</div>
          </div>
          <button onClick={onClose} aria-label="Close Conceptdex" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${LINE}`, color: INK_SOFT, borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "10px 18px", overflowX: "auto", flexShrink: 0 }}>
          {worlds.map((w, i) => (
            <button key={w.id} onClick={() => { setDexWorld(w.id); setSelectedId(null); }} style={chip(dexWorld === w.id, hueFor(i))}>{w.emoji} {w.title}</button>
          ))}
        </div>

        <div style={{ position: "relative", margin: "2px 14px 0", height: graphH, flexShrink: 0, borderRadius: 20, overflow: "hidden", border: `1px solid ${LINE}`, background: "radial-gradient(130% 100% at 50% 0%, #17204A 0%, #0C1230 60%, #080C20 100%)", transition: "height .45s cubic-bezier(.3,.75,.25,1)" }}>
          <div aria-hidden style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, borderRadius: "50%", boxShadow: stars, animation: "starTwinkle 6s ease-in-out infinite" }} />
          {open && (
            <ForceGraph
              nodes={nodes}
              links={links}
              height={580}
              focusId={selectedId}
              style={{ position: "absolute", inset: 0, height: "100%" }}
              onNodeClick={(id) => { if (!id.startsWith("w:") && !id.startsWith("r:")) setSelectedId(id); }}
            />
          )}
          {graphBig && <div style={{ position: "absolute", left: 10, bottom: 10, ...mono(8.5), background: "rgba(9,13,30,0.7)", border: `1px solid ${LINE}`, borderRadius: 999, padding: "5px 9px", pointerEvents: "none" }}>
            ghost ? = undiscovered · click a star to inspect
          </div>}
          <button
            onClick={() => { manualRef.current = true; setGraphBig(!graphBig); }}
            title={graphBig ? "Condense the constellation" : "Expand the constellation"}
            style={{ position: "absolute", right: 10, top: 10, ...mono(9, INK), background: "rgba(9,13,30,0.75)", border: `1px solid ${LINE}`, borderRadius: 999, padding: "6px 11px", cursor: "pointer", backdropFilter: "blur(8px)" }}
          >{graphBig ? "⌃ condense" : "⌄ expand"}</button>
        </div>

        <div onScroll={onBodyScroll} style={{ flex: 1, overflowY: "auto", padding: "12px 18px 20px" }}>
          {selected ? (
            <div style={{ borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.045)", border: `1px solid ${LINE}`, animation: "slideUp .25s ease" }}>
              <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <span style={{ fontSize: 22 }}>{selectedCaptured ? selected.sprite : "❔"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14.5 }}>{selectedCaptured ? selected.name : "Undiscovered concept"}</b>
                  <div style={{ ...mono(8.5) }}>{selected.regionName.toUpperCase()}</div>
                </div>
                <span style={{ ...mono(9, selectedCaptured ? "#5BE0A2" : INK_SOFT) }}>{selectedCaptured ? "CAPTURED" : "LOCKED"}</span>
              </div>
              {selectedCaptured && note ? (
                <>
                  <p style={{ fontSize: 12.8, lineHeight: 1.6, margin: "9px 0 0" }}>{note.mechanism}</p>
                  <p style={{ fontSize: 12.3, color: INK_SOFT, lineHeight: 1.55, margin: "6px 0 0" }}><b>Decision note:</b> {note.consequence}</p>
                  <p style={{ fontSize: 12, color: "#8D9BFF", lineHeight: 1.55, margin: "6px 0 0" }}>{note.checkpoint}</p>
                  {deepLore[selected.id]
                    ? <RichText text={`🔍 ${note.deep}`} style={{ fontSize: 12, color: INK_SOFT, lineHeight: 1.55, marginTop: 6 }} />
                    : onDeepen && <button onClick={() => onDeepen(selected)} disabled={busy === "lore"} style={{ ...chip(false), marginTop: 9, fontSize: 11.5 }}>{busy === "lore" ? "Asking the sage…" : "🔍 Deepen this lore"}</button>}
                </>
              ) : (
                <p style={{ fontSize: 12.5, color: INK_SOFT, lineHeight: 1.6, margin: "9px 0 0" }}>
                  This star hasn't been charted yet. Win its critical encounter in <b style={{ color: INK }}>{selected.regionName}</b> to capture it.
                </p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: INK_SOFT, lineHeight: 1.6, margin: "2px 0 0" }}>
              Your field guide, one constellation per world. Captured concepts shine with their region's colour; ghosts are still out there. Save tricky questions from battles with <b style={{ color: INK }}>＋ dex</b> and they land in the deck below.
            </p>
          )}

          <button onClick={() => setDeckOpen(!deckOpen)} style={{ width: "100%", textAlign: "left", marginTop: 14, background: "rgba(255,255,255,0.045)", border: `1px solid ${LINE}`, color: INK, borderRadius: 14, padding: "11px 13px", cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ ...mono(9.5, "#8D9BFF") }}>{deckOpen ? "⌄" : "›"} SAVED QUESTION DECK · {savedQuestions.length}</span>
            <span style={{ ...mono(8.5) }}>{deckOpen ? "collapse" : "review"}</span>
          </button>
          {deckOpen && (savedQuestions.length ? savedQuestions.map((sq) => (
            <div key={sq.id} style={{ borderRadius: 14, padding: "11px 13px", marginTop: 8, background: "rgba(255,255,255,0.035)", border: `1px solid ${LINE}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span style={{ ...mono(8.5, "#8D9BFF") }}>{sq.sourceName || sq.src}</span>
                {onRemoveQuestion && <button onClick={() => onRemoveQuestion(sq.id)} style={{ ...chip(false), padding: "3px 8px", fontSize: 10 }}>remove</button>}
              </div>
              <p style={{ fontSize: 12.8, fontWeight: 700, lineHeight: 1.5, margin: "6px 0" }}>{sq.q}</p>
              <div style={{ display: "grid", gap: 4 }}>
                {(sq.options || []).map((o, i) => <div key={i} style={{ fontSize: 12, color: i === sq.a ? "#5BE0A2" : INK_SOFT }}><b>{String.fromCharCode(65 + i)}.</b> {o}{i === sq.a ? " ✓" : ""}</div>)}
              </div>
              {sq.why && <p style={{ fontSize: 12, color: INK_SOFT, lineHeight: 1.55, margin: "6px 0 0" }}>{sq.why}</p>}
            </div>
          )) : <p style={{ fontSize: 12, color: INK_SOFT, lineHeight: 1.55, margin: "8px 2px 0" }}>Empty deck. During any battle or gauntlet, tap <b style={{ color: INK }}>＋ dex</b> to bank a question worth re-drilling.</p>)}

          {(world && world.regions || []).map((r, ri) => {
            const capturedHere = (r.concepts || []).filter((c) => capturedSet.has(c.id));
            const hue = hueFor(ri % 8);
            return (
              <div key={r.id} style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ ...mono(9.5, tint(hue, 0.45)) }}>{r.emoji} {r.name.toUpperCase()}</span>
                  <span style={{ ...mono(8.5) }}>{capturedHere.length}/{(r.concepts || []).length}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                  {(r.concepts || []).map((c) => {
                    const isCap = capturedSet.has(c.id);
                    return (
                      <button key={c.id} onClick={() => setSelectedId(c.id)} style={{ ...chip(selectedId === c.id, hue), fontSize: 11, padding: "5px 9px", opacity: isCap ? 1 : 0.55 }}>
                        {isCap ? `${c.sprite} ${c.name}` : "❔ ???"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
