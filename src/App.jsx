import React, { useState, useEffect, useRef, useMemo } from "react";
import { dkgSyncConfigStatus, loadDkgSnapshot, subscribeDkgSnapshot, snapshotToEdokaiWorlds, mergeDkgWorlds, summarizeDkgSnapshot } from "./dkgLiveSync";
import AtlasGraph from "./AtlasGraph.jsx";
import ConceptdexDrawer from "./ConceptdexDrawer.jsx";
import { withAlpha, tint, hueFor } from "./uiTheme.js";
import RichText from "./RichText.jsx";

/* ============================================================
   EDOKAI
   Two modes:
   🌍 LEARN — Budokai-style board worlds. Criticals teach, sides
      drill retention (with recommended level + prereq lore).
   ⌨️ DOJO — implementation katas: attention, LoRA, training
      loops, Blind-75 ties, system design. PyTorch/NumPy/JAX.
   Bring your own model (Claude built-in, or any OpenAI-compatible
   endpoint: Ollama, LM Studio, llama.cpp, cloud). Bring your own
   resource (URL, PDF, pasted text, or just a concept name).
   ============================================================ */

/* Twilight-first design system: dreamy stylized-world palette (deep indigo
   skies, aurora accents, glass panels) with an airy daylight counterpart. */
const THEMES = {
  light: {
    paper: "#E9EDF9", card: "rgba(255,255,255,0.82)", cardSolid: "#FFFFFF", ink: "#1C2442", inkSoft: "#5D6890",
    line: "rgba(93,104,144,0.20)", reward: "#149E6E", rewardSoft: "rgba(20,158,110,0.10)",
    penalty: "#D9534F", penaltySoft: "rgba(217,83,79,0.10)", action: "#E8643F",
    explore: "#5B5BD6", exploreSoft: "rgba(91,91,214,0.10)", gold: "#C08A1E", teal: "#0FA7A0", night: "#232B54",
    code: "#141A2E", codeText: "#D6DEF5", hud: "rgba(244,246,255,0.72)", shadow: "rgba(27,36,64,0.10)",
    glow: "rgba(91,91,214,0.22)",
  },
  dark: {
    paper: "#080B1A", card: "rgba(20,27,54,0.62)", cardSolid: "#141B36", ink: "#EEF2FF", inkSoft: "#9AA6CC",
    line: "rgba(148,163,214,0.16)", reward: "#3DDC97", rewardSoft: "rgba(61,220,151,0.10)",
    penalty: "#FF7A76", penaltySoft: "rgba(255,122,118,0.10)", action: "#FF8E5E",
    explore: "#8D9BFF", exploreSoft: "rgba(141,155,255,0.12)", gold: "#FFC862", teal: "#3ED6C4", night: "#05070F",
    code: "#0A0F22", codeText: "#D9E2FF", hud: "rgba(8,11,26,0.70)", shadow: "rgba(2,4,12,0.5)",
    glow: "rgba(141,155,255,0.30)",
  },
};
const T = { ...THEMES.dark };

/* ============================================================
   MUSIC ENGINE — bundled low-volume lo-fi background track
   ============================================================ */
class MusicEngine {
  constructor() { this.ctx = null; this.playing = false; this.timer = null; this.step = 0; this.defaultUrl = null; this.customUrl = null; this.audioEl = null; this.volume = 0.05; }
  setCustom(url) { this.customUrl = url; if (this.playing) { this.stop(); this.start(); } }
  start() {
    const track = this.customUrl || this.defaultUrl;
    if (track) {
      if (!this.audioEl) { this.audioEl = new Audio(); this.audioEl.loop = true; }
      this.audioEl.volume = this.volume;
      this.audioEl.src = track;
      this.audioEl.play().then(() => { this.playing = true; }).catch(() => { this.startGeneratedLoop(); });
      this.playing = true;
      return;
    }
    this.startGeneratedLoop();
  }
  startGeneratedLoop() {
    if (this.playing && this.timer) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.playing = true;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.08; this.master.connect(this.ctx.destination);
      const lead = [0, 3, 5, 7, 10, 7, 5, 3];     // minor pentatonic steps
      const bass = [0, 0, -5, -5, -7, -7, -5, -5];
      const base = 220; // A3
      const f = (semi) => base * Math.pow(2, semi / 12);
      const bpm = 92, spb = 60 / bpm / 2; // eighth notes
      this.timer = setInterval(() => {
        if (!this.playing) return;
        const t = this.ctx.currentTime + 0.05;
        const i = this.step % 8;
        // lead (triangle, gentle)
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = "triangle"; o.frequency.value = f(lead[i] + (Math.floor(this.step / 8) % 2 ? 12 : 7));
        g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.9);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + spb);
        // bass every other step (sine)
        if (i % 2 === 0) {
          const ob = this.ctx.createOscillator(), gb = this.ctx.createGain();
          ob.type = "sine"; ob.frequency.value = f(bass[i]) / 2;
          gb.gain.setValueAtTime(0.0, t); gb.gain.linearRampToValueAtTime(0.55, t + 0.03); gb.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.8);
          ob.connect(gb); gb.connect(this.master); ob.start(t); ob.stop(t + spb * 2);
        }
        // soft hat (noise-ish via high square blip)
        if (i % 2 === 1) {
          const oh = this.ctx.createOscillator(), gh = this.ctx.createGain();
          oh.type = "square"; oh.frequency.value = 6000 + Math.random() * 1500;
          gh.gain.setValueAtTime(0.03, t); gh.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          oh.connect(gh); gh.connect(this.master); oh.start(t); oh.stop(t + 0.05);
        }
        this.step++;
      }, spb * 1000);
    } catch (e) { console.error("audio", e); this.playing = false; }
  }
  stop() {
    this.playing = false;
    if (this.audioEl) { try { this.audioEl.pause(); } catch (e) {} }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.master) { try { this.master.disconnect(); } catch (e) {} }
  }
}
const music = new MusicEngine();

/* ============================================================
   MODEL ROUTING — built-in Claude or any OpenAI-compatible API
   (Ollama: http://localhost:11434/v1 · LM Studio: :1234/v1 ·
    llama.cpp server: :8080/v1 · or a cloud base URL + key)
   ============================================================ */
let GLOBAL_KEY = "";   // optional Anthropic key for desktop builds
async function askModel(prompt, cfg, opts = {}) {
  if (!cfg || cfg.provider === "builtin") cfg = { provider: "builtin", anthropicKey: (cfg && cfg.anthropicKey) || GLOBAL_KEY };
  const { needsWeb = false, pdfBase64 = null } = opts;
  if (!cfg || cfg.provider === "builtin") {
    // Claude/Artifacts bridge when available; Anthropic API with user key elsewhere.
    if (typeof window !== "undefined" && window.claude && typeof window.claude.complete === "function" && !pdfBase64 && !needsWeb) {
      return await window.claude.complete(prompt);
    }
    const content = pdfBase64
      ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } }, { type: "text", text: prompt }]
      : prompt;
    const body = {
      model: "claude-opus-4-20250514", max_tokens: 1600,
      messages: [{ role: "user", content }],
    };
    if (needsWeb) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    if (!(cfg && cfg.anthropicKey)) {
      if (typeof window !== "undefined" && window.edokaiAuth && typeof window.edokaiAuth.completeWithDefaultProvider === "function" && !pdfBase64) {
        try {
          return await window.edokaiAuth.completeWithDefaultProvider(prompt, { needsWeb, preferred: cfg.preferredAuth || "codex" });
        } catch (e) {
          console.warn("Default desktop model auth bridge failed", e);
        }
      }
      if (typeof window !== "undefined" && window.edokaiAuth && typeof window.edokaiAuth.completeWithClaudeCode === "function" && !pdfBase64) {
        try { return await window.edokaiAuth.completeWithClaudeCode(prompt, { needsWeb }); }
        catch (e) { console.warn("Claude Code auth bridge failed", e); }
      }
      let proxied;
      try {
        proxied = await fetch("/.netlify/functions/anthropic", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } catch (e) {
        throw new Error("Hosted model proxy is unreachable from this app session. In local browser dev, run Netlify Dev or use Settings → Custom endpoint; in the desktop app, use the default Codex GPT-5.5 / Claude auth bridge or run `claude auth login`.");
      }
      const pdata = await proxied.json().catch(() => ({}));
      if (!proxied.ok || pdata.error) throw new Error(pdata.error?.message || pdata.error || `Model proxy error ${proxied.status}`);
      const pout = (pdata.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (!pout.trim()) throw new Error("EMPTY_MODEL_RESPONSE");
      return pout;
    }
    const hdrs = { "Content-Type": "application/json" };
    hdrs["x-api-key"] = cfg.anthropicKey;
    hdrs["anthropic-version"] = "2023-06-01";
    hdrs["anthropic-dangerous-direct-browser-access"] = "true";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: hdrs, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error?.message || `Anthropic error ${res.status}`);
    const out = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (!out.trim()) throw new Error("EMPTY_MODEL_RESPONSE");
    return out;
  }
  // custom OpenAI-compatible endpoint
  if (needsWeb) throw new Error("WEB_NEEDED");
  if (pdfBase64) throw new Error("PDF_NEEDS_BUILTIN");
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  let res;
  try {
    res = await fetch(cfg.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST", headers,
      body: JSON.stringify({ model: cfg.model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
    });
  } catch (e) {
    throw new Error(`Could not reach custom model endpoint at ${cfg.baseUrl}. Check that the server is running and CORS allows this origin.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.message || `Endpoint error ${res.status}`);
  const out = data.choices?.[0]?.message?.content || "";
  if (!out.trim()) throw new Error("EMPTY_MODEL_RESPONSE");
  return out;
}
function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("no json");
  return JSON.parse(clean.slice(s, e + 1));
}
function optionTellBad(q) {
  if (!q || !q.options || q.options.length !== 4) return true;
  const lens = q.options.map((o) => String(o || "").trim().split(/\s+/).filter(Boolean).length);
  const max = Math.max(...lens), min = Math.min(...lens);
  return (lens[q.a] === max && lens.filter((x) => x === max).length === 1) || (max - min > 5);
}
function keepFairQuestions(qs) {
  return (qs || []).filter((q) => q.options && q.options.length === 4 && Number.isInteger(q.a) && q.a >= 0 && q.a < 4 && !optionTellBad(q));
}

function sentenceCaseOption(text) {
  let out = String(text || "").replace(/\s+/g, " ").replace(/[.…]+$/g, "").trim();
  if (!out) return "A nearby but incorrect explanation";
  out = out.replace(/^(the\s+)/i, "The ");
  if (/^[a-z]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  return out;
}
function wordsOf(text) { return String(text || "").trim().split(/\s+/).filter(Boolean); }
function cleanRepeatedWords(text) {
  let out = String(text || "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i += 1) out = out.replace(/\b([A-Za-z][A-Za-z0-9'-]*)\b(?:\s+\1\b)+/gi, "$1");
  out = out.replace(/\b(the|a|an|this|that)\s+\1\b/gi, "$1");
  out = out.replace(/\boption option\b/gi, "option");
  return out;
}
function compactOption(text) {
  // Options are NEVER truncated (CLAUDE.md rule 3): only cleaned.
  return cleanRepeatedWords(sentenceCaseOption(text)).replace(/[;:]+$/g, "") || "Nearby but wrong mechanism";
}
const OPTION_TAILS = [
  "in this workflow", "for this scenario", "during this stage", "across these tasks",
  "in this system", "under these constraints", "for this pipeline", "at this step",
  "in day-to-day practice", "for the task at hand",
];
function balanceOptionLengths(options, seed = "edokai") {
  const base = (options || []).slice(0, 4).map(compactOption);
  while (base.length < 4) base.push(compactOption(`Nearby wrong mechanism ${base.length + 1}`));
  // Dissolve length tells by EXPANDING short options with varied natural
  // tails (never by cutting long ones) until the spread is small.
  const seedN = Math.abs(Array.from(String(seed)).reduce((h, ch) => ((h * 31 + ch.charCodeAt(0)) | 0), 0));
  const maxLen = Math.max(...base.map((o) => wordsOf(o).length));
  const used = new Set();
  return base.map((o, i) => {
    let out = o;
    let guard = 0;
    while (maxLen - wordsOf(out).length > 3 && guard < 3) {
      const tail = OPTION_TAILS[(seedN + i * 3 + guard * 7 + out.length) % OPTION_TAILS.length];
      if (!used.has(tail) && !out.toLowerCase().includes(tail)) { out = `${out} ${tail}`; used.add(tail); }
      guard += 1;
    }
    return cleanRepeatedWords(out).replace(/\s+/g, " ").trim();
  });
}
function polishQuestionStem(stem, context = "this concept") {
  let q = cleanRepeatedWords(String(stem || "Choose the best answer.").replace(/\s+/g, " ").trim());
  q = q.replace(/^SCENARIO:\s*/i, "Scenario: ");
  q = q.replace(/[.…]+$/g, "").trim();
  q = q.replace(/\s+:$/g, "");
  q = q.replace(/^A pure-exploitation agent's characteristic failure$/i, "What failure should you expect from an agent that only exploits its current best-known action?");
  q = q.replace(/^Advantage A\(s,a\) measures$/i, "What does the advantage A(s,a) measure during policy-gradient training?");
  q = q.replace(/^For a tool-calling LLM agent, the state sₜ is$/i, "For a tool-calling LLM agent, which information should count as the current state sₜ?");
  q = q.replace(/^The Markov property guarantees that$/i, "What does the Markov property guarantee about the current state?");
  q = q.replace(/^Raising γ from 0\.5 toward 0\.99 makes the agent$/i, "What behavior changes when γ is raised from 0.5 toward 0.99?");
  q = q.replace(/^RL differs from supervised learning because$/i, "Why is reinforcement learning different from supervised learning?");
  q = q.replace(/^Exploration from a randomly-initialized LLM policy fails because$/i, "Why does exploration from a randomly initialized LLM policy usually fail?");
  q = q.replace(/^An action with negative advantage should become$/i, "What should happen to an action whose advantage estimate is negative?");
  q = q.replace(/^Rank by credit-assignment difficulty, easiest first$/i, "Which ordering ranks these environments by credit-assignment difficulty, from easiest to hardest?");
  q = q.replace(/^Multi-turn sequential environments are distinguished by$/i, "What distinguishes multi-turn sequential environments from simpler agent environments?");
  if (/^Scenario:/.test(q)) {
    if (!/[?]$/.test(q)) q += " What is the best next conclusion or action?";
    return cleanRepeatedWords(q);
  }
  if (/^(What|Why|Which|How|When|Where|Who|In what|For which)\b/i.test(q)) return cleanRepeatedWords(/[?]$/.test(q) ? q : `${q}?`);
  const lower = q.toLowerCase();
  if (/^order\b/i.test(q)) return cleanRepeatedWords(`Which sequence correctly orders this process: ${q.replace(/^order\s+/i, "")}?`);
  if (/^rank\b/i.test(q)) return cleanRepeatedWords(`Which option gives the correct ranking for this prompt: ${q.replace(/^rank\s+/i, "")}?`);
  if (/^not\b/i.test(q)) return cleanRepeatedWords(`Which option is not part of the mechanism described here: ${q}?`);
  const inContext = q.match(/^(In .+?, )(.+)$/i);
  if (/\bteaches$/i.test(q)) return cleanRepeatedWords(inContext ? `${inContext[1]}what does ${inContext[2].replace(/\s*teaches$/i, "")} teach?` : `What does ${q.replace(/\s*teaches$/i, "")} teach?`);
  if (/\bhelps\b.*\bby$/i.test(q) || /\bprimarily help by$/i.test(q)) return cleanRepeatedWords(`How does ${q.replace(/\s*by$/i, "")} help?`);
  if (/\bshould preserve evidence by$/i.test(q)) return cleanRepeatedWords(`How should ${q.replace(/\s*by$/i, "")} preserve evidence?`);
  if (/\bstruggles\b.*\bbecause$/i.test(q) || /\bfails because$/i.test(q) || /\bdiffers\b.*\bbecause$/i.test(q)) return cleanRepeatedWords(`Why does this happen: ${q.replace(/\s*because$/i, "")}?`);
  if (/\bworks because$/i.test(q)) return cleanRepeatedWords(`Why does this pipeline work: ${q.replace(/\s*because$/i, "")}?`);
  if (/\bsolves$/i.test(q)) return cleanRepeatedWords(`What problem does ${q.replace(/\s*solves$/i, "")} solve?`);
  if (/\bmatters downstream because$/i.test(q)) return cleanRepeatedWords(`Why does ${q.replace(/\s*because$/i, "")} matter downstream?`);
  if (/\bmeasures$/i.test(q)) return cleanRepeatedWords(`What does ${q.replace(/\s*measures$/i, "")} measure?`);
  if (/\bguarantees that$/i.test(q)) return cleanRepeatedWords(`What does this guarantee in ${context}?`);
  if (/\bshould become$/i.test(q)) return cleanRepeatedWords(`What should ${q.replace(/\s*should become$/i, "")} become?`);
  if (/\b(is|are|becomes|become|means|represents|requires|skips|enables|exists to|depends on)$/i.test(q)) return cleanRepeatedWords(`Which option correctly completes this idea: ${q}?`);
  if (lower.includes(" ___ ")) return cleanRepeatedWords(`Which option correctly fills in the blank for this prompt: ${q}?`);
  if (!/[?]$/.test(q)) return cleanRepeatedWords(`Which option best answers this prompt: ${q}?`);
  return q;
}
function polishQuestion(q, context = "this concept") {
  if (!q) return q;
  const options = balanceOptionLengths(Array.isArray(q.options) ? q.options : [], `${context}-${q.q || "question"}`);
  const a = Number.isInteger(q.a) && q.a >= 0 && q.a < 4 ? q.a : 0;
  let why = String(q.why || "This answer follows the mechanism taught in this concept.").replace(/\s+/g, " ").trim();
  if (!/[.!?]$/.test(why)) why += ".";
  if (why.length < 35) why = `${why} It connects the choice to the mechanism instead of a surface clue.`;
  return { ...q, q: polishQuestionStem(q.q, context), options, a, why };
}
function polishQuestions(qs, context = "this concept") {
  return (qs || []).map((q) => polishQuestion(q, context));
}
function balanceQuestion(q, seed = "edokai") {
  if (!q) return null;
  const raw = Array.isArray(q.options) ? q.options.map((o) => String(o || "").replace(/\s+/g, " ").replace(/[.…]+$/g, "").trim()).filter(Boolean) : [];
  const a0 = Number.isInteger(q.a) && q.a >= 0 && q.a < raw.length ? q.a : 0;
  const correct = raw[a0] || "source-backed mechanism";
  const fallbacks = ["neighbor mechanism in this region", "nearby but wrong design path", "surface-only evaluation signal", "unrelated runtime detail here"];
  const unique = [correct, ...raw.filter((_, i) => i !== a0), ...fallbacks].filter((o, i, arr) => o && arr.indexOf(o) === i).slice(0, 4);
  while (unique.length < 4) unique.push(`nearby distractor ${unique.length}`);
  const options = balanceOptionLengths(unique, seed);
  const idx = Math.abs(Array.from(seed).reduce((h, ch) => ((h * 31 + ch.charCodeAt(0)) | 0), 0)) % 4;
  [options[0], options[idx]] = [options[idx], options[0]];
  return polishQuestion({ ...q, q: String(q.q || "Choose the best source-grounded answer."), options, a: idx, why: String(q.why || "This advances the source-backed learning path.") }, seed);
}
function uniqueConceptName(name, section, used) {
  const base = String(name || "Source Mechanism").replace(/\s+/g, " ").trim();
  let out = base;
  let i = 2;
  while (used.has(out.toLowerCase())) {
    out = `${base} · ${String(section || `Facet ${i}`).replace(/\s+/g, " ").trim()}`;
    i += 1;
  }
  used.add(out.toLowerCase());
  return out;
}

const QUALITY_RULES = `CRITICAL QUALITY RULES for questions: every question must have exactly 4 complete, non-truncated options with similar length (within ~3 words and similar punctuation); the correct option must NEVER be the longest or most detailed; do not make the correct answer the only option with examples/numbers; distractors must be technically plausible; vary "a" (0-3) across questions. Stems and options are complete human-readable sentences — never trailing ellipses, never cut off mid-thought. A stem may use 1-2 short paragraphs or a "- " bullet list for scenario details when that aids readability.`;
const NAMING_RULES = `NAMING RULES: every world, arc, region, concept encounter, and side duel gets an evocative in-world name — a place, character, or artifact that hints at the mechanism — NEVER a bare publication/section title or dry taxonomy label. Good: "The Cache Vaults", "The Asymmetry Chasm", "Mirage of Acronyms". Bad: "KV Caching", "Section 3: Attention". Pair each lore name with the plain technical term inside its blurb/lore so learners still recognize the topic.`;

const TEACH_SOURCE = "mattpocock/skills productivity/teach";
const TEACHING_PARADIGM = {
  source: TEACH_SOURCE,
  mission: "Tie every world, region, and encounter to a concrete learner mission.",
  resources: "Ground knowledge in high-trust resources; never lean on vibes when a source is available.",
  lesson: "Teach one tightly-scoped win at a time: lore first, then an immediate feedback loop.",
  retention: "Build storage strength through retrieval, spacing, interleaving, and desirable difficulty.",
  wisdom: "When judgment depends on practice, point learners toward communities and real-world use.",
  reference: "Compress captured concepts into a durable glossary/reference layer for later review.",
};
const TEACH_PROMPT = `Teaching paradigm to apply everywhere (from ${TEACH_SOURCE}): make the learner mission explicit; ground claims in high-trust resources; each lesson/region teaches one tangible win; separate easy knowledge acquisition from effortful skill practice; build storage strength with retrieval, spacing, interleaving, and desirable difficulty; use immediate feedback; cite/source resources; surface wisdom/community practice when useful; keep glossary/reference terms crisp and consistent.`;
const teachMissionFor = (w) => `Master ${w.title} well enough to explain mechanisms, solve applied questions, and transfer the ideas into code or design decisions.`;
const applyTeachingParadigm = (w) => ({
  ...w,
  teaching: { ...TEACHING_PARADIGM, mission: w.mission || teachMissionFor(w), resources: (w.links || []).map((l) => l.label).slice(0, 4) },
  regions: (w.regions || []).map((r, i) => {
    const concepts = (r.concepts || []).map((c) => ({
      ...c,
      lore: narrativeLore(c.name, c.lore, w.title),
      questions: polishQuestions(c.questions, `${w.title} / ${r.name} / ${c.name}`),
    }));
    const sides = (r.sides || []).map((side) => ({
      ...side,
      questions: polishQuestions(side.questions, `${w.title} / ${r.name} / ${side.name || "side quest"}`),
    }));
    const gym = r.gym ? { ...r.gym, questions: polishQuestions(r.gym.questions, `${w.title} / ${r.name} gym`) } : r.gym;
    return {
      ...r,
      concepts,
      sides,
      gym,
      teachPhase: r.teachPhase || (i === 0 ? "mission + foundations" : "spaced transfer"),
      referenceHint: r.referenceHint || `Reference terms: ${(r.concepts || []).map((c) => c.name).join(", ")}.`,
    };
  }),
});
const teachRecordId = (worldId, conceptId) => `${worldId}:${conceptId}`;

async function scanUrl(url, cfg) {
  return parseJSON(await askModel(
    `Read the content at this URL (use web search): ${url}\nIdentify the title and 3-6 main learnable sections, plus an evocative game-world name for a learning RPG built from it (a lore name hinting at the core mechanism - never the raw publication title).\nRespond ONLY raw JSON: {"title":"...","worldName":"...","sections":["...","..."]}`, cfg, { needsWeb: true }));
}
async function scanText(text, cfg) {
  return parseJSON(await askModel(
    `Here is learning material:\n"""${text.slice(0, 6000)}"""\nIdentify a title and 3-6 main learnable sections, plus an evocative game-world name for a learning RPG built from it (a lore name hinting at the core mechanism - never the raw title).\nRespond ONLY raw JSON: {"title":"...","worldName":"...","sections":["...","..."]}`, cfg));
}
async function scanPdf(b64, cfg) {
  return parseJSON(await askModel(
    `Identify this document's title and 3-6 main learnable sections, plus an evocative game-world name for a learning RPG built from it (a lore name hinting at the core mechanism - never the raw document title).\nRespond ONLY raw JSON: {"title":"...","worldName":"...","sections":["...","..."]}`, cfg, { pdfBase64: b64 }));
}
async function findResource(concept, cfg) {
  return parseJSON(await askModel(
    `Find the single best free online resource (article/primer/docs) with optimal coverage for learning: "${concept}". Use web search.\nRespond ONLY raw JSON: {"title":"...","url":"...","worldName":"evocative game-world lore name for this topic (never the raw article title)","sections":["3-6 main learnable sections of that resource"]}`, cfg, { needsWeb: true }));
}
const REGION_JSON_SPEC = `{"regionName":"evocative in-world region name (a place/character/artifact hinting at the mechanism - do NOT reuse the source section title)","regionEmoji":"one emoji for the region","arc":"short lore-named category grouping related regions of this world (e.g. Foundations of Decision, The Craft of Reward)","npcText":"40-word NPC summary of the key principle","referenceHint":"one sentence glossary/reference summary","concepts":[{"name":"unique evocative concept name, not reused elsewhere in this generated world","sprite":"emoji","lore":"90-150 words written for humans: 1-2 short paragraphs, optionally a *dash* bullet list of 2-4 crisp points, **bold** the key technical term; teach the concept as a memorable mechanism with a concrete scene, state change, stakes, and evidence","questions":[{"q":"clear complete question with enough scenario context to choose an answer without guessing","options":["complete plausible option","complete plausible option","complete plausible option","complete plausible option"],"a":0,"why":"complete explanation that ties the answer to the mechanism"},{...}]}],"side":{"name":"healing creature name","sprite":"emoji","recLevel":2,"desc":"side duel framed as healing retention practice","questions":[{"q":"HEALING SCENARIO: clear applied scenario that reinforces prerequisites and asks for the best conclusion/action","options":[4 complete, similar-length plausible options],"a":0,"why":"complete explanation of why this heals/reinforces"},{...}]}}
Exactly 2 concepts (2 questions each) + 1 side (2 scenario questions). Concept names must be unique across the whole generated world, not generic duplicates. Lore must read like a short teaching story, not broken notes or colon-separated bullets. Critical questions are advancement gates; side questions are healing/retention gates that restore HP. Every question stem must be a complete sentence or scenario with a clear ask; avoid fragments like “X is...” or “failure:”. No option may be truncated or length-reveal the answer. Apply this teaching paradigm: ${TEACH_PROMPT} ${QUALITY_RULES} ${NAMING_RULES}`;

async function buildRegionFrom(sourceDesc, section, idx, cfg, pdfB64) {
  const prompt = pdfB64
    ? `From this document's section "${section}", build RPG learning content. Respond ONLY raw JSON:\n${REGION_JSON_SPEC}`
    : `Read ${sourceDesc}, section "${section}"${cfg && cfg.provider !== "builtin" ? "" : " (use web search)"}. Build RPG learning content. Respond ONLY raw JSON:\n${REGION_JSON_SPEC}`;
  const parsed = parseJSON(await askModel(prompt, cfg, { needsWeb: !pdfB64 && (!cfg || cfg.provider === "builtin"), pdfBase64: pdfB64 }));
  const usedConceptNames = new Set();
  const concepts = (parsed.concepts || []).slice(0, 2).map((c, i) => {
    const name = uniqueConceptName(c.name, section, usedConceptNames);
    const lore = String(c.lore || "").trim();
    return {
      ...c,
      id: `g${idx}c${i}`,
      name,
      lore: lore.length > 40 ? lore : `${name} begins as a concrete problem inside ${section}: the learner must notice which part of the system changes state, which evidence shows the change worked, and which design choice would fail without it. Capture the encounter by telling that causal story back in your own words before answering the advancement question.`,
      questions: (c.questions || []).map((q, qi) => balanceQuestion(q, `${section}-${name}-critical-${qi}`)).filter(Boolean).slice(0, 2),
    };
  });
  const sides = parsed.side ? [{
    ...parsed.side,
    id: `g${idx}s0`,
    anchor: 1,
    prereqs: concepts.map((c) => c.id),
    recLevel: parsed.side.recLevel || 2,
    desc: parsed.side.desc || "A generated healing retention duel: answer side questions to recover HP while strengthening prerequisites.",
    questions: (parsed.side.questions || []).map((q, qi) => balanceQuestion(q, `${section}-side-heal-${qi}`)).filter(Boolean).slice(0, 2),
  }] : [];
  const regionName = String(parsed.regionName || "").trim();
  return {
    id: `gr${idx}`,
    name: regionName && regionName.toLowerCase() !== section.toLowerCase() ? regionName : `The ${section} Reaches`,
    emoji: parsed.regionEmoji || "🌀",
    arc: String(parsed.arc || "").trim() || undefined,
    intro: `Forged from "${section}".`,
    npc: { name: "The Archivist", text: parsed.npcText || "Study this region's concepts carefully." },
    teachPhase: "resource-grounded mini lesson",
    referenceHint: parsed.referenceHint || `Reference terms: ${concepts.map((c) => c.name).join(", ")}.`,
    concepts, sides,
    gym: { leader: "Region Warden", badge: `${regionName || section} Badge`, sprite: "🏛️", taunt: "Prove you absorbed everything in this region!", questions: concepts.flatMap((c) => c.questions || []).slice(0, 4) },
  };
}
function normalizeGeneratedWorld(w) {
  const used = new Set();
  return {
    ...w,
    regions: (w.regions || []).map((r) => {
      const concepts = (r.concepts || []).map((c) => {
        const name = uniqueConceptName(c.name, r.name, used);
        return {
          ...c,
          name,
          lore: String(c.lore || "").length > 40 ? c.lore : `${name} is the key mechanism in ${r.name}: it changes what the learner can predict, debug, or design. The encounter is captured when you can name the state before and after the mechanism acts, then point to evidence that the change mattered.`,
          questions: (c.questions || []).map((q, qi) => balanceQuestion(q, `${w.title}-${r.name}-${name}-${qi}`)).filter(Boolean).slice(0, 2),
        };
      });
      const sides = (r.sides || []).map((side, si) => ({
        ...side,
        desc: side.desc || "Healing retention duel: answer side questions to recover HP while reinforcing prerequisite lore.",
        questions: (side.questions || []).map((q, qi) => balanceQuestion(q, `${w.title}-${r.name}-heal-${si}-${qi}`)).filter(Boolean).slice(0, 2),
      }));
      return { ...r, concepts, sides, referenceHint: r.referenceHint || `Reference terms: ${concepts.map((c) => c.name).join(", ")}.`, gym: { ...r.gym, questions: concepts.flatMap((c) => c.questions || []).slice(0, 4) } };
    }),
  };
}
async function buildKataFrom(sourceDesc, cfg, pdfB64) {
  const prompt = `${pdfB64 ? "From this document" : "Read " + sourceDesc + (cfg && cfg.provider !== "builtin" ? "" : " (use web search)")}, design ONE hands-on implementation kata for its core method. Respond ONLY raw JSON:
{"title":"Implement <method>","blurb":"40 words on what gets built","lore":"why this kata matters and what mechanism it teaches","frameworks":["pytorch"],"steps":[{"prompt":"TODO instruction referencing the code","lore":"why this TODO matters","hint":"small nudge, not the full answer","code":"short python snippet with ____ blank","options":["...","...","...","..."],"a":0,"why":"one line"},{...},{...}],"solution":"complete commented reference implementation, <60 lines"}
Exactly 3 steps. Apply this teaching paradigm: ${TEACH_PROMPT} ${QUALITY_RULES} ${NAMING_RULES}`;
  const parsed = parseJSON(await askModel(prompt, cfg, { needsWeb: !pdfB64 && (!cfg || cfg.provider === "builtin"), pdfBase64: pdfB64 }));
  return { id: "uk" + Date.now(), family: "custom", title: parsed.title || "Custom kata", blurb: parsed.blurb || "", lore: parsed.lore || "", frameworks: parsed.frameworks || ["pytorch"], steps: parsed.steps || [], solutions: { pytorch: parsed.solution || "" }, links: [] };
}
async function fetchPapers(topic, cfg) {
  return parseJSON(await askModel(
    `Search the web for the 5 most notable/recent ML papers about "${topic}" (arXiv, Hugging Face Papers — note: Papers with Code was sunset in 2025, do not cite it). Respond ONLY raw JSON:
{"papers":[{"title":"...","summary":"25-word plain-language summary","venue":"arXiv id or venue","url":"..."}]}`, cfg, { needsWeb: true }));
}
async function reviewCode(kataTitle, framework, code, cfg) {
  return askModel(
    `You are a strict but encouraging ML code reviewer. The learner attempted the kata "${kataTitle}" in ${framework}. Review their code: correctness first (shapes, math, gradients, edge cases), then style. Give a grade out of 10, the top 3 issues, and one concrete improvement. Be concise (<200 words).\n\nCODE:\n${code.slice(0, 5000)}`, cfg);
}


/* ============================================================
   WALKTHROUGH — first-run tour of every tab and why it exists.
   New top-level features must add a step here (see CLAUDE.md).
   ============================================================ */
const TOUR_STEPS = [
  { icon: "\u{1F5FA}\uFE0F", kicker: "LEARN", title: "The Atlas", target: '[data-tour="atlas"]', body: "Every **world** is a glowing hub in a living constellation, its **regions** orbiting as satellites. Click a world to focus it, click again to enter. Progress rings fill as you capture concepts, and golden threads join worlds that share sources." },
  { icon: "\u{1F9ED}", kicker: "WORLDS", title: "Case boards & arcs", target: '[data-tour="tab-home"]', body: "Inside a world, case boards are grouped into **arcs** — lore-named chapters that keep growing content organized.\n- \u2B21 **Criticals** teach a new concept and gate the path\n- \u25C7 **Sides** are retention duels that heal your HP\n- \u{1F3DB} the **Gym** awards the region badge" },
  { icon: "\u{1FAD8}", kicker: "HP & SENZU", title: "Harm, healing, and the Senzu bean", target: '[data-tour="hp"]', body: "This bar is your HP.\n- Missing a **critical** question draws a counterattack that costs HP\n- Winning **side duels** heals you back\n- When you are badly hurt, start the **\u{1FAD8} Senzu bean** quest: clear one Blind 75 kata and one ML kata in the Dojo to fully recover" },
  { icon: "\u2328\uFE0F", kicker: "DOJO", title: "The Dojo", target: '[data-tour="tab-dojo"]', body: "Implementation katas: **Blind 75**, **TorchLeet**, ML engineering, and system design — with live in-browser Python, runnable tests, and AI review. Senzu healing quests route here." },
  { icon: "\u{1F33F}", kicker: "WILDS", title: "The Wilds", target: '[data-tour="tab-wildspick"]', body: "An episode generator over any world's lore. Each run forges **brand-new, verifiable questions** grounded strictly in the material — so practice never goes stale — and it biases toward the topics you miss most." },
  { icon: "\u{1F9EA}", kicker: "COACH", title: "The Coach", target: '[data-tour="tab-coach"]', body: "Every answer feeds per-concept telemetry. The Coach reads your **miss patterns** and forges targeted scenario drills that join the world's question pool — the system teaches hardest where you are weakest." },
  { icon: "\u2694\uFE0F", kicker: "GAUNTLET", title: "Trial Gauntlet", target: null, body: "The world exam, launched from any world or the Coach: **3 lives**, the entire shuffled question pool including coach-forged drills, and a weakest-topic report at the end. Run it to prove a world is truly cleared." },
  { icon: "\u{1F4D6}", kicker: "CONCEPTDEX", title: "The Conceptdex", target: '[data-tour="dex"]', body: "Your field guide, sliding in from the right on any screen. Captured concepts shine in their region's colour; undiscovered ones stay ghost stars. During battles, tap **\uFF0B dex** to bank tricky questions into its review deck." },
  { icon: "\u{1F4E1}", kicker: "MISSION & PAPERS", title: "Mission log & Paper scout", target: '[data-tour="tab-papers"]', body: "**Mission** is the teach workspace: mission, resources, glossary terms and learning records earned by wins. **Papers** scouts fresh research — any paper can be forged into a brand-new world with *+ Bring your own*." },
  { icon: "\u{1F9E0}", kicker: "MODELS", title: "Bring your own brain", target: '[data-tour="settings"]', body: "Generation runs through whatever model you connect in **\u2699\uFE0F Settings**: sign into a **Claude Code** or **Codex** subscription (desktop app), paste an **Anthropic API key**, or point at any local OpenAI-compatible endpoint:\n- Ollama — `http://localhost:11434/v1`\n- LM Studio — `http://localhost:1234/v1`\nThis powers the Wilds, Coach, Deepen Lore, imports, and code review." },
];

/* ============================================================
   STORAGE
   ============================================================ */
async function loadStore(key, fb) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; }
}
async function saveStore(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch (e) { console.error("storage", e); }
}

/* ============================================================
   CONTENT — WORLD 1: AGENTIC RL (6 regions, full primer)
   Sides carry recLevel + prereqs (concept ids) for optimal
   retention, and some carry code walkthroughs.
   ============================================================ */
const RL_REGIONS = [
  {
    id: "fields", name: "Foundation Fields", emoji: "🌾",
    intro: "The raw mathematics of decision-making.",
    npc: { name: "Professor Bellman", text: "An MDP is the tuple (S, A, P, R, γ). The agent's whole life is maximizing J(π) = E[Σ γᵗ·R(sₜ,aₜ)] — expected discounted return. Everything ahead is built on that one equation." },
    concepts: [
      { id: "mdp", name: "MDP", sprite: "🎲",
        lore: "The Markov Decision Process is the formal arena of RL: a tuple (S, A, P, R, γ). S is every state the world can be in; A is every action available; P(s′|s,a) says how the world changes when you act; R(s,a) is the feedback signal; γ ∈ [0,1] discounts the future. The Markov property means the current state contains everything needed to decide. For LLM agents, the 'state' is the serialized context: user query, reasoning so far, past tool calls and their outputs.",
        questions: [
          { q: "In the MDP tuple, what does P(s′|s,a) represent?", options: ["The environment's transition dynamics", "The agent's action-selection policy", "The reward attached to reaching s′", "The discount applied to future states"], a: 0, why: "P is how the world changes when you act — the environment's side, not the agent's." },
          { q: "For a tool-calling LLM agent, the state sₜ is…", options: ["the model's current weight values", "the single most recent output token", "the full serialized context and tool history", "the list of available tool schemas only"], a: 2, why: "State = query + reasoning + past tool calls and outputs, serialized into the prompt." },
          { q: "The Markov property guarantees that…", options: ["rewards are always positive", "the current state suffices for deciding", "transitions are fully deterministic", "the episode ends in finite steps"], a: 1, why: "No hidden history needed — sₜ carries everything decision-relevant." },
        ] },
      { id: "policy", name: "Policy & Return", sprite: "🧭",
        lore: "The policy π(a|s) is the agent's brain: a probability distribution over actions given state. Training never edits the world — it edits π. The objective is the expected return J(π) = E[Σₜ γᵗ R(sₜ,aₜ)]. The discount γ shapes temperament: γ→1 makes a far-sighted planner; γ→0 makes a greedy reflex machine. RL is distinct from supervised learning because no labels exist — the agent must act, observe consequences, and adapt.",
        questions: [
          { q: "Raising γ from 0.5 toward 0.99 makes the agent…", options: ["explore far less of the state space", "ignore everything past the next step", "act with much higher randomness", "weigh distant rewards far more heavily"], a: 3, why: "γᵗ decays slower, so far-future rewards keep real weight — patience emerges." },
          { q: "RL differs from supervised learning because…", options: ["no correct labels exist, only consequences", "it requires far larger neural networks", "it cannot use gradient-based optimization", "it never evaluates on held-out data"], a: 0, why: "Act, observe reward, adapt — the label never exists." },
        ] },
      { id: "explore", name: "Exploration", sprite: "🔦",
        lore: "Rewards must be discovered, creating RL's deepest tension: exploit the best-known action, or explore in case something better hides. Pure exploitation locks into mediocre habits; pure exploration never banks a win. For LLM agents the action space is astronomically large — every possible token sequence — so unguided exploration is hopeless. This is why systems warm-start with imitation (SFT) before RL: it collapses the search space to sane behavior so exploration refines instead of flailing.",
        questions: [
          { q: "Exploration from a randomly-initialized LLM policy fails because…", options: ["the GPU memory required is too large", "valid useful actions are almost never sampled", "rewards cannot be computed for text", "the discount factor becomes undefined"], a: 1, why: "Random token sequences essentially never form valid tool calls — zero signal." },
          { q: "A pure-exploitation agent's characteristic failure:", options: ["it spends all compute on simulation", "it produces malformed actions constantly", "it never banks any reward at all", "it locks into a suboptimal habit forever"], a: 3, why: "Without exploration, better actions stay invisible — the local optimum trap." },
        ] },
      { id: "advantage", name: "Value & Advantage", sprite: "📈",
        lore: "The value function V(s) estimates expected future return from a state; the advantage A(s,a) = how much better a specific action was than expected: actual return minus baseline V(s). Advantages are the currency of policy-gradient training: positive → make that action more likely; negative → less. GAE blends multi-step returns to trade bias against variance. In PPO a learned value network supplies the baseline; GRPO replaces it with the group's mean reward.",
        questions: [
          { q: "Advantage A(s,a) measures…", options: ["the action's return relative to expectation", "the raw reward emitted by the environment", "the entropy of the policy's action distribution", "the remaining distance to the episode's goal"], a: 0, why: "Surprise relative to the baseline V(s) — centered signal, not absolute reward." },
          { q: "An action with negative advantage should become…", options: ["the new deterministic default", "less probable under the policy", "the baseline for future actions", "exempt from gradient updates"], a: 1, why: "Worse than expected → push its probability down. That's the policy gradient." },
        ] },
    ],
    sides: [
      { id: "s-gamma", name: "Bandit Gamma", sprite: "🦝", anchor: 1, recLevel: 1, prereqs: ["mdp", "policy"],
        desc: "Tests whether you can actually TUNE the math you just learned.",
        questions: [
          { q: "SCENARIO: A trading agent's position today pays off in 60 steps. Training stalls. First suspect?", options: ["γ set too low", "Too many states in the environment", "The reward is accidentally positive", "Batch size is one step too small"], a: 0, why: "0.9⁶⁰ ≈ 0.002 — the future payoff barely registers. Raise γ for long horizons." },
          { q: "SCENARIO: A clinical agent can interrupt a doctor now (small cost) to prevent a likely error in 20 minutes (big payoff). Which agent intervenes?", options: ["The γ ≈ 0 agent, acting on reflex", "Neither — RL can't trade off costs", "The γ ≈ 0.99 agent, valuing the future", "Both behave identically here"], a: 2, why: "High γ keeps the distant prevented-error reward valuable enough to outweigh the cost." },
          { q: "SCENARIO: Your agent found one decent strategy and repeats it forever. Standard countermeasure?", options: ["lowering the learning rate to zero", "maintaining exploration", "removing the reward baseline", "shortening every episode to one step"], a: 1, why: "Exploitation lock-in is broken by keeping exploration pressure alive." },
        ] },
      { id: "s-baseline", name: "Baseline Wisp", sprite: "👻", anchor: 3, recLevel: 2, prereqs: ["advantage"],
        desc: "Haunts trainers who confuse rewards with advantages.",
        code: `# advantage in five lines
returns = compute_returns(rewards, gamma)   # discounted sums
values  = value_net(states)                 # baseline V(s)
adv     = returns - values                  # surprise!
adv     = (adv - adv.mean()) / (adv.std() + 1e-8)
loss    = -(logprobs * adv.detach()).mean() # policy gradient`,
        codeNote: "The policy-gradient core: every scenario below happens inside these five lines.",
        questions: [
          { q: "SCENARIO: Two actions both earned +50, but V(s) predicted +80 and +20 respectively. The gradient pushes…", options: ["both actions up equally hard", "both actions down equally hard", "the first up, the second down", "the first down, the second up"], a: 3, why: "Advantages: 50−80 = −30 (push down); 50−20 = +30 (push up)." },
          { q: "SCENARIO: In the code above, why .detach() on adv?", options: ["it frees GPU memory between optimizer steps", "gradients must not flow into the critic here", "it converts the tensor into a numpy array first", "it normalizes the advantage scale"], a: 1, why: "The policy loss should move the policy only; the critic trains on its own MSE loss." },
        ] },
    ],
    gym: {
      leader: "Professor Bellman", badge: "Foundation Badge", sprite: "🏛️",
      taunt: "Show me you've internalized the loop itself!",
      questions: [
        { q: "Order the RL loop correctly:", options: ["reward → update → action → state", "state → action → reward+next state → update", "update → state → reward → action", "action → state → update → reward"], a: 1, why: "Observe, act, get consequence, learn. That loop IS reinforcement learning." },
        { q: "+5 now vs +100 in 50 steps, γ = 0.9 (0.9⁵⁰ ≈ 0.005). The agent takes…", options: ["the +5: the +100 discounts to ≈0.5", "the +100: bigger raw value wins", "neither: both discount to zero", "both: rewards stack across branches"], a: 0, why: "100 × 0.005 ≈ 0.5 < 5 — γ shapes patience." },
        { q: "Which pairing is WRONG?", options: ["π(a|s) — the agent's behavior", "V(s) — expected future return", "γ — transition probability", "A(s,a) — return vs baseline"], a: 2, why: "γ is the discount factor. Transitions are P(s′|s,a)." },
      ] },
  },
  {
    id: "village", name: "Imitation Village", emoji: "🏘️",
    intro: "Agents learn by copying — and discover copying isn't enough.",
    npc: { name: "Elder Clone", text: "SFT is behavior cloning: L_SFT(θ) = −Σ log p_θ(aₜᵉˣᵖᵉʳᵗ|sₜ). Maximize the likelihood of the expert's action at every state. Notice what's absent from that loss: outcomes. That absence is everything." },
    concepts: [
      { id: "bc", name: "Behavior Cloning", sprite: "🪞",
        lore: "Imitation learning trains a policy by directly copying expert actions — no rewards, no exploration, no environment. Given demonstrations of (state, action) pairs, it maximizes the likelihood of the expert's action at each state: L = −Σ log p_θ(aᵉˣᵖᵉʳᵗ|s). SFT on tool-call traces is exactly this — behavior cloning. It teaches what tool calls look like: syntax, schemas, argument shapes, answer formatting, and rough human patterns of tool use.",
        questions: [
          { q: "SFT's loss depends on which quantities?", options: ["States, actions, and received rewards", "States and expert actions only", "Rewards and future states only", "Tool outputs and final answers"], a: 1, why: "Pure likelihood of demonstrations — outcomes are structurally absent." },
          { q: "SFT reliably teaches which competency?", options: ["Cost-aware timing of tool calls", "Recovery from execution failures", "Valid tool-call syntax and schemas", "Optimal stopping in long pipelines"], a: 2, why: "Form, not decisions: JSON shape, schemas, formatting patterns." },
        ] },
      { id: "sftfails", name: "SFT's Blind Spots", sprite: "🕳️",
        lore: "SFT cannot: decide WHEN (it never sees the cost of calling or of not calling); choose WHICH among tools (it replicates demo choices without learning trade-offs); use execution feedback (tool success/failure never reaches the loss); handle multi-step workflows and stopping (demos have fixed lengths); penalize over-use or under-use; generalize past the demonstration distribution; or optimize multi-component objectives — one monolithic loss can't separately punish timing vs selection vs argument errors.",
        questions: [
          { q: "An SFT-only model calls the weather API on 'define photosynthesis'. Root cause?", options: ["Cost signals can't enter SFT's loss", "The training set was far too small", "Weather data corrupts embeddings", "The discount factor was set too low"], a: 0, why: "Over-calling is a consequence problem; the likelihood loss has nowhere to encode cost." },
          { q: "SFT struggles with multi-step workflows because…", options: ["attention cannot span multiple calls", "JSON grows too long to tokenize", "demos have fixed lengths", "tools reject repeated invocations"], a: 2, why: "'Enough info — ANSWER now' is a policy decision RL learns via episodic returns." },
        ] },
      { id: "warmstart", name: "Warm-Start", sprite: "🔥",
        lore: "Why SFT before RL, always? RL from random init over raw text collapses: malformed JSON everywhere, runaway tool-call loops, zero successful episodes, noisy gradients, degenerate policies. SFT anchors the policy with baseline competencies — tool syntax literacy, a heuristic when/which/how prior, drastically reduced exploration burden — so early RL is stable. Imitation provides competence, then RL provides policy mastery. Skipping the warm-start doesn't make training purer; it makes it impossible.",
        questions: [
          { q: "Which is NOT a listed failure of RL-from-scratch on text?", options: ["Runaway tool-call loops", "An excess of valid JSON output", "Zero successful early episodes", "Degenerate collapsed policies"], a: 1, why: "The problem is the opposite — random policies almost never emit valid JSON." },
          { q: "SFT helps subsequent RL chiefly by…", options: ["shrinking the effective search space", "eliminating the reward function", "freezing the value network early", "guaranteeing positive advantages"], a: 0, why: "A sane prior means correct calls get sampled often enough to learn from." },
        ] },
    ],
    sides: [
      { id: "s-debug", name: "Copycat Golem", sprite: "🗿", anchor: 1, recLevel: 2, prereqs: ["bc", "sftfails"],
        desc: "Built entirely from demonstrations. Diagnose its malfunctions.",
        questions: [
          { q: "SCENARIO: An SFT clinical agent formats lab-lookup calls perfectly but fires them on 'good morning'. 10× more demos helps a little; novel phrasings still trigger calls. Why?", options: ["The base model is too small for clinical work", "Greetings are out-of-vocabulary tokens", "The lab tools expose ambiguous, overlapping schemas", "WHEN is a consequence decision SFT can't optimize"], a: 3, why: "Demos patch the seen distribution; only cost-bearing reward teaches restraint that generalizes." },
          { q: "SCENARIO: A new FHIR API has a schema unseen in training. SFT model's calls fail and never improve. Missing ingredient?", options: ["execution feedback flowing into learning", "a much larger demonstration training dataset", "a substantially longer model context window", "lower sampling temperature"], a: 0, why: "SFT can't use tool success/failure; RL turns outcomes into adaptation." },
          { q: "SCENARIO: Budget for ONE training stage on a new tool-use task, zero existing competence. Choose:", options: ["RL alone — exploration finds syntax", "SFT alone", "either works equally well", "neither; prompting suffices"], a: 1, why: "RL at random init produces no valid episodes. Competence first." },
        ] },
      { id: "s-retain1", name: "Echo of the Fields", sprite: "🌀", anchor: 2, recLevel: 2, prereqs: ["mdp", "bc"],
        desc: "Tests whether Foundation Fields stuck.",
        questions: [
          { q: "RETENTION: In MDP terms, what does behavior cloning ignore?", options: ["The state space S", "The action space A", "P, R, and γ", "The existence of a policy π"], a: 2, why: "Cloning keeps (s,a) pairs and discards the entire consequence machinery." },
          { q: "RETENTION: Why does exploration become tractable after SFT?", options: ["The reward function becomes denser", "Sampling concentrates near valid behaviors", "Advantages are guaranteed positive", "The MDP's horizon becomes shorter"], a: 1, why: "The prior collapses the search space — same exploration concept from the Fields." },
        ] },
    ],
    gym: {
      leader: "Elder Clone", badge: "Imitation Badge", sprite: "🏛️",
      taunt: "Prove you know why copying alone would have doomed you!",
      questions: [
        { q: "Which term would the SFT loss need for cost-aware timing — and lacks?", options: ["A dependence on action outcomes", "A log-likelihood over tokens", "A sum across trajectory steps", "A parameter vector θ"], a: 0, why: "States and expert actions only; consequences are structurally absent." },
        { q: "The pipeline SFT → RL works because…", options: ["each stage covers the other's weakness", "RL is cheaper after SFT converges", "SFT prevents all reward hacking", "RL cannot run without a value net"], a: 0, why: "Imitation gives stability and competence; RL optimizes what imitation can't express." },
        { q: "Even with infinite perfect demos, which problem persists?", options: ["Malformed JSON output", "Answer formatting errors", "Adapting to tools unseen in demos", "Learning what calls look like"], a: 2, why: "SFT overfits the demo distribution; adaptation needs exploration + returns." },
      ] },
  },
  {
    id: "forest", name: "Tool-Calling Forest", emoji: "🌲",
    intro: "Three trails: WHEN, WHICH, HOW.",
    npc: { name: "Ranger ReAct", text: "Every tool decision factors into WHEN (call or answer?), WHICH (which tool?), and HOW (valid, correct arguments). ToolRL and ReTool proved decomposed rewards along these axes stabilize RL — reward tells the model WHICH sub-skill failed." },
    concepts: [
      { id: "when", name: "WHEN", sprite: "⏱️",
        lore: "The timing decision: is a tool invocation necessary, optional, or wasteful right here? Over-calling burns cost and latency; under-calling degrades correctness. It's a policy decision that must be explicitly learned and rewarded. Supervision: rule-based intent detectors (math → calculator; 'define X' → no tool; factual → search), a discriminative classifier predicting P(call needed), or a generative LLM-judge asked 'should the agent call a tool here?' converted to scalar reward.",
        questions: [
          { q: "User asks 'explain what recursion means'. Optimal WHEN decision:", options: ["CALL search to verify the definition", "CALL calculator for the base case", "ANSWER directly — no tool needed", "CALL both, then merge results"], a: 2, why: "Definitional queries → no tool. Calling here is penalized over-use." },
          { q: "The three supervision sources for the WHEN reward:", options: ["SGD, Adam, and RMSProp variants", "rules, discriminative models, LLM judges", "temperature, top-p, and top-k tuning", "unit tests, linters, and type checkers"], a: 1, why: "Every reward component can be scored by rules, discriminators, or judges." },
        ] },
      { id: "which", name: "WHICH", sprite: "🔀",
        lore: "Given a call will happen, selection among the library is classification over a structured action space. SFT only echoes demo choices; RL teaches discrimination via negative reward for wrong picks. Supervision: rules mapping task types to tools (+r match, −r otherwise), a discriminative model f(s,a) judging whether the choice matches human expectation, or a judge prompt — 'was TOOL_X the best choice here?' — scored and normalized.",
        questions: [
          { q: "WHICH is formally framed as…", options: ["classification over the available toolset", "regression onto a tool-quality score", "clustering of similar tool schemas", "ranking every token in the vocabulary"], a: 0, why: "Pick the right class among K tools; rewards teach trade-offs SFT can't." },
          { q: "Wrong-tool picks need explicitly NEGATIVE reward because…", options: ["negative values speed up convergence", "the surrogate loss requires both signs", "rewards must sum to zero per episode", "absence of bonus alone doesn't discourage"], a: 3, why: "Merely-unrewarded wrong picks persist; penalties teach discrimination." },
        ] },
      { id: "how", name: "HOW", sprite: "🔧",
        lore: "Argument construction is structured generation: valid JSON, schema-consistent fields, semantically correct values. Decomposes into syntax correctness (parses? required fields? types? → ±1 by rule), execution correctness (HTTP 200 → +r; exception → −r), and argument quality — numeric args: r = −|a_pred − a_gold|; strings: embedding similarity or fuzzy match; or discriminative models catching bad values; or a judge scoring plausibility against the query.",
        questions: [
          { q: "Valid JSON, schema OK, but city = 'Brelin' not 'Berlin'. Which reward catches it?", options: ["The syntax-correctness component", "The argument-quality component", "The when-to-call component", "No component can catch this"], a: 1, why: "Syntax passed; semantic argument errors are quality's job." },
          { q: "The rule-based quality reward for numeric arguments:", options: ["+1 if the number parses as a float", "cosine similarity of hidden states", "−|a_pred − a_gold|, growing with distance", "binary match against a regex pattern"], a: 2, why: "Graded distance gives smoother signal than binary right/wrong." },
        ] },
      { id: "actionspace", name: "Factored Actions", sprite: "🧩",
        lore: "The policy emits two action types as strict JSON in <action> tags. ANSWER(final_text): when=false, ends the episode. CALL(tool, args): when=true, carries which (tool name) and how (args); the tool executes and its output is appended to context, producing the next state. The explicit 'when' flag aids debugging and credit assignment. Episodes run until ANSWER or a max-step limit. Gradients flow over the whole structured action while reward decomposes along the axes.",
        questions: [
          { q: "What terminates an episode?", options: ["Any failed tool execution", "The first CALL action emitted", "Any negative reward component", "ANSWER, or the max-step limit"], a: 3, why: "CALL continues the loop; ANSWER ends it." },
          { q: "Why an explicit 'when' flag in the action JSON?", options: ["It makes the decision inspectable and rewardable", "The JSON specification mandates boolean flag fields", "It compresses the structured action encoding size", "Tools refuse calls without the flag"], a: 0, why: "Explicit structure aids debugging and credit assignment on the timing axis." },
        ] },
      { id: "malformed", name: "Malformed Actions", sprite: "💢",
        lore: "When the model emits invalid when/which/how output, the episode must NOT terminate. Instead: assign a negative syntax/validity reward, return an error message into context, and continue. This reward-shaping (lineage of Christiano et al.'s preference RL) converts failures into learning signal and teaches self-correction — the agent experiences the error AND the recovery within one trajectory, far better credit assignment than a death penalty.",
        questions: [
          { q: "Correct handling of a malformed CALL:", options: ["terminate the episode with a large penalty", "penalize, inject the error, continue the episode", "silently auto-repair the JSON and proceed", "restart training from the last checkpoint"], a: 1, why: "Keep it alive: the agent learns the penalty AND the recovery." },
          { q: "'Survive and retry' beats 'episode over' because…", options: ["terminated episodes waste allocated GPU cycles", "termination inflates the value estimates", "recovery gets demonstrated and rewarded in-trajectory", "injected errors raise the policy's output entropy"], a: 2, why: "Termination hides the path back to success; continuation makes self-correction learnable." },
        ] },
    ],
    sides: [
      { id: "s-trace", name: "Trail Mimic", sprite: "🦎", anchor: 2, recLevel: 3, prereqs: ["when", "which", "how"],
        desc: "Replays agent trajectories and dares you to judge them.",
        questions: [
          { q: "SCENARIO: 'What's 847 × 392, and will it rain in Tokyo tomorrow?' Ideal trajectory:", options: ["one search CALL covering both, then ANSWER", "ANSWER immediately from parametric knowledge", "CALL calculator, CALL weather, then ANSWER", "five calculator CALLs for numerical safety"], a: 2, why: "Two sub-tasks → two when/which/how decisions; ANSWER when both results are in." },
          { q: "SCENARIO: Call has right tool, but schema requires a date field that's missing. What fires?", options: ["negative syntax/schema reward; episode continues", "positive execution reward; episode continues", "the WHEN penalty; episode terminates", "final-task penalty only, at episode end"], a: 0, why: "Schema validation fails → rule-based penalty, error injected, agent retries." },
          { q: "SCENARIO: Agent answers correctly but made 4 pointless search calls first. Total return is…", options: ["maximal — final correctness dominates", "exactly zero — terms cancel by design", "reduced — success minus call penalties", "undefined — rewards conflict"], a: 2, why: "Efficiency is part of the objective: cost penalties coexist with success." },
        ] },
      { id: "s-retain2", name: "Echo of the Village", sprite: "🌀", anchor: 4, recLevel: 3, prereqs: ["bc", "malformed"],
        desc: "Connects the Forest back to Imitation Village.",
        questions: [
          { q: "RETENTION: Of when/which/how, which can SFT approximate best?", options: ["WHEN — demos show timing perfectly", "HOW (syntax) — formats are visible in demos", "WHICH — selection is just classification", "None — SFT teaches nothing useful"], a: 1, why: "Form is imitable; timing and selection trade-offs need consequences." },
          { q: "RETENTION: Penalize-and-continue is good credit assignment because…", options: ["the recovery path stays observable and rewardable", "it maximizes the episode's total length", "it keeps all advantages strictly positive", "errors reset the value network baseline"], a: 0, why: "Keep the causal chain visible to learning — same principle as decomposed rewards." },
        ] },
    ],
    gym: {
      leader: "Ranger ReAct", badge: "Forest Badge", sprite: "🏛️",
      taunt: "Three trails, one policy!",
      questions: [
        { q: "Reward decomposition primarily solves…", options: ["GPU memory fragmentation", "credit assignment across sub-skills", "tokenizer schema collisions", "sampling temperature drift"], a: 1, why: "A monolithic score can't localize the error; decomposed terms can." },
        { q: "Continue-or-stop before a third search call is which axis?", options: ["WHEN — the timing reward", "WHICH — the selection reward", "HOW — the argument reward", "Final-task — the outcome reward"], a: 0, why: "Call-vs-answer is the timing axis." },
        { q: "Why do gradients flow over the WHOLE action while rewards stay decomposed?", options: ["JSON cannot be split across loss terms", "one policy must learn all three skills jointly", "decomposed gradients would explode", "the value network requires full actions"], a: 1, why: "Single policy, factored feedback." },
      ] },
  },
  {
    id: "foundry", name: "Reward Foundry", emoji: "⚒️",
    intro: "Where the teaching signal is forged.",
    npc: { name: "Smith Shaper", text: "Seven components leave this foundry: when, which, syntax, execution, argument quality, final success, preference judgment. Each forged three ways — rules, discriminative models, or LLM judges. And heed: rewards must be ASYMMETRIC." },
    concepts: [
      { id: "components", name: "Reward Components", sprite: "🧱",
        lore: "The unified reward sums per-axis terms: r_when, r_which, r_syntax (±1), r_exec, r_args, r_final (unit tests, exact match, tolerance-based numeric match), plus optional preference terms. Each component can be independently trained and debugged — that modularity is why decomposition wins. Preference pairs can be built per-axis: two trajectories differing only in timing, only in tool choice, or only in arguments.",
        questions: [
          { q: "'Unit tests pass' supervises which component?", options: ["r_syntax — format validity", "r_when — call timing", "r_args — argument quality", "r_final — task success"], a: 3, why: "Final success rules: unit tests, exact match, tolerance-based numeric match." },
          { q: "Preference pairs differing ONLY in tool choice train…", options: ["the timing signal, isolated", "the selection signal, isolated", "the syntax signal, isolated", "all axes simultaneously"], a: 1, why: "Controlled pairs isolate one axis." },
        ] },
      { id: "supervision", name: "The Supervision Trio", sprite: "⚖️",
        lore: "RULES: deterministic — JSON parses, schema validates, HTTP 200, exact match. Cheap, exact, unhackable, rigid. DISCRIMINATIVE reward models: classifiers trained on human labels (InstructGPT lineage); for final success, the Bradley-Terry preference loss L = −log(e^r(τA)/(e^r(τA)+e^r(τB))) from Christiano et al. GENERATIVE judges: prompt a strong LLM — 'should the agent call a tool here?' — and extract scalar reward. Judges capture nuance rules can't, at the cost of noise and gaming risk.",
        questions: [
          { q: "The Bradley-Terry loss trains…", options: ["the policy network directly", "the environment's dynamics", "a reward model from preference pairs", "the tokenizer's merge table"], a: 2, why: "Fit a scalar reward so preferred trajectories score higher." },
          { q: "Generative judges beat rules specifically when…", options: ["checking whether JSON parses", "quality is nuanced and contextual", "verifying HTTP status codes", "counting tokens in the output"], a: 1, why: "Rules for the checkable; judges for the nuanced." },
        ] },
      { id: "asymmetric", name: "Asymmetric Rewards", sprite: "⚡",
        lore: "Penalties and bonuses are deliberately unequal. Unnecessary calls (cost, latency) penalized harder than routine correct calls are rewarded; malformed syntax earns a small consistent negative; catastrophic failures hit hardest. Asymmetry encodes deployment economics, biases the policy's risk profile away from expensive failure modes, and stabilizes PPO/GRPO — bounded negatives prevent both spam-calling reward hacks and collapse from over-punishment.",
        questions: [
          { q: "Core rationale for asymmetric magnitudes:", options: ["symmetric rewards break PPO's clipping", "reward should mirror real deployment costs", "negative values compress to fewer bits", "asymmetry guarantees faster convergence"], a: 1, why: "The policy inherits the risk profile implied by the reward's economics." },
          { q: "Equal small penalties and bonuses likely yield…", options: ["a policy that tolerates over-calling", "perfectly calibrated tool restraint", "immediate training divergence", "zero gradient on the WHEN axis"], a: 0, why: "Weak symmetric penalties under-price cost; asymmetry teaches restraint." },
        ] },
      { id: "procout", name: "Process vs Outcome", sprite: "🔬",
        lore: "Outcome rewards score only the final result: clean, hard to game, but sparse — over a 12-step trajectory one scalar must explain everything. Process rewards score intermediate steps: dense signal, faster learning, finer control — but gameable: the model can optimize looking-good-per-step over being-right. The synthesis: blend both — process rewards shaping early training or guiding search, outcome rewards anchoring final correctness.",
        questions: [
          { q: "Pure outcome reward on long tasks suffers from…", options: ["reward hacking of step proxies", "sparsity — brutal credit assignment", "excessive compute per episode", "over-constrained exploration"], a: 1, why: "Which of 30 clicks mattered? One terminal scalar can't say." },
          { q: "The characteristic RISK of process rewards:", options: ["the signal becomes too sparse", "they require terminal verification", "gaming — looking good beats being right", "they cannot guide tree search"], a: 2, why: "Dense proxies invite proxy-optimization." },
        ] },
      { id: "tarm", name: "TARM", sprite: "🛠️",
        lore: "Tool-Augmented Reward Modeling: the reward model itself gets tools. Instead of judging from parametric memory, a TARM invokes calculators, search, or code execution while evaluating — verifying claims before scoring. Trained on the TARA dataset with SFT then RL, TARMs outperform tool-free reward models on verification-heavy domains. A reward model that can check facts gives cleaner signal, making downstream RL more trustworthy.",
        questions: [
          { q: "TARM's key move:", options: ["scaling reward models past the policy size", "letting the judge verify with tools before scoring", "replacing rewards with retrieval scores", "training judges only on synthetic data"], a: 1, why: "Verification beats vibes." },
          { q: "TARM matters downstream because…", options: ["it eliminates the SFT warm-start stage", "it doubles effective context length", "it removes the need for preference pairs", "reward quality upper-bounds policy quality"], a: 3, why: "Cleaner verified signal → less noise and hacking in the agent's RL." },
        ] },
    ],
    sides: [
      { id: "s-design", name: "Forge Imp", sprite: "👺", anchor: 1, recLevel: 4, prereqs: ["components", "supervision", "asymmetric"],
        desc: "Throws real reward-design jobs at you and cackles at mistakes.",
        code: `# decomposed asymmetric reward (sketch)
def reward(traj):
    r  = 0.0
    r += 0.2 if traj.syntax_valid else -0.3
    r += 0.3 if traj.right_tool   else -0.6   # asymmetric!
    r += 0.2 if traj.executed_ok  else -0.4
    r -= 0.5 * traj.unnecessary_calls          # cost pressure
    r += 2.0 if traj.task_success else -1.5    # anchor
    return r`,
        codeNote: "Note every penalty outweighs its sibling bonus — the asymmetry lives in the constants.",
        questions: [
          { q: "SCENARIO: syntax ✓, right tool ✓, executed ✓, final wrong ✗, one wasted call. Under the code above, net return is…", options: ["+0.7 — the per-step bonuses win", "−1.3 — failure terms dominate", "exactly 0 — terms cancel", "+2.0 — success anchor fires"], a: 1, why: "0.2+0.3+0.2−0.5−1.5 = −1.3. Asymmetry makes failure dominate." },
          { q: "SCENARIO: Match the mechanism. 'HTTP 200 → +r' / 'classifier predicts P(call needed)' / 'judge rates plausibility':", options: ["judge / rule / discriminator", "rule / discriminator / judge", "discriminator / judge / rule", "rule / judge / discriminator"], a: 1, why: "Rules check facts; discriminators are trained classifiers; judges generate verdicts." },
          { q: "SCENARIO: 'Plan adheres to sepsis protocol' — too nuanced for rules, no labeled data yet. Best immediate scorer?", options: ["a generative judge with the protocol in-prompt", "exact string match against one gold plan", "a discriminator trained on zero labels", "uniform +1 reward to keep training moving"], a: 0, why: "Judges handle nuance without labels; distill a discriminator later." },
        ] },
      { id: "s-hack", name: "Proxy Phantom", sprite: "🎭", anchor: 3, recLevel: 4, prereqs: ["procout", "tarm"],
        desc: "Wears the mask of good metrics over rotten behavior.",
        questions: [
          { q: "SCENARIO: Agent emits 8 plausible steps and a confident wrong answer — and scores well. Diagnosis + fix?", options: ["sparse rewards; densify with step bonuses", "process-reward gaming; re-anchor on outcomes", "skill collapse; restart from SFT checkpoint", "under-exploration; raise the entropy bonus"], a: 1, why: "Dense proxies outweighed the outcome anchor — rebalance toward verified outcomes." },
          { q: "SCENARIO: Milestone 'submitted ✓' fires on empty forms; the agent exploits it. The TARM-flavored fix:", options: ["remove every milestone and rely on outcomes only", "raise the milestone bonus to encourage honesty", "verify the milestone's state condition before paying", "add three additional unverified milestone bonuses"], a: 2, why: "Reward hacking → harden the proxy's verification." },
        ] },
    ],
    gym: {
      leader: "Smith Shaper", badge: "Foundry Badge", sprite: "🏛️",
      taunt: "A policy is only as good as the signal that forged it!",
      questions: [
        { q: "Why are decomposed rewards more DEBUGGABLE than one scalar?", options: ["fewer floating-point operations per step", "each component can be ablated independently", "scalars cannot be logged efficiently", "decomposition removes all reward noise"], a: 1, why: "You see which axis misbehaves." },
        { q: "Rank by hackability, least-hackable first:", options: ["judges < discriminators < rules", "rules < discriminators < judges", "discriminators < rules < judges", "all three are equally gameable"], a: 1, why: "Deterministic checks can't be charmed; learned models can be probed; judges persuaded." },
        { q: "Blending process + outcome works best when…", options: ["process shapes early, outcome anchors correctness", "outcome shapes early, process anchors late", "both are weighted identically at every timestep", "the two signals alternate every other episode"], a: 0, why: "Dense guidance to get moving; verified outcomes to keep it honest." },
      ] },
  },
  {
    id: "peaks", name: "Optimization Peaks", emoji: "🏔️",
    intro: "Three summits — PPO, DPO, GRPO — and the curriculum trail.",
    npc: { name: "Guide Gradient", text: "All three summits share one flow: sample, score, update. PPO climbs with a critic and clipped steps. DPO skips rollouts, learning from preference pairs. GRPO drops the critic — each sample competes against its group's mean. The rope that saves every climber: KL regularization to the SFT reference." },
    concepts: [
      { id: "ppo", name: "PPO", sprite: "🗜️",
        lore: "Sample trajectories, estimate advantages with GAE using a learned value network V_φ, then maximize the clipped surrogate: L = E[min(ρ·Â, clip(ρ, 1−ε, 1+ε)·Â)] where ρ = π_new/π_old. Clipping caps how far one batch can move the policy — a trust region. The value loss trains the critic; an entropy bonus keeps exploration alive; a KL penalty to the frozen SFT reference prevents drift into degenerate text. Full objective: surrogate − c₁·value loss + c₂·entropy − β·KL(π‖π_ref).",
        questions: [
          { q: "Clipping ρ to [1−ε, 1+ε] exists to…", options: ["bound per-update policy movement", "normalize rewards across batches", "accelerate trajectory sampling", "regularize the value network"], a: 0, why: "A soft trust region — no single batch can destructively yank the policy." },
          { q: "The KL penalty in LLM-PPO is measured against…", options: ["the value network's predictions", "a uniform distribution over tokens", "the frozen SFT reference policy", "last epoch's policy snapshot"], a: 2, why: "The anchor keeps optimization from drifting into degenerate high-reward text." },
        ] },
      { id: "dpo", name: "DPO", sprite: "🤝",
        lore: "Direct Preference Optimization removes the reward model AND rollouts. Data: preference pairs (y_w chosen, y_l rejected). Loss: −log σ(β[log π(y_w)/π_ref(y_w) − log π(y_l)/π_ref(y_l)]) — push the winner up relative to the loser, measured against the reference. Remarkably, this is the closed-form optimum of the same KL-regularized objective PPO chases. No value net, no environment. Strength: simple preference alignment. Weakness: no exploration, no execution feedback — ill-suited for multi-step tool interaction.",
        questions: [
          { q: "DPO requires ___ and skips ___:", options: ["environment rollouts / static preference data", "preference pairs / reward model and rollouts", "a learned critic / the frozen reference model", "milestones / the KL anchor"], a: 1, why: "Comparisons in, direct policy update out." },
          { q: "DPO is weak for multi-step tool agents because…", options: ["its loss numerically diverges on long sequences", "preference pairs cannot include tool calls", "execution feedback never shapes the policy", "it lacks any reference-model anchoring term"], a: 2, why: "Offline preferences can't capture what only acting reveals." },
        ] },
      { id: "grpo", name: "GRPO", sprite: "👥",
        lore: "For each prompt, sample a group of G responses, score them all, set each sample's advantage to its normalized deviation from the group mean — Âᵢ = (rᵢ − mean(r))/std(r). The group IS the baseline, so the value network is deleted: huge memory savings. Updates use a PPO-style clipped surrogate plus KL regularization. The engine behind DeepSeek-R1-style reasoning training. It shines when rewards are cheaply checkable (math, code, tool execution) so large groups can be scored automatically.",
        questions: [
          { q: "GRPO's replacement for the learned critic:", options: ["a frozen copy of the policy", "the group's reward statistics", "human-in-the-loop scoring", "a Monte Carlo tree estimate"], a: 1, why: "Beat your G−1 siblings → positive advantage." },
          { q: "GRPO's economics depend on…", options: ["scoring many samples cheaply per prompt", "very small group sizes (G ≤ 2)", "human preference labels per group", "deterministic environment transitions"], a: 0, why: "Checkable rewards let whole groups be scored automatically." },
        ] },
      { id: "curriculum", name: "The Curriculum", sprite: "🪜",
        lore: "Six stages, each isolating a skill: Stage 0 SFT bootstrap → Stage 1 binary WHEN → Stage 2 WHICH among growing libraries → Stage 3 HOW with syntax/quality rewards → Stage 4 multi-step pipelines, conditional logic, stopping → Stage 5 open-domain tasks. Scheduling interleaves and revisits stages; jumping straight to Stage 5 produces uninterpretable failure — when everything is hard at once, reward can't localize which sub-skill broke.",
        questions: [
          { q: "Stage 1 trains specifically…", options: ["argument JSON construction", "multi-tool pipeline chaining", "the binary call-vs-answer decision", "open-domain task completion"], a: 2, why: "Isolate timing first on cleanly separable queries." },
          { q: "The deep reason staging works:", options: ["it reduces total GPU-hours linearly", "credit assignment stays legible per skill", "later stages reuse earlier checkpoints", "it removes the need for KL anchoring"], a: 1, why: "Reward decomposition's principle, applied across training time." },
        ] },
      { id: "diagnostics", name: "Diagnostics", sprite: "🩺",
        lore: "Track each axis or fly blind. Process metrics: when-accuracy, which-accuracy, argument validity rate, executability rate, tool-call frequency, steps-per-episode. Outcome metrics: final accuracy, return, cost. The dreaded failure: SKILL COLLAPSE — one axis silently degrades while aggregate reward looks fine (the model stops calling tools but compensates on easy tasks, or spams one favored tool). Per-axis dashboards catch collapse early; aggregate-only monitoring catches it after deployment.",
        questions: [
          { q: "Aggregate reward stable, which-accuracy quietly down 30%. This is…", options: ["skill collapse masked by compensation", "healthy curriculum stage transition", "a guaranteed logging artifact", "normal variance in advantage noise"], a: 0, why: "Exactly why per-axis tracking exists." },
          { q: "Which is a PROCESS-level metric?", options: ["final task accuracy per episode", "total deployment cost per query", "executability rate of tool calls", "cumulative return per trajectory"], a: 2, why: "Process watches the steps; outcome watches the ending." },
        ] },
    ],
    sides: [
      { id: "s-pick", name: "Summit Sphinx", sprite: "🦅", anchor: 1, recLevel: 5, prereqs: ["ppo", "dpo", "grpo"],
        desc: "Every riddle is 'which algorithm, and why'.",
        code: `# the PPO clipped surrogate, in code
ratio  = (logp_new - logp_old).exp()        # ρ
unclip = ratio * adv
clip   = ratio.clamp(1-eps, 1+eps) * adv
policy_loss = -torch.min(unclip, clip).mean()
loss = policy_loss \\
     + c1 * F.mse_loss(values, returns) \\
     - c2 * entropy.mean() \\
     + beta * kl(policy, ref_policy)`,
        codeNote: "Read each term: surrogate, critic, exploration, anchor. The Sphinx asks about all four.",
        questions: [
          { q: "SCENARIO: Unit-test rewards (cheap, automatic), memory-constrained on critics. Pick:", options: ["PPO — the critic stabilizes everything", "GRPO — group baselines exploit cheap scoring", "DPO — preferences avoid rollouts entirely", "SFT only — RL is unnecessary here"], a: 1, why: "Checkable rewards + no value network = GRPO's sweet spot." },
          { q: "SCENARIO: 50k static preference pairs, no simulator, no verifiable reward. Pick:", options: ["PPO with a hand-written reward", "GRPO with groups of size one", "DPO — it consumes pairs directly", "MCTS over candidates"], a: 2, why: "No environment, no checkable reward → the rollout-free method." },
          { q: "SCENARIO: Mid-PPO, generations drift toward repetitive high-reward gibberish. Which knob in the code above, which direction?", options: ["raise beta on the KL term", "raise eps to widen the clip", "lower c2 toward zero", "delete the value loss term"], a: 0, why: "Drift from sane language is exactly what the KL anchor restrains." },
        ] },
      { id: "s-curves", name: "Curve Reader", sprite: "📉", anchor: 4, recLevel: 5, prereqs: ["curriculum", "diagnostics", "explore"],
        desc: "Shows you training dashboards and demands diagnosis. Pure retention.",
        questions: [
          { q: "RETENTION: Argument-validity crashes mid-training; when-accuracy holds. Response?", options: ["full restart from random initialization", "revisit Stage 3 and inspect the HOW rewards", "remove all tools from the environment", "double the discount factor immediately"], a: 1, why: "Per-axis diagnosis enables per-axis repair." },
          { q: "RETENTION: PPO's entropy bonus exists to…", options: ["shrink the value network's loss", "keep exploration from collapsing early", "enforce the trust-region clipping", "anchor the policy to the reference"], a: 1, why: "Foundation Fields callback: exploration pressure prevents premature determinism." },
          { q: "RETENTION: All three algorithms keep a KL/reference anchor because…", options: ["it is required for advantage estimation", "industry regulators mandate frozen reference models", "reward optimization alone drifts into degeneracy", "the anchor halves the training memory footprint"], a: 2, why: "PPO penalizes KL, DPO embeds the reference, GRPO adds explicit KL." },
        ] },
    ],
    gym: {
      leader: "Guide Gradient", badge: "Summit Badge", sprite: "🏛️",
      taunt: "Three algorithms, one objective!",
      questions: [
        { q: "Which component appears in ALL THREE methods?", options: ["a learned value network", "group-relative advantages", "preference pair construction", "KL regularization to a reference"], a: 3, why: "The anchor is universal; critics, groups, pairs are method-specific." },
        { q: "DPO secretly optimizes…", options: ["a completely unrelated objective", "the same KL-regularized objective, closed-form", "a pure likelihood objective, identical to SFT", "the group-relative advantage objective from GRPO"], a: 1, why: "Its loss is the closed-form optimum of the KL-regularized RL objective." },
        { q: "GRPO advantage for a sample exactly at the group mean:", options: ["zero advantage — no gradient push", "maximum positive advantage", "a penalty proportional to std", "excluded from the update batch"], a: 0, why: "Average performance = no surprise = no push." },
      ] },
  },
  {
    id: "citadel", name: "Agent Citadel", emoji: "🏰",
    intro: "Environments, reliability, multi-agent politics, search, memory, safety.",
    npc: { name: "Champion Horizon", text: "The architecture law: START SINGLE-AGENT. Under equal compute, unified context usually beats a committee — every inter-agent message is a lossy bottleneck. Escalate only deliberately: parallel exploration, specialization, verification, or noise so bad that decomposition is filtering." },
    concepts: [
      { id: "envtypes", name: "Environment Types", sprite: "🗺️",
        lore: "Three regimes, rising difficulty. SINGLE-TURN: one prompt → one response → one reward; trivial credit assignment. TOOL-USE: episodes interleave reasoning, tool calls, observations; moderate horizon; rewards can attach to steps. MULTI-TURN SEQUENTIAL: long horizons, persistent state, delayed consequences — web/computer-use agents across 30 clicks. Each step up makes rewards sparser, exploration harder, credit crueler; environment design shapes everything downstream.",
        questions: [
          { q: "Rank by credit-assignment difficulty, easiest first:", options: ["multi-turn, tool-use, single-turn", "tool-use, single-turn, multi-turn", "single-turn, tool-use, multi-turn", "all three are equally difficult"], a: 2, why: "Horizon length and action-consequence delay drive difficulty." },
          { q: "Multi-turn sequential environments are distinguished by…", options: ["persistent state and delayed consequences", "guaranteed dense per-step rewards", "the complete absence of any tool invocations", "action spaces restricted to single tokens"], a: 0, why: "An early wrong click silently dooms the booking 25 steps later." },
        ] },
      { id: "milestones", name: "Milestone Rewards", sprite: "🚩",
        lore: "For long-horizon agents, milestones densify the sparse end-signal: decompose the task into verifiable checkpoints — logged in ✓, results loaded ✓, item in cart ✓, form submitted ✓ — each emitting partial reward. Example: r = Σ milestone bonuses + final success bonus − step costs − error penalties. Process-reward thinking applied to web/computer-use: a gradient of progress instead of a verdict at the end.",
        questions: [
          { q: "Milestones primarily fix…", options: ["sparse terminal rewards on long tasks", "the cost of running web browsers", "ambiguity in user instructions", "the size of the action space"], a: 0, why: "Checkpoint bonuses turn a 30-step desert into breadcrumbs." },
          { q: "A usable milestone must be…", options: ["subjective enough to allow nuance", "programmatically verifiable in state", "terminal — only at episode end", "secret from the training policy"], a: 1, why: "If you can't reliably detect 'logged in', you can't pay for it." },
        ] },
      { id: "passk", name: "pass@k vs pass^k", sprite: "🎯",
        lore: "pass@k: success in AT LEAST ONE of k attempts — CAPABILITY, the ceiling. pass^k: success in ALL k attempts — RELIABILITY, the floor. Agents routinely post high pass@k with dismal pass^k: capable but flaky. Gap sources: sampling stochasticity, instruction ambiguity, planning variability. Production cares about pass^k — a booking agent that succeeds 1-in-5 tries is a demo, not a product.",
        questions: [
          { q: "pass@5 = 95%, pass^5 = 20% means…", options: ["reliable but barely capable", "capable but highly unreliable", "both metrics indicate failure", "the metrics contradict each other"], a: 1, why: "High ceiling, low floor — the classic agentic gap." },
          { q: "NOT a listed source of unreliability:", options: ["sampling stochasticity", "instruction ambiguity", "insufficient GPU memory", "planning variability"], a: 2, why: "The triad: stochasticity, ambiguity, planning variability." },
        ] },
      { id: "singlemulti", name: "Single vs Multi-Agent", sprite: "♟️",
        lore: "Single-agent: unified reasoning, full context, simplicity — under budget-aware comparison (equal compute) it usually wins; apparent multi-agent gains often vanish when compute is normalized. Multi-agent costs: every message is a lossy information bottleneck, coordination overhead, error propagation. Multi-agent earns its keep when: context is noisy (decomposition = filtering), tasks need parallel search, specialization or independent verification helps. Law: single-agent baseline first; escalate with a named reason.",
        questions: [
          { q: "Many multi-agent 'wins' evaporate when…", options: ["agents share a single context window", "total compute is normalized across setups", "the task contains any tool calls", "the coordinator agent is removed"], a: 1, why: "The gain often came from extra compute, not architecture." },
          { q: "The information-bottleneck critique says…", options: ["handoffs compress context lossily", "agents compete for the same tools", "networks add latency per message", "memory stores overflow at scale"], a: 0, why: "Each summarized handoff discards information a single agent would keep." },
        ] },
      { id: "mcts", name: "Search & MCTS", sprite: "🌳",
        lore: "MCTS gives agents foresight: SELECT promising branches (UCB-style), EXPAND a node, SIMULATE/evaluate, BACKPROPAGATE values up the tree — then commit. Neural guidance makes it tractable: the policy provides priors over branches, a value model scores leaves without full rollouts (the AlphaGo pattern). Search results can be distilled back into the policy, and process-wise reward shaping scores intermediate nodes.",
        questions: [
          { q: "MCTS's four phases, in order:", options: ["expand, select, backprop, simulate", "simulate, expand, select, backprop", "select, expand, simulate, backpropagate", "backprop, select, simulate, expand"], a: 2, why: "The canonical loop, repeated until budget is spent." },
          { q: "Neural guidance solves MCTS's core problem of…", options: ["intractable branching in huge spaces", "non-differentiable tree structures", "reward sparsity at the root node", "memory leaks in deep trees"], a: 0, why: "Priors focus expansion; value nets replace expensive rollouts." },
        ] },
      { id: "memory", name: "Memory & Credit", sprite: "🧠",
        lore: "EXPLICIT memory: external stores (episodic buffers, retrieval) read/written by the agent — inspectable. IMPLICIT: everything in context/weights — simple, decays with length. World models learn predictive representations enabling latent rollouts and model-predictive control: plan in imagination, act in reality. Credit over hundreds of steps leans on advantage estimation and HIERARCHICAL RL — high-level policy sets subgoals, low-level executes, so credit flows over short horizons at each level.",
        questions: [
          { q: "Hierarchical RL eases long-horizon credit by…", options: ["increasing the discount factor", "splitting policies into subgoal levels", "storing every state in a buffer", "removing intermediate rewards"], a: 1, why: "Two short credit chains beat one enormous one." },
          { q: "A world model enables…", options: ["unlimited context windows", "automatic reward decomposition", "planning via internal latent rollouts", "exact transition probabilities"], a: 2, why: "Imagination as cheap exploration: predict, evaluate, commit in reality." },
        ] },
      { id: "safety", name: "Eval & Safety", sprite: "🛡️",
        lore: "Five evaluation dimensions: task performance, behavioral efficiency, robustness/generalization, alignment/ethical compliance, interpretability of the trace. Safety challenges: reward hacking, unsafe tool misuse, distribution shift. Mitigations: safety-aware RL (constrained optimization, penalties for unsafe actions), human-in-the-loop gates for high-stakes actions, traceable reasoning logs, benchmarks testing safety alongside capability.",
        questions: [
          { q: "Reward hacking is…", options: ["exploiting the proxy without achieving the goal", "stealing compute from other training jobs", "any use of negative reward components", "overfitting the value network to returns"], a: 0, why: "Agents optimize what you measure, not what you meant." },
          { q: "Human-in-the-loop gates belong on…", options: ["every intermediate reasoning token", "high-stakes irreversible actions", "read-only documentation lookups", "all tool calls without exception"], a: 1, why: "Gate the irreversible; automate the recoverable." },
        ] },
    ],
    sides: [
      { id: "s-arch", name: "Council Shade", sprite: "🌑", anchor: 3, recLevel: 6, prereqs: ["singlemulti"],
        desc: "A shadowy committee that wants MORE AGENTS for everything. Resist it.",
        questions: [
          { q: "SCENARIO: A teammate proposes 6 sub-agents, citing a paper with multi-agent wins. Your first question:", options: ["'Which orchestration framework did they use?'", "'Was the comparison compute-normalized?'", "'How many tools does each agent get?'", "'What temperature were the agents run at?'"], a: 1, why: "Apparent gains often vanish under equal total compute." },
          { q: "SCENARIO: Your single agent drowns in 200-page noisy intake docs. Escalation is justified because…", options: ["more agents always read faster", "committees vote out hallucinations", "decomposition acts as noise filtering", "sub-agents share a clean context"], a: 2, why: "Context degradation is a legitimate escalation trigger." },
          { q: "SCENARIO: You split the task and accuracy DROPS despite more compute. Likeliest culprit:", options: ["lossy handoffs between the sub-agents", "the discount factor across agents", "too few emoji in the prompts", "sub-agents sharing too much context"], a: 0, why: "Information bottlenecks: each handoff discards decision-relevant detail." },
        ] },
      { id: "s-ship", name: "Gatekeeper Golem", sprite: "🤖", anchor: 2, recLevel: 6, prereqs: ["passk", "milestones", "procout"],
        desc: "Stands before the deployment gate. Only respects reliability math.",
        questions: [
          { q: "SCENARIO: Stakeholders see pass@10 = 90% and want to ship. Your read:", options: ["ship now — the capability ceiling is demonstrated", "not yet — pass^k reveals the reliability floor", "ship with a larger model behind it", "the two metrics are effectively interchangeable"], a: 1, why: "1-in-k success is a demo; production needs all-k consistency." },
          { q: "SCENARIO: To CLOSE the pass^k gap, which lever set matches the unreliability sources?", options: ["bigger model, longer context, more tools", "reduce stochasticity, disambiguate, stabilize planning", "add more agents, more milestones, deeper search", "raise γ, lower clip ε, and enlarge GRPO groups"], a: 1, why: "The triad of causes maps to the triad of fixes." },
          { q: "RETENTION: Deployed agent games 'submitted ✓' with empty forms. Name it, fix it:", options: ["skill collapse / restart the training curriculum", "distribution shift / collect fresh data", "reward hacking / verify the milestone condition", "under-exploration / raise the entropy bonus"], a: 2, why: "Foundry callback: harden the proxy — checked conditions, not vibes." },
        ] },
    ],
    gym: {
      leader: "Champion Horizon", badge: "Champion Badge", sprite: "👑",
      taunt: "The final battle. Everything you've captured — all at once!",
      questions: [
        { q: "Design a reward for a 40-step insurance-form agent:", options: ["one terminal success-only reward, kept maximally clean", "milestones + final bonus − step costs − error penalties", "a uniform +1 every step to encourage steady progress", "judge-only scoring of the final screenshot"], a: 1, why: "Long horizon → densify with verifiable checkpoints; asymmetric costs price reality." },
        { q: "The full primer-style training stack:", options: ["DPO on static pairs, then deploy directly", "MCTS at inference with no training at all", "SFT → curriculum → PPO/GRPO + decomposed rewards", "pure RL from random initialization with dense shaped rewards"], a: 2, why: "The complete recipe this world taught." },
        { q: "One principle unifies warm-starts, reward decomposition, curricula, AND dashboards:", options: ["minimize total GPU expenditure", "make credit assignment legible everywhere", "maximize the policy's entropy floor", "prefer rules over learned judges"], a: 1, why: "Every design choice localizes which skill produced which outcome." },
        { q: "MCTS + world models + HRL all attack the same enemy:", options: ["long-horizon credit assignment and foresight", "tokenizer vocabulary fragmentation at scale", "the reward model's total parameter count", "inter-agent message-passing bandwidth limits"], a: 0, why: "Search simulates ahead, world models imagine, hierarchy shortens credit chains." },
      ] },
  },
];

/* ============================================================
   THE ATLAS — compact concept worlds (one region each)
   ============================================================ */
const ATLAS = [
{
  id: "w-diffusion", title: "Diffusion Models", emoji: "🌫️",
  links: [
    { label: "3b1b · Neural networks series", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi" },
    { label: "Lilian Weng · What are Diffusion Models?", url: "https://lilianweng.github.io/posts/2021-07-11-diffusion-models/" },
  ],
  regions: [{
    id: "diff-r", name: "The Noise Gardens", emoji: "🌫️",
    intro: "Destroy data slowly; learn to reverse the destruction.",
    npc: { name: "Gardener Epsilon", text: "Diffusion is two processes. Forward: gradually add Gaussian noise over T steps until data becomes pure noise — fixed, no learning. Reverse: a network learns to undo one noising step at a time. Train it to predict the noise ε that was added, and sampling becomes iterative denoising from random Gaussian." },
    concepts: [
      { id: "fwdrev", name: "Forward/Reverse", sprite: "🌀",
        lore: "Forward process q(xₜ|xₜ₋₁): add a little Gaussian noise each step per a variance schedule βₜ; after T steps, x_T ≈ N(0, I). A closed form jumps straight to any t: xₜ = √(ᾱₜ)x₀ + √(1−ᾱₜ)ε. The reverse process p_θ(xₜ₋₁|xₜ) is learned: a network (typically U-Net or DiT transformer) predicts how to denoise one step. Generation = start from pure noise, apply the reverse step T times.",
        questions: [
          { q: "Which process involves NO learning?", options: ["the forward noising process", "the reverse denoising process", "both require trained networks", "neither involves any computation"], a: 0, why: "Forward is fixed Gaussian corruption per schedule; only the reverse is learned." },
          { q: "The closed form xₜ = √(ᾱₜ)x₀ + √(1−ᾱₜ)ε matters for training because…", options: ["it removes the need for noise", "any timestep is sampled in one jump", "it defines the reverse process", "it eliminates the variance schedule"], a: 1, why: "Train on random t without simulating t sequential noising steps." },
        ] },
      { id: "objective", name: "The ε Objective", sprite: "🎯",
        lore: "The ELBO of the diffusion model simplifies (Ho et al., DDPM) to something shockingly clean: L = E[‖ε − ε_θ(xₜ, t)‖²] — just MSE between the true noise added and the network's prediction of it. The network sees a noisy image and the timestep, and answers 'what noise was mixed in?'. Equivalent parameterizations exist (predict x₀, predict velocity v), trading stability at different noise levels.",
        questions: [
          { q: "The DDPM training loss is essentially…", options: ["cross-entropy over pixel classes", "MSE between true and predicted noise", "a GAN-style adversarial game", "KL between two learned networks"], a: 1, why: "The ELBO reduces to noise-prediction MSE — diffusion's famous simplicity." },
          { q: "ε_θ takes which inputs?", options: ["the clean image and a class label", "only the variance schedule β", "the noisy image and the timestep", "the previous predicted noise only"], a: 2, why: "It must know how corrupted the input is — t conditions the denoiser." },
        ] },
      { id: "guidance", name: "Sampling & CFG", sprite: "🧪",
        lore: "DDPM sampling needs T (~1000) sequential steps; DDIM reformulates it as a deterministic ODE-like process allowing big jumps (50 steps). Classifier-free guidance (CFG): train the model both with and without conditioning (drop the prompt ~10% of the time), then at sampling extrapolate: ε̂ = ε_uncond + w·(ε_cond − ε_uncond). Guidance scale w trades fidelity/prompt-adherence against diversity; too high w fries images. Latent diffusion (Stable Diffusion) runs the whole thing in a VAE's compressed latent space — far cheaper than pixel space.",
        questions: [
          { q: "Classifier-free guidance requires training…", options: ["a separate classifier on noisy images", "with conditioning randomly dropped", "two entirely separate diffusion models", "only on unconditional samples"], a: 1, why: "Random condition-dropping gives one model both ε_cond and ε_uncond." },
          { q: "Latent diffusion's core economy:", options: ["denoising in a VAE's compressed space", "skipping the forward process entirely", "using fewer attention heads per layer", "replacing Gaussian noise with uniform"], a: 0, why: "A 64×64 latent beats a 512×512 pixel grid — most cost vanishes." },
        ] },
    ],
    sides: [
      { id: "diff-s1", name: "Schedule Serpent", sprite: "🐍", anchor: 2, recLevel: 3, prereqs: ["fwdrev", "objective", "guidance"],
        desc: "Coils around your sampler settings and squeezes.",
        code: `# classifier-free guidance at sampling time
eps_c = model(x_t, t, prompt_emb)     # conditional
eps_u = model(x_t, t, null_emb)       # unconditional
eps   = eps_u + w * (eps_c - eps_u)   # w = guidance scale
x_prev = ddim_step(x_t, eps, t)       # 50 steps, not 1000`,
        codeNote: "Two forward passes per step — that's CFG's hidden 2× cost.",
        questions: [
          { q: "SCENARIO: Generations match prompts perfectly but look oversaturated and same-y. First knob?", options: ["lower the guidance scale w", "raise the number of DDIM steps", "increase the noise schedule's β", "switch the U-Net to a transformer"], a: 0, why: "High w over-extrapolates toward the condition — fidelity up, diversity and realism down." },
          { q: "SCENARIO: Inference is too slow at 1000 steps. The standard first fix:", options: ["a smaller U-Net backbone", "DDIM-style sampling with ~50 steps", "removing the timestep embedding", "training a second faster model"], a: 1, why: "Deterministic samplers take big jumps along the denoising trajectory." },
          { q: "SCENARIO: Pixel-space diffusion at 1024² blows your VRAM. The Stable-Diffusion answer:", options: ["gradient checkpointing everywhere", "tiling the image into patches", "compress with a VAE, diffuse in latents", "quantize the model to 4 bits"], a: 2, why: "Latent diffusion — do the expensive iteration in compressed space." },
        ] },
    ],
    gym: { leader: "Gardener Epsilon", badge: "Diffusion Badge", sprite: "🏛️", taunt: "Reverse my garden's entropy!",
      questions: [
        { q: "Generation in diffusion is…", options: ["one forward pass through a decoder", "iterative denoising from pure Gaussian noise", "sampling from a discrete codebook", "adversarial refinement of a draft"], a: 1, why: "Start at N(0,I), apply the learned reverse step repeatedly." },
        { q: "Why does predicting ε work as well as predicting x₀?", options: ["they are linearly related given xₜ and t", "noise has lower dimensionality", "ε is always Gaussian at test time", "x₀ prediction is mathematically invalid"], a: 0, why: "The closed form ties x₀, xₜ, and ε together — parameterizations are interconvertible." },
        { q: "CFG with w = 0 gives…", options: ["pure conditional sampling", "pure unconditional sampling", "an average of both predictions", "a divergent sampler"], a: 1, why: "ε̂ = ε_u + 0·(…) = ε_u. w=1 is plain conditional; w>1 extrapolates." },
      ] },
  }],
},
{
  id: "w-vlm", title: "Vision-Language Models", emoji: "👁️",
  links: [
    { label: "CNN Explainer (interactive)", url: "https://poloclub.github.io/cnn-explainer/" },
    { label: "Transformer Explainer (interactive)", url: "https://poloclub.github.io/transformer-explainer/" },
  ],
  regions: [{
    id: "vlm-r", name: "The Seeing Tower", emoji: "👁️",
    intro: "Where pixels learn to speak.",
    npc: { name: "Oracle CLIP", text: "Modern VLMs are three parts: a vision encoder (often a ViT pre-trained contrastively), a projector that maps image features into the LLM's token space, and the LLM itself. Images become 'soft tokens' the language model attends over like any other words." },
    concepts: [
      { id: "clip", name: "Contrastive Pretraining", sprite: "🧲",
        lore: "CLIP trains an image encoder and text encoder jointly on (image, caption) pairs with a contrastive loss: in a batch of N pairs, maximize cosine similarity of the N matched pairs while minimizing the N²−N mismatched ones (symmetric InfoNCE). Result: a shared embedding space where 'photo of a dog' lands near dog images — enabling zero-shot classification by comparing an image against text prompts for each class.",
        questions: [
          { q: "CLIP's training signal comes from…", options: ["a pixel-level image reconstruction loss", "matching vs mismatching image-text pairs", "ranked human preference comparisons", "next-token prediction on captions"], a: 1, why: "Symmetric contrastive loss over the batch's similarity matrix." },
          { q: "Zero-shot classification with CLIP works by…", options: ["fine-tuning a linear head per task", "comparing the image embedding to class prompts", "generating a caption and parsing the class out", "unsupervised clustering of image embeddings"], a: 1, why: "The shared space makes 'nearest text prompt' a classifier." },
        ] },
      { id: "llava", name: "The Projector Pattern", sprite: "🌉",
        lore: "The LLaVA recipe: freeze a strong vision encoder, freeze (initially) a strong LLM, and train only a small projector — an MLP mapping ViT patch features to LLM embedding dimensions. Image patches become a sequence of soft tokens prepended to the text. Stage 1 trains the projector on captions (alignment); stage 2 fine-tunes projector + LLM on visual instruction data. Cheap, modular, and the dominant open-VLM pattern.",
        questions: [
          { q: "In stage 1, LLaVA trains…", options: ["the vision encoder from scratch", "only the projector MLP", "the full LLM end-to-end", "a contrastive text encoder"], a: 1, why: "Alignment first: teach the bridge, keep both towers frozen." },
          { q: "Images enter the LLM as…", options: ["a sequence of soft tokens in embedding space", "base64-encoded strings inside the prompt text", "one single pooled CLS summary vector", "discrete codebook indices only"], a: 0, why: "Patch features, projected to embedding dim, attended like words." },
        ] },
      { id: "patches", name: "Resolution & Tokens", sprite: "🧩",
        lore: "A ViT splits images into patches (e.g., 14×14 px), each becoming one token: a 336² image → 576 tokens. Higher resolution = quadratically more tokens = quadratic attention cost, so VLMs use tricks: tiling (split high-res images into crops processed separately, e.g., LLaVA-NeXT 'AnyRes'), token pooling/merging, or resamplers (Perceiver-style cross-attention to a fixed token budget). Document and medical imagery especially need high resolution — fine text and subtle findings vanish at 224².",
        questions: [
          { q: "Doubling image resolution does what to token count?", options: ["doubles it", "quadruples it", "leaves it unchanged", "halves it via pooling"], a: 1, why: "Tokens scale with area: 2× side length → 4× patches." },
          { q: "A Perceiver-style resampler exists to…", options: ["compress patches to a fixed token budget", "increase the effective resolution", "replace the vision encoder entirely", "convert tokens to discrete codes"], a: 0, why: "Cross-attend many patch features into k learned queries — constant LLM cost." },
        ] },
    ],
    sides: [
      { id: "vlm-s1", name: "Pixel Sphinx", sprite: "🦉", anchor: 1, recLevel: 3, prereqs: ["clip", "llava", "patches"],
        desc: "Asks how you'd ACTUALLY build a medical VLM.",
        questions: [
          { q: "SCENARIO: Building a chest-X-ray VLM. The CLIP-336 vision tower misses small nodules entirely. First architectural lever?", options: ["a bigger LLM behind the projector", "higher input resolution via tiling/AnyRes", "more instruction-tuning epochs", "a second contrastive text encoder"], a: 1, why: "Subtle findings die at low res — resolution strategy before model scale." },
          { q: "SCENARIO: Budget allows training ~20M parameters total on 100k caption pairs. The LLaVA-style move:", options: ["LoRA the vision encoder only", "train the projector, freeze both towers", "train the LLM's embedding layer", "distill CLIP into a smaller ViT"], a: 1, why: "The projector IS the cheap alignment stage — exactly this budget." },
          { q: "SCENARIO: Your VLM hallucinates objects not in the image. A grounded mitigation at the data level:", options: ["raise the sampling temperature", "negative/contrastive instruction data", "remove all text-only data", "shrink the patch size further"], a: 1, why: "Teaching 'no' explicitly counters the LM prior's tendency to confabulate objects." },
        ] },
    ],
    gym: { leader: "Oracle CLIP", badge: "Vision Badge", sprite: "🏛️", taunt: "See clearly, answer precisely!",
      questions: [
        { q: "The three-part modern VLM:", options: ["encoder, projector, LLM", "tokenizer, decoder, sampler", "GAN, VAE, diffusion head", "retriever, ranker, reader"], a: 0, why: "Vision tower → bridge → language tower." },
        { q: "Why is contrastive pretraining a good vision-tower base for VLMs?", options: ["its features already align with language semantics", "it consistently produces the smallest models", "it requires no labeled image data at all", "it outputs discrete tokens natively"], a: 0, why: "CLIP's space was forged against text — the projector's job is short." },
        { q: "576 tokens for one 336² image implies what cost concern?", options: ["attention cost grows with image tokens", "the vocabulary must expand", "gradients vanish past 500 tokens", "the KV cache becomes unnecessary"], a: 0, why: "Image tokens crowd the context — hence pooling, tiling, resamplers." },
      ] },
  }],
},
{
  id: "w-moe", title: "Mixture of Experts", emoji: "🔀",
  links: [
    { label: "Raschka · Big LLM Architecture Comparison", url: "https://magazine.sebastianraschka.com/p/the-big-llm-architecture-comparison" },
  ],
  regions: [{
    id: "moe-r", name: "The Expert Bazaar", emoji: "🔀",
    intro: "A market of specialists; a router decides who works.",
    npc: { name: "Broker Router", text: "MoE replaces each FFN with many expert FFNs plus a router. Per token, the router picks top-k experts (often k=8 of 256 fine-grained ones, plus a shared expert that always fires). Total parameters explode; ACTIVE parameters per token stay small. Capacity without proportional compute." },
    concepts: [
      { id: "routing", name: "Sparse Routing", sprite: "🚦",
        lore: "The router is a small linear layer producing logits over experts; top-k are selected, their outputs combined weighted by softmax gate values. Sparsity means each token's FLOPs touch only k experts — a 671B-total model can run ~37B active (DeepSeek-V3 pattern). Routing is per-token, per-layer: the same token can visit different experts at different depths. Discrete top-k breaks differentiability; gradients flow through the gate weights of selected experts.",
        questions: [
          { q: "'Active parameters' means…", options: ["parameters updated during training", "parameters touched per token at inference", "the routing network's own parameter count", "the subset of parameters stored in fp32"], a: 1, why: "Total capacity is huge; per-token compute touches only k experts." },
          { q: "Routing decisions are made…", options: ["once per sequence, globally", "per token, per MoE layer", "once at model load time", "per attention head"], a: 1, why: "Each token at each MoE layer gets its own top-k expert set." },
        ] },
      { id: "balance", name: "Load Balancing", sprite: "⚖️",
        lore: "Routers naturally collapse: a few experts win early, get more gradient, win more — leaving dead experts and hot ones that bottleneck parallel hardware. Fixes: auxiliary load-balancing losses pushing uniform expert utilization, expert capacity limits with token dropping, and auxiliary-loss-free bias tweaks (DeepSeek-V3 adjusts per-expert bias terms online). A shared expert (always active) absorbs common patterns so routed experts can specialize.",
        questions: [
          { q: "Router collapse means…", options: ["the router's weights become NaN", "a few experts dominate while others die", "all experts produce identical outputs", "tokens skip the MoE layer entirely"], a: 1, why: "Rich-get-richer dynamics in routing — the classic MoE pathology." },
          { q: "The shared expert's purpose:", options: ["absorbing common patterns so others specialize", "serving as a fallback when routing fails", "reducing the model's total parameter count", "balancing gradients across GPUs"], a: 0, why: "Commonality goes to the always-on expert; routed ones get the long tail." },
        ] },
      { id: "moeinfra", name: "MoE at Inference", sprite: "🏗️",
        lore: "MoE's catch: ALL experts must live in memory even though few fire per token — memory scales with total parameters, FLOPs with active. Multi-GPU serving uses expert parallelism: experts sharded across devices, tokens routed over the interconnect (all-to-all communication, a real cost). Batch effects matter: a large batch touches most experts anyway, so MoE shines at large-batch serving and hurts at batch-1 local inference where you pay memory for unused capacity.",
        questions: [
          { q: "MoE memory footprint scales with ___ while FLOPs scale with ___:", options: ["active / total parameters", "total / active parameters", "expert count / router size", "batch size / sequence length"], a: 1, why: "Everything must be resident; only the routed slice computes." },
          { q: "Expert parallelism's characteristic cost:", options: ["all-to-all token routing over the interconnect", "fully duplicated experts on every device", "redundant router recomputation per device", "synchronous gradient averaging each step"], a: 0, why: "Tokens travel to wherever their experts live — communication is the tax." },
        ] },
    ],
    sides: [
      { id: "moe-s1", name: "Bazaar Haggler", sprite: "🧞", anchor: 1, recLevel: 3, prereqs: ["routing", "balance", "moeinfra"],
        desc: "Haggles over deployment trade-offs.",
        questions: [
          { q: "SCENARIO: Choosing between a 30B dense and a 100B-total/12B-active MoE for a single 24GB consumer GPU. The MoE problem:", options: ["routing latency dominates decoding", "100B must fit in memory despite 12B active", "MoEs cannot be quantized at all", "the dense model has more capacity"], a: 1, why: "Memory pays for total parameters — batch-1 local inference is MoE's worst case." },
          { q: "SCENARIO: Mid-training, 80% of tokens route to 3 of 64 experts. Standard remedies?", options: ["balance losses / bias tweaks, capacity limits", "delete the 61 unpopular experts outright", "freeze the routing layer permanently", "raise the global learning rate by 10×"], a: 0, why: "Push utilization uniform before the dead experts waste all that capacity." },
          { q: "SCENARIO: Your serving fleet runs huge batches. Why does MoE economics improve?", options: ["the router amortizes to zero cost", "large batches touch most experts anyway", "all-to-all traffic disappears", "experts merge automatically at scale"], a: 1, why: "Utilization rises with batch size — capacity stops being dead weight." },
        ] },
    ],
    gym: { leader: "Broker Router", badge: "Expert Badge", sprite: "🏛️", taunt: "Route wisely!",
      questions: [
        { q: "MoE's fundamental trade:", options: ["capacity up, per-token compute roughly flat", "compute rises while capacity stays flat", "memory drops while per-token FLOPs rise", "latency falls while output quality falls"], a: 0, why: "More parameters to specialize, same active FLOPs per token." },
        { q: "Fine-grained experts (many small, higher k) vs few large ones — the argued benefit:", options: ["more flexible combinations of specializations", "substantially lower total memory usage", "eliminating the need for load balancing", "much simpler all-to-all communication"], a: 0, why: "The DeepSeek lineage: many small experts compose more expressively." },
        { q: "Why does top-k routing complicate gradients?", options: ["selection is discrete and non-differentiable", "the softmax cannot represent k > 1 choices", "the experts share no trainable parameters", "the router contributes no loss term itself"], a: 0, why: "Hard selection blocks gradient flow; gating weights carry what signal there is." },
      ] },
  }],
},
{
  id: "w-orch", title: "Multi-Agent Orchestration", emoji: "🕸️",
  links: [
    { label: "Anthropic · Building Effective Agents", url: "https://www.anthropic.com/research/building-effective-agents" },
  ],
  regions: [{
    id: "orch-r", name: "The Orchestra Pit", emoji: "🕸️",
    intro: "Many players, one score — if the conductor is good.",
    npc: { name: "Maestro Topology", text: "Workflows are fixed pipelines (predictable, debuggable); agents are loops that decide their own next step (flexible, expensive, riskier). Orchestration patterns are reusable shapes: routing, chaining, parallelization, orchestrator-workers, evaluator-optimizer. Pick the simplest shape that fits the task — escalate complexity only when the simple shape demonstrably fails." },
    concepts: [
      { id: "patterns", name: "Core Patterns", sprite: "🎼",
        lore: "CHAINING: fixed sequence, each step's output feeding the next — for decomposable tasks with stable structure. ROUTING: a classifier sends inputs down specialized paths — when input types differ. PARALLELIZATION: sectioning (independent subtasks at once) or voting (same task, multiple samples, aggregate). ORCHESTRATOR-WORKERS: a lead agent dynamically decomposes, delegates to workers, synthesizes — for unpredictable subtask structure. EVALUATOR-OPTIMIZER: generator loops against a critic until quality passes.",
        questions: [
          { q: "Subtasks unknown until runtime → which pattern?", options: ["fixed chaining", "orchestrator-workers", "simple routing", "voting parallelization"], a: 1, why: "Dynamic decomposition is exactly what the orchestrator provides." },
          { q: "Evaluator-optimizer fits best when…", options: ["clear evaluation criteria exist and iteration helps", "the task is one deterministic transformation", "latency must be absolutely minimal", "no available model can judge the output"], a: 0, why: "A loop needs a meaningful stop condition: the critic's pass." },
        ] },
      { id: "comms", name: "Handoffs & State", sprite: "📨",
        lore: "Inter-agent communication is the failure surface. Every handoff is a serialization: full-context transfer (expensive, faithful) vs summaries (cheap, lossy) vs structured artifacts (schemas, files — inspectable middle ground). Shared state (a blackboard/workspace all agents read-write) trades coupling for fidelity. Design questions: what does each agent SEE, what can it WRITE, and who arbitrates conflicts? Untracked state mutation by parallel agents is the classic heisenbug source.",
        questions: [
          { q: "The most inspectable handoff medium:", options: ["raw chat transcripts between agents", "structured artifacts with schemas", "implicit shared model weights", "summaries of summaries"], a: 1, why: "Schemas make handoffs checkable, diffable, and debuggable." },
          { q: "Parallel agents writing shared state risks…", options: ["conflicting untracked mutations", "deterministic but slow execution", "automatic deduplication", "improved context fidelity"], a: 0, why: "Two workers editing one workspace without arbitration = race conditions in prose." },
        ] },
      { id: "governance", name: "Governance & Cost", sprite: "🏛️",
        lore: "Agent systems multiply cost (~4× tokens for single agents, ~15× for multi-agent vs chat, per Anthropic's measurements) and multiply failure modes: error cascades (one bad subtask poisons synthesis), infinite delegation loops, and unobservable decisions. Governance: budgets per task (token/step/time caps), tracing every decision with structured logs, gates on irreversible actions, and evals on the SYSTEM level, not just per-agent — the orchestra can fail while every instrument plays correctly.",
        questions: [
          { q: "System-level evals matter beyond per-agent evals because…", options: ["coordination failures emerge between correct agents", "individual agents cannot be tested in isolation", "system-level evals are cheaper to run at scale", "per-agent metrics are always wrong"], a: 0, why: "Every instrument in tune; the symphony still wrong — emergent failure." },
          { q: "The first defense against runaway delegation loops:", options: ["hard budgets", "more capable worker agents", "removing the orchestrator entirely", "lowering sampling temperature"], a: 0, why: "Caps convert infinite loops into bounded, diagnosable failures." },
        ] },
    ],
    sides: [
      { id: "orch-s1", name: "Cascade Wraith", sprite: "🌊", anchor: 1, recLevel: 4, prereqs: ["patterns", "comms", "governance"],
        desc: "Feeds on error cascades in agent pipelines. It has seen your architecture diagrams.",
        questions: [
          { q: "SCENARIO: A simulation platform runs three agents — two domain agents and a scenario director. The director's prose summaries keep dropping vital constraints on their way to the others. Best structural fix?", options: ["a louder system prompt for the director", "structured artifacts", "have twins re-derive constraints themselves", "merge everything into one mega-prompt"], a: 1, why: "Lossy summaries → move invariants into shared, schema'd state instead of prose handoffs." },
          { q: "SCENARIO: Tickets are one of: billing, technical, refund. Each has a stable resolution flow. Simplest correct shape?", options: ["orchestrator-workers with dynamic planning", "routing into three specialized chains", "evaluator-optimizer on every reply", "a single agent with all instructions"], a: 1, why: "Known categories + stable flows = routing. Don't pay orchestrator complexity." },
          { q: "SCENARIO: Your 5-agent system's cost is 15× chat and one task looped for 2 hours overnight. Triage order:", options: ["budgets/caps first, then tracing, then architecture review", "rewrite every agent's prompts immediately", "add a sixth dedicated supervisor agent", "switch every agent to a larger model"], a: 0, why: "Stop the bleeding (caps), see the system (traces), then redesign with evidence." },
        ] },
    ],
    gym: { leader: "Maestro Topology", badge: "Orchestration Badge", sprite: "🏛️", taunt: "Conduct, don't just multiply agents!",
      questions: [
        { q: "Workflow vs agent — the dividing line:", options: ["who decides the next step", "the number of LLM calls made", "whether tools are involved", "the size of the model used"], a: 0, why: "Fixed control flow = workflow; model-directed control flow = agent." },
        { q: "Voting-style parallelization buys…", options: ["reliability through sample diversity", "a lower total token cost per task", "fully guaranteed deterministic outputs", "complete elimination of handoff loss"], a: 0, why: "Multiple attempts + aggregation hedge against per-sample flakiness." },
        { q: "The RL-world principle that transfers directly to orchestration:", options: ["start simple; escalate only with evidence", "always maximize the number of components", "reward magnitudes must always stay symmetric", "exploration is unnecessary in production"], a: 0, why: "Single-agent-first is the same law as simplest-pattern-first." },
      ] },
  }],
},
{
  id: "w-embed", title: "Embeddings & Position", emoji: "🧭",
  links: [
    { label: "Transformer Explainer (interactive)", url: "https://poloclub.github.io/transformer-explainer/" },
    { label: "3b1b · But what is a GPT?", url: "https://www.youtube.com/watch?v=wjZofJX0v4M" },
  ],
  regions: [{
    id: "emb-r", name: "The Rotating Library", emoji: "🧭",
    intro: "Where tokens learn where they are.",
    npc: { name: "Librarian Theta", text: "Attention is permutation-invariant — without positional information, 'dog bites man' equals 'man bites dog'. Position must be injected. The old way: add a position vector to each token embedding. The modern way: rotate the queries and keys themselves." },
    concepts: [
      { id: "sinusoidal", name: "Sinusoidal PE", sprite: "〰️",
        lore: "The original transformer adds fixed sinusoidal vectors: PE(pos, 2i) = sin(pos/10000^(2i/d)), PE(pos, 2i+1) = cos(…). Each dimension oscillates at a different frequency — low dims wiggle fast (fine position), high dims slowly (coarse position) — like binary counting in continuous form. Properties: no learned parameters, unique encoding per position, and relative offsets are expressible as linear transforms of the encodings. Limit: it's ABSOLUTE position added to content, entangling the two.",
        questions: [
          { q: "Why multiple frequencies across dimensions?", options: ["fine and coarse position at different scales", "to randomize the embedding initialization", "to keep every vector's norm exactly one", "frequencies are an implementation accident"], a: 0, why: "A multi-scale ruler: fast dims resolve neighbors, slow dims resolve regions." },
          { q: "Sinusoidal PE's structural limitation:", options: ["it encodes absolute position, entangled with content", "it requires training extra position parameters", "it cannot represent the zeroth position", "it only functions for even model dimensions"], a: 0, why: "Added to embeddings, position and meaning mix; attention often cares about RELATIVE offsets." },
        ] },
      { id: "rope", name: "RoPE", sprite: "🌀",
        lore: "Rotary Position Embedding rotates each query/key 2D-pair by an angle proportional to its position: q at position m becomes R(mθᵢ)q per frequency θᵢ. The magic: the dot product q_m·k_n then depends only on (m−n) — relative position emerges from absolute rotations, with zero added parameters and no vectors added to the residual stream. Long-context extension: positions beyond training length extrapolate poorly, so methods rescale θ — NTK-aware scaling, YaRN — stretching the rotation frequencies to cover longer sequences.",
        questions: [
          { q: "RoPE's central property: q_m·k_n depends on…", options: ["only the relative offset m−n", "the absolute positions separately", "the token embeddings' norms", "the layer index"], a: 0, why: "Rotation angles subtract inside the dot product — relativity for free." },
          { q: "NTK/YaRN-style scaling addresses…", options: ["extrapolation past the trained context length", "the runtime memory cost of the rotations", "gradient explosion in the deepest layers", "growth of the size of the tokenizer's vocabulary size"], a: 0, why: "Stretch the frequency spectrum so longer positions stay in-distribution." },
        ] },
      { id: "semantic", name: "Semantic Embeddings", sprite: "💠",
        lore: "Separate concern: representation embeddings for retrieval/similarity. Trained contrastively (like CLIP's text tower, or sentence-transformers): pull paired texts together, push negatives apart — hard negatives matter enormously. Pooling turns token vectors into one (CLS, mean, or last-token for decoder models). Practical knobs: cosine similarity as metric, dimension truncation via Matryoshka training (a 1024-d model whose first 256 dims still work), and the asymmetry of query vs document prompts.",
        questions: [
          { q: "Hard negatives in contrastive training are…", options: ["similar-but-wrong pairs that sharpen boundaries", "training examples with corrupted labels", "the batches with the largest gradients", "tokens falling outside the vocabulary"], a: 0, why: "Easy negatives teach nothing; near-misses define the decision surface." },
          { q: "Matryoshka embeddings allow…", options: ["truncating dimensions with graceful degradation", "encoding infinitely long input sequences", "contrastive training without any negatives", "fully lossless compression of the corpus"], a: 0, why: "Information ordered by prefix importance — cut to 256-d and keep most quality." },
        ] },
    ],
    sides: [
      { id: "emb-s1", name: "Context Stretcher", sprite: "🦒", anchor: 1, recLevel: 3, prereqs: ["sinusoidal", "rope"],
        desc: "Pulls your sequences far past training length and watches what breaks.",
        code: `# RoPE in ~10 lines (pytorch)
def rope(x, pos):                  # x: [seq, dim]
    d = x.shape[-1]
    theta = 10000 ** (-torch.arange(0, d, 2) / d)
    ang = pos[:, None] * theta[None, :]      # [seq, d/2]
    cos, sin = ang.cos(), ang.sin()
    x1, x2 = x[..., 0::2], x[..., 1::2]
    return torch.stack(
        [x1*cos - x2*sin, x1*sin + x2*cos], -1
    ).flatten(-2)   # rotate each 2D pair`,
        codeNote: "Apply to q and k (never v). The dot product then sees only m−n.",
        questions: [
          { q: "SCENARIO: Model trained at 8k context degrades sharply at 32k. Looking at the code, the fix targets…", options: ["theta — rescale frequencies", "the .flatten(-2) reshape order", "applying rope to v as well", "removing cos and keeping only sin"], a: 0, why: "Out-of-range angles are the problem; stretch the spectrum." },
          { q: "SCENARIO: A bug applies RoPE to values too. The observable symptom:", options: ["degraded outputs", "no change — v rotation cancels out", "a shape mismatch crash", "doubled attention scores"], a: 0, why: "Values are the payload; rotating them corrupts content with position." },
          { q: "RETENTION: Why does relative beat absolute position for language?", options: ["'the adjective before this noun' is what matters", "absolute encodings overflow integer ranges", "relative encodings are smaller tensors", "absolute position breaks the causal mask"], a: 0, why: "Linguistic structure is built from offsets, not coordinates." },
        ] },
    ],
    gym: { leader: "Librarian Theta", badge: "Position Badge", sprite: "🏛️", taunt: "Locate yourself!",
      questions: [
        { q: "Without positional information, self-attention treats input as…", options: ["a bag of tokens — order-invariant", "a strictly ordered sequence", "a tree of dependencies", "a single pooled vector"], a: 0, why: "Permutation invariance is attention's default; position must be injected." },
        { q: "RoPE adds how many learned parameters?", options: ["zero", "one per attention head", "d per layer", "a full position embedding table"], a: 0, why: "Pure deterministic rotation — that's part of its elegance." },
        { q: "Retrieval embeddings vs LLM token embeddings differ chiefly in…", options: ["training objective", "numerical precision used", "whether positions are encoded", "vocabulary size"], a: 0, why: "Same idea (vectors for meaning), different forces shaping the space." },
      ] },
  }],
},
{
  id: "w-attn", title: "Attention Mechanisms", emoji: "🔍",
  links: [
    { label: "3b1b · Attention, visually explained", url: "https://www.youtube.com/watch?v=eMlx5fFNoYc" },
    { label: "Raschka · Visual Guide to Attention Variants", url: "https://magazine.sebastianraschka.com/p/visual-attention-variants" },
  ],
  regions: [{
    id: "attn-r", name: "The Head Court", emoji: "🔍",
    intro: "MHA's royal court, and the pretenders trimming its costs.",
    npc: { name: "Judge QKV", text: "Every attention variant you'll meet exists for one reason: the KV cache. At inference, every generated token attends over all cached keys/values — cache size = layers × kv_heads × seq × head_dim × 2. Shrink kv_heads (MQA/GQA), shrink seq (sliding window), or compress the cache itself (MLA). Memory is the battlefield." },
    concepts: [
      { id: "attncomp", name: "The Attention Computation", sprite: "🧮",
        lore: "Walk it step by step (Raschka's classic derivation). Each token embedding x is projected three ways: q = xW_q (what am I looking for?), k = xW_k (what do I contain?), v = xW_v (what do I give if attended to?). Unnormalized score ω_ij = q_i·k_j measures query-key compatibility. Two transformations make ω usable: divide by √d_k — dot-product variance grows with dimension, and large logits saturate softmax into a near-one-hot whose gradients vanish — then softmax each row into attention weights α that sum to 1. The output context vector is z_i = Σ_j α_ij v_j: a learned mixture of value vectors. Causality is one surgical edit: set ω_ij = −∞ for j > i BEFORE softmax, so future positions get exactly zero weight. Multi-head = run h of these in parallel on d/h-dim slices, concatenate, project with W_o.",
        questions: [
          { q: "Why scale scores by √d_k rather than feed q·k straight to softmax?", options: ["large-variance logits saturate softmax, killing gradients", "unscaled scores overflow float16 storage", "softmax requires inputs between 0 and 1", "it makes the score matrix symmetric"], a: 0, why: "Variance grows with d_k; near-one-hot softmax outputs propagate almost no gradient." },
          { q: "The context vector z_i is best described as…", options: ["the value vector of the most attended token", "an attention-weighted mixture of value vectors", "the sum of all query projections", "the row-max of the score matrix"], a: 1, why: "z_i = Σ α_ij v_j — a soft, learned blend, not a hard selection." },
          { q: "Causal masking sets ω to −∞ for future positions BEFORE softmax because…", options: ["−∞ is cheaper to store than zero", "post-softmax zeroing breaks row normalization", "softmax cannot process negative inputs", "the mask must be differentiable"], a: 1, why: "exp(−∞)=0 inside the softmax keeps each row a clean distribution; zeroing after would leave rows summing to less than 1." },
        ] },
      { id: "mqagqa", name: "MQA & GQA", sprite: "👥",
        lore: "Multi-Head Attention gives every query head its own K and V heads. Multi-Query Attention (MQA) keeps all query heads but shares ONE K/V head — cache shrinks by n_heads×, with some quality cost. Grouped-Query Attention interpolates: groups of query heads share a K/V head (e.g., 32 q-heads, 8 kv-heads → 4× cache reduction, near-MHA quality). GQA is the modern default (Llama, Gemma, Qwen). The cache formula's kv_heads term is exactly what these attack.",
        questions: [
          { q: "GQA with 32 query heads and 8 KV heads reduces the KV cache by…", options: ["4× versus full MHA", "32× versus full MHA", "8× versus full MHA", "it doesn't change the cache"], a: 0, why: "Cache scales with KV heads: 32/8 = 4× reduction." },
          { q: "MQA is the special case of GQA where…", options: ["kv_heads = 1", "kv_heads = n_heads", "queries are shared instead", "the cache is disabled"], a: 0, why: "One K/V head serving every query head — maximum sharing." },
        ] },
      { id: "swa", name: "Sliding Window", sprite: "🪟",
        lore: "Sliding-window attention restricts each token to attend only the last W tokens — cache and compute become O(W) instead of O(seq). Information still propagates beyond W through depth: layer L sees an effective receptive field of ~L×W. Modern designs interleave: Gemma-style patterns run several sliding-window layers per full-attention layer (e.g., 4:1 ratio), keeping a few global layers for long-range retrieval while most layers stay cheap. Cousin ideas: attention sinks (always-attended first tokens) stabilize long streaming contexts.",
        questions: [
          { q: "With window W and depth L, information can propagate roughly…", options: ["L×W tokens through stacked layers", "exactly W tokens, hard limit", "only within one layer", "the full sequence at every layer"], a: 0, why: "Each layer extends reach by W — depth buys range." },
          { q: "Why interleave full-attention layers among sliding ones?", options: ["a few global layers preserve long-range retrieval", "full layers are cheaper to run than windowed", "windowed layers cannot be trained stably", "the KV cache requires at least one of them"], a: 0, why: "Most layers local and cheap; occasional global layers keep needle-in-haystack ability." },
        ] },
      { id: "mla", name: "MLA & Compression", sprite: "🗜️",
        lore: "Multi-head Latent Attention (DeepSeek) compresses K and V into a small shared latent vector cached instead of full heads; at attention time the latent is up-projected. Cache shrinks dramatically while, per DeepSeek's ablations, quality can exceed GQA. The 2025-26 frontier pushes further: cross-layer KV sharing (Gemma 4 — later layers reuse earlier layers' KV tensors, halving the cache), per-layer attention budgets, and compressed/convolutional attention variants — all chasing long-context memory for reasoning and agent workloads.",
        questions: [
          { q: "MLA caches…", options: ["a compressed latent, up-projected at use", "every attention head's full K and V", "only the value tensors, never the keys", "the raw attention score matrix directly"], a: 0, why: "Store small, decompress on demand — the latent IS the cache." },
          { q: "Cross-layer KV sharing (Gemma-4 style) means…", options: ["later layers reuse earlier layers' K/V tensors", "all layers sharing one query projection", "KV tensors are shared across batch items", "the whole cache moving to CPU memory"], a: 0, why: "Layers keep their own queries but borrow KV — roughly halving cache." },
        ] },
    ],
    sides: [
      { id: "attn-s1", name: "Cache Goblin", sprite: "👹", anchor: 1, recLevel: 4, prereqs: ["mqagqa", "swa", "mla"],
        desc: "Hoards your VRAM. Do the memory math to drive it out.",
        code: `# KV cache size, bytes (bf16 = 2 bytes)
cache = (n_layers * n_kv_heads * head_dim
         * seq_len * 2 * 2)
# ex: 32 layers, 8 kv-heads, 128 dim, 128k ctx
#   = 32*8*128*131072*4 bytes ≈ 17.2 GB
# MHA (32 kv-heads) would be ≈ 68.7 GB!`,
        codeNote: "This formula is the whole reason MQA/GQA/MLA/SWA exist. Memorize its terms.",
        questions: [
          { q: "SCENARIO: Using the formula, switching that model from 8 kv-heads to MQA (1 kv-head) gives a cache of roughly…", options: ["≈ 2.1 GB", "≈ 8.6 GB", "≈ 34 GB", "≈ 17.2 GB (unchanged)"], a: 0, why: "17.2 GB × (1/8) ≈ 2.15 GB — kv_heads is a linear factor." },
          { q: "SCENARIO: An agent workload keeps 200k-token traces and your retrieval quality on far-back tool outputs matters. Pure sliding-window everywhere risks…", options: ["losing direct access to distant context in most layers", "quadratic memory growth with sequence length", "router collapse in the expert layers", "breaking the causal attention masking"], a: 0, why: "Local windows trade away global lookback — hence interleaved full layers." },
          { q: "RETENTION: Why is KV-cache pressure WORSE in the reasoning/agent era specifically?", options: ["reasoning chains and tool traces keep more tokens live", "newer models largely stopped using attention", "recent GPUs shipped with less memory capacity", "modern tokenizers became far less efficient"], a: 0, why: "Reasoning + agents = long-lived contexts; cache cost dominates serving." },
        ] },
    ],
    gym: { leader: "Judge QKV", badge: "Attention Badge", sprite: "🏛️", taunt: "Order in the court of heads!",
      questions: [
        { q: "Rank by KV-cache size, smallest first (same dims):", options: ["MQA < GQA < MHA", "MHA < GQA < MQA", "GQA < MQA < MHA", "all identical"], a: 0, why: "1 head < grouped heads < all heads." },
        { q: "MLA differs from GQA fundamentally by…", options: ["compressing the cache rather than reducing head count", "removing the query projections entirely", "using convolution instead of attention", "caching the attention probability matrices"], a: 0, why: "GQA shares heads; MLA stores a learned low-rank latent." },
        { q: "The unifying motive across MQA, GQA, SWA, MLA, and cross-layer sharing:", options: ["shrink KV-cache memory for long contexts", "increase total trainable parameter counts", "improve raw tokenizer encoding throughput", "eliminate positional encodings altogether"], a: 0, why: "Judge QKV's opening statement: memory is the battlefield." },
      ] },
  }],
},
{
  id: "w-infer", title: "Inference Systems", emoji: "⚙️",
  links: [
    { label: "Raschka · Coding the KV Cache from Scratch", url: "https://magazine.sebastianraschka.com/p/coding-the-kv-cache-in-llms" },
  ],
  regions: [{
    id: "inf-r", name: "The Serving Forge", emoji: "⚙️",
    intro: "Where tokens-per-second is hammered out.",
    npc: { name: "Foreman Throughput", text: "Two phases rule serving: PREFILL (process the whole prompt — compute-bound, parallel) and DECODE (one token at a time — memory-bandwidth-bound, the cache read dominates). Most serving wisdom is managing decode's memory traffic and keeping GPUs busy across requests." },
    concepts: [
      { id: "kvcache", name: "KV Cache", sprite: "📦",
        lore: "Without caching, generating token N recomputes attention over all N−1 prior tokens' K/V from scratch — O(N²) per token, O(N³) per sequence. The KV cache stores each token's keys/values once; each new token computes only its own q/k/v and attends over the cache: O(N) per token. The price: memory that grows linearly with sequence and batch, which is why cache size (not FLOPs) usually caps concurrent users, and why attention variants attack it.",
        questions: [
          { q: "The KV cache converts per-token generation cost from…", options: ["O(N²) recomputation to O(N) lookup+attend", "from O(N) lookups down to O(1) per token", "memory-bandwidth-bound to compute-bound", "from linear cost down to logarithmic cost"], a: 0, why: "Compute each K/V once, reuse forever." },
          { q: "In long-context serving, concurrency is usually capped by…", options: ["KV-cache memory, not FLOPs", "the tokenizer's speed", "disk I/O bandwidth", "the optimizer state size"], a: 0, why: "Decode is memory-bound; cache bytes are the scarce resource." },
        ] },
      { id: "paged", name: "PagedAttention & Batching", sprite: "📑",
        lore: "Naive serving pre-allocates max-length cache per request — most of it wasted (fragmentation). PagedAttention (vLLM) borrows OS virtual memory: cache lives in fixed-size blocks, a block table maps each sequence's logical positions to scattered physical blocks; allocation is on demand, and identical prefixes can SHARE blocks (copy-on-write) — huge for system prompts. Continuous batching evicts finished sequences and admits new ones at token granularity instead of waiting for the whole batch, keeping the GPU saturated.",
        questions: [
          { q: "PagedAttention's core idea borrowed from operating systems:", options: ["block tables mapping logical to physical cache pages", "swapping cold model weights out to disk", "scheduling incoming requests round-robin", "compressing the cache pages with zlib"], a: 0, why: "Virtual-memory-style paging kills fragmentation and enables sharing." },
          { q: "Continuous batching improves throughput by…", options: ["admitting/evicting requests at token granularity", "padding all requests to identical lengths", "batching only exactly identical prompts", "skipping the prefill phase entirely"], a: 0, why: "No GPU idle time waiting for the batch's slowest member." },
        ] },
      { id: "parallel", name: "Parallelism", sprite: "🔱",
        lore: "When a model exceeds one GPU: TENSOR PARALLELISM splits individual matrices across devices (each holds a slice of every layer; all-reduce syncs activations every layer — needs fast interconnect like NVLink). PIPELINE PARALLELISM assigns whole layer ranges to devices, micro-batching to keep stages busy (bubble overhead). EXPERT PARALLELISM shards MoE experts with all-to-all token routing. Real deployments compose them: TP within a node, PP across nodes, EP for the MoE layers — plus speculative decoding to cut decode latency.",
        questions: [
          { q: "Tensor parallelism's defining communication cost:", options: ["all-reduce on activations every layer", "a single transfer at each pipeline boundary", "zero inter-device communication at all", "synchronized gradient averaging per epoch"], a: 0, why: "Sliced matrices must reassemble activations constantly — interconnect-hungry." },
          { q: "Pipeline parallelism's characteristic inefficiency:", options: ["bubbles — stages idle awaiting upstream", "fully duplicated weights on all devices", "all-to-all token shuffling every layer", "fragmentation of the KV-cache pool"], a: 0, why: "Stage dependencies leave idle gaps; micro-batches shrink but don't erase them." },
        ] },
    ],
    sides: [
      { id: "inf-s1", name: "Latency Leech", sprite: "🦠", anchor: 1, recLevel: 4, prereqs: ["kvcache", "paged", "parallel"],
        desc: "Sucks milliseconds from your p99. Diagnose its bite marks.",
        questions: [
          { q: "SCENARIO: Your chat service has a 3k-token system prompt shared by all users. PagedAttention's gift here:", options: ["prefix blocks shared copy-on-write across requests", "the shared system prompt skips attention", "all prompts compress down to one block", "the decode phase becomes compute-bound"], a: 0, why: "One physical copy of the shared prefix serves every request." },
          { q: "SCENARIO: GPU utilization graphs show sawtooth idle gaps between batches; some users wait for unrelated long generations. The fix:", options: ["continuous batching at token granularity", "tensor parallelism across more GPUs", "configuring a larger maximum batch size", "allowing longer maximum sequence lengths"], a: 0, why: "Static batching's lockstep is the sawtooth; continuous batching erases it." },
          { q: "SCENARIO: Serving a 70B dense model across 2 nodes (8 GPUs each, NVLink within, slow Ethernet between). Sensible layout:", options: ["TP within each node, PP across the nodes", "TP across all 16 GPUs uniformly", "PP within nodes, TP across them", "EP everywhere — it's dense anyway"], a: 0, why: "Match communication patterns to interconnects: chatty TP on NVLink, boundary-only PP on Ethernet." },
        ] },
    ],
    gym: { leader: "Foreman Throughput", badge: "Serving Badge", sprite: "🏛️", taunt: "Tokens per second or perish!",
      questions: [
        { q: "Prefill vs decode bottlenecks:", options: ["compute-bound vs memory-bandwidth-bound", "both phases are strictly compute-bound", "memory-bound vs compute-bound", "both phases are strictly network-bound"], a: 0, why: "Parallel prompt math saturates FLOPs; one-token decode drowns in cache reads." },
        { q: "Speculative decoding accelerates…", options: ["decode, by verifying cheap draft tokens in parallel", "prefill, by skipping prompt processing", "training, by reusing the cached gradients", "tokenization, by caching the BPE merges"], a: 0, why: "Draft model proposes; target model verifies several tokens per pass." },
        { q: "This world and the Attention world meet at:", options: ["KV-cache size as the central serving constraint", "the choice of training-time optimizer", "the size of the tokenizer's vocabulary", "the weight initialization scheme used"], a: 0, why: "Architecture (GQA/MLA/SWA) and systems (paging) attack the same bytes." },
      ] },
  }],
},
{
  id: "w-ae", title: "Autoencoders", emoji: "🪞",
  links: [
    { label: "CNN Explainer (interactive)", url: "https://poloclub.github.io/cnn-explainer/" },
    { label: "Lilian Weng · From AE to VAE", url: "https://lilianweng.github.io/posts/2018-08-12-vae/" },
  ],
  regions: [{
    id: "ae-r", name: "The Bottleneck Mines", emoji: "🪞",
    intro: "Compress to understand; reconstruct to prove it.",
    npc: { name: "Miner Latent", text: "An autoencoder squeezes input through a bottleneck and tries to rebuild it. The bottleneck forces the network to keep only what matters — the latent code IS the learned understanding. Everything in this mine is a variation on what to do with that code." },
    concepts: [
      { id: "vanilla", name: "The Bottleneck", sprite: "⏳",
        lore: "Encoder f: x → z (low-dimensional), decoder g: z → x̂, loss ‖x − x̂‖². With z smaller than x, perfect copying is impossible — the network must learn structure. Uses: dimensionality reduction (nonlinear PCA), denoising (corrupt input, reconstruct clean — forces robust features), and anomaly detection: train on normal data; anomalies reconstruct poorly, so reconstruction error becomes the anomaly score. The latent is deterministic and unstructured — fine for compression, useless for sampling new data.",
        questions: [
          { q: "Why must the bottleneck be smaller (or otherwise constrained) than the input?", options: ["otherwise identity copying learns nothing", "decoders cannot handle equal dimensions", "gradients vanish in wide latents", "the loss is undefined otherwise"], a: 0, why: "Constraint is the teacher — no squeeze, no structure." },
          { q: "Anomaly detection with an AE works because…", options: ["unseen patterns reconstruct with high error", "anomalies have larger latent norms", "the encoder rejects unknown inputs", "the decoder memorizes anomalies"], a: 0, why: "The AE learned 'normal'; anything off-manifold comes back mangled." },
        ] },
      { id: "vae", name: "VAE", sprite: "🎲",
        lore: "The Variational Autoencoder makes the latent a distribution: the encoder outputs μ and σ; z is sampled as z = μ + σ⊙ε (the reparameterization trick — moving randomness to ε ~ N(0,I) so gradients flow through μ, σ). The loss is the ELBO: reconstruction + KL(q(z|x) ‖ N(0,I)). The KL term packs latents into a smooth standard-normal ball, so decoding a random z yields coherent samples — a true generative model. Tension: heavy KL → blurry reconstructions; light KL → broken sampling.",
        questions: [
          { q: "The reparameterization trick exists so that…", options: ["gradients can flow through the sampling step", "the decoder receives discrete latent codes", "KL becomes computable in closed form", "the encoder network needs fewer parameters"], a: 0, why: "z = μ + σ⊙ε makes sampling differentiable w.r.t. μ and σ." },
          { q: "The KL term in the ELBO does what to latent space?", options: ["regularizes it toward a smooth standard normal", "expands it into far higher dimensions", "discretizes it into separated clusters", "removes the latent space entirely"], a: 0, why: "Smooth, centered latents make random sampling decode coherently." },
        ] },
      { id: "vqvae", name: "VQ-VAE", sprite: "🧊",
        lore: "Vector-Quantized VAE makes latents DISCRETE: encoder outputs are snapped to the nearest entry in a learned codebook; the decoder reconstructs from codebook vectors. The straight-through estimator copies gradients past the non-differentiable snap. Why discrete? Tokens! Images become grids of codebook indices that autoregressive transformers (or diffusion) can model — the foundation of modern image/audio tokenization (and the VAE inside latent diffusion is its continuous cousin). Codebook collapse (few codes used) is the classic failure, fought with commitment losses and EMA updates.",
        questions: [
          { q: "VQ-VAE's discrete codes matter because…", options: ["they let sequence models treat images as token grids", "discrete values train faster than continuous", "they eliminate the decoder network entirely", "they require no learned codebook at all"], a: 0, why: "Quantization turns perception into a language transformers speak." },
          { q: "The straight-through estimator handles…", options: ["gradients across the non-differentiable quantization", "the codebook's initial vector assignment", "the decoder's upsampling convolutions", "the KL-term annealing schedule weights"], a: 0, why: "Forward snaps to nearest code; backward pretends it was identity." },
        ] },
    ],
    sides: [
      { id: "ae-s1", name: "Reconstruction Wraith", sprite: "🫥", anchor: 0, recLevel: 2, prereqs: ["vanilla", "vae"],
        desc: "Returns your inputs slightly wrong and grades your diagnosis.",
        questions: [
          { q: "SCENARIO: Detecting anomalous ECG beats with no anomaly labels. The AE recipe:", options: ["train on normal beats; flag high reconstruction error", "train on anomalies; flag low reconstruction error", "train a classifier with random labels", "cluster latents and discard small clusters"], a: 0, why: "Learn normal; let error expose the abnormal — label-free." },
          { q: "SCENARIO: Your VAE samples are coherent but reconstructions look blurry and generic. The dial to examine:", options: ["KL weight", "the learning rate warmup", "batch normalization momentum", "the codebook size"], a: 0, why: "Over-regularized latents lose instance detail — the classic VAE trade-off (β tuning)." },
          { q: "RETENTION: Latent diffusion (from the Diffusion world) runs inside which component from THIS world?", options: ["a VAE's compressed latent space", "a VQ codebook's index grid", "the encoder's gradient buffer", "the anomaly score map"], a: 0, why: "Stable Diffusion = diffusion model living in a VAE latent — the worlds connect." },
        ] },
    ],
    gym: { leader: "Miner Latent", badge: "Latent Badge", sprite: "🏛️", taunt: "Compress me if you can!",
      questions: [
        { q: "AE vs VAE vs VQ-VAE latents:", options: ["deterministic / Gaussian-distributed / discrete codes", "discrete codes / deterministic / Gaussian", "all three are Gaussian-distributed latents", "all three are discrete codebook latents"], a: 0, why: "Point, distribution, codebook index — the family's axis of variation." },
        { q: "Which can natively GENERATE new samples from noise?", options: ["the VAE (decode z ~ N(0,I))", "the vanilla AE", "neither — only GANs generate", "only with a classifier attached"], a: 0, why: "The KL term made N(0,I) meaningful territory for the decoder." },
        { q: "Denoising autoencoders foreshadow which later family?", options: ["diffusion models", "mixture of experts", "contrastive embeddings", "tree search"], a: 0, why: "Corrupt-then-reconstruct, scaled to a full noise schedule, is diffusion." },
      ] },
  }],
},
{
  id: "w-kl", title: "KL Divergence", emoji: "📐",
  links: [
    { label: "3b1b · Neural networks playlist", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi" },
  ],
  regions: [{
    id: "kl-r", name: "The Asymmetry Chasm", emoji: "📐",
    intro: "One formula, two personalities, depending on which side you stand.",
    npc: { name: "Twin Sigma", text: "KL(P‖Q) = Σ P log(P/Q) measures how badly Q models P — in extra nats of surprise. It is NOT symmetric: KL(P‖Q) ≠ KL(Q‖P). Which argument holds your data and which holds your model decides EVERYTHING about how your model fails." },
    concepts: [
      { id: "kldef", name: "The Definition", sprite: "📏",
        lore: "KL(P‖Q) = E_{x~P}[log P(x) − log Q(x)]: the expected extra code length when encoding samples from P using a code optimized for Q. Always ≥ 0, zero iff P = Q. The expectation is taken under the FIRST argument — that's the source of all asymmetry. Where P assigns mass but Q assigns ~zero, the ratio explodes: KL punishes Q's failure to cover P's support catastrophically, but ignores regions where P itself is zero.",
        questions: [
          { q: "KL(P‖Q) explodes when…", options: ["P has mass where Q has nearly none", "Q has mass where P has nearly none", "both distributions are uniform", "P and Q are exactly equal everywhere"], a: 0, why: "log(P/Q) → ∞ under P's expectation when Q fails to cover P." },
          { q: "The expectation in KL(P‖Q) is taken under…", options: ["P, the first argument", "Q, the second argument", "the uniform distribution", "whichever has higher entropy"], a: 0, why: "Samples come from P; Q is the model being graded — hence the asymmetry." },
        ] },
      { id: "fwdkl", name: "Forward KL", sprite: "🫳",
        lore: "Forward KL = KL(data ‖ model): expectation under the DATA. The model must place mass everywhere the data does, or pay infinitely — so it becomes MEAN-SEEKING / mass-covering: faced with a multimodal target it can't fit, it spreads itself across all modes (even covering empty valleys between them). Maximum likelihood training IS forward KL minimization — which is why MLE-trained models (including LLMs under cross-entropy) over-cover: they'd rather hedge over everything plausible than miss a mode.",
        questions: [
          { q: "Minimizing forward KL against a two-peak target with a single Gaussian yields…", options: ["a wide Gaussian straddling both peaks", "a sharp fit to one peak only", "a flat uniform distribution over the range", "a degenerate point mass at the origin"], a: 0, why: "Mass-covering: missing either peak costs infinitely; covering the valley is cheap." },
          { q: "Cross-entropy / MLE training corresponds to…", options: ["minimizing forward KL(data ‖ model)", "minimizing reverse KL(model ‖ data)", "maximizing both KLs jointly", "minimizing Jensen-Shannon only"], a: 0, why: "E_data[−log model] = forward KL + constant entropy term." },
        ] },
      { id: "revkl", name: "Reverse KL", sprite: "🫴",
        lore: "Reverse KL = KL(model ‖ target): expectation under the MODEL. The model only pays for mass IT places — so it's MODE-SEEKING: it locks onto one high-probability mode and confidently ignores the rest (zero-forcing). This is variational inference's choice (VAE's KL term), and crucially it's RLHF's anchor: the penalty KL(π ‖ π_ref) is reverse KL under the policy's own samples — the policy may sharpen within the reference's support but is punished for venturing where the reference assigns little mass. Mode-seeking is exactly the personality you want from an aligned policy.",
        questions: [
          { q: "Reverse KL against a two-peak target with a single Gaussian yields…", options: ["a sharp fit to one peak, ignoring the other", "a wide straddle spanning both peaks", "an exact bimodal copy of the target", "a flat uniform spread across the support"], a: 0, why: "Mode-seeking: it only pays where IT puts mass — pick a peak, commit." },
          { q: "The RLHF penalty KL(π‖π_ref) is reverse KL, which means the policy…", options: ["may sharpen within reference support but not stray outside it", "is forced to cover every reference behavior", "gets pushed toward fully uniform outputs", "simply ignores the reference model entirely"], a: 0, why: "Expectation under π: straying off π_ref's support is what gets punished." },
        ] },
    ],
    sides: [
      { id: "kl-s1", name: "Mode Mirage", sprite: "🏜️", anchor: 1, recLevel: 4, prereqs: ["kldef", "fwdkl", "revkl"],
        desc: "Shimmering distributions; choose your divergence or chase illusions.",
        code: `# forward vs reverse KL between Gaussians (numpy)
import numpy as np
x = np.linspace(-8, 8, 2001); dx = x[1]-x[0]
def g(mu, s): p = np.exp(-(x-mu)**2/(2*s*s)); return p/(p.sum()*dx)
P = 0.5*g(-3,.7) + 0.5*g(3,.7)   # bimodal data
Q = g(0, 3.2)                     # mean-seeking fit
kl_fwd = np.sum(P*np.log((P+1e-12)/(Q+1e-12)))*dx  # small-ish
Q2 = g(3, .7)                     # mode-seeking fit
kl_rev = np.sum(Q2*np.log((Q2+1e-12)/(P+1e-12)))*dx # also small!`,
        codeNote: "Both fits are 'good' — under DIFFERENT divergences. The choice of divergence chooses the failure mode.",
        questions: [
          { q: "SCENARIO: Distilling a big model into a small one and you want the student to commit to the teacher's best behaviors rather than blurrily average all of them. Direction?", options: ["reverse KL(student ‖ teacher)", "forward KL(teacher ‖ student)", "symmetrized JS divergence only", "either — they're equivalent here"], a: 0, why: "Mode-seeking distillation sharpens; forward KL would force covering everything including mediocrity." },
          { q: "SCENARIO: In RLHF, swap the anchor to FORWARD KL(π_ref ‖ π). The new failure you'd expect:", options: ["the policy forced to cover ALL reference behaviors", "the policy collapsing to a single token", "no behavioral change — KL is symmetric", "policy gradients ceasing to flow entirely"], a: 0, why: "Forward KL is mass-covering: π must spread over everything π_ref does." },
          { q: "RETENTION: The VAE's KL(q(z|x) ‖ N(0,I)) is which direction, with which personality?", options: ["reverse-style", "forward-style: the prior must cover q", "symmetric by construction", "not actually a KL divergence"], a: 0, why: "Expectation under q — the encoder posterior nestles inside the prior's support." },
        ] },
    ],
    gym: { leader: "Twin Sigma", badge: "Divergence Badge", sprite: "🏛️", taunt: "Stand on the correct side of the chasm!",
      questions: [
        { q: "KL(P‖Q) vs KL(Q‖P):", options: ["generally unequal", "always equal by definition", "equal only for Gaussians", "negatives of each other"], a: 0, why: "Different expectations, different penalties, different personalities." },
        { q: "Mean-seeking : mode-seeking ::", options: ["forward KL : reverse KL", "reverse KL : forward KL", "MLE : cross-entropy", "prior : posterior"], a: 0, why: "Cover the mass vs commit to a peak." },
        { q: "One sentence that ties this world to the RL world:", options: ["the PPO/GRPO reference penalty is reverse KL", "advantage estimates are KL divergences", "reward magnitudes must always stay symmetric like KL", "GAE secretly computes a forward KL"], a: 0, why: "The anchor that keeps RLHF sane is exactly reverse KL's mode-seeking leash." },
      ] },
  }],
},
{
  id: "w-arch", title: "LLM Architectures", emoji: "🏛️",
  links: [
    { label: "Raschka · LLM Architecture Gallery", url: "https://sebastianraschka.com/llm-architecture-gallery/" },
    { label: "Raschka · Recent Developments (KV sharing, mHC)", url: "https://magazine.sebastianraschka.com/p/recent-developments-in-llm-architectures" },
    { label: "Transformer Explainer (interactive)", url: "https://poloclub.github.io/transformer-explainer/" },
  ],
  regions: [{
    id: "arch-r", name: "The Gallery of Blocks", emoji: "🏛️",
    intro: "Every modern LLM is the same skeleton wearing different efficiency jewelry.",
    npc: { name: "Curator Raschka's Echo", text: "Walk the gallery and you'll see one skeleton everywhere: decoder-only, pre-norm RMSNorm, RoPE, GQA-family attention, SwiGLU FFNs, often MoE. The differences that matter in 2025-26 are almost all about ONE thing: cutting long-context cost — KV sharing, latent compression, sliding windows, attention budgets." },
    concepts: [
      { id: "recipe", name: "The Modern Recipe", sprite: "📜",
        lore: "The post-Llama consensus block: decoder-only transformer; PRE-norm placement with RMSNorm (cheaper than LayerNorm, no mean-centering); RoPE for position; GQA attention; SwiGLU feed-forward (gated: (W₁x ⊙ swish(W_g x))W₂, outperforming plain ReLU/GELU MLPs); no biases; often QK-norm (normalizing queries/keys before attention) for training stability. Departures from GPT-2 — learned absolute positions, post-norm, GELU MLP, dropout — have each been replaced. Newer wrinkles: NoPE in some layers (Llama-4 lineage) and hybrid linear-attention layers (Qwen3-Next-style) for long context.",
        questions: [
          { q: "The modern consensus stack:", options: ["pre-norm RMSNorm + RoPE + GQA + SwiGLU", "post-norm LayerNorm + learned positions + MHA + GELU", "encoder-decoder + sinusoidal + MQA + ReLU", "pre-norm BatchNorm + ALiBi + MLA + GLU"], a: 0, why: "The Llama-era recipe nearly every 2024-26 open model shares." },
          { q: "SwiGLU differs from a plain MLP by…", options: ["a multiplicative learned gate on the hidden activation", "having no nonlinear activation at all", "running inside the attention module instead", "using convolution instead of matmul"], a: 0, why: "The gating (swish branch ⊙ value branch) is the expressivity win." },
        ] },
      { id: "deepseek", name: "The DeepSeek Lineage", sprite: "🐋",
        lore: "DeepSeek's contributions define the efficiency frontier: MLA (latent-compressed KV cache, often beating GQA in quality per ablations), fine-grained MoE with many small routed experts plus a shared expert and auxiliary-loss-free load balancing, and multi-token prediction (MTP) as auxiliary training signal. V3 set the 671B-total/37B-active template; R1 added GRPO-based reasoning RL on top. The 2026 V4 generation pushes further with mHC (manifold-constrained hyper-connections — multiple weighted residual streams replacing the single residual, constrained for stability) and compressed attention for long-context cost.",
        questions: [
          { q: "DeepSeek-V3's headline numbers, 671B total / 37B active, are possible because of…", options: ["fine-grained MoE", "extreme quantization to 2 bits", "weight sharing across all layers", "running on CPU memory"], a: 0, why: "Sparse routing: capacity scales while active compute stays small." },
          { q: "Hyper-connections (mHC) modify which classic component?", options: ["the single residual stream becomes multiple weighted streams", "the tokenizer's learned merge rules", "the attention module's softmax function", "the optimizer's momentum accumulators"], a: 0, why: "Widening the residual highway, with manifold constraints keeping training stable." },
        ] },
      { id: "efficiency", name: "The 2026 Efficiency Wave", sprite: "🌊",
        lore: "As reasoning and agents keep more tokens alive longer, KV-cache cost became THE design driver. Gemma 4: cross-layer KV sharing (later layers reuse earlier layers' KV — E2B shares across ~20 of 35 layers, halving cache, saving ~2.7GB at 128k) plus per-layer embeddings (PLE: cheap per-layer token vectors gated into the residual, boosting capacity without widening the stack — 'effective' 2.3B vs 5.1B total). Laguna XS.2: layer-wise attention budgeting. ZAYA1: compressed convolutional attention. The pattern: spend architecture complexity to buy long-context memory.",
        questions: [
          { q: "Gemma 4's cross-layer KV sharing has later layers…", options: ["reuse earlier layers' KV tensors of matching type", "skip the attention computation entirely", "share only their query projections instead", "recompute KV from scratch each step"], a: 0, why: "Own queries, borrowed KV — sliding layers borrow from sliding, full from full." },
          { q: "Per-layer embeddings (PLE) add capacity via…", options: ["cheap layer-specific token vectors gated into the residual", "doubling every FFN's hidden-layer width", "adding extra attention heads per layer", "attaching a second full transformer stack"], a: 0, why: "Lookup-style parameters instead of expensive stack widening — hence 'effective' size." },
        ] },
    ],
    sides: [
      { id: "arch-s1", name: "Gallery Phantom", sprite: "🖼️", anchor: 1, recLevel: 5, prereqs: ["recipe", "deepseek", "efficiency"],
        desc: "Quizzes you across the whole gallery — this world AND the Attention world.",
        questions: [
          { q: "SCENARIO: Designing a 4B on-device model for 128k-context agent traces. Which gallery tricks compose naturally?", options: ["GQA/MQA + sliding-window 4:1 + cross-layer KV sharing", "MHA + learned positions + post-norm", "a dense FFN simply scaled 8× wider", "encoder-decoder with cross-attention"], a: 0, why: "Exactly the Gemma-4-E recipe: every choice attacks cache or parameter cost." },
          { q: "SCENARIO: An architecture review claims 'MoE saves memory at batch-1 on-device'. Your correction:", options: ["MoE saves FLOPs; ALL experts still occupy memory", "MoE saves memory and FLOPs equally", "MoE increases FLOPs but saves memory", "the claim is fully correct as stated"], a: 0, why: "MoE-world retention: memory scales with total params — batch-1 local is MoE's weak spot." },
          { q: "RETENTION: MLA, GQA, sliding window, cross-layer sharing, compressed attention — the single sentence uniting them:", options: ["different attacks on the same enemy", "ways to grow the vocabulary", "alternatives to backpropagation", "methods to remove the FFN"], a: 0, why: "The curator's thesis — the 2025-26 architecture story is long-context economics." },
        ] },
    ],
    gym: { leader: "The Curator", badge: "Architecture Badge", sprite: "🏛️", taunt: "Name every block in my gallery!",
      questions: [
        { q: "Why did RMSNorm displace LayerNorm?", options: ["cheaper (no mean-centering) with equal quality", "it adds extra trainable bias vectors", "it normalizes across the batch dimension", "it removes the need for residuals"], a: 0, why: "Scale-only normalization: fewer ops, same stability in practice." },
        { q: "QK-norm addresses…", options: ["attention-logit explosions for training stability", "the size of the KV cache at inference", "tokenizer vocabulary fragmentation", "MoE expert load-balancing pressure"], a: 0, why: "Normalizing q,k before the dot product tames logit growth in deep/long training." },
        { q: "The honest summary of 2024→2026 architecture change:", options: ["evolution of one skeleton, driven by long-context efficiency", "a revolution replacing attention entirely", "a wholesale return to recurrent networks", "convergence on encoder-decoder designs"], a: 0, why: "Same bones, relentless KV-cache and capacity-per-FLOP refinement." },
      ] },
  }],
},
];


/* ============================================================
   WORLD MODELS REGION — Dreamer, JEPA family, LeJEPA
   ============================================================ */
const WM_REGION = {
  id: "wm-r", name: "The Imagination Engine", emoji: "🛰️",
  intro: "Models that predict the world — in latent space, not pixels.",
  npc: { name: "Dreamer Prime", text: "A world model learns the environment's dynamics so the agent can plan in imagination. The modern argument, from Dreamer to JEPA: predict in REPRESENTATION space. Pixels are full of unpredictable detail that wastes capacity; abstractions are what planning actually needs." },
  concepts: [
    { id: "latentwm", name: "Latent World Models", sprite: "💭",
      lore: "The Dreamer lineage: learn a compact latent state from observations, a transition model predicting the next latent given action, and reward/value heads — then train the policy almost entirely inside imagined latent rollouts, touching the real environment only to collect fresh data. Wins: enormous sample-efficiency (real steps are expensive; imagined ones are a matmul), planning via model-predictive control, and transfer. Risk: the policy exploits model errors — imagination diverges from reality, so rollouts are kept short and the model is continually corrected.",
      questions: [
        { q: "Training the policy 'in imagination' means…", options: ["backprop through pixels of real frames", "gradient steps on imagined latent rollouts", "replaying stored real episodes only", "querying a human simulator each step"], a: 1, why: "Latent rollouts from the learned dynamics are the training ground; reality just supplies corrections." },
        { q: "Why keep imagined rollouts SHORT?", options: ["GPU memory limits rollout length", "model error compounds with each step", "rewards are undefined past 15 steps", "long rollouts break the encoder"], a: 1, why: "Each imagined step adds model error; the policy would learn to exploit the divergence." },
        { q: "The sample-efficiency claim rests on…", options: ["imagined steps costing far less than real ones", "world models removing exploration", "latents requiring no training data", "rewards becoming denser in latents"], a: 0, why: "Real interaction is the scarce resource; imagination converts compute into experience." },
      ] },
    { id: "jepa", name: "The JEPA Family", sprite: "🧿",
      lore: "Joint-Embedding Predictive Architecture (LeCun): mask part of the input, then predict the MISSING part's representation from the visible part's representation — never reconstructing pixels. An encoder embeds context, a predictor guesses target embeddings produced by a target encoder. Why not pixels? Generative reconstruction wastes capacity modeling unpredictable detail (leaf positions, sensor noise). The danger is COLLAPSE: encoders can cheat by outputting constants, making prediction trivial — historically held off by heuristics (EMA target encoders, stop-gradient). I-JEPA does this for image regions; V-JEPA for video; V-JEPA 2 (2025) scales video pretraining and adds an action-conditioned variant enabling zero-shot robot planning.",
      questions: [
        { q: "JEPA predicts…", options: ["the raw pixels of masked regions", "representations of the missing content", "class labels for each image patch", "the next token in a caption"], a: 1, why: "Prediction happens in embedding space — the defining departure from generative reconstruction." },
        { q: "Representation collapse means…", options: ["the predictor overfits the targets", "training loss oscillates without bound", "embeddings degenerate to constants, making prediction trivial", "the encoder forgets early layers"], a: 2, why: "If everything maps to the same vector, the prediction task is 'solved' and nothing useful is learned." },
        { q: "V-JEPA 2's action-conditioned variant matters because…", options: ["it renders photorealistic video", "predicting consequences of actions enables planning", "it removes the need for any encoder", "it labels video frames automatically"], a: 1, why: "A world model that answers 'what if I do X' is exactly what zero-shot robot planning needs." },
      ] },
    { id: "lejepa", name: "LeJEPA & SIGReg", sprite: "🧮",
      lore: "LeJEPA (Balestriero & LeCun, late 2025) replaces JEPA's anti-collapse heuristics with theory. Result one: the optimal distribution for JEPA embeddings is an isotropic Gaussian — it provably minimizes worst-case downstream risk. Result two: SIGReg (Sketched Isotropic Gaussian Regularization) enforces it cheaply, by testing many random 1-D projections of the embeddings against a Gaussian. Consequences: no stop-gradient, no EMA teacher network, no whitening tricks; a single trade-off hyperparameter; a core implementable in ~50 lines; and a training loss that actually correlates with downstream performance — so you can monitor pretraining without constant probing.",
      questions: [
        { q: "LeJEPA's claimed optimal embedding distribution:", options: ["an isotropic Gaussian", "a uniform hypersphere shell", "a sparse Laplacian mixture", "a learned codebook prior"], a: 0, why: "The paper's theoretical anchor: isotropic Gaussian minimizes worst-case downstream risk." },
        { q: "SIGReg checks Gaussianity via…", options: ["full covariance matrix inversion", "random 1-D projections tested statistically", "training a discriminator network", "counting embedding clusters"], a: 1, why: "Sketching: many cheap 1-D tests stand in for an intractable high-dim test." },
        { q: "Which heuristic does LeJEPA make UNNECESSARY?", options: ["minibatch gradient descent", "data augmentation pipelines", "the EMA teacher / stop-gradient pair", "any positional encoding"], a: 2, why: "SIGReg prevents collapse by construction, retiring the heuristic scaffolding." },
      ] },
  ],
  sides: [
    { id: "wm-s1", name: "Mirage of Acronyms", sprite: "🃏", anchor: 1, recLevel: 4, prereqs: ["latentwm", "jepa", "lejepa"],
      desc: "A trickster that shuffles lookalike acronyms and watches you grab the wrong one.",
      questions: [
        { q: "SCENARIO: A teammate cites 'GEPA' as the newest JEPA variant for your vision stack. Your correction:", options: ["GEPA is JEPA's GAN-based cousin", "GEPA is a reflective prompt-evolution optimizer (DSPy), not a world model", "GEPA is V-JEPA 2's robot module", "they're right — GEPA extends I-JEPA"], a: 1, why: "Genetic-Pareto prompt optimization lives in the DSPy world — same letters, different universe. (See the DSPy kata.)" },
        { q: "SCENARIO: A robotics team needs to predict camera futures for planning. Pixel-level video prediction keeps burning capacity on texture noise the planner never uses. The JEPA-aligned move:", options: ["higher-resolution pixel reconstruction", "predict future states in representation space", "add a GAN loss for sharper frames", "predict raw audio instead of video"], a: 1, why: "Abstract away the unpredictable detail; plan over latents — the family's core thesis." },
        { q: "SCENARIO: Mid-pretraining, every embedding's cosine similarity approaches 1.0 and loss plummets. Diagnosis and the LeJEPA-era fix:", options: ["overfitting / add dropout layers", "collapse / SIGReg-style distributional regularization", "underfitting / enlarge the predictor", "data leakage / reshuffle the dataset"], a: 1, why: "Trivially happy loss + identical embeddings = collapse; regularize the embedding distribution." },
      ] },
  ],
  gym: { leader: "Dreamer Prime", badge: "World Model Badge", sprite: "🏛️", taunt: "Imagine the future — correctly!",
    questions: [
      { q: "The shared thesis from Dreamer through JEPA:", options: ["plan and predict in abstract latent space", "always reconstruct at pixel fidelity", "replace learning with retrieval", "world models need no encoders"], a: 0, why: "Representation-space prediction is the through-line of the whole region." },
      { q: "Generative reconstruction vs JEPA — the capacity argument:", options: ["reconstruction wastes capacity on unpredictable detail", "JEPA models need 10× more parameters", "reconstruction cannot use transformers", "JEPA requires labeled data"], a: 0, why: "Leaf positions and sensor noise aren't worth modeling; abstractions are." },
      { q: "RETENTION (RL world): a world model gives an agent…", options: ["denser external rewards", "planning via internal rollouts before acting", "a larger context window", "guaranteed pass^k reliability"], a: 1, why: "The Citadel's memory node, now with its own region: imagination as cheap exploration." },
    ] },
};

/* ============================================================
   INFERENCE SPLIT — two regions + new concepts
   ============================================================ */
const _INF = ATLAS.find((w) => w.id === "w-infer").regions[0];
const QUANT_CONCEPT = {
  id: "quant", name: "Quantization", sprite: "🪙",
  lore: "Squeeze precision, keep quality. Weight-only quantization (INT8/INT4 via GPTQ, AWQ) shrinks the model and — because decode is memory-bandwidth-bound — directly speeds token generation: fewer bytes moved per step. KV-cache quantization (e.g., FP8) attacks the other big memory consumer, multiplying how many concurrent contexts fit. Activation quantization is hardest (outlier channels). The cliffs: quality degrades non-uniformly — small models and long reasoning chains suffer first, so evaluate on YOUR workload, not just perplexity.",
  questions: [
    { q: "Why does weight quantization speed up DECODE specifically?", options: ["it reduces the FLOPs of attention", "decode is bandwidth-bound; fewer bytes per step", "it shortens the generated sequences", "it removes the softmax entirely"], a: 1, why: "Decode drowns in memory traffic; halving bytes ≈ faster steps." },
    { q: "KV-cache quantization (FP8) primarily buys…", options: ["more concurrent contexts in the same memory", "better tokenizer compression rates", "higher training throughput", "smaller model checkpoints on disk"], a: 0, why: "The cache is the concurrency cap; cheaper bytes per token = more users." },
    { q: "The honest evaluation rule for quantization:", options: ["perplexity alone certifies quality", "test on your workload; degradation is non-uniform", "INT4 is always safe above 7B", "quantize activations before weights"], a: 1, why: "Long reasoning and small models hit quality cliffs that average perplexity hides." },
  ] };
const SPECDEC_CONCEPT = {
  id: "specdec", name: "Speculative Decoding", sprite: "🐇",
  lore: "Decode's tragedy: one token per expensive forward pass. Speculative decoding drafts K tokens with a cheap model (or self-drafting heads like Medusa/EAGLE), then the big model verifies all K in ONE parallel pass — accepting the longest correct prefix via rejection sampling that provably preserves the target distribution. Speedup ≈ acceptance rate × draft length: predictable text (code, boilerplate) accepts long runs; creative text accepts less. Costs: draft compute, and complexity in batching verify steps.",
  questions: [
    { q: "The verification pass accepts…", options: ["the longest prefix matching the target distribution", "all K draft tokens unconditionally", "exactly one token per round", "tokens with draft probability > 0.5"], a: 0, why: "Rejection sampling keeps outputs exactly distributed as the big model alone." },
    { q: "Speculative decoding shines most on…", options: ["highly predictable text like code", "maximum-temperature creative sampling", "single-token classification tasks", "the prefill phase of long prompts"], a: 0, why: "High acceptance rates → long accepted runs → big effective speedups." },
    { q: "Output quality under speculative decoding is…", options: ["identical in distribution to the target model", "slightly worse, traded for speed", "better — two models ensemble", "nondeterministic and unbounded"], a: 0, why: "That's the point of the acceptance rule: lossless acceleration." },
  ] };
const DISAGG_CONCEPT = {
  id: "disagg", name: "Prefill/Decode Disaggregation", sprite: "🔀",
  lore: "Prefill and decode want different hardware behavior: prefill is a compute-hungry burst; decode is a steady bandwidth drip. Co-locating them makes long prompts stall everyone's token streams (head-of-line blocking). Disaggregated serving runs prefill on one worker pool, ships the resulting KV cache to a decode pool, and scales each independently — smoothing latency at the cost of cache-transfer bandwidth and orchestration complexity. The same logic motivates chunked prefill: slice big prompts so decode steps interleave.",
  questions: [
    { q: "Disaggregation separates prefill and decode because…", options: ["they bottleneck on different resources", "decode cannot run on modern GPUs", "prefill needs no KV cache", "attention differs mathematically between them"], a: 0, why: "Compute-burst vs bandwidth-drip: separate pools let each scale to its own bottleneck." },
    { q: "Its characteristic new cost:", options: ["transferring KV caches between pools", "recomputing the prompt on decode nodes", "doubled model weights per request", "losing the ability to batch"], a: 0, why: "The cache must travel from prefill workers to decode workers — bandwidth and plumbing." },
    { q: "Chunked prefill exists to…", options: ["interleave decode steps during long prompt processing", "compress prompts before encoding", "skip attention for early chunks", "quantize the prompt tokens"], a: 0, why: "Slicing the burst prevents head-of-line blocking of everyone's token streams." },
  ] };
const CAPACITY_CONCEPT = {
  id: "capacity", name: "Capacity Planning", sprite: "📐",
  lore: "Production serving (the vLLM zero-to-hero recipe) is napkin math plus load tests. Memory budget: usable KV pool ≈ GPU_mem × gpu-memory-utilization (typically 0.85–0.95) − model weights. Per-request footprint ≈ context_len × bytes-per-token (the cache formula from the KV vault). Concurrency ceiling ≈ pool ÷ per-request footprint — which is why max-model-len is a capacity knob, not just a feature flag: doubling allowed context halves concurrent users. The three metrics that matter: TTFT (time to first token — prefill latency), TPOT/ITL (time per output token — decode pace), and total throughput (tokens/sec across all requests). Knobs: gpu-memory-utilization (too low wastes VRAM, too high risks OOM), max-num-seqs (in-flight ceiling), tensor-parallel-size for models that don't fit. The classic sin: tuning to a synthetic benchmark instead of your real traffic's prompt/output length mix.",
  questions: [
    { q: "Doubling max-model-len on a fixed GPU roughly does what to max concurrency?", options: ["halves it — per-request KV footprint doubles", "leaves it unchanged — context is free", "doubles it — longer sequences batch better", "quarters it — footprint grows quadratically"], a: 0, why: "Footprint scales linearly with allowed context; the pool is fixed, so users trade off against length." },
    { q: "TTFT and TPOT respectively measure…", options: ["prefill latency and per-token decode pace", "throughput and total request latency", "queue depth and batch size", "cache hit rate and eviction rate"], a: 0, why: "First token = prompt processing speed; each subsequent token = decode cadence. They bottleneck differently." },
    { q: "Setting gpu-memory-utilization to 0.99 risks ___, while 0.60 causes ___:", options: ["OOM crashes / wasted VRAM and smaller batches", "slow prefill / faster decode", "dtype errors / fragmentation", "nothing / nothing — it's cosmetic"], a: 0, why: "Headroom protects against spikes; unused VRAM is concurrency left on the table." },
    { q: "Why is benchmarking with uniform 100-token prompts a capacity-planning trap?", options: ["real traffic's length mix shifts prefill/decode balance and KV pressure", "benchmarks cannot saturate a GPU", "vLLM disables batching for benchmarks", "short prompts disable PagedAttention"], a: 0, why: "Config tuned to synthetic shapes misallocates memory and scheduling for the traffic you actually get." },
  ] };

const INF_REGION_A = {
  id: "inf-cache", name: "The Cache Vaults", emoji: "📦",
  intro: "Memory is the currency of serving. Spend it well.",
  npc: _INF.npc,
  concepts: [_INF.concepts[0], _INF.concepts[1], QUANT_CONCEPT, CAPACITY_CONCEPT],
  sides: [_INF.sides[0]],
  gym: { leader: "Vault Keeper", badge: "Cache Badge", sprite: "🏛️", taunt: "Account for every byte!",
    questions: [
      { q: "Concurrency in long-context serving is capped by…", options: ["the KV-cache memory pool", "the tokenizer's throughput", "disk read bandwidth", "the optimizer state size"], a: 0, why: "Decode is memory-bound; cache bytes are the scarce resource." },
      { q: "PagedAttention + prefix sharing together attack…", options: ["fragmentation and duplicated prompt storage", "the FLOPs of the attention kernel", "tokenization latency", "gradient memory during training"], a: 0, why: "Blocks kill internal fragmentation; copy-on-write kills prompt duplication." },
      { q: "Cheapest first lever to double concurrent users on fixed hardware:", options: ["KV-cache quantization to FP8", "switching to a bigger model", "doubling max sequence length", "disabling continuous batching"], a: 0, why: "Halve cache bytes per token, roughly double resident contexts — no retraining." },
    ] },
};
const INF_REGION_B = {
  id: "inf-flow", name: "The Throughput Works", emoji: "🏭",
  intro: "Where parallelism, drafts, and scheduling mint tokens per second.",
  npc: { name: "Foreman Throughput", text: "Three throughput machines: parallelism spreads the model, speculative decoding compresses decode steps, and disaggregation lets prefill and decode each scale to their own bottleneck. Compose them; don't worship any one." },
  concepts: [_INF.concepts[2], SPECDEC_CONCEPT, DISAGG_CONCEPT],
  sides: [
    { id: "inf-s2", name: "Pipeline Poltergeist", sprite: "👾", anchor: 1, recLevel: 5, prereqs: ["parallel", "specdec", "disagg"],
      desc: "Haunts your p99 latency graphs. Exorcise it with systems judgment.",
      questions: [
        { q: "SCENARIO: Speculative decoding's measured speedup collapsed after you switched traffic from code completion to creative fiction. Why?", options: ["acceptance rate fell — drafts miss unpredictable text", "the draft model's cache overflowed", "fiction tokens are longer in bytes", "verification cannot batch fiction"], a: 0, why: "Speedup ≈ acceptance × draft length; high-entropy text rejects drafts." },
        { q: "SCENARIO: p99 time-to-first-token spikes whenever 100k-token documents arrive, stalling everyone's streams. Two structural fixes:", options: ["chunked prefill or prefill/decode disaggregation", "longer max_tokens and bigger batches", "INT4 weights and a louder autoscaler", "more KV blocks and fewer users"], a: 0, why: "Both break the head-of-line burst: slice it, or move it to its own pool." },
        { q: "RETENTION: TP across slow Ethernet between nodes failed (Cache Vaults lesson). The matching principle here:", options: ["match each parallelism's traffic to its interconnect", "TP always beats PP regardless of fabric", "disaggregation removes networking entirely", "speculative decoding replaces parallelism"], a: 0, why: "Chatty all-reduce stays on NVLink; boundary-only PP crosses nodes; cache transfers need provisioned bandwidth." },
      ] },
  ],
  gym: { leader: "Foreman Throughput", badge: "Throughput Badge", sprite: "🏛️", taunt: "Tokens per second or perish!",
    questions: [
      { q: "Prefill vs decode bottlenecks:", options: ["compute-bound vs memory-bandwidth-bound", "both strictly compute-bound", "bandwidth-bound vs compute-bound", "both strictly network-bound"], a: 0, why: "Parallel prompt math saturates FLOPs; one-token decode drowns in cache reads." },
      { q: "Speculative decoding leaves output distribution…", options: ["exactly equal to the target model's", "biased toward the draft model", "sharper than either model", "dependent on batch size"], a: 0, why: "The acceptance rule guarantees losslessness." },
      { q: "A 70B dense model, 2 nodes, NVLink inside, Ethernet between:", options: ["TP within nodes, PP across them", "TP across all 16 GPUs", "PP within nodes, TP across", "expert parallelism everywhere"], a: 0, why: "Match communication to interconnect — the region's law." },
    ] },
};

/* ============================================================
   UMBRELLA WORLDS — pooled regions per category
   ============================================================ */
const ENV_REGION = {
  id: "env-r", name: "The Env Foundry", emoji: "🧫",
  intro: "Where training grounds themselves are built, debugged, and scaled.",
  npc: { name: "The Env Smith", text: "In the LLM era an environment is not just a simulator — it is a bundle: Tasks, a Harness, a Verifier (reward), State, and Config. The policy is only ever as good as the arena you forge for it. And heed the oldest law of this foundry: READ YOUR TRAJECTORIES." },
  concepts: [
    { id: "envanatomy", name: "Anatomy of an Env", sprite: "🧬",
      lore: "A complete LLM-RL environment bundles five things: E = {Tasks, Harness, Verifier, State, Config}. TASKS: the dataset of inputs — bundled WITH the env because a coding task means nothing outside a coding sandbox. HARNESS: how the model plugs in — chat template, tool schemas, turn loop. VERIFIER: the reward function scoring outputs. STATE: what persists across turns (files, a Wordle board, a desktop). CONFIG: knobs like max turns and tool budgets. The interaction contract is still Gym's: reset() → observation; step(action) → (observation, reward, terminated). Single-turn envs end after one response; multi-turn envs (a Jupyter agent, computer use) loop tools and observations until termination — and everything from the Tool-Calling Forest applies inside them.",
      questions: [
        { q: "Why are tasks bundled INSIDE the environment rather than kept separate?", options: ["tasks are only meaningful with their env's tools and state", "datasets are too large to store separately", "the Gym API requires it since v1.0", "rewards cannot reference external data"], a: 0, why: "A coding task belongs to a coding sandbox — task and arena are inseparable." },
        { q: "The five-piece bundle of a modern LLM env:", options: ["tasks, harness, verifier, state, config", "model, optimizer, scheduler, loss, data", "prompt, response, reward, critic, judge", "reset, step, render, seed, close"], a: 0, why: "E = {T, H, V, S, C} — the taxonomy that survives across frameworks." },
        { q: "step(action) returns…", options: ["observation, reward, and termination signal", "the next task in the dataset", "the updated model weights", "a new environment instance"], a: 0, why: "The Gym contract: act, observe consequence, learn whether the episode continues." },
      ] },
    { id: "verifrewards", name: "Verifiable Rewards", sprite: "✅",
      lore: "The foundry's first commandment: verifiable beats judgeable. Programmatic checks — string match, unit tests, code execution, terminal-state validation functions — are faster, cheaper, more consistent, and far harder to charm than an LLM-as-judge; use judges when there is no other option, not as the default. Independent of TYPE is GRANULARITY: trajectory-level (did the final output pass?), turn-level (was each tool call useful? — enabling credit like 'the bad search query was turn 23, not the whole episode'), or per-step process rewards. Partial credit is the antidote to sparsity: an env where every rollout scores 0.0 gives GRPO literally nothing to learn from.",
      questions: [
        { q: "'Verifiable beats judgeable' argues for…", options: ["programmatic checks as the default reward source", "always using the strongest LLM judge", "human labels on every rollout", "removing rewards entirely"], a: 0, why: "Code execution and exact checks are cheap, consistent, and resistant to persuasion." },
        { q: "Turn-level reward granularity buys you…", options: ["credit assignment to the specific failing step", "smaller models at inference", "shorter episodes by design", "freedom from any verifier"], a: 0, why: "Localize the bad tool call instead of condemning the whole trajectory — Foundry-region thinking, applied to envs." },
        { q: "Every rollout in your new env returns exactly 0.0 reward. For GRPO this means…", options: ["zero advantage everywhere — no learning signal at all", "faster convergence from clean signal", "the critic compensates automatically", "exploration increases to find reward"], a: 0, why: "Group-relative advantages need variance; identical scores normalize to nothing." },
      ] },
    { id: "envdebug", name: "Debugging & Scaling", sprite: "🔬",
      lore: "Before any training run: execute ONE rollout and read the trajectory by hand. Did the model see what you expected? Did tool returns make sense? Did the reward fire correctly? If a human can't read a trajectory and tell whether the model did well, neither can a reward function — and the biggest env-design mistakes are caught by reading 5 trajectories, not by 1000 training steps. The failure taxonomy: reward too SPARSE (all zeros → add partial credit or easier tasks), reward too LEAKY (shortcuts score well — read trajectories, hunt the exploit), tasks too EASY (solved in one tool call → no multi-turn signal), tools too POWERFUL (one tool does everything → no exploration). Scaling: frameworks (OpenEnv, Verifiers, SkyRL Gym, NeMo Gym, GEM) are dialects of the same anatomy, and envs are scaled by programmatic synthesis — generate scenarios plus terminal-state validation functions whose pass-rate IS the reward.",
      questions: [
        { q: "The guide's highest-leverage debugging act:", options: ["reading a handful of rollout trajectories by hand", "running 1000 training steps and watching loss", "doubling the learning rate to expose bugs", "adding a second reward model"], a: 0, why: "Five read trajectories catch what a thousand training steps hide." },
        { q: "An agent scores well but its behavior won't generalize. The taxonomy names this…", options: ["leaky reward — the env permits shortcuts", "sparse reward — no signal exists", "task bundling failure", "harness misconfiguration"], a: 0, why: "Reward fires for the wrong thing; trajectories reveal the exploit." },
        { q: "'One tool can solve everything' is a design smell because…", options: ["exploration and multi-step skill never develop", "tool calls become too expensive", "the verifier cannot score tools", "config files grow too large"], a: 0, why: "All-powerful tools collapse the decision space — nothing left to learn." },
      ] },
  ],
  sides: [
    { id: "env-s1", name: "Trajectory Gremlin", sprite: "🐛", anchor: 1, recLevel: 7, prereqs: ["envanatomy", "verifrewards", "envdebug"],
      desc: "Lives inside unread rollouts. Feeds on training runs launched without a smoke test.",
      code: `# a minimal verifiable env (Verifiers-style sketch)
class WordleEnv:
    def reset(self, task):
        self.secret, self.turns = task["word"], 0
        return {"prompt": "Guess the 5-letter word."}
    def step(self, guess):
        self.turns += 1
        fb = grade(guess, self.secret)   # greens/yellows
        done = guess == self.secret or self.turns >= 6
        # partial credit fights sparsity:
        r = 1.0 if guess == self.secret else 0.1 * fb.greens
        return {"feedback": fb}, r, done`,
      codeNote: "Note the 0.1×greens term — without it, GRPO sees all-zero groups until the first lucky solve.",
      questions: [
        { q: "SCENARIO: Your math env rewards 1.0 only on exact final answers; the 7B model never solves any. Training is flat. The foundry's fix:", options: ["partial credit (steps, formats) or easier task tiers first", "a 10× larger group size in GRPO", "switching the judge to a bigger model", "longer episodes with more retries"], a: 0, why: "Sparse-to-the-point-of-silent reward starves learning; shape a gradient of progress." },
        { q: "SCENARIO: In the env above, a model learns to guess 'AROSE' every turn 1 regardless of task, scoring steady 0.2s. What failure, what response?", options: ["leaky reward — read trajectories, cap repeated-guess credit", "sparse reward — raise the green bonus", "task too hard — shrink the word list", "harness bug — fix the chat template"], a: 0, why: "Partial credit leaked into a degenerate strategy; trajectory reading catches it in minutes." },
        { q: "RETENTION: 'Plan adheres to clinical protocol' (Foundry region) vs 'unit tests pass' — by THIS region's commandment, which is the default-preferred reward and why?", options: ["unit tests — programmatic verification beats judge scoring", "the protocol judge — nuance always wins", "both equally — type doesn't matter", "neither — only human labels count"], a: 0, why: "Verifiable beats judgeable; reserve judges for what code cannot check." },
      ] },
  ],
  gym: { leader: "The Env Smith", badge: "Env Foundry Badge", sprite: "🏛️", taunt: "Forge an arena worthy of a policy!",
    questions: [
      { q: "The training loop through an env, in order:", options: ["reset → model acts via harness → verifier scores → update", "verify → reset → score → act", "act → reset → update → observe", "score → act → terminate → reset"], a: 0, why: "Arena up, policy acts, verifier judges, gradients flow." },
      { q: "Which pairing is WRONG?", options: ["sparse reward — model finds shortcuts", "leaky reward — ungeneralizable behavior scores well", "tasks too easy — no multi-turn signal", "tools too powerful — no exploration pressure"], a: 0, why: "Sparse reward means NO signal (all zeros); shortcuts are the LEAKY failure." },
      { q: "Scaling to thousands of envs leans on…", options: ["programmatic scenario synthesis with validation-function rewards", "manually authoring each environment", "removing verifiers for speed", "one mega-environment with every tool"], a: 0, why: "Generate scenarios + terminal-state checks; pass-rate becomes reward — envs become data." },
      { q: "This region powers a feature of THIS app: the Wilds generates fresh grounded questions per episode. In env terms, the lore is the ___ and the answer-check is the ___:", options: ["task material — verifier", "harness — config", "policy — critic", "optimizer — scheduler"], a: 0, why: "You're inside an RL environment over knowledge: grounded tasks, verifiable answers, adaptive targeting." },
    ] },
};


const SECURITY_AI_REGION = {
  id: "agentic-workflows-r", name: "Agentic Workflows", emoji: "🛡️",
  intro: "Post-train and orchestrate agents, then prove their workflows work on real tasks.",
  npc: { name: "SOC Research Lead", text: "Security agents need more than clever prompts: post-training, tool workflows, planning research, eval rigor, inference discipline, and production collaboration all have to line up before an analyst can trust them." },
  concepts: [
    { id: "sec-posttrain", name: "Post-train for Security", sprite: "🎯", lore: "Post-training turns a general model into a reliable security operator. SFT teaches procedure traces: triage steps, tool syntax, report formats, and analyst etiquette. RLHF/RLAIF, PPO/GRPO/DPO, and reward modeling then optimize outcomes: correct classification, lower false positives, valid tool use, calibrated escalation, and evidence-backed writeups. Security is unforgiving because a plausible answer is not enough — the agent must improve measured reliability on real tasks like alert triage, vuln analysis, detection engineering, and incident summarization.", questions: [
      { q: "In security-agent post-training, SFT mainly teaches…", options: ["procedure traces and valid formats", "the reward model's scalar preferences", "GPU scheduling policy", "database indexing strategy"], a: 0, why: "SFT clones analyst demonstrations: steps, schemas, and report style." },
      { q: "Why add RL-style training after SFT?", options: ["to optimize consequences like accuracy, tool cost, and escalation quality", "to remove all need for evals", "to make prompts shorter only", "to avoid reward models entirely"], a: 0, why: "RL optimizes outcomes that demonstrations alone cannot price." }
    ] },
    { id: "sec-workflows", name: "Agent Workflows", sprite: "🧰", lore: "Security work is naturally tool-rich: search logs, query SIEM, inspect endpoints, retrieve runbooks, call scanners, summarize evidence, and route cases. Agents become useful when they are composed into workflows: planning and reasoning loops decide what to inspect, function calling executes tools with typed arguments, retrieval/memory brings in detections and prior incidents, and orchestrators coordinate specialists. The danger is lossy handoff — keep evidence as structured artifacts, not vague prose.", questions: [
      { q: "A security agent workflow should preserve evidence by…", options: ["passing structured artifacts across steps", "summarizing everything into vibes", "dropping tool outputs after every call", "hiding citations until final answer"], a: 0, why: "Structured evidence keeps later decisions auditable." },
      { q: "Retrieval and memory primarily help by…", options: ["bringing runbooks, detections, and prior incidents into context", "guaranteeing the model never hallucinates", "replacing all tools", "forcing single-turn answers"], a: 0, why: "They ground the agent in local operational knowledge." }
    ] },
    { id: "sec-planning", name: "Planning Research", sprite: "🧭", lore: "Agentic planning is still a research frontier. You prototype literature methods — ReAct-style tool reasoning, tree/search variants, reflection, evaluator-optimizer loops, plan-and-execute, memory-augmented agents, and multi-agent decomposition — then test whether they beat simpler baselines. The rule: new planning methods must earn their complexity with trajectory evidence, not demos that merely look impressive.", questions: [
      { q: "When should a new agentic planning method survive?", options: ["when trajectory evidence beats simpler baselines", "when it uses the most agents", "when the prompt is longest", "when it avoids measurement"], a: 0, why: "Complexity must buy measurable reliability." },
      { q: "Evaluator-optimizer loops are useful when…", options: ["a draft can be critiqued against objective criteria", "there is no way to score outputs", "all tasks are one-token answers", "tools are forbidden"], a: 0, why: "A critic guides revision when quality criteria are visible." }
    ] },
    { id: "sec-evals", name: "Evals with Rigor", sprite: "📊", lore: "Agentic systems need objective benchmarks: held-out task suites, adversarial cases, LLM-as-judge pipelines with calibration, trajectory-level metrics, confidence intervals, bootstrap tests, and regression gates. Measure more than final accuracy: tool-call validity, evidence coverage, cost, latency, escalation precision, recovery after errors, and step-level credit. Statistical rigor matters because tiny demo sets lie; variance and judge bias can make a worse system look better.", questions: [
      { q: "Trajectory-level metrics catch failures that final accuracy misses, such as…", options: ["bad tool calls and unsupported evidence", "CSS color choices", "model card typography", "package-lock size"], a: 0, why: "The path matters in agent reliability." },
      { q: "Why use confidence intervals / bootstrap tests?", options: ["to avoid over-trusting noisy eval differences", "to make the app slower", "to replace test cases", "to hide judge bias"], a: 0, why: "Statistical uncertainty decides whether a gain is real." }
    ] },
    { id: "sec-inference", name: "Prompt & Inference Optimization", sprite: "⚡", lore: "Getting more out of every model means systematic prompt and inference work: task decomposition, tool schemas, few-shot examples, retrieval formatting, temperature/top-p choices, response budgets, caching, batching, model routing, distillation, and fallback paths. In production security contexts, optimization is not just cheaper tokens; it is consistent outputs, bounded latency, reproducible tool calls, and graceful degradation when a model or API fails.", questions: [
      { q: "Inference optimization for security agents should optimize…", options: ["quality, latency, cost, and graceful failure", "only the prettiness of prose", "only maximum temperature", "only number of agents"], a: 0, why: "Operational systems balance multiple constraints." },
      { q: "A good tool schema improves reliability because it…", options: ["constrains arguments into typed, checkable fields", "makes all results true", "removes need for auth", "forces longer reasoning"], a: 0, why: "Typed calls are easier to validate and reward." }
    ] },
    { id: "sec-production", name: "Research to Production", sprite: "🤝", lore: "Research prototypes become useful only through coordination. Engineering hardens interfaces, observability, deployment, and rollback. Data Science owns measurement, datasets, and statistical validity. Managed Services knows analyst workflows, customer constraints, and failure modes. The AI researcher helps track the field, define research bets, prioritize experiments, and translate promising prototypes into production candidates with clear acceptance criteria.", questions: [
      { q: "Why involve Managed Services in a security-agent prototype?", options: ["they know real analyst workflows and failure modes", "they replace evals", "they remove engineering work", "they guarantee the model is correct"], a: 0, why: "Domain operations expose what real users need." },
      { q: "A research area should be prioritized when it has…", options: ["clear user value, measurable criteria, and feasible path to production", "only hype", "no baseline", "no owner"], a: 0, why: "Priorities need impact, measurability, and execution path." }
    ] }
  ],
  sides: [{ id: "sec-s1", name: "Analyst Automation Trial", sprite: "🕵️", anchor: 2, recLevel: 4, prereqs: ["sec-posttrain", "sec-workflows", "sec-evals"], desc: "Tests whether you can turn agent research into trustworthy security automation.", questions: [
    { q: "SCENARIO: A prototype triage agent has impressive demos but no held-out evals. Next move?", options: ["build benchmark tasks and trajectory metrics before expanding", "ship immediately", "add three more agents", "raise temperature"], a: 0, why: "Reliability must be measured before complexity or deployment." },
    { q: "SCENARIO: The agent often gives right final labels but cites irrelevant log lines. What metric is missing?", options: ["evidence coverage/support", "font rendering", "GPU utilization", "repo stars"], a: 0, why: "Security outputs need grounded evidence, not just labels." }
  ] }],
  gym: { leader: "SOC Research Lead", badge: "Security Agent Badge", sprite: "🛡️", taunt: "Prove your agent can be trusted in the SOC.", questions: [] }
};
SECURITY_AI_REGION.gym.questions = SECURITY_AI_REGION.concepts.flatMap(c => c.questions).slice(0, 4);

const _g = (id) => ATLAS.find((w) => w.id === id).regions[0];
/* Arcs group a world's case boards into lore-named chapters so worlds can
   keep absorbing regions without the region list sprawling (see CLAUDE.md).
   Ids never change; arcs are display grouping only. */
const withArcs = (regions, arcs) => regions.map((r) => (arcs[r.id] ? { ...r, arc: arcs[r.id] } : r));
const BUILTIN_WORLDS = [
  { id: "w-rl", title: "The Agentic RL Frontier", emoji: "🤖", domain: "Agents & Agentic RL · post-training",
    blurb: "Agentic workflows → MDPs → SFT → tool rewards → PPO/GRPO/DPO → orchestration.",
    links: [
      { label: "Source primer · aman.ai Agentic RL", url: "https://aman.ai/primers/ai/agentic-RL/" },
      { label: "Anthropic · Building Effective Agents", url: "https://www.anthropic.com/research/building-effective-agents" },
      { label: "3b1b · But what is a GPT?", url: "https://www.youtube.com/watch?v=wjZofJX0v4M" },
      { label: "Karpathy · Deep RL: Pong from Pixels", url: "https://karpathy.github.io/2016/05/31/rl/" },
      { label: "Karpathy · A Recipe for Training Neural Networks", url: "https://karpathy.github.io/2019/04/25/recipe/" },
      { label: "AdithyaSK · Ultimate Guide to RL Environments", url: "https://huggingface.co/spaces/AdithyaSK/rl-environments-guide" },
      { label: "RL_Envs_101 (companion repo)", url: "https://github.com/adithya-s-k/RL_Envs_101" },
    ],
    regions: withArcs([SECURITY_AI_REGION, ...RL_REGIONS, _g("w-orch"), ENV_REGION], {
      "agentic-workflows-r": "Agents at Scale",
      fields: "Foundations of Decision", village: "Foundations of Decision",
      forest: "The Craft of Reward", foundry: "The Craft of Reward", peaks: "The Craft of Reward",
      citadel: "Agents at Scale", "orch-r": "Agents at Scale", "env-r": "Agents at Scale",
    }) },
  { id: "w-tf", title: "The Attention Citadel", emoji: "🏛️", domain: "Transformer Architecture",
    blurb: "Position → attention variants → MoE → the modern block gallery.",
    links: [
      { label: "Transformer Explainer (interactive)", url: "https://poloclub.github.io/transformer-explainer/" },
      { label: "3b1b · Attention, visually", url: "https://www.youtube.com/watch?v=eMlx5fFNoYc" },
      { label: "Raschka · LLM Architecture Gallery", url: "https://sebastianraschka.com/llm-architecture-gallery/" },
      { label: "Raschka · Recent Developments (KV sharing, mHC)", url: "https://magazine.sebastianraschka.com/p/recent-developments-in-llm-architectures" },
      { label: "Raschka · Understanding & Coding Self-Attention", url: "https://magazine.sebastianraschka.com/p/understanding-and-coding-self-attention" },
      { label: "Karpathy · Let's build GPT from scratch", url: "https://www.youtube.com/watch?v=kCc8FmEb1nY" },
      { label: "Karpathy · nanoGPT", url: "https://github.com/karpathy/nanoGPT" },
    ],
    regions: withArcs([_g("w-embed"), _g("w-attn"), _g("w-moe"), _g("w-arch")], {
      "emb-r": "Foundations of Signal", "attn-r": "Foundations of Signal",
      "moe-r": "The Craft of Blocks", "arch-r": "The Craft of Blocks",
    }) },
  { id: "w-gen", title: "The Dreaming Depths", emoji: "🌫️", domain: "Generative Models",
    blurb: "KL's two personalities → autoencoder family → diffusion.",
    links: [
      { label: "Lilian Weng · From AE to VAE", url: "https://lilianweng.github.io/posts/2018-08-12-vae/" },
      { label: "Lilian Weng · Diffusion Models", url: "https://lilianweng.github.io/posts/2021-07-11-diffusion-models/" },
      { label: "Karpathy · Neural Networks: Zero to Hero (makemore→GPT)", url: "https://karpathy.ai/zero-to-hero.html" },
    ],
    regions: withArcs([_g("w-kl"), _g("w-ae"), _g("w-diffusion")], {
      "kl-r": "The Craft of Dreams", "ae-r": "The Craft of Dreams", "diff-r": "The Craft of Dreams",
    }) },
  { id: "w-percept", title: "The Worldseer Observatory", emoji: "👁️", domain: "Perception & World Models",
    blurb: "Pixels → language (VLMs), and pixels → planning (JEPA, LeJEPA).",
    links: [
      { label: "CNN Explainer (interactive)", url: "https://poloclub.github.io/cnn-explainer/" },
      { label: "Meta AI · V-JEPA 2", url: "https://ai.meta.com/vjepa/" },
      { label: "Fei-Fei Li's CS231n · CNNs for Visual Recognition", url: "https://cs231n.github.io/" },
      { label: "Fei-Fei Li · World Labs on spatial intelligence", url: "https://www.worldlabs.ai/blog" },
      { label: "LeCun · A Path Towards Autonomous Machine Intelligence", url: "https://openreview.net/pdf?id=BZ5a1r-kVsf" },
    ],
    regions: [_g("w-vlm"), WM_REGION] },
  { id: "w-sys", title: "The Throughput Shogunate", emoji: "⚙️", domain: "LLM Systems & Serving",
    blurb: "KV cache & quantization → parallelism, drafts, disaggregation.",
    links: [
      { label: "Raschka · Coding the KV Cache", url: "https://magazine.sebastianraschka.com/p/coding-the-kv-cache-in-llms" },
      { label: "vLLM · PagedAttention paper", url: "https://arxiv.org/abs/2309.06180" },
      { label: "Zero to Hero with vLLM (capacity planning §8.3)", url: "https://martinuke0.github.io/posts/2026-01-04-zero-to-hero-with-vllm-a-practical-guide-for-highthroughput-llm-inference/#83-capacity-planning" },
    ],
    regions: withArcs([INF_REGION_A, INF_REGION_B], {
      "inf-cache": "The Craft of Memory", "inf-flow": "The Way of Throughput",
    }) },
];

/* ============================================================
   CODE LAB — runnable starters & tests (Pyodide: python+numpy)
   ============================================================ */

const SWE_PATTERN_HINTS = {
  arrays: "Array/hash-map problems ask you to maintain a compact fact while scanning: seen values, best-so-far, prefix state, or two moving indices.",
  strings: "String problems usually turn characters into counts, windows, stacks, or normalized keys so equality and constraints become cheap checks.",
  "linked lists": "Linked-list problems are pointer choreography: preserve the next node before rewiring, and keep a dummy or slow/fast pointer when edges get awkward.",
  trees: "Tree problems ask what each node returns upward: a boolean, depth, path score, serialized token, or bounded min/max invariant.",
  graphs: "Graph problems are about state exploration: define nodes, edges, visited state, and whether BFS/DFS/toposort/union-find owns the invariant.",
  "intervals/matrices": "Interval and matrix problems reward ordering: sort/scan ranges, or flood/search grids from the right frontier so repeated work disappears.",
  dp: "Dynamic programming problems need a state definition, a recurrence, base cases, and an iteration order that guarantees dependencies are ready.",
  binary: "Bit/binary-search problems shrink uncertainty: each comparison or bit operation should discard impossible states while preserving the answer.",
};
const SWE_IO_EXAMPLES = {
  "Two Sum": "nums=[2,7,11,15], target=9 → [0,1]; nums=[3,2,4], target=6 → [1,2]",
  "Longest Substring": "s='abcabcbb' → 3; s='bbbbb' → 1; s='' → 0",
  "Best Time to Buy and Sell Stock": "prices=[7,1,5,3,6,4] → 5; prices=[7,6,4,3,1] → 0",
  "Contains Duplicate": "nums=[1,2,3,1] → true; nums=[1,2,3,4] → false",
  "Product of Array Except Self": "nums=[1,2,3,4] → [24,12,8,6]; nums=[-1,1,0,-3,3] → [0,0,9,0,0]",
  "Maximum Subarray": "nums=[-2,1,-3,4,-1,2,1,-5,4] → 6; nums=[1] → 1",
  "Maximum Product Subarray": "nums=[2,3,-2,4] → 6; nums=[-2,0,-1] → 0",
  "Find Minimum in Rotated Sorted Array": "nums=[3,4,5,1,2] → 1; nums=[4,5,6,7,0,1,2] → 0",
  "Search in Rotated Sorted Array": "nums=[4,5,6,7,0,1,2], target=0 → 4; target=3 → -1",
  "3Sum": "nums=[-1,0,1,2,-1,-4] → [[-1,-1,2],[-1,0,1]]; nums=[0,0,0] → [[0,0,0]]",
  "Container With Most Water": "height=[1,8,6,2,5,4,8,3,7] → 49; height=[1,1] → 1",
  "Valid Parentheses": "s='()[]{}' → true; s='(]' → false; s='([)]' → false",
  "Valid Anagram": "s='anagram', t='nagaram' → true; s='rat', t='car' → false",
  "Group Anagrams": "['eat','tea','tan','ate','nat','bat'] → groups for aet/ant/abt",
  "Minimum Window Substring": "s='ADOBECODEBANC', t='ABC' → 'BANC'; s='a', t='aa' → ''",
  "Valid Palindrome": "s='A man, a plan, a canal: Panama' → true; s='race a car' → false",
  "Reverse Linked List": "1→2→3→4→5 → 5→4→3→2→1; empty list → empty",
  "Merge Two Sorted Lists": "1→2→4 and 1→3→4 → 1→1→2→3→4→4",
  "Number of Islands": "grid with three separated land masses → 3; all water → 0",
  "Climbing Stairs": "n=2 → 2; n=3 → 3; n=5 → 8",
  "Coin Change": "coins=[1,2,5], amount=11 → 3; coins=[2], amount=3 → -1",
};
const SWE_SOLUTIONS = {
  "Two Sum": `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
    return []
`,
  "Best Time to Buy and Sell Stock": `def best_time_to_buy_and_sell_stock(prices):
    best = 0; low = float('inf')
    for p in prices:
        low = min(low, p); best = max(best, p - low)
    return best
`,
  "Contains Duplicate": `def contains_duplicate(nums):
    return len(set(nums)) != len(nums)
`,
  "Valid Parentheses": `def valid_parentheses(s):
    stack = []
    pairs = {')': '(', ']': '[', '}': '{'}
    for ch in s:
        if ch in pairs.values():
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack
`,
  "Valid Anagram": `from collections import Counter
def valid_anagram(s, t):
    return Counter(s) == Counter(t)
`,
  "Maximum Subarray": `def maximum_subarray(nums):
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x); best = max(best, cur)
    return best
`,
  "Climbing Stairs": `def climbing_stairs(n):
    a, b = 1, 1
    for _ in range(n):
        a, b = b, a + b
    return a
`,
};
const SWE_TESTS = {
  "Two Sum": `
assert two_sum([2,7,11,15], 9) == [0,1]
assert two_sum([3,2,4], 6) == [1,2]
assert two_sum([3,3], 6) == [0,1]
print("ALL TESTS PASSED ✓")
`,
  "Best Time to Buy and Sell Stock": `
assert best_time_to_buy_and_sell_stock([7,1,5,3,6,4]) == 5
assert best_time_to_buy_and_sell_stock([7,6,4,3,1]) == 0
print("ALL TESTS PASSED ✓")
`,
  "Contains Duplicate": `
assert contains_duplicate([1,2,3,1]) is True
assert contains_duplicate([1,2,3,4]) is False
print("ALL TESTS PASSED ✓")
`,
  "Valid Parentheses": `
assert valid_parentheses('()[]{}') is True
assert valid_parentheses('(]') is False
assert valid_parentheses('([)]') is False
assert valid_parentheses('') is True
print("ALL TESTS PASSED ✓")
`,
  "Valid Anagram": `
assert valid_anagram('anagram','nagaram') is True
assert valid_anagram('rat','car') is False
print("ALL TESTS PASSED ✓")
`,
  "Maximum Subarray": `
assert maximum_subarray([-2,1,-3,4,-1,2,1,-5,4]) == 6
assert maximum_subarray([1]) == 1
print("ALL TESTS PASSED ✓")
`,
  "Climbing Stairs": `
assert climbing_stairs(2) == 2
assert climbing_stairs(3) == 3
assert climbing_stairs(5) == 8
print("ALL TESTS PASSED ✓")
`,
};
function sweReference(k) { return SWE_SOLUTIONS[cleanBlindTitle(k.title)] || null; }
function sweTest(k) { return SWE_TESTS[cleanBlindTitle(k.title)] || null; }
function sweCategory(k) {
  const text = `${k.title || ""} ${k.blurb || ""}`.toLowerCase();
  for (const cat of ["arrays", "strings", "linked lists", "trees", "graphs", "intervals/matrices", "dp", "binary"]) if (text.includes(cat)) return cat;
  if (/tree|bst|trie/.test(text)) return "trees";
  if (/graph|island|course|alien|component|clone/.test(text)) return "graphs";
  if (/string|substring|anagram|palindrome|parentheses/.test(text)) return "strings";
  if (/list|node/.test(text)) return "linked lists";
  if (/interval|matrix|meeting|rotate image|spiral|set matrix/.test(text)) return "intervals/matrices";
  if (/climb|coin|word break|decode|lis|partition|dp/.test(text)) return "dp";
  if (/bits|binary|sum of two integers|missing number|reverse bits/.test(text)) return "binary";
  return "arrays";
}
function cleanBlindTitle(title) { return String(title || "Kata").replace(/\s*\(Blind 75 #\d+\)\s*/g, "").trim(); }
function narrativeLore(name, lore, worldTitle = "this world") {
  let text = String(lore || "").replace(/\s+/g, " ").trim();
  if (!text) return text;
  const wrapped = text.match(/^In ([^,]+), (.+?) is not a glossary flashcard; it is a scene you can replay\. (.+?) Read it as a mechanism with stakes:.*$/);
  if (wrapped) text = wrapped[3].trim();
  const sentenceCount = (text.match(/[.!?](\s|$)/g) || []).length;
  const labelCount = (text.match(/\b[A-Z][A-Z0-9+/@-]{2,}:\s/g) || []).length;
  const hasChoppySignals = labelCount >= 2 || /;\s*[A-Z][A-Z0-9+/@-]{2,}:/.test(text) || /trivial credit assignment|moderate horizon|credit crueler/i.test(text);

  if (/^Environment Types$/i.test(name)) {
    return "Agent environments are training arenas with different kinds of memory. In a single-turn arena, the agent answers once and the reward lands immediately, so blame and credit are easy to assign. In a tool-use arena, the agent must decide when to call tools, read observations, and recover from intermediate mistakes; rewards can now attach to the quality of each step. In a multi-turn sequential arena, early choices change the future state, and the consequence of a bad click may not appear until many turns later. This progression matters because the environment chooses how sparse the reward is, how hard exploration becomes, and whether the agent can learn from a clear signal or only from delayed fallout.";
  }

  const cleaned = text
    .replace(/\bSINGLE-TURN:\s*/g, "In the single-turn case, ")
    .replace(/\bTOOL-USE:\s*/g, "With tool use, ")
    .replace(/\bMULTI-TURN SEQUENTIAL:\s*/g, "In multi-turn sequential work, ")
    .replace(/\b([A-Z][A-Z0-9+/@-]{2,}):\s*/g, (_, label) => `${label.replace(/[-_]/g, " ")} means `)
    .replace(/;\s*/g, ". ")
    .replace(/\s+—\s+/g, " — ")
    .replace(/\.\s*\./g, ".")
    .trim();

  if (!hasChoppySignals && text.length >= 150 && sentenceCount >= 3) return cleaned;

  const variants = [
    `${name} is the moment in ${worldTitle} where an abstract term turns into a decision you can test. ${cleaned} As you read, track the moving part: what information changes, what evidence would confirm it, and which failure appears when the mechanism is missing.`,
    `Think of ${name} as a small machine inside ${worldTitle}. ${cleaned} The useful question is not “can I recite the definition?” but “can I predict how the system behaves when this part is present, absent, or tuned badly?”`,
    `${name} should feel like a cause-and-effect story. ${cleaned} Start from the situation, follow the state change, then name the consequence. That path is what makes the idea reusable in a design review, debugging session, or interview answer.`,
    `When ${worldTitle} introduces ${name}, the learner is being asked to notice a mechanism, not memorize a label. ${cleaned} Anchor the lore in one concrete contrast: what gets easier, what gets harder, and what signal tells you the concept is doing real work.`
  ];
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return variants[h % variants.length];
}

function splitSentences(text) {
  return String(text || "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}
function conceptNote(c, deep = "") {
  const lore = narrativeLore(c.name, c.lore || "");
  const parts = splitSentences(lore).map((x) => x.trim()).filter(Boolean);
  const mechanism = parts[0] || `${c.name} is a mechanism worth testing in context.`;
  const consequence = parts.slice(1, 3).join(" ") || "Use the question to connect the definition to a concrete state change.";
  const deepText = String(deep || "").replace(/\s+/g, " ").trim();
  return {
    mechanism,
    consequence,
    checkpoint: `Before answering, ask: what changes when ${c.name} is present, and what evidence would rule out a distractor?`,
    deep: deepText ? splitSentences(deepText).slice(0, 2).join(" ") : "",
  };
}
function compactLore(c) {
  const n = conceptNote(c);
  return `${n.mechanism} ${n.consequence}`.trim();
}
function sweIo(k) {
  const base = cleanBlindTitle(k.title);
  return SWE_IO_EXAMPLES[base] || "Use the canonical Blind 75 examples: include a normal case, an edge case, and a minimal input; write the expected output before coding so the invariant has something concrete to satisfy.";
}
function sweStarter(k, guided = true) {
  const title = cleanBlindTitle(k.title);
  const fn = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "solve";
  if (!guided) return `def ${fn}(*args):\n    pass\n`;
  return `def ${fn}(*args):\n    # TODO 1: replace *args with the real parameters for ${title}; copy one test case below as a comment.\n    # TODO 2: choose the invariant: what compact fact must still be true after each step?\n    # TODO 3: update that state inside the loop/recursion; do not skip edge cases.\n    # TODO 4: return the value promised by the test I/O card, then run tests before marking complete.\n    pass\n`;
}
function enrichSWEKata(k) {
  if (!k || k.family !== "swe") return k;
  const cat = sweCategory(k), title = cleanBlindTitle(k.title), io = k.testIo || sweIo(k);
  const lore = k.lore || `Imagine ${title} as a tiny interview dungeon: the examples are lanterns, and the invariant is the rope that keeps you from wandering. First translate the prompt into an input→output contract; then use the ${cat} pattern to keep one fact true after every step. ${SWE_PATTERN_HINTS[cat] || SWE_PATTERN_HINTS.arrays} Retention comes from naming the state before coding, watching it change on a small example, and only then compressing the solution into code.`;
  const testLore = `The test card is your oracle: ${io}. Before writing code, say what your function receives, what it returns, and which edge case would break a fake solution.`;
  const steps = (k.steps && k.steps.length ? k.steps : [
    { prompt: `Define the input/output contract for ${title}.`, lore: testLore, hint: "Write the signature with real parameter names. Then copy the smallest example and expected output as a comment.", code: "# TODO: replace *args with real parameters and state the return type" },
    { prompt: `Choose the core ${cat} invariant.`, lore: `${SWE_PATTERN_HINTS[cat] || SWE_PATTERN_HINTS.arrays} Your invariant should be short enough to check after every iteration.`, hint: "Ask: after processing item i, what do I know that lets item i+1 be handled without rereading the past?", code: "# TODO: name and initialize the state variables that preserve the invariant" },
    { prompt: `Implement and verify ${title}.`, lore: `Run against: ${io}. Treat failed tests as feedback about the invariant, not as punishment.`, hint: "Trace the normal example by hand for two iterations, then add the edge case that would fool a memorized answer.", code: "# TODO: update state, return the promised value, and run tests" },
  ]).map((s, i) => ({ ...s, lore: s.lore || (i === 0 ? testLore : (SWE_PATTERN_HINTS[cat] || SWE_PATTERN_HINTS.arrays)), hint: s.hint || s.why || "Use the test I/O card to decide what state must change on this line." }));
  return { ...k, lore, testIo: io, steps, solution: k.solution || sweReference(k) || `# Reference solution not authored yet for ${title}. Use AI review plus your tests to verify.`, test: k.test || sweTest(k), starter: k.starter && k.starter.includes("TODO") ? k.starter : sweStarter(k, true), unguidedStarter: k.unguidedStarter || sweStarter(k, false) };
}
function stripGuidance(code) {
  return String(code || "").split("\n").filter((line) => !/TODO|YOUR CODE|Sketch the canonical|write the invariant/i.test(line)).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
function starterFromKata(k) {
  if (!k) return "# Write your solution here\n";
  if (k.starter) return k.starter;
  const title = cleanBlindTitle(k.title);
  const steps = (k.steps || []).map((st, i) => `# TODO ${i + 1}: ${st.prompt || st.lore || "complete this checkpoint"}\n${st.code ? String(st.code).replace(/____/g, "TODO_VALUE") : "# implement this piece"}`).join("\n\n");
  if (k.family === "ml" || k.family === "torchleet") return `# ${title} skeleton\n# Fill each TODO, then use AI review or local tests where available.\n${steps || "# TODO: implement the core model/training function.\npass"}\n`;
  if (k.family === "sys") return `# ${title} design skeleton\n# TODO 1: state assumptions and constraints.\n# TODO 2: sketch API/data model.\n# TODO 3: identify bottlenecks and failure modes.\n`;
  return `# ${title} skeleton\n${steps || "# TODO: solve the exercise.\npass"}\n`;
}

const LABS = {
  "k-selfattn": { needs: "numpy",
    starter: `import numpy as np\n\ndef softmax(x, axis=-1):\n    e = np.exp(x - x.max(axis=axis, keepdims=True))\n    return e / e.sum(axis=axis, keepdims=True)\n\ndef self_attention(X, W_q, W_k, W_v):\n    # YOUR CODE: Q,K,V projections, scaled scores, softmax, weighted sum\n    pass\n`,
    test: `\nnp.random.seed(0)\nX = np.random.randn(5, 8); W = [np.random.randn(8, 8) for _ in range(3)]\nout = self_attention(X, *W)\nassert out is not None, "returned None"\nassert out.shape == (5, 8), f"bad shape {out.shape}"\nQ,K,V = X@W[0], X@W[1], X@W[2]\nref = softmax(Q@K.T/np.sqrt(8)) @ V\nassert np.allclose(out, ref, atol=1e-6), "values differ from reference"\nprint("ALL TESTS PASSED ✓")\n` },
  "k-mlp": { needs: "numpy",
    starter: `import numpy as np\n\ndef forward(X, p):\n    # return logits, cache(X, Z1, H)\n    pass\n\ndef backward(dlogits, cache, p):\n    # return dict W1,b1,W2,b2\n    pass\n`,
    test: `\nnp.random.seed(1)\np = {'W1': np.random.randn(4,8)*.1, 'b1': np.zeros(8), 'W2': np.random.randn(8,3)*.1, 'b2': np.zeros(3)}\nX = np.random.randn(10,4)\nlogits, cache = forward(X, p)\nassert logits.shape == (10,3)\ng = backward(np.ones((10,3)), cache, p)\n# numeric gradient check on W1[0,0]\neps=1e-5; p2={k:v.copy() for k,v in p.items()}\np2['W1'][0,0]+=eps; l1,_=forward(X,p2); p2['W1'][0,0]-=2*eps; l2,_=forward(X,p2)\nnum=(l1.sum()-l2.sum())/(2*eps)\nassert abs(num - g['W1'][0,0]*10) < 1e-3, f"grad check failed {num} vs {g['W1'][0,0]*10}"\nprint("ALL TESTS PASSED ✓ (including numeric gradient check)")\n` },
  "k-attnback": { needs: "numpy",
    starter: `import numpy as np\n\ndef softmax(x):\n    e = np.exp(x - x.max(-1, keepdims=True)); return e/e.sum(-1, keepdims=True)\n\ndef attn_forward(Q, K, V):\n    # return out, cache\n    pass\n\ndef attn_backward(dO, cache):\n    # return dQ, dK, dV\n    pass\n`,
    test: `\nnp.random.seed(2)\nQ,K,V = (np.random.randn(4,6) for _ in range(3))\nO, cache = attn_forward(Q,K,V)\ndQ,dK,dV = attn_backward(np.ones_like(O), cache)\neps=1e-5; Qp=Q.copy(); Qp[0,0]+=eps; O1,_=attn_forward(Qp,K,V)\nQp[0,0]-=2*eps; O2,_=attn_forward(Qp,K,V)\nnum=(O1.sum()-O2.sum())/(2*eps)\nassert abs(num-dQ[0,0])<1e-4, f"dQ check failed: {num} vs {dQ[0,0]}"\nprint("ALL TESTS PASSED ✓ (numeric dQ check)")\n` },
  "k-twosum": { needs: null,
    starter: `def two_sum(nums, target):\n    # TODO 1: create a hash map from value -> index for numbers already seen.\n    # TODO 2: for each num, compute complement = target - num.\n    # TODO 3: if complement was seen, return [seen[complement], current_index].\n    # TODO 4: otherwise store the current num and keep scanning; return [] if none.\n    pass\n`,
    test: `\nassert two_sum([2,7,11,15], 9) == [0,1]\nassert two_sum([3,2,4], 6) == [1,2]\nassert two_sum([3,3], 6) == [0,1]\nassert two_sum([1,2], 99) == []\nprint("ALL TESTS PASSED ✓")\n` },
  "k-slidewin": { needs: null,
    starter: `def longest_substring(s):\n    # TODO 1: keep a left pointer and a set/dict of characters in the current window.\n    # TODO 2: move right through the string one character at a time.\n    # TODO 3: while the new character duplicates the window, advance left until valid.\n    # TODO 4: update the best window length after the invariant is restored.\n    pass\n`,
    test: `\nassert longest_substring("abcabcbb") == 3\nassert longest_substring("bbbbb") == 1\nassert longest_substring("pwwkew") == 3\nassert longest_substring("") == 0\nprint("ALL TESTS PASSED ✓")\n` },
  "tl-bpe": { needs: null,
    starter: `def get_pair_counts(tokens):
    # count adjacent pairs
    pass

def merge(tokens, pair, new_token):
    pass

def bpe_train(text, n_merges):
    tokens = list(text); merges = []
    # repeat: most frequent pair -> merge
    return tokens, merges
`,
    test: `
toks, merges = bpe_train("aaabdaaabac", 3)
assert merges[0] == ("a","a"), f"first merge should be ('a','a'), got {merges[0] if merges else None}"
assert len(merges) == 3
assert "".join(toks) == "aaabdaaabac", "merging must preserve the underlying text"
print("ALL TESTS PASSED ✓")
` },
  "k-paged": { needs: "numpy",
    starter: `import numpy as np\n\nclass PagedKVCache:\n    def __init__(self, n_blocks=64, block=4, d=8):\n        # K,V pools, free list, tables{}, lens{}\n        pass\n    def append(self, seq, k, v):\n        pass\n    def gather(self, seq):\n        # return (ks, vs) for seq, length-trimmed\n        pass\n`,
    test: `\nc = PagedKVCache()\nfor i in range(10):\n    c.append("a", np.full(8, i, float), np.full(8, -i, float))\nks, vs = c.gather("a")\nassert ks.shape == (10, 8) and vs.shape == (10, 8)\nassert ks[7,0] == 7 and vs[3,0] == -3\nprint("ALL TESTS PASSED ✓")\n` },
};
const KATAS = [
{
  id: "k-selfattn", family: "ml", title: "Self-Attention from Scratch", emoji: "🔍",
  blurb: "The core computation of every transformer: scores, scale, softmax, weighted sum.",
  frameworks: ["pytorch", "numpy", "jax"],
  links: [
    { label: "Transformer Explainer", url: "https://poloclub.github.io/transformer-explainer/" },
    { label: "3b1b · Attention, visually", url: "https://www.youtube.com/watch?v=eMlx5fFNoYc" },
    { label: "Raschka · Coding Self-Attention", url: "https://magazine.sebastianraschka.com/p/understanding-and-coding-self-attention" },
  ],
  steps: [
    { prompt: "We project input X [seq, d] into queries, keys, values. Fill the blank:", code: `Q = X @ W_q     # [seq, d_k]
K = X @ W_k     # [seq, d_k]
V = X @ W_v     # [seq, d_v]
scores = ____            # [seq, seq]`,
      options: ["Q @ K.T", "K @ Q", "Q @ V.T", "Q.T @ K"], a: 0, why: "Each query dots against every key: [seq,d_k] @ [d_k,seq] → [seq,seq]." },
    { prompt: "Why divide scores by √d_k before softmax?", code: `scores = Q @ K.T / math.sqrt(d_k)`,
      options: ["large dot products saturate softmax, killing gradients", "it normalizes rows to sum to one", "it prevents integer overflow", "it makes scores symmetric"], a: 0, why: "Dot-product variance grows with d_k; unscaled logits push softmax into near-one-hot, vanishing-gradient territory." },
    { prompt: "Finish the computation:", code: `attn = softmax(scores, axis=-1)   # rows sum to 1
out  = ____`,
      options: ["attn @ V", "V @ attn", "attn @ K", "attn.T @ Q"], a: 0, why: "Each output token is its attention-weighted mixture of value vectors." },
  ],
  solutions: {
    pytorch: `import torch, math
def self_attention(X, W_q, W_k, W_v):
    Q, K, V = X @ W_q, X @ W_k, X @ W_v
    scores = Q @ K.transpose(-2, -1) / math.sqrt(Q.shape[-1])
    attn = torch.softmax(scores, dim=-1)
    return attn @ V

# sanity check
X = torch.randn(5, 16)
W = [torch.randn(16, 16) for _ in range(3)]
print(self_attention(X, *W).shape)  # torch.Size([5, 16])`,
    numpy: `import numpy as np
def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))  # stability!
    return e / e.sum(axis=axis, keepdims=True)
def self_attention(X, W_q, W_k, W_v):
    Q, K, V = X @ W_q, X @ W_k, X @ W_v
    scores = Q @ K.T / np.sqrt(Q.shape[-1])
    return softmax(scores) @ V`,
    jax: `import jax.numpy as jnp
from jax.nn import softmax
def self_attention(X, W_q, W_k, W_v):
    Q, K, V = X @ W_q, X @ W_k, X @ W_v
    scores = Q @ K.T / jnp.sqrt(Q.shape[-1])
    return softmax(scores, axis=-1) @ V
# jax.jit(self_attention) compiles it for free`,
  },
},
{
  id: "k-causalcross", family: "ml", title: "Causal & Cross Attention", emoji: "🎭",
  blurb: "Masking the future for decoders; attending across sequences for encoder-decoder and VLMs.",
  frameworks: ["pytorch"],
  links: [{ label: "Transformer Explainer", url: "https://poloclub.github.io/transformer-explainer/" }],
  steps: [
    { prompt: "Causal masking: token i must not see tokens j > i. Which mask, applied where?", code: `scores = Q @ K.T / math.sqrt(d)
mask = torch.triu(torch.ones(T, T), diagonal=1).bool()
scores = scores.____`,
      options: ["masked_fill(mask, float('-inf'))", "masked_fill(mask, 0.0)", "mul(mask)", "masked_fill(~mask, float('-inf'))"], a: 0, why: "Future positions get −inf BEFORE softmax → exactly zero probability. Filling 0 would still leak attention." },
    { prompt: "Cross-attention (decoder attends to encoder / LLM attends to image tokens). Which projections come from which sequence?", code: `# dec: [T_d, d]   enc: [T_e, d]
Q = ____ @ W_q
K = ____ @ W_k
V = ____ @ W_v`,
      options: ["dec / enc / enc", "enc / dec / dec", "dec / dec / enc", "enc / enc / dec"], a: 0, why: "Queries ask from the decoder; keys/values answer from the encoder — output shape stays [T_d, d]." },
    { prompt: "In cross-attention, is a causal mask applied over the encoder sequence?", code: `attn = softmax(Q @ K.T / sqrt(d))  # [T_d, T_e]`,
      options: ["no — the encoder context is fully visible, not generated", "yes — always mask everything", "only during inference", "only if T_e > T_d"], a: 0, why: "Causality protects autoregressive GENERATION; conditioning context (image, source text) is given, so all of it is fair game." },
  ],
  solutions: {
    pytorch: `import torch, math
import torch.nn.functional as F

def causal_self_attention(x, W_q, W_k, W_v):
    T, d = x.shape
    Q, K, V = x @ W_q, x @ W_k, x @ W_v
    scores = Q @ K.T / math.sqrt(d)
    mask = torch.triu(torch.ones(T, T, dtype=torch.bool), 1)
    scores = scores.masked_fill(mask, float('-inf'))
    return F.softmax(scores, -1) @ V

def cross_attention(dec, enc, W_q, W_k, W_v):
    Q = dec @ W_q          # queries from decoder
    K, V = enc @ W_k, enc @ W_v   # keys/values from encoder
    scores = Q @ K.T / math.sqrt(Q.shape[-1])
    return F.softmax(scores, -1) @ V   # [T_dec, d] — no mask`,
  },
},
{
  id: "k-transformer", family: "ml", title: "Transformer Block from Scratch", emoji: "🏗️",
  blurb: "Assemble the modern block: pre-norm, multi-head attention, SwiGLU, residuals.",
  frameworks: ["pytorch"],
  links: [
    { label: "Raschka · Architecture Gallery", url: "https://sebastianraschka.com/llm-architecture-gallery/" },
    { label: "3b1b · But what is a GPT?", url: "https://www.youtube.com/watch?v=wjZofJX0v4M" },
  ],
  steps: [
    { prompt: "Multi-head = run h attentions in parallel on d/h-dim slices. The reshape:", code: `# x: [B, T, d]  →  heads: [B, h, T, d_h]
q = self.W_q(x).view(B, T, h, d_h).____`,
      options: ["transpose(1, 2)", "transpose(0, 1)", "reshape(B*h, T, d_h)", "permute(2, 0, 1, 3)"], a: 0, why: "[B,T,h,d_h] → [B,h,T,d_h]: heads become a batch dimension so attention runs per-head in parallel." },
    { prompt: "Modern block ordering (pre-norm). Fill the blanks:", code: `x = x + self.attn(____(x))
x = x + self.ffn(____(x))`,
      options: ["norm1 / norm2", "norm2 / norm1", "dropout / norm1", "identity / identity"], a: 0, why: "Pre-norm: normalize INPUT to each sublayer, add residual after — far more stable to train deep than post-norm." },
    { prompt: "SwiGLU feed-forward. Complete it:", code: `def ffn(x):
    return self.W_down( ____ )`,
      options: ["F.silu(self.W_gate(x)) * self.W_up(x)", "F.relu(self.W_up(x))", "self.W_gate(x) + self.W_up(x)", "torch.sigmoid(self.W_up(x))"], a: 0, why: "The gated form: swish(gate) elementwise-multiplies the up projection — the modern FFN." },
  ],
  solutions: {
    pytorch: `import torch, torch.nn as nn, torch.nn.functional as F, math

class Block(nn.Module):
    def __init__(self, d=256, h=8):
        super().__init__()
        self.h, self.d_h = h, d // h
        self.W_qkv = nn.Linear(d, 3*d, bias=False)
        self.W_o   = nn.Linear(d, d, bias=False)
        self.norm1 = nn.RMSNorm(d)
        self.norm2 = nn.RMSNorm(d)
        self.W_gate = nn.Linear(d, 4*d, bias=False)
        self.W_up   = nn.Linear(d, 4*d, bias=False)
        self.W_down = nn.Linear(4*d, d, bias=False)

    def attn(self, x):
        B, T, d = x.shape
        q, k, v = self.W_qkv(x).chunk(3, -1)
        shp = (B, T, self.h, self.d_h)
        q, k, v = (t.view(shp).transpose(1, 2) for t in (q, k, v))
        att = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_h)
        mask = torch.triu(torch.ones(T, T, dtype=torch.bool, device=x.device), 1)
        att = att.masked_fill(mask, float('-inf')).softmax(-1)
        y = (att @ v).transpose(1, 2).reshape(B, T, d)
        return self.W_o(y)

    def ffn(self, x):
        return self.W_down(F.silu(self.W_gate(x)) * self.W_up(x))

    def forward(self, x):
        x = x + self.attn(self.norm1(x))   # pre-norm + residual
        x = x + self.ffn(self.norm2(x))
        return x`,
  },
},
{
  id: "k-flash", family: "ml", title: "Flash Attention (Tiling)", emoji: "⚡",
  blurb: "Why exact attention can skip materializing the [T,T] matrix: tiles + online softmax.",
  frameworks: ["pytorch"],
  links: [{ label: "Original FlashAttention paper", url: "https://arxiv.org/abs/2205.14135" }],
  steps: [
    { prompt: "Standard attention's memory problem at T=32k:", code: `scores = Q @ K.T   # shape [T, T] = [32768, 32768]
# fp32: 32768² × 4 bytes ≈ ____`,
      options: ["≈ 4.3 GB for ONE head's score matrix", "≈ 4.3 MB, negligible", "≈ 43 KB, trivial", "zero — it's never materialized"], a: 0, why: "The quadratic score matrix is the memory (and HBM-bandwidth) villain Flash kills." },
    { prompt: "Flash processes K/V in tiles, never storing full scores. The trick that makes softmax tile-able:", code: `# online softmax: maintain running (m, l, acc)
m_new = max(m_old, tile_scores.max())
l_new = l_old * exp(m_old - m_new) + exp(tile_scores - m_new).sum()
acc   = acc * ____ + exp(tile_scores - m_new) @ V_tile`,
      options: ["exp(m_old - m_new)", "exp(m_new - m_old)", "l_old / l_new", "1.0 (no correction)"], a: 0, why: "When the running max rises, previously accumulated terms must be rescaled by exp(m_old − m_new)." },
    { prompt: "Flash attention's output vs standard attention's output:", code: `out_flash = flash_attn(Q, K, V)
out_std   = softmax(Q@K.T/√d) @ V`,
      options: ["numerically equivalent — it's exact, not approximate", "an approximation within 1% error", "exact only for short sequences", "different: Flash drops small scores"], a: 0, why: "Flash is an IO-aware exact algorithm — same math, radically less HBM traffic." },
  ],
  solutions: {
    pytorch: `import torch, math
# educational tiled attention (the algorithm, not the CUDA kernel)
def flash_attention(Q, K, V, tile=128):
    T, d = Q.shape
    O = torch.zeros_like(Q)
    m = torch.full((T, 1), float('-inf'))
    l = torch.zeros(T, 1)
    for j in range(0, T, tile):
        Kj, Vj = K[j:j+tile], V[j:j+tile]
        S = Q @ Kj.T / math.sqrt(d)            # [T, tile] only!
        m_new = torch.maximum(m, S.max(-1, keepdim=True).values)
        P = torch.exp(S - m_new)
        corr = torch.exp(m - m_new)            # rescale old mass
        l = l * corr + P.sum(-1, keepdim=True)
        O = O * corr + P @ Vj
        m = m_new
    return O / l
# verify: torch.allclose(flash_attention(Q,K,V),
#         (Q@K.T/math.sqrt(d)).softmax(-1)@V, atol=1e-5)`,
  },
},
{
  id: "k-paged", family: "ml", title: "PagedAttention (Block Tables)", emoji: "📑",
  blurb: "vLLM's OS-style virtual memory for the KV cache: blocks, tables, prefix sharing.",
  frameworks: ["pytorch"],
  links: [{ label: "vLLM PagedAttention paper", url: "https://arxiv.org/abs/2309.06180" }],
  steps: [
    { prompt: "Naive serving pre-allocates max_len cache per request. With max 4096, avg 350 tokens used, the waste is…", code: `util = 350 / 4096`,
      options: ["≈ 91% of cache memory wasted", "≈ 9% wasted", "zero — unused pages cost nothing", "exactly 50% by design"], a: 0, why: "Internal fragmentation: reserved-but-unused cache is the capacity killer PagedAttention fixes." },
    { prompt: "The block table maps logical token positions → physical blocks. Token 70 with block_size 16 lives at:", code: `block_size = 16
logical_block = 70 // 16   # = 4
offset        = 70 %  16   # = 6
phys = ____`,
      options: ["block_table[seq_id][4], slot 6", "block_table[4][seq_id], slot 6", "physical block 70 directly", "block_table[seq_id][6], slot 4"], a: 0, why: "Indirection per sequence: logical block index → physical block id, then the offset within it." },
    { prompt: "Two requests share a 3k-token system prompt. PagedAttention's copy-on-write means:", code: `# both block tables point at the same physical blocks`,
      options: ["shared prefix stored once; copy a block only when one request writes", "the prompt is recomputed per request", "blocks are duplicated immediately", "the second request waits for the first"], a: 0, why: "Reference-counted shared blocks — fork semantics for the KV cache." },
  ],
  solutions: {
    pytorch: `# minimal paged KV cache (logic-level, single head)
import torch

class PagedKVCache:
    def __init__(self, n_blocks=1024, block=16, d=128):
        self.K = torch.zeros(n_blocks, block, d)
        self.V = torch.zeros(n_blocks, block, d)
        self.free = list(range(n_blocks))
        self.tables = {}            # seq_id -> [phys_block,...]
        self.lens = {}              # seq_id -> n_tokens
        self.block = block

    def append(self, seq, k, v):
        tbl = self.tables.setdefault(seq, [])
        n = self.lens.get(seq, 0)
        if n % self.block == 0:               # need a new block
            tbl.append(self.free.pop())
        b, off = tbl[n // self.block], n % self.block
        self.K[b, off], self.V[b, off] = k, v
        self.lens[seq] = n + 1

    def gather(self, seq):                    # for attention
        n, tbl = self.lens[seq], self.tables[seq]
        ks = torch.cat([self.K[b] for b in tbl])[:n]
        vs = torch.cat([self.V[b] for b in tbl])[:n]
        return ks, vs

    def fork(self, src, dst):                 # prefix sharing
        self.tables[dst] = list(self.tables[src])  # share blocks
        self.lens[dst] = self.lens[src]            # (CoW on write
                                                   # left as exercise)`,
  },
},
{
  id: "k-attnback", family: "ml", title: "Attention Backward Pass", emoji: "↩️",
  blurb: "Derive and code the gradients through softmax(QKᵀ/√d)V by hand.",
  frameworks: ["numpy"],
  links: [{ label: "3b1b · Backpropagation", url: "https://www.youtube.com/watch?v=Ilg3gGewQ5U" }, { label: "Karpathy · micrograd", url: "https://github.com/karpathy/micrograd" }],
  steps: [
    { prompt: "Forward: O = P V where P = softmax(S). Given dO (= ∂L/∂O), the easy gradients first:", code: `dV = ____
dP = ____`,
      options: ["P.T @ dO  /  dO @ V.T", "dO @ P.T  /  V @ dO.T", "P @ dO  /  dO @ V", "dO.T @ P  /  V.T @ dO"], a: 0, why: "O = P V is a plain matmul: dV = Pᵀ dO and dP = dO Vᵀ — shapes [T,d] and [T,T]." },
    { prompt: "The softmax Jacobian, row-wise. The gradient through P = softmax(S):", code: `# per row i:  dS_i = P_i ⊙ (dP_i − (dP_i · P_i))
dS = P * (dP - ____)`,
      options: ["(dP * P).sum(-1, keepdims=True)", "dP.sum(-1, keepdims=True)", "P.sum(-1, keepdims=True)", "(dP - P).mean(-1, keepdims=True)"], a: 0, why: "softmax's Jacobian is diag(p) − ppᵀ; contracted with dP it gives p⊙(dP − ⟨dP,p⟩)." },
    { prompt: "Finish: S = QKᵀ/√d. The last gradients:", code: `dQ = ____ / sqrt(d)
dK = ____ / sqrt(d)`,
      options: ["dS @ K  /  dS.T @ Q", "dS @ Q  /  dS.T @ K", "K @ dS  /  Q @ dS.T", "dS.T @ K  /  dS @ Q"], a: 0, why: "S = QKᵀ ⇒ dQ = dS·K, dK = dSᵀ·Q — then the scalar 1/√d rides along." },
  ],
  solutions: {
    numpy: `import numpy as np
def softmax(x):
    e = np.exp(x - x.max(-1, keepdims=True))
    return e / e.sum(-1, keepdims=True)

def attn_forward(Q, K, V):
    d = Q.shape[-1]
    S = Q @ K.T / np.sqrt(d)
    P = softmax(S)
    return P @ V, (Q, K, V, P)

def attn_backward(dO, cache):
    Q, K, V, P = cache
    d = Q.shape[-1]
    dV = P.T @ dO
    dP = dO @ V.T
    dS = P * (dP - (dP * P).sum(-1, keepdims=True))  # softmax jac
    dQ = dS @ K / np.sqrt(d)
    dK = dS.T @ Q / np.sqrt(d)
    return dQ, dK, dV

# gradient-check against finite differences to trust it:
# f(Q) = attn_forward(Q,K,V)[0].sum(); compare numerical dQ.`,
  },
},
{
  id: "k-lora", family: "ml", title: "LoRA from Scratch", emoji: "🪡",
  blurb: "Low-rank adapters: freeze W, learn BA, merge at inference. ~0.5% of the parameters.",
  frameworks: ["pytorch"],
  links: [{ label: "LoRA paper", url: "https://arxiv.org/abs/2106.09685" }],
  steps: [
    { prompt: "LoRA replaces h = Wx with:", code: `h = W x + ____   # W frozen`,
      options: ["(alpha/r) · B A x", "B + A x", "W B A x", "alpha · (B + A) x"], a: 0, why: "A: d→r down-project, B: r→d up-project; α/r scales the update. Only A, B train." },
    { prompt: "Initialization that makes step 0 a no-op:", code: `A = ____
B = ____`,
      options: ["gaussian / zeros", "zeros / gaussian — either way", "zeros / zeros", "gaussian / gaussian"], a: 0, why: "B = 0 ⇒ BA = 0 at start: the model begins exactly at the pretrained function. (A=0,B=0 would kill A's gradient too.)" },
    { prompt: "Parameter math: d=4096, r=16 vs full fine-tuning of W (4096²):", code: `lora_params = 2 * 4096 * 16
ratio = lora_params / 4096**2`,
      options: ["≈ 0.8% of full fine-tuning", "≈ 8% of full fine-tuning", "≈ 50% of full fine-tuning", "more than full fine-tuning"], a: 0, why: "131k vs 16.8M per matrix — and the update merges into W at inference: zero added latency." },
  ],
  solutions: {
    pytorch: `import torch, torch.nn as nn

class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, r=16, alpha=32):
        super().__init__()
        self.base = base
        for p in self.base.parameters():
            p.requires_grad = False          # freeze W
        d_in, d_out = base.in_features, base.out_features
        self.A = nn.Parameter(torch.randn(r, d_in) * 0.01)
        self.B = nn.Parameter(torch.zeros(d_out, r))   # start = no-op
        self.scale = alpha / r

    def forward(self, x):
        return self.base(x) + self.scale * (x @ self.A.T @ self.B.T)

    @torch.no_grad()
    def merge(self):                         # fold into W for serving
        self.base.weight += self.scale * (self.B @ self.A)

# usage: wrap q_proj/v_proj of each attention layer,
# train only params where requires_grad=True (~0.5-1% of model).`,
  },
},
{
  id: "k-mlp", family: "ml", title: "MLP Forward & Backward", emoji: "🧮",
  blurb: "The fundamentals: two layers, ReLU, chain rule, gradient check.",
  frameworks: ["numpy"],
  links: [{ label: "3b1b · Backpropagation calculus", url: "https://www.youtube.com/watch?v=tIeHLnjs5U8" }, { label: "Karpathy · micrograd", url: "https://github.com/karpathy/micrograd" }],
  steps: [
    { prompt: "Forward: X→[W1,ReLU]→H→[W2]→logits. The hidden layer:", code: `Z1 = X @ W1 + b1
H  = ____`,
      options: ["np.maximum(0, Z1)", "np.exp(Z1)", "Z1 / np.abs(Z1)", "np.sign(Z1)"], a: 0, why: "ReLU: elementwise max(0, z). Remember Z1 — its sign gates the backward pass." },
    { prompt: "Backward through ReLU:", code: `dZ1 = dH * ____`,
      options: ["(Z1 > 0)", "(H > 1)", "Z1", "np.exp(-Z1)"], a: 0, why: "ReLU's derivative is the 0/1 mask of where the pre-activation was positive." },
    { prompt: "The weight gradient for W1 (X is [N, d_in], dZ1 is [N, d_h]):", code: `dW1 = ____ / N`,
      options: ["X.T @ dZ1", "dZ1 @ X.T", "X @ dZ1.T", "dZ1.T @ dZ1"], a: 0, why: "Shapes must yield [d_in, d_h]: input-transposed times upstream gradient, averaged over batch." },
  ],
  solutions: {
    numpy: `import numpy as np

def forward(X, p):
    Z1 = X @ p['W1'] + p['b1']
    H  = np.maximum(0, Z1)
    logits = H @ p['W2'] + p['b2']
    return logits, (X, Z1, H)

def backward(dlogits, cache, p):
    X, Z1, H = cache; N = X.shape[0]
    dW2 = H.T @ dlogits / N
    db2 = dlogits.mean(0)
    dH  = dlogits @ p['W2'].T
    dZ1 = dH * (Z1 > 0)               # ReLU gate
    dW1 = X.T @ dZ1 / N
    db1 = dZ1.mean(0)
    return {'W1': dW1, 'b1': db1, 'W2': dW2, 'b2': db2}

# gradient check (do this EVERY time you hand-write a backward):
# num = (loss(W+eps) - loss(W-eps)) / (2*eps)  vs analytic — agree to ~1e-6.`,
  },
},
{
  id: "k-trainloop", family: "ml", title: "Training Loop (PyTorch & JAX)", emoji: "🔁",
  blurb: "The five-step heartbeat — and the JAX way: pure functions, grad transforms, jit.",
  frameworks: ["pytorch", "jax"],
  links: [{ label: "3b1b · Gradient descent", url: "https://www.youtube.com/watch?v=IHZwWFHWa-w" }, { label: "Karpathy · A Recipe for Training NNs", url: "https://karpathy.github.io/2019/04/25/recipe/" }],
  steps: [
    { prompt: "PyTorch's canonical five-step loop. What's missing — and where?", code: `for x, y in loader:
    loss = criterion(model(x), y)
    loss.backward()
    optimizer.step()`,
      options: ["optimizer.zero_grad() before backward", "model.eval() before forward", "loss.detach() after backward", "torch.no_grad() around step"], a: 0, why: ".backward() ACCUMULATES into .grad — without zeroing, every step uses stale gradient sums. The classic bug." },
    { prompt: "JAX differs fundamentally: gradients come from…", code: `loss_fn = lambda params, x, y: ce(model_apply(params, x), y)
grads = ____(loss_fn)(params, x, y)`,
      options: ["jax.grad — transforming the pure function", "calling .backward() on the loss", "a tape recorded during forward", "params.grad attributes"], a: 0, why: "JAX is functional: grad() returns a NEW function computing ∂loss/∂params. No mutation, no tape objects." },
    { prompt: "Why must the JAX update be written like this rather than `params -= lr*grads` in place?", code: `params = jax.tree.map(
    lambda p, g: p - lr * g, params, grads)`,
      options: ["jit-compiled functions require pure, immutable updates", "JAX arrays don't support subtraction", "tree.map is faster than subtraction", "it prevents NaN gradients"], a: 0, why: "Purity is the contract that lets jit/vmap/pmap transform your code; in-place mutation breaks it." },
  ],
  solutions: {
    pytorch: `import torch
model, opt = MyModel(), None
opt = torch.optim.AdamW(model.parameters(), lr=3e-4)
crit = torch.nn.CrossEntropyLoss()

for epoch in range(epochs):
    model.train()
    for x, y in loader:
        opt.zero_grad()                  # 1 clear
        loss = crit(model(x), y)         # 2 forward
        loss.backward()                  # 3 backprop
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()                       # 4 update
    # 5 validate under no_grad + model.eval()`,
    jax: `import jax, jax.numpy as jnp, optax

opt = optax.adamw(3e-4)
opt_state = opt.init(params)

def loss_fn(params, x, y):
    logits = model_apply(params, x)
    return optax.softmax_cross_entropy_with_integer_labels(
        logits, y).mean()

@jax.jit                                  # compile the whole step
def train_step(params, opt_state, x, y):
    loss, grads = jax.value_and_grad(loss_fn)(params, x, y)
    updates, opt_state = opt.update(grads, opt_state, params)
    params = optax.apply_updates(params, updates)
    return params, opt_state, loss

for x, y in loader:
    params, opt_state, loss = train_step(params, opt_state, x, y)`,
  },
},
{
  id: "k-dspy", family: "ml", title: "RLM with DSPy", emoji: "🧠",
  blurb: "Program—don't prompt: signatures, modules, and compiling a reasoning LM pipeline.",
  frameworks: ["pytorch"],
  links: [{ label: "DSPy docs", url: "https://dspy.ai/" }],
  steps: [
    { prompt: "DSPy's core abstraction — a Signature — declares:", code: `class TriageNote(dspy.Signature):
    """Extract acuity from a clinical note."""
    note: str = dspy.InputField()
    acuity: str = dspy.OutputField(desc="ESI level 1-5")`,
      options: ["typed inputs/outputs — the WHAT, leaving the prompt HOW to the compiler", "the exact prompt template verbatim", "the model's weights to fine-tune", "a regex over model outputs"], a: 0, why: "Signatures are contracts; DSPy generates and optimizes the actual prompting strategy." },
    { prompt: "Turning that signature into a reasoning module:", code: `triage = ____(TriageNote)
result = triage(note="68M, chest pain radiating...")`,
      options: ["dspy.ChainOfThought", "dspy.compile", "dspy.Retrieve", "dspy.Assert"], a: 0, why: "ChainOfThought wraps the signature with a learned reasoning step before the output fields." },
    { prompt: "The 'RL' in modern DSPy pipelines: optimizers like MIPROv2 / GRPO-style teleprompters improve the program by…", code: `opt = dspy.MIPROv2(metric=acuity_match)
compiled = opt.compile(triage, trainset=examples)`,
      options: ["searching over instructions/demos scored by your metric", "backpropagating through the LLM weights", "increasing the temperature gradually", "caching previous responses"], a: 0, why: "Programmatic optimization: propose prompts/few-shots, evaluate with the metric, keep what scores — RL-flavored search over the program, not the weights." },
  ],
  solutions: {
    pytorch: `import dspy

lm = dspy.LM("openai/gpt-4o-mini")        # or ollama_chat/llama3
dspy.configure(lm=lm)

class TriageNote(dspy.Signature):
    """Extract ESI acuity (1-5) from a clinical note."""
    note: str = dspy.InputField()
    rationale: str = dspy.OutputField()
    acuity: int = dspy.OutputField()

class Triage(dspy.Module):
    def __init__(self):
        self.classify = dspy.ChainOfThought(TriageNote)
    def forward(self, note):
        return self.classify(note=note)

def metric(example, pred, trace=None):
    return int(example.acuity == pred.acuity)

opt = dspy.MIPROv2(metric=metric, auto="light")
compiled = opt.compile(Triage(), trainset=train_examples)
compiled.save("triage_v1.json")   # the optimized program`,
  },
},
{
  id: "k-twosum", family: "swe", title: "Two Sum (Blind 75 #1)", emoji: "🎯",
  blurb: "The hash-map pattern that opens half of Blind 75: trade memory for a single pass.",
  frameworks: ["pytorch"],
  links: [{ label: "NeetCode · Two Sum", url: "https://neetcode.io/problems/two-integer-sum" }],
  steps: [
    { prompt: "Brute force is O(n²). The one-pass insight: while scanning, ask…", code: `for i, x in enumerate(nums):
    need = target - x
    if ____: return [seen[need], i]
    seen[x] = i`,
      options: ["need in seen", "x in seen", "need == x", "i in seen"], a: 0, why: "Have I already SEEN my complement? Hash lookup O(1) makes the whole scan O(n)." },
    { prompt: "Why insert AFTER the check, not before?", code: `# check first, then seen[x] = i`,
      options: ["so an element can't match itself (e.g., target 6, x 3)", "to keep the map sorted", "insertion order matters for the answer", "it avoids hash collisions"], a: 0, why: "Insert-first would let need==x find its own index — a self-pairing bug." },
    { prompt: "Pattern transfer — this same complement-lookup shape powers which ML routine?", code: `seen = {}  # value -> index`,
      options: ["dedup/inverted-index lookups in retrieval pipelines", "matrix multiplication tiling", "the softmax Jacobian", "gradient clipping"], a: 0, why: "Hash-the-thing-you'll-need-later is the universal pattern: exact-match retrieval, caching, dedup." },
  ],
  solutions: {
    pytorch: `def two_sum(nums, target):
    seen = {}                      # value -> index
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], i]
        seen[x] = i
    return []
# O(n) time, O(n) space — vs O(n²)/O(1) brute force.`,
  },
},
{
  id: "k-slidewin", family: "swe", title: "Longest Substring (Sliding Window)", emoji: "🪟",
  blurb: "Blind 75's sliding window — the same window you met in sliding-window ATTENTION.",
  frameworks: ["pytorch"],
  links: [
    { label: "NeetCode · Longest Substring", url: "https://neetcode.io/problems/longest-substring-without-duplicates" },
  ],
  steps: [
    { prompt: "Longest substring without repeats. Window [left, right]; on a duplicate we…", code: `for right, c in enumerate(s):
    while c in window:
        ____
    window.add(c)`,
      options: ["window.remove(s[left]); left += 1", "right -= 1", "window.clear()", "left = right"], a: 0, why: "Shrink from the LEFT until the duplicate leaves — each pointer moves at most n times: O(n) total." },
    { prompt: "Why is this O(n), not O(n²), despite the nested while?", code: `# left and right each only move forward`,
      options: ["amortized: each index enters and leaves the window once", "the while loop runs at most twice", "sets make membership O(0)", "it isn't — it's O(n²)"], a: 0, why: "Two monotone pointers = 2n total moves. The amortized argument behind every sliding-window proof." },
    { prompt: "The ML rhyme: sliding-window ATTENTION (Attention world) uses the same shape because…", code: `# token t attends to [t-W, t]`,
      options: ["a bounded recent-context window caps cost at O(n·W) instead of O(n²)", "attention also forbids duplicate tokens", "both use hash sets internally", "coincidence — no shared idea"], a: 0, why: "Same trade in both worlds: bound the window, bound the cost, accept local context." },
  ],
  solutions: {
    pytorch: `def longest_substring(s):
    window, left, best = set(), 0, 0
    for right, c in enumerate(s):
        while c in window:           # shrink until valid
            window.remove(s[left])
            left += 1
        window.add(c)
        best = max(best, right - left + 1)
    return best
# O(n) time, O(min(n, alphabet)) space.`,
  },
},
{
  id: "k-sysdesign", family: "sys", title: "System Design: LLM Inference Server", emoji: "🏰",
  blurb: "A guided design interview: KV cache, paging, continuous batching, autoscaling — everything the Inference world taught, composed.",
  frameworks: ["pytorch"],
  links: [{ label: "vLLM paper", url: "https://arxiv.org/abs/2309.06180" }],
  steps: [
    { prompt: "Requirements: 70B model, p50 < 400ms first token, hundreds of concurrent chats. First architectural split:", code: `# phase 1: prompt processing   phase 2: token generation`,
      options: ["separate prefill and decode scheduling — different bottlenecks", "one queue, FIFO, identical handling", "decode first, prefill later", "one GPU per user"], a: 0, why: "Prefill is compute-bound and bursty; decode is memory-bound and steady. Mixing them naively lets long prefills stall everyone's decode." },
    { prompt: "Memory plan: cache capacity decides concurrency. Your levers, in architecture and in serving:", code: `cache_bytes = layers * kv_heads * head_dim * seq * 2 * 2`,
      options: ["GQA/MLA model choice + PagedAttention blocks + prefix sharing", "more CPU RAM only", "smaller batch sizes only", "longer max_seq to amortize"], a: 0, why: "Attack every factor: kv_heads (architecture), fragmentation (paging), duplicated prompts (sharing)." },
    { prompt: "Scheduling: a 30-token query is stuck behind a 4000-token generation. The fix and its granularity:", code: `# admission/eviction every ____`,
      options: ["iteration — continuous batching at token granularity", "batch — wait for all to finish", "minute — autoscaler handles it", "request — FIFO is fairest"], a: 0, why: "Iteration-level scheduling: finished sequences leave, waiting ones join, every step. The single biggest throughput win in modern serving." },
  ],
  solutions: {
    pytorch: `# Design sketch (interview whiteboard form)
#
#  client → [gateway: auth, rate-limit, streaming SSE]
#        → [router: session affinity, prefix-cache aware]
#        → [scheduler]
#             • two queues: prefill / decode
#             • continuous batching @ token granularity
#             • priority: SLO class, then fairness
#        → [workers: TP within node (NVLink), PP across]
#             • PagedAttention KV pool, block=16
#             • prefix sharing (system prompts, few-shots)
#             • speculative decoding (draft 1B model)
#        → [autoscaler]
#             • signal: KV-pool utilization, queue depth
#             • scale OUT replicas, never split TP groups
#  observability: tokens/s, TTFT p50/p99, cache hit %,
#                 preemption rate, per-request cost.
#
# Capacity math to memorize:
#   concurrency ≈ kv_pool_bytes / (avg_ctx * bytes_per_token)
#   bytes_per_token = layers*kv_heads*head_dim*2*2`,
  },
},
];



const BLIND75_EXTRA = [
  { id: "b75-3-best-time-to-buy-and-sell-stock", family: "swe", title: "Best Time to Buy and Sell Stock (Blind 75 #3)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Best Time to Buy and Sell Stock.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Best Time to Buy and Sell Stock
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-4-contains-duplicate", family: "swe", title: "Contains Duplicate (Blind 75 #4)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Contains Duplicate.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Contains Duplicate
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-5-product-of-array-except-self", family: "swe", title: "Product of Array Except Self (Blind 75 #5)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Product of Array Except Self.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Product of Array Except Self
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-6-maximum-subarray", family: "swe", title: "Maximum Subarray (Blind 75 #6)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Maximum Subarray.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Maximum Subarray
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-7-maximum-product-subarray", family: "swe", title: "Maximum Product Subarray (Blind 75 #7)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Maximum Product Subarray.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Maximum Product Subarray
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-8-find-minimum-in-rotated-sorted-array", family: "swe", title: "Find Minimum in Rotated Sorted Array (Blind 75 #8)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Find Minimum in Rotated Sorted Array.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Find Minimum in Rotated Sorted Array
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-9-search-in-rotated-sorted-array", family: "swe", title: "Search in Rotated Sorted Array (Blind 75 #9)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Search in Rotated Sorted Array.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Search in Rotated Sorted Array
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-10-3sum", family: "swe", title: "3Sum (Blind 75 #10)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for 3Sum.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# 3Sum
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-11-container-with-most-water", family: "swe", title: "Container With Most Water (Blind 75 #11)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Container With Most Water.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Container With Most Water
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-12-valid-parentheses", family: "swe", title: "Valid Parentheses (Blind 75 #12)", emoji: "🧩", blurb: "Blind 75 arrays/hash pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Valid Parentheses.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Valid Parentheses
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-13-valid-anagram", family: "swe", title: "Valid Anagram (Blind 75 #13)", emoji: "🧩", blurb: "Blind 75 strings pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Valid Anagram.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Valid Anagram
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-14-group-anagrams", family: "swe", title: "Group Anagrams (Blind 75 #14)", emoji: "🧩", blurb: "Blind 75 strings pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Group Anagrams.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Group Anagrams
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-15-minimum-window-substring", family: "swe", title: "Minimum Window Substring (Blind 75 #15)", emoji: "🧩", blurb: "Blind 75 strings pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Minimum Window Substring.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Minimum Window Substring
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-16-valid-palindrome", family: "swe", title: "Valid Palindrome (Blind 75 #16)", emoji: "🧩", blurb: "Blind 75 strings pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Valid Palindrome.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Valid Palindrome
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-17-longest-repeating-character-replacement", family: "swe", title: "Longest Repeating Character Replacement (Blind 75 #17)", emoji: "🧩", blurb: "Blind 75 strings pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Longest Repeating Character Replacement.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Longest Repeating Character Replacement
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-18-encode-and-decode-strings", family: "swe", title: "Encode and Decode Strings (Blind 75 #18)", emoji: "🧩", blurb: "Blind 75 strings pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Encode and Decode Strings.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Encode and Decode Strings
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-19-reverse-linked-list", family: "swe", title: "Reverse Linked List (Blind 75 #19)", emoji: "🧩", blurb: "Blind 75 linked lists pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Reverse Linked List.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Reverse Linked List
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-20-merge-two-sorted-lists", family: "swe", title: "Merge Two Sorted Lists (Blind 75 #20)", emoji: "🧩", blurb: "Blind 75 linked lists pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Merge Two Sorted Lists.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Merge Two Sorted Lists
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-21-reorder-list", family: "swe", title: "Reorder List (Blind 75 #21)", emoji: "🧩", blurb: "Blind 75 linked lists pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Reorder List.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Reorder List
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-22-remove-nth-node-from-end", family: "swe", title: "Remove Nth Node From End (Blind 75 #22)", emoji: "🧩", blurb: "Blind 75 linked lists pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Remove Nth Node From End.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Remove Nth Node From End
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-23-linked-list-cycle", family: "swe", title: "Linked List Cycle (Blind 75 #23)", emoji: "🧩", blurb: "Blind 75 linked lists pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Linked List Cycle.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Linked List Cycle
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-24-merge-k-sorted-lists", family: "swe", title: "Merge K Sorted Lists (Blind 75 #24)", emoji: "🧩", blurb: "Blind 75 linked lists pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Merge K Sorted Lists.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Merge K Sorted Lists
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-25-invert-binary-tree", family: "swe", title: "Invert Binary Tree (Blind 75 #25)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Invert Binary Tree.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Invert Binary Tree
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-26-maximum-depth-of-binary-tree", family: "swe", title: "Maximum Depth of Binary Tree (Blind 75 #26)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Maximum Depth of Binary Tree.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Maximum Depth of Binary Tree
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-27-same-tree", family: "swe", title: "Same Tree (Blind 75 #27)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Same Tree.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Same Tree
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-28-subtree-of-another-tree", family: "swe", title: "Subtree of Another Tree (Blind 75 #28)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Subtree of Another Tree.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Subtree of Another Tree
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-29-lowest-common-ancestor-of-bst", family: "swe", title: "Lowest Common Ancestor of BST (Blind 75 #29)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Lowest Common Ancestor of BST.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Lowest Common Ancestor of BST
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-30-binary-tree-level-order-traversal", family: "swe", title: "Binary Tree Level Order Traversal (Blind 75 #30)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Binary Tree Level Order Traversal.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Binary Tree Level Order Traversal
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-31-validate-binary-search-tree", family: "swe", title: "Validate Binary Search Tree (Blind 75 #31)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Validate Binary Search Tree.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Validate Binary Search Tree
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-32-kth-smallest-element-in-bst", family: "swe", title: "Kth Smallest Element in BST (Blind 75 #32)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Kth Smallest Element in BST.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Kth Smallest Element in BST
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-33-construct-tree-from-preorder-and-inorder", family: "swe", title: "Construct Tree from Preorder and Inorder (Blind 75 #33)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Construct Tree from Preorder and Inorder.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Construct Tree from Preorder and Inorder
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-34-binary-tree-maximum-path-sum", family: "swe", title: "Binary Tree Maximum Path Sum (Blind 75 #34)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Binary Tree Maximum Path Sum.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Binary Tree Maximum Path Sum
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-35-serialize-and-deserialize-binary-tree", family: "swe", title: "Serialize and Deserialize Binary Tree (Blind 75 #35)", emoji: "🧩", blurb: "Blind 75 trees pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Serialize and Deserialize Binary Tree.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Serialize and Deserialize Binary Tree
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-36-clone-graph", family: "swe", title: "Clone Graph (Blind 75 #36)", emoji: "🧩", blurb: "Blind 75 graphs pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Clone Graph.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Clone Graph
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-37-course-schedule", family: "swe", title: "Course Schedule (Blind 75 #37)", emoji: "🧩", blurb: "Blind 75 graphs pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Course Schedule.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Course Schedule
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-38-pacific-atlantic-water-flow", family: "swe", title: "Pacific Atlantic Water Flow (Blind 75 #38)", emoji: "🧩", blurb: "Blind 75 graphs pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Pacific Atlantic Water Flow.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Pacific Atlantic Water Flow
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-39-number-of-islands", family: "swe", title: "Number of Islands (Blind 75 #39)", emoji: "🧩", blurb: "Blind 75 graphs pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Number of Islands.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Number of Islands
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-40-longest-consecutive-sequence", family: "swe", title: "Longest Consecutive Sequence (Blind 75 #40)", emoji: "🧩", blurb: "Blind 75 graphs pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Longest Consecutive Sequence.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Longest Consecutive Sequence
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-41-alien-dictionary", family: "swe", title: "Alien Dictionary (Blind 75 #41)", emoji: "🧩", blurb: "Blind 75 graphs pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Alien Dictionary.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Alien Dictionary
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-42-graph-valid-tree", family: "swe", title: "Graph Valid Tree (Blind 75 #42)", emoji: "🧩", blurb: "Blind 75 intervals/matrices pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Graph Valid Tree.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Graph Valid Tree
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-43-number-of-connected-components", family: "swe", title: "Number of Connected Components (Blind 75 #43)", emoji: "🧩", blurb: "Blind 75 intervals/matrices pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Number of Connected Components.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Number of Connected Components
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-44-insert-interval", family: "swe", title: "Insert Interval (Blind 75 #44)", emoji: "🧩", blurb: "Blind 75 intervals/matrices pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Insert Interval.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Insert Interval
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-45-merge-intervals", family: "swe", title: "Merge Intervals (Blind 75 #45)", emoji: "🧩", blurb: "Blind 75 intervals/matrices pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Merge Intervals.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Merge Intervals
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-46-non-overlapping-intervals", family: "swe", title: "Non-overlapping Intervals (Blind 75 #46)", emoji: "🧩", blurb: "Blind 75 intervals/matrices pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Non-overlapping Intervals.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Non-overlapping Intervals
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-47-meeting-rooms", family: "swe", title: "Meeting Rooms (Blind 75 #47)", emoji: "🧩", blurb: "Blind 75 intervals/matrices pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Meeting Rooms.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Meeting Rooms
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-48-meeting-rooms-ii", family: "swe", title: "Meeting Rooms II (Blind 75 #48)", emoji: "🧩", blurb: "Blind 75 intervals/matrices pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Meeting Rooms II.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Meeting Rooms II
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-49-spiral-matrix", family: "swe", title: "Spiral Matrix (Blind 75 #49)", emoji: "🧩", blurb: "Blind 75 intervals/matrices pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Spiral Matrix.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Spiral Matrix
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-50-set-matrix-zeroes", family: "swe", title: "Set Matrix Zeroes (Blind 75 #50)", emoji: "🧩", blurb: "Blind 75 intervals/matrices pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Set Matrix Zeroes.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Set Matrix Zeroes
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-51-rotate-image", family: "swe", title: "Rotate Image (Blind 75 #51)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Rotate Image.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Rotate Image
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-52-word-search", family: "swe", title: "Word Search (Blind 75 #52)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Word Search.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Word Search
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-53-jump-game", family: "swe", title: "Jump Game (Blind 75 #53)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Jump Game.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Jump Game
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-54-coin-change", family: "swe", title: "Coin Change (Blind 75 #54)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Coin Change.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Coin Change
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-55-longest-increasing-subsequence", family: "swe", title: "Longest Increasing Subsequence (Blind 75 #55)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Longest Increasing Subsequence.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Longest Increasing Subsequence
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-56-longest-common-subsequence", family: "swe", title: "Longest Common Subsequence (Blind 75 #56)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Longest Common Subsequence.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Longest Common Subsequence
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-57-word-break", family: "swe", title: "Word Break (Blind 75 #57)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Word Break.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Word Break
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-58-combination-sum", family: "swe", title: "Combination Sum (Blind 75 #58)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Combination Sum.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Combination Sum
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-59-house-robber", family: "swe", title: "House Robber (Blind 75 #59)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for House Robber.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# House Robber
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-60-house-robber-ii", family: "swe", title: "House Robber II (Blind 75 #60)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for House Robber II.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# House Robber II
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-61-decode-ways", family: "swe", title: "Decode Ways (Blind 75 #61)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Decode Ways.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Decode Ways
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-62-unique-paths", family: "swe", title: "Unique Paths (Blind 75 #62)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Unique Paths.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Unique Paths
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-63-climbing-stairs", family: "swe", title: "Climbing Stairs (Blind 75 #63)", emoji: "🧩", blurb: "Blind 75 dynamic programming pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Climbing Stairs.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Climbing Stairs
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-64-maximum-depth-n-ary--tree-variant", family: "swe", title: "Maximum Depth N-ary / Tree Variant (Blind 75 #64)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Maximum Depth N-ary / Tree Variant.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Maximum Depth N-ary / Tree Variant
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-65-counting-bits", family: "swe", title: "Counting Bits (Blind 75 #65)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Counting Bits.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Counting Bits
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-66-missing-number", family: "swe", title: "Missing Number (Blind 75 #66)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Missing Number.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Missing Number
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-67-reverse-bits", family: "swe", title: "Reverse Bits (Blind 75 #67)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Reverse Bits.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Reverse Bits
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-68-number-of-1-bits", family: "swe", title: "Number of 1 Bits (Blind 75 #68)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Number of 1 Bits.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Number of 1 Bits
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-69-sum-of-two-integers", family: "swe", title: "Sum of Two Integers (Blind 75 #69)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Sum of Two Integers.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Sum of Two Integers
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-70-implement-trie", family: "swe", title: "Implement Trie (Blind 75 #70)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Implement Trie.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Implement Trie
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-71-add-and-search-word", family: "swe", title: "Add and Search Word (Blind 75 #71)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Add and Search Word.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Add and Search Word
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-72-word-search-ii", family: "swe", title: "Word Search II (Blind 75 #72)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Word Search II.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Word Search II
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-73-top-k-frequent-elements", family: "swe", title: "Top K Frequent Elements (Blind 75 #73)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Top K Frequent Elements.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Top K Frequent Elements
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-74-find-median-from-data-stream", family: "swe", title: "Find Median from Data Stream (Blind 75 #74)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Find Median from Data Stream.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Find Median from Data Stream
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
  { id: "b75-75-sliding-window-maximum", family: "swe", title: "Sliding Window Maximum (Blind 75 #75)", emoji: "🧩", blurb: "Blind 75 bits/data structures pattern drill: identify the invariant, code the minimal solution, then compare to the reference.", frameworks: ["python"], steps: [{ prompt: "State the core invariant/pattern for Sliding Window Maximum.", code: "# TODO: write the invariant before coding", options: ["track a small state that makes each step locally checkable", "try every subset without pruning", "sort randomly until it works", "ignore edge cases"], a: 0, why: "Most Blind 75 problems unlock once the invariant is explicit." }], solutions: { python: `# Sliding Window Maximum
# Sketch the canonical Blind 75 solution here: define inputs, maintain the invariant, handle edge cases, and test small examples.
` }, links: [{ label: "NeetCode roadmap", url: "https://neetcode.io/roadmap" }] },
];

/* ============================================================
   TORCHLEET — practical PyTorch workthroughs
   Source: github.com/Exorust/TorchLeet (Chandrahas Aroori)
   Fill the TODOs in the workspace, reveal the reference,
   get an AI review. Copy starters into your local env to run
   torch (the in-browser lab runs python/numpy katas only).
   ============================================================ */
const TORCHLEET = [
{ id: "tl-linreg", family: "torchleet", emoji: "📈", tier: "BASIC",
  title: "Linear Regression", blurb: "The five-step training heartbeat on the simplest possible model.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/basic/lin-regression/lin-regression.ipynb" }],
  starter: `import torch, torch.nn as nn

X = torch.rand(100, 1) * 10
y = 2 * X + 3 + torch.randn(100, 1)

class LinearRegressionModel(nn.Module):
    def __init__(self):
        super().__init__()
        # TODO: one linear layer, 1 -> 1
    def forward(self, x):
        # TODO
        pass

model = LinearRegressionModel()
criterion = None   # TODO: which loss for regression?
optimizer = None   # TODO: SGD, lr=0.01

for epoch in range(1000):
    # TODO: the 5 steps — zero, forward, loss, backward, step
    pass

print([p.item() for p in model.parameters()])  # ≈ [2, 3]`,
  solution: `class LinearRegressionModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = nn.Linear(1, 1)
    def forward(self, x):
        return self.linear(x)

model = LinearRegressionModel()
criterion = nn.MSELoss()
optimizer = torch.optim.SGD(model.parameters(), lr=0.01)

for epoch in range(1000):
    optimizer.zero_grad()          # 1 clear stale grads
    pred = model(X)                # 2 forward
    loss = criterion(pred, y)      # 3 loss
    loss.backward()                # 4 backprop
    optimizer.step()               # 5 update
# weight → ~2, bias → ~3` },
{ id: "tl-dataset", family: "torchleet", emoji: "🗂️", tier: "BASIC",
  title: "Custom Dataset & DataLoader", blurb: "Load from CSV: __len__, __getitem__, batching.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/basic/custom-dataset/custom-dataset.ipynb" }],
  starter: `import torch, pandas as pd
from torch.utils.data import Dataset, DataLoader

class CSVDataset(Dataset):
    def __init__(self, path):
        # TODO: read csv; split features / label column
        pass
    def __len__(self):
        # TODO
        pass
    def __getitem__(self, idx):
        # TODO: return (x_tensor, y_tensor) for one row
        pass

loader = DataLoader(CSVDataset("data.csv"),
                    batch_size=32, shuffle=True)
for xb, yb in loader:
    print(xb.shape, yb.shape); break`,
  solution: `class CSVDataset(Dataset):
    def __init__(self, path):
        df = pd.read_csv(path)
        self.X = torch.tensor(df.iloc[:, :-1].values,
                              dtype=torch.float32)
        self.y = torch.tensor(df.iloc[:, -1].values,
                              dtype=torch.float32).unsqueeze(1)
    def __len__(self):
        return len(self.X)
    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]
# DataLoader handles batching, shuffling, and parallel
# workers — __getitem__ only ever sees ONE example.` },
{ id: "tl-huber", family: "torchleet", emoji: "🛡️", tier: "BASIC",
  title: "Custom Loss (Huber)", blurb: "L2 near zero, L1 in the tails — robust regression, by hand.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/basic/custom-loss/custom-loss.ipynb" }],
  starter: `import torch, torch.nn as nn

class HuberLoss(nn.Module):
    def __init__(self, delta=1.0):
        super().__init__()
        self.delta = delta
    def forward(self, y_pred, y):
        # TODO:
        #  err = y - y_pred
        #  |err| <= delta : 0.5 * err^2
        #  |err| >  delta : delta * (|err| - 0.5*delta)
        # hint: torch.where — and it must handle batches
        pass

# sanity: matches nn.HuberLoss()
print(HuberLoss()(torch.tensor([2.5]), torch.tensor([1.0])))`,
  solution: `class HuberLoss(nn.Module):
    def __init__(self, delta=1.0):
        super().__init__()
        self.delta = delta
    def forward(self, y_pred, y):
        err = y - y_pred
        abs_err = err.abs()
        quad = 0.5 * err ** 2
        lin  = self.delta * (abs_err - 0.5 * self.delta)
        return torch.where(abs_err <= self.delta,
                           quad, lin).mean()
# torch.where keeps it vectorized & differentiable —
# no python if on tensor values (that breaks batching).` },
{ id: "tl-dnn", family: "torchleet", emoji: "🕸️", tier: "BASIC",
  title: "Deep Neural Network", blurb: "Stack Linear+ReLU into an MLP classifier, train it end to end.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/basic/custom-DNN/custon-DNN.ipynb" }],
  starter: `import torch, torch.nn as nn

class DNN(nn.Module):
    def __init__(self, d_in=20, d_hidden=64, n_classes=3):
        super().__init__()
        # TODO: Sequential — Linear, ReLU, Linear, ReLU, Linear
    def forward(self, x):
        # TODO
        pass

model = DNN()
# TODO: pick the right loss for multi-class classification
# (careful: does it want logits or probabilities?)
criterion = None
opt = torch.optim.AdamW(model.parameters(), lr=1e-3)`,
  solution: `class DNN(nn.Module):
    def __init__(self, d_in=20, d_hidden=64, n_classes=3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_in, d_hidden), nn.ReLU(),
            nn.Linear(d_hidden, d_hidden), nn.ReLU(),
            nn.Linear(d_hidden, n_classes),   # raw logits!
        )
    def forward(self, x):
        return self.net(x)

criterion = nn.CrossEntropyLoss()
# CrossEntropyLoss applies log-softmax itself — the classic
# bug is adding a Softmax layer before it (double softmax).` },
{ id: "tl-cnn", family: "torchleet", emoji: "🖼️", tier: "EASY",
  title: "CNN on CIFAR-10", blurb: "Conv→pool→flatten→linear, and the shape arithmetic in between.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/easy/cnn/CNN.ipynb" },
          { label: "CNN Explainer", url: "https://poloclub.github.io/cnn-explainer/" },
          { label: "Fei-Fei Li's CS231n notes", url: "https://cs231n.github.io/" }],
  starter: `import torch, torch.nn as nn

class CNN(nn.Module):
    def __init__(self):
        super().__init__()
        # CIFAR-10 input: [B, 3, 32, 32]
        # TODO: conv1 3->32 (k=3,pad=1), conv2 32->64 (k=3,pad=1)
        #       maxpool 2x2 after each conv+relu
        #       then Linear(? , 10)  <- compute the flattened size!
    def forward(self, x):
        # TODO
        pass

print(CNN()(torch.randn(2, 3, 32, 32)).shape)  # [2, 10]`,
  solution: `class CNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(3, 32, 3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, 3, padding=1)
        self.pool  = nn.MaxPool2d(2, 2)
        self.relu  = nn.ReLU()
        # 32x32 -> pool -> 16x16 -> pool -> 8x8
        self.fc = nn.Linear(64 * 8 * 8, 10)
    def forward(self, x):
        x = self.pool(self.relu(self.conv1(x)))
        x = self.pool(self.relu(self.conv2(x)))
        x = x.flatten(1)              # keep batch dim
        return self.fc(x)
# padding=1 with k=3 preserves H,W; each pool halves them.
# The Linear in_features is where everyone's shape bug lives.` },
{ id: "tl-rnn", family: "torchleet", emoji: "🔄", tier: "EASY",
  title: "RNN from Scratch", blurb: "The recurrence: h_t = tanh(W_x x_t + W_h h_{t-1} + b), unrolled by hand.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/easy/rnn/RNN.ipynb" }],
  starter: `import torch, torch.nn as nn

class VanillaRNN(nn.Module):
    def __init__(self, d_in, d_hidden, d_out):
        super().__init__()
        # TODO: W_xh, W_hh (as nn.Linear), and an output head
    def forward(self, x):           # x: [B, T, d_in]
        B, T, _ = x.shape
        h = None  # TODO: init hidden state (zeros)
        for t in range(T):
            # TODO: h = tanh(W_xh x_t + W_hh h)
            pass
        # TODO: predict from the LAST hidden state
        pass`,
  solution: `class VanillaRNN(nn.Module):
    def __init__(self, d_in, d_hidden, d_out):
        super().__init__()
        self.W_xh = nn.Linear(d_in, d_hidden)
        self.W_hh = nn.Linear(d_hidden, d_hidden)
        self.head = nn.Linear(d_hidden, d_out)
    def forward(self, x):
        B, T, _ = x.shape
        h = torch.zeros(B, self.W_hh.in_features,
                        device=x.device)
        for t in range(T):
            h = torch.tanh(self.W_xh(x[:, t]) + self.W_hh(h))
        return self.head(h)
# Same weights every step — that IS the recurrence.
# tanh keeps h bounded; gradients through T steps still
# vanish/explode, which is why LSTM exists (next kata).` },
{ id: "tl-ae", family: "torchleet", emoji: "🪞", tier: "EASY",
  title: "Autoencoder for Anomaly Detection", blurb: "Train on normal data; reconstruction error becomes the alarm.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/easy/autoencoder/autoencoder.ipynb" }],
  starter: `import torch, torch.nn as nn

class AE(nn.Module):
    def __init__(self, d=20, z=4):
        super().__init__()
        # TODO: encoder d->16->z, decoder z->16->d
    def forward(self, x):
        # TODO: return reconstruction
        pass

# TODO (concept): train ONLY on normal samples with MSE.
# At test time, score = per-sample reconstruction error;
# flag scores above a percentile threshold as anomalies.
def anomaly_scores(model, X):
    # TODO: per-sample MSE (no reduction across batch!)
    pass`,
  solution: `class AE(nn.Module):
    def __init__(self, d=20, z=4):
        super().__init__()
        self.enc = nn.Sequential(nn.Linear(d, 16), nn.ReLU(),
                                 nn.Linear(16, z))
        self.dec = nn.Sequential(nn.Linear(z, 16), nn.ReLU(),
                                 nn.Linear(16, d))
    def forward(self, x):
        return self.dec(self.enc(x))

@torch.no_grad()
def anomaly_scores(model, X):
    recon = model(X)
    return ((X - recon) ** 2).mean(dim=1)   # per-sample!
# threshold = scores_on_normal_val.quantile(0.99)
# The bottleneck z<<d forces the AE to learn 'normal';
# off-manifold inputs come back mangled → high score.` },
{ id: "tl-lstm", family: "torchleet", emoji: "🚪", tier: "MEDIUM",
  title: "LSTM from Scratch", blurb: "Four gates, two states — the cell that beat vanishing gradients.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/medium/lstm/LSTM.ipynb" }],
  starter: `import torch, torch.nn as nn

class LSTMCell(nn.Module):
    def __init__(self, d_in, d_h):
        super().__init__()
        # one big projection for all 4 gates is the trick:
        self.gates = nn.Linear(d_in + d_h, 4 * d_h)
        self.d_h = d_h
    def forward(self, x_t, h, c):
        # TODO:
        #  z = gates([x_t, h])  -> chunk into i, f, g, o
        #  i, f, o -> sigmoid;  g -> tanh
        #  c_new = f*c + i*g
        #  h_new = o * tanh(c_new)
        pass`,
  solution: `class LSTMCell(nn.Module):
    def __init__(self, d_in, d_h):
        super().__init__()
        self.gates = nn.Linear(d_in + d_h, 4 * d_h)
        self.d_h = d_h
    def forward(self, x_t, h, c):
        z = self.gates(torch.cat([x_t, h], dim=-1))
        i, f, g, o = z.chunk(4, dim=-1)
        i, f, o = i.sigmoid(), f.sigmoid(), o.sigmoid()
        g = g.tanh()
        c_new = f * c + i * g        # additive cell update!
        h_new = o * torch.tanh(c_new)
        return h_new, c_new
# The additive c update is the gradient highway: f≈1 lets
# gradients flow across many steps — the fix RNNs lacked.` },
{ id: "tl-silu", family: "torchleet", emoji: "⚙️", tier: "HARD",
  title: "Custom Autograd (SiLU)", blurb: "torch.autograd.Function: write forward AND backward yourself.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/hard/custom-autograd/custom-autgrad-function.ipynb" }],
  starter: `import torch

class SiLU(torch.autograd.Function):
    # silu(x) = x * sigmoid(x)
    @staticmethod
    def forward(ctx, x):
        # TODO: compute, and ctx.save_for_backward what
        # the backward pass will need
        pass
    @staticmethod
    def backward(ctx, grad_out):
        # TODO: d/dx [x*s(x)] = s(x) * (1 + x * (1 - s(x)))
        pass

x = torch.randn(5, requires_grad=True)
SiLU.apply(x).sum().backward()
print(torch.allclose(x.grad,
      torch.nn.functional.silu(x).sum().backward() or x.grad))`,
  solution: `class SiLU(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x):
        s = torch.sigmoid(x)
        ctx.save_for_backward(x, s)
        return x * s
    @staticmethod
    def backward(ctx, grad_out):
        x, s = ctx.saved_tensors
        return grad_out * (s * (1 + x * (1 - s)))
# gradcheck it (double precision):
# torch.autograd.gradcheck(SiLU.apply,
#     torch.randn(4, dtype=torch.double,
#                 requires_grad=True))
# save_for_backward is the contract: forward stores,
# backward consumes, autograd handles the graph.` },
{ id: "tl-transformer", family: "torchleet", emoji: "🤖", tier: "HARD",
  title: "Full Transformer", blurb: "TorchLeet's capstone: embeddings, blocks, and a generate() loop.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/hard/transformer/transformer.ipynb" }, { label: "Karpathy · Let's build GPT", url: "https://www.youtube.com/watch?v=kCc8FmEb1nY" }, { label: "Karpathy · nanoGPT", url: "https://github.com/karpathy/nanoGPT" }],
  starter: `import torch, torch.nn as nn

class TinyGPT(nn.Module):
    def __init__(self, vocab, d=128, n_layers=2, h=4, max_T=64):
        super().__init__()
        # TODO: token embedding, position embedding,
        # n_layers transformer blocks (reuse the Dojo block!),
        # final RMSNorm/LayerNorm + lm_head to vocab
    def forward(self, idx):         # idx: [B, T] token ids
        # TODO: embed + pos, blocks, norm, logits
        pass
    @torch.no_grad()
    def generate(self, idx, n_new):
        for _ in range(n_new):
            # TODO: crop to max_T, forward, take LAST step
            # logits, softmax, sample, append
            pass
        return idx`,
  solution: `class TinyGPT(nn.Module):
    def __init__(self, vocab, d=128, n_layers=2, h=4, max_T=64):
        super().__init__()
        self.tok = nn.Embedding(vocab, d)
        self.pos = nn.Embedding(max_T, d)
        self.blocks = nn.ModuleList(
            [Block(d, h) for _ in range(n_layers)])
        self.norm = nn.LayerNorm(d)
        self.head = nn.Linear(d, vocab, bias=False)
        self.max_T = max_T
    def forward(self, idx):
        B, T = idx.shape
        x = self.tok(idx) + self.pos(
            torch.arange(T, device=idx.device))
        for b in self.blocks: x = b(x)
        return self.head(self.norm(x))      # [B, T, vocab]
    @torch.no_grad()
    def generate(self, idx, n_new):
        for _ in range(n_new):
            ctx = idx[:, -self.max_T:]
            logits = self(ctx)[:, -1]       # last position only
            probs = logits.softmax(-1)
            nxt = torch.multinomial(probs, 1)
            idx = torch.cat([idx, nxt], 1)
        return idx
# Block = the pre-norm causal block from the ML dojo kata.` },
{ id: "tl-gan", family: "torchleet", emoji: "🎭", tier: "HARD",
  title: "GAN", blurb: "Two optimizers, two losses, one adversarial game.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/torch/hard/GAN/GAN.ipynb" }],
  starter: `import torch, torch.nn as nn

G = nn.Sequential(nn.Linear(16, 64), nn.ReLU(),
                  nn.Linear(64, 2))          # noise -> sample
D = nn.Sequential(nn.Linear(2, 64), nn.LeakyReLU(0.2),
                  nn.Linear(64, 1))          # sample -> logit
bce = nn.BCEWithLogitsLoss()
optG = torch.optim.Adam(G.parameters(), lr=2e-4)
optD = torch.optim.Adam(D.parameters(), lr=2e-4)

for step in range(2000):
    real = sample_real_batch(64)             # given
    z = torch.randn(64, 16)
    # TODO D step: real->1, G(z).detach()->0
    # TODO G step: D(G(z))->1   (why detach above but not here?)
    pass`,
  solution: `for step in range(2000):
    real = sample_real_batch(64)
    z = torch.randn(64, 16)
    # --- Discriminator ---
    optD.zero_grad()
    fake = G(z).detach()        # block grads into G here!
    lossD = bce(D(real), torch.ones(64, 1)) + \\
            bce(D(fake), torch.zeros(64, 1))
    lossD.backward(); optD.step()
    # --- Generator ---
    optG.zero_grad()
    lossG = bce(D(G(z)), torch.ones(64, 1))  # fool D
    lossG.backward(); optG.step()
# detach() in the D step stops D's loss from training G;
# the G step keeps the graph so gradients flow THROUGH D
# into G — but only optG.step() updates weights.` },
{ id: "tl-bpe", family: "torchleet", emoji: "🔤", tier: "LLM",
  title: "Byte-Pair Encoding", blurb: "The tokenizer beneath every LLM: merge the most frequent pair, repeat.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/llm/Byte-Pair-Encoder/BPE-q3.ipynb" }, { label: "Karpathy · Let's build the GPT Tokenizer", url: "https://www.youtube.com/watch?v=zduSFxRajkE" }, { label: "Karpathy · minbpe", url: "https://github.com/karpathy/minbpe" }],
  starter: `# pure python — runnable right here in the lab!
def get_pair_counts(tokens):
    # TODO: count adjacent pairs in a list of tokens
    pass

def merge(tokens, pair, new_token):
    # TODO: replace every occurrence of pair with new_token
    pass

def bpe_train(text, n_merges):
    tokens = list(text)
    merges = []
    for _ in range(n_merges):
        # TODO: most frequent pair -> merge it, record it
        pass
    return tokens, merges`,
  solution: `def get_pair_counts(tokens):
    counts = {}
    for a, b in zip(tokens, tokens[1:]):
        counts[(a, b)] = counts.get((a, b), 0) + 1
    return counts

def merge(tokens, pair, new_token):
    out, i = [], 0
    while i < len(tokens):
        if (i < len(tokens) - 1
                and (tokens[i], tokens[i+1]) == pair):
            out.append(new_token); i += 2
        else:
            out.append(tokens[i]); i += 1
    return out

def bpe_train(text, n_merges):
    tokens, merges = list(text), []
    for _ in range(n_merges):
        counts = get_pair_counts(tokens)
        if not counts: break
        pair = max(counts, key=counts.get)
        new = pair[0] + pair[1]
        tokens = merge(tokens, pair, new)
        merges.append(pair)
    return tokens, merges` },
{ id: "tl-gqa", family: "torchleet", emoji: "👥", tier: "LLM",
  title: "Grouped-Query Attention", blurb: "Fewer KV heads than Q heads — implement the sharing.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/llm/Grouped-Query-Attention/grouped-query-attention-Question.ipynb" }],
  starter: `import torch, torch.nn as nn, math

class GQA(nn.Module):
    def __init__(self, d=256, n_q=8, n_kv=2):
        super().__init__()
        assert n_q % n_kv == 0
        self.dh = d // n_q
        self.W_q = nn.Linear(d, n_q * self.dh, bias=False)
        self.W_k = nn.Linear(d, n_kv * self.dh, bias=False)
        self.W_v = nn.Linear(d, n_kv * self.dh, bias=False)
        self.W_o = nn.Linear(d, d, bias=False)
        self.n_q, self.n_kv = n_q, n_kv
    def forward(self, x):           # [B, T, d]
        B, T, _ = x.shape
        # TODO: project; reshape q->[B,n_q,T,dh], kv->[B,n_kv,T,dh]
        # TODO: expand kv heads to match q heads
        #       (hint: repeat_interleave by n_q//n_kv on dim 1)
        # TODO: scaled-dot-product attention, merge heads, W_o
        pass`,
  solution: `    def forward(self, x):
        B, T, _ = x.shape
        q = self.W_q(x).view(B, T, self.n_q, self.dh)
        k = self.W_k(x).view(B, T, self.n_kv, self.dh)
        v = self.W_v(x).view(B, T, self.n_kv, self.dh)
        q, k, v = (t.transpose(1, 2) for t in (q, k, v))
        g = self.n_q // self.n_kv          # queries per kv head
        k = k.repeat_interleave(g, dim=1)  # share KV across group
        v = v.repeat_interleave(g, dim=1)
        att = (q @ k.transpose(-2, -1)) / math.sqrt(self.dh)
        y = att.softmax(-1) @ v            # [B, n_q, T, dh]
        y = y.transpose(1, 2).reshape(B, T, -1)
        return self.W_o(y)
# Only n_kv heads are CACHED at inference — that's the whole
# point. repeat_interleave is a view-time convenience; real
# kernels index the shared heads instead of materializing.` },
{ id: "tl-sin", family: "torchleet", emoji: "〰️", tier: "LLM",
  title: "Sinusoidal Embeddings", blurb: "The original position code: interleaved sin/cos at geometric frequencies.",
  frameworks: ["pytorch"], steps: [],
  links: [{ label: "TorchLeet problem", url: "https://github.com/Exorust/TorchLeet/blob/main/llm/Sinusoidal-Positional-Embedding/sinusoidal-q7-Question.ipynb" }],
  starter: `import torch, math

def sinusoidal_pe(max_T, d):
    # TODO: pe[pos, 2i]   = sin(pos / 10000^(2i/d))
    #       pe[pos, 2i+1] = cos(pos / 10000^(2i/d))
    # build with tensor ops, no python double-loop
    pass

pe = sinusoidal_pe(64, 128)
print(pe.shape)            # [64, 128]
print(pe[0, :4])           # [0, 1, 0, 1] — sin(0), cos(0)`,
  solution: `def sinusoidal_pe(max_T, d):
    pos = torch.arange(max_T).unsqueeze(1)         # [T, 1]
    div = torch.exp(torch.arange(0, d, 2)
                    * (-math.log(10000.0) / d))    # [d/2]
    pe = torch.zeros(max_T, d)
    pe[:, 0::2] = torch.sin(pos * div)
    pe[:, 1::2] = torch.cos(pos * div)
    return pe
# div is 10000^(-2i/d) computed in log-space for stability.
# Low dims oscillate fast (fine position), high dims slowly
# (coarse position) — a multi-scale ruler, added to embeddings.` },
];

/* ============================================================
   PYODIDE — in-browser Python (+numpy) for the Code Lab
   ============================================================ */
let _pyodide = null;
const PYODIDE_CDNS = [
  "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/",   // official full bundle (has numpy wheels)
  "https://cdnjs.cloudflare.com/ajax/libs/pyodide/0.26.2/",
];
async function getPyodide(onStatus) {
  if (_pyodide) return _pyodide;
  let lastErr = null;
  for (const base of PYODIDE_CDNS) {
    try {
      if (onStatus) onStatus("⏳ loading Python runtime from " + new URL(base).host + "…");
      await new Promise((res, rej) => {
        if (window.loadPyodide) return res();
        const s = document.createElement("script");
        s.src = base + "pyodide.js";
        s.onload = res; s.onerror = () => rej(new Error("script blocked"));
        document.head.appendChild(s);
      });
      _pyodide = await window.loadPyodide({ indexURL: base });
      return _pyodide;
    } catch (e) { lastErr = e; }
  }
  throw new Error("Python runtime couldn't load (" + (lastErr && lastErr.message) + "). The claude.ai sandbox blocks some CDNs — the desktop build runs it reliably.");
}
async function runPython(code, needs, onStatus) {
  const py = await getPyodide(onStatus);
  if (onStatus) onStatus("⏳ runtime ready — executing…");
  if (needs === "numpy") { try { await py.loadPackage("numpy"); } catch (e) { throw new Error("numpy unavailable in this sandbox — pure-Python katas still run; the desktop build has the full environment."); } }
  let out = "";
  py.setStdout({ batched: (s) => { out += s + "\n"; } });
  py.setStderr({ batched: (s) => { out += s + "\n"; } });
  try { await py.runPythonAsync(code); } catch (e) { out += String(e.message || e).split("\n").slice(-6).join("\n"); }
  return out || "(no output)";
}

/* ============================================================
   BOARD LAYOUT
   ============================================================ */
function buildBoard(region) {
  const mains = ["start", ...region.concepts.map((c) => "c:" + c.id), "gym"];
  const M = mains.length;
  const nodes = []; const edges = [];
  mains.forEach((id, i) => {
    const t = i / (M - 1);
    nodes.push({ id, x: 9 + 82 * t, y: 50 + 27 * Math.sin(i * 1.85 + 0.7) });
    if (i > 0) edges.push([mains[i - 1], id]);
  });
  (region.sides || []).forEach((s) => {
    const a = nodes[Math.min(s.anchor ?? 1, M - 2)];
    const dir = a.y > 50 ? -1 : 1;
    nodes.push({ id: "s:" + s.id, x: Math.min(92, Math.max(8, a.x + 7)), y: Math.min(88, Math.max(12, a.y + dir * 30)) });
    edges.push([a.id, "s:" + s.id]);
  });
  return { nodes, edges };
}
const shuf4 = () => { const a = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ============================================================ */
export default function App() {
  const [save, setSave] = useState(null);
  const [worlds, setWorlds] = useState([]);
  const [uKatas, setUKatas] = useState([]);
  const [aug, setAug] = useState({});                  // worldId -> coach-forged drills
  const [cfg, setCfg] = useState({ provider: "builtin", baseUrl: "", apiKey: "", model: "", anthropicKey: "" });
  const [screen, setScreen] = useState("title");
  const [activeWorld, setActiveWorld] = useState("w-rl");
  const [dexWorld, setDexWorld] = useState("w-rl");
  const [regionIdx, setRegionIdx] = useState(0);
  const [atNode, setAtNode] = useState("start");
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(null);
  const [battle, setBattle] = useState(null);
  const [musicOn, setMusicOn] = useState(false);
  const [resTab, setResTab] = useState("url");
  const [url, setUrl] = useState(""); const [pasteText, setPasteText] = useState("");
  const [conceptQ, setConceptQ] = useState(""); const [pdfB64, setPdfB64] = useState(null);
  const [pdfName, setPdfName] = useState("");
  const [scan, setScan] = useState(null); const [goal, setGoal] = useState("learn");
  const [busy, setBusy] = useState("");
  const [kataId, setKataId] = useState(null); const [stepIdx, setStepIdx] = useState(0);
  const [fw, setFw] = useState("pytorch"); const [kPhase, setKPhase] = useState("step");
  const [kFeedback, setKFeedback] = useState(null); const [kOrd, setKOrd] = useState(shuf4());
  const [myCode, setMyCode] = useState(""); const [review, setReview] = useState("");
  const [labCode, setLabCode] = useState(""); const [labOut, setLabOut] = useState(""); const [kataValidated, setKataValidated] = useState({});
  const [paperQ, setPaperQ] = useState(""); const [papers, setPapers] = useState(null);
  const [gaunt, setGaunt] = useState(null);            // {pool, idx, lives, score, ord}
  const [deepLore, setDeepLore] = useState({});        // conceptId -> model-expanded lore
  const [wilds, setWilds] = useState(null);            // the knowledge RL environment
  const [repl, setRepl] = useState("");                // REPL input line
  const [darkMode, setDarkMode] = useState(true);
  const [dojoOpen, setDojoOpen] = useState({ swe: true, torchleet: true, ml: true, sys: true, custom: true });
  const [kataAttempts, setKataAttempts] = useState(0);
  const [todoGuidance, setTodoGuidance] = useState(true);
  const [claudeCodeAuth, setClaudeCodeAuth] = useState(null);
  const [desktopModelStatus, setDesktopModelStatus] = useState(null);
  const [modelTest, setModelTest] = useState(null);
  const [dkgSync, setDkgSync] = useState({ ...dkgSyncConfigStatus(), status: "booting", updatedAt: null, stats: null, recentSources: [], recentRuns: [] });
  const [dkgWorlds, setDkgWorlds] = useState([]);
  const [mapFocus, setMapFocus] = useState(null);
  const [homeView, setHomeView] = useState("atlas");
  const [dexOpen, setDexOpen] = useState(false);
  const [tourStep, setTourStep] = useState(null);
  const tourShownRef = useRef(false);
  const [sectionOpen, setSectionOpen] = useState({ liveDkg: true, teachPanel: true, studySources: true, teachMission: true, teachResources: true, teachGlossary: true, teachRecords: true });

  Object.assign(T, darkMode ? THEMES.dark : THEMES.light);

  useEffect(() => {
    (async () => {
      const s = await loadStore("ru-save", { xp: 0, hp: 100, badges: [], captured: [], sides: [], katas: {}, qstats: {}, kataHints: {}, kataAttempts: {}, learningRecords: [], dexQuestions: [], senzu: null, pet: { mood: "idle", msg: "ready" }, player: null });
      s.sides = s.sides || []; s.katas = s.katas || {}; s.qstats = s.qstats || {}; s.kataHints = s.kataHints || {}; s.kataAttempts = s.kataAttempts || {}; s.learningRecords = s.learningRecords || []; s.dexQuestions = s.dexQuestions || []; s.senzu = s.senzu || null; s.pet = s.pet || { mood: "idle", msg: "ready" };
      if (!s.player && typeof window !== "undefined" && window.edokaiDb && window.edokaiDb.auth) {
        try { s.player = await window.edokaiDb.auth("local-player"); } catch {}
      }
      if (!s.player) s.player = { id: (crypto && crypto.randomUUID ? crypto.randomUUID() : `player-${Date.now()}`), name: "local-player", sessionId: (crypto && crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`) };
      setSave(s); saveStore("ru-save", s);
      setWorlds(await loadStore("ru-worlds", []));
      setDkgWorlds(await loadStore("ru-dkg-worlds", []));
      setUKatas(await loadStore("ru-ukatas", []));
      setAug(await loadStore("ru-aug", {}));
      setDeepLore(await loadStore("ru-lore", {}));
      const c = await loadStore("ru-cfg", { provider: "builtin", baseUrl: "", apiKey: "", model: "", anthropicKey: "", darkMode: true });
      if (!c.anthropicKey && typeof window !== "undefined" && window.edokaiAuth && window.edokaiAuth.anthropicKey) c.anthropicKey = window.edokaiAuth.anthropicKey;
      if (typeof window !== "undefined" && window.edokaiAuth && typeof window.edokaiAuth.claudeCodeStatus === "function") {
        window.edokaiAuth.claudeCodeStatus().then(setClaudeCodeAuth).catch((e) => setClaudeCodeAuth({ loggedIn: false, error: e.message || String(e) }));
      }
      if (typeof window !== "undefined" && window.edokaiAuth && typeof window.edokaiAuth.desktopModelStatus === "function") {
        window.edokaiAuth.desktopModelStatus().then(setDesktopModelStatus).catch((e) => setDesktopModelStatus({ error: e.message || String(e) }));
      }
      setCfg(c); setDarkMode(!!c.darkMode); GLOBAL_KEY = c.anthropicKey || "";
    })();
  }, []);

  useEffect(() => {
    return subscribeDkgSnapshot(
      applyDkgSnapshot,
      (status) => {
        if (status.disabled) setDkgSync((prev) => ({ ...prev, status: "disabled", error: status.message, source: status.source || prev.source }));
        else if (status.error) setDkgSync((prev) => ({ ...prev, status: "error", error: status.error, source: status.source || prev.source }));
        else if (status.realtimeStatus) setDkgSync((prev) => ({ ...prev, realtimeStatus: status.realtimeStatus }));
      }
    );
  }, []);

  useEffect(() => {
    if (save && !save.tourDone && screen === "home" && !tourShownRef.current) { tourShownRef.current = true; setTourStep(0); }
  }, [screen, save]);

  const persist = (s) => { setSave(s); saveStore("ru-save", s); if (window.edokaiDb && window.edokaiDb.saveSession) window.edokaiDb.saveSession({ player: s.player, save: s }).catch(() => {}); };
  const persistWorlds = (w) => { setWorlds(w); saveStore("ru-worlds", w); };
  const persistUKatas = (k) => { setUKatas(k); saveStore("ru-ukatas", k); };
  const persistAug = (a) => { setAug(a); saveStore("ru-aug", a); };
  const persistLore = (l) => { setDeepLore(l); saveStore("ru-lore", l); };
  const applyDkgSnapshot = (snapshot) => {
    const liveWorlds = snapshotToEdokaiWorlds(snapshot.payload);
    if (liveWorlds.length) {
      setDkgWorlds(() => {
        saveStore("ru-dkg-worlds", liveWorlds);
        return liveWorlds;
      });
    }
    const dkgSummary = summarizeDkgSnapshot(snapshot.payload);
    setDkgSync((prev) => ({
      ...prev,
      status: snapshot.realtime ? "live" : snapshot.empty ? "empty" : "synced",
      source: snapshot.source || prev.source,
      updatedAt: snapshot.updatedAt || snapshot.payload?.synced_at || null,
      stats: snapshot.payload?.stats || null,
      recentSources: dkgSummary.recentSources,
      recentRuns: dkgSummary.recentRuns,
      error: null,
    }));
    return liveWorlds.length;
  };
  const refreshDkgNow = async () => {
    setDkgSync((prev) => ({ ...prev, status: "refreshing", error: null }));
    try {
      const snapshot = await loadDkgSnapshot({ force: true });
      if (snapshot.ok) {
        const count = applyDkgSnapshot(snapshot);
        showToast(`Live DKG updated from ${snapshot.source || "source"}: ${count} worlds`);
      } else {
        setDkgSync((prev) => ({ ...prev, status: snapshot.disabled ? "disabled" : "error", error: snapshot.error || snapshot.message }));
        showToast(snapshot.error || snapshot.message || "Live DKG refresh failed.");
      }
    } catch (e) {
      setDkgSync((prev) => ({ ...prev, status: "error", error: e.message || String(e) }));
      showToast(`Live DKG refresh failed: ${e.message || e}`);
    }
  };
  const deepenLore = async (c) => {
    if (deepLore[c.id] || busy === "lore") return;
    setBusy("lore");
    try {
      const extra = await askModel(`You are a patient ML teacher using this paradigm: ${TEACH_PROMPT}\nA learner read this summary of "${c.name}":\n"""${c.lore}"""\nExpand it with ~150 words of deeper explanation: the intuition behind it, one concrete worked example with small numbers where possible, and the most common misconception. Write for humans: 1-2 short paragraphs and, where it helps, a "- " bullet list; **bold** the key term. No headers.`, cfg);
      if (extra && extra.length > 40) persistLore({ ...deepLore, [c.id]: extra.trim() });
    } catch (e) {
      showToast(`Deepen lore model call failed: ${e.message || "Check model settings."}`);
    }
    setBusy("");
  };
  // lore the player should review for the current battle
  const battleNotes = () => {
    if (!battle) return [];
    if (battle.kind === "critical") return [battle.concept];
    if (battle.kind === "gym") return region.concepts;
    const ids = battle.side.prereqs || [];
    const out = [];
    for (const r of regions) for (const c of r.concepts) if (ids.includes(c.id)) out.push(c);
    return out;
  };
  const persistCfg = (c) => { setCfg(c); setDarkMode(!!c.darkMode); GLOBAL_KEY = c.anthropicKey || ""; saveStore("ru-cfg", c); };
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const toggleSection = (id) => setSectionOpen((s) => ({ ...s, [id]: !s[id] }));
  const toggleMusic = () => { if (musicOn) { music.stop(); setMusicOn(false); } else { music.start(); setMusicOn(true); } };
  const toggleTheme = () => persistCfg({ ...cfg, darkMode: !darkMode });

  const allWorlds = mergeDkgWorlds([...BUILTIN_WORLDS, ...worlds], dkgWorlds).map((w) => applyTeachingParadigm(w));
  const world = allWorlds.find((w) => w.id === activeWorld) || BUILTIN_WORLDS[0];
  const focusedMapWorld = allWorlds.find((w) => w.id === (mapFocus || activeWorld)) || world;
  const mapStats = (w) => {
    const concepts = w.regions.reduce((n, r) => n + r.concepts.length, 0);
    const sides = w.regions.reduce((n, r) => n + (r.sides || []).length, 0);
    const sources = (w.links || []).length;
    const capturedIds = new Set(save?.captured || []);
    const captured = w.regions.reduce((n, r) => n + r.concepts.filter((c) => capturedIds.has(c.id)).length, 0);
    return { concepts, sides, sources, captured };
  };
  const worldSourceOverlap = (a, b) => {
    const au = new Set((a.links || []).map((l) => l.url));
    return (b.links || []).filter((l) => au.has(l.url)).length;
  };
  const mapNeighbors = allWorlds
    .filter((w) => w.id !== focusedMapWorld.id)
    .map((w) => ({ world: w, overlap: worldSourceOverlap(focusedMapWorld, w), stats: mapStats(w) }))
    .sort((a, b) => b.overlap - a.overlap || b.stats.concepts - a.stats.concepts)
    .slice(0, 5);
  const regions = world.regions;
  const region = regions[regionIdx];
  const level = save ? Math.floor(save.xp / 150) + 1 : 1;
  const maxHp = 100 + (level - 1) * 10;
  const capturedSet = new Set(save ? save.captured : []);
  const sidesSet = new Set(save ? save.sides : []);
  const allKatas = [...KATAS, ...BLIND75_EXTRA, ...TORCHLEET, ...uKatas].map(enrichSWEKata);
  const incompleteKatas = (fam) => allKatas.filter((k) => k.family === fam && kProgress(k.id) < (k.steps.length || 1));
  const pickQuestKata = (fam, salt = 0) => { const ks = incompleteKatas(fam); return ks.length ? ks[(Date.now() + salt) % ks.length] : null; };
  const ensureSenzuQuest = () => {
    if (save.senzu && !save.senzu.claimed) return save.senzu;
    const swe = pickQuestKata("swe", 7), ml = pickQuestKata("ml", 19);
    if (!swe || !ml) return null;
    const q = { id: `senzu-${Date.now()}`, required: { swe: swe.id, ml: ml.id }, claimed: false };
    persist({ ...save, senzu: q, pet: { mood: "quest", msg: "win two dojo trials for a senzu bean" } });
    return q;
  };
  const petReact = (mood, msg) => persist({ ...save, pet: { mood, msg } });
  const conceptName = (id) => {
    for (const w of allWorlds) for (const r of w.regions) {
      const c = r.concepts.find((x) => x.id === id); if (c) return c.name;
      const sd = (r.sides || []).find((x) => x.id === id); if (sd) return sd.name;
      if (id === "gym:" + r.id) return r.name + " Gym";
    }
    return id;
  };
  const stat = (id) => (save.qstats[id] || [0, 0]);
  const recStat = (s, id, correct) => { const [a, m] = s.qstats[id] || [0, 0]; s.qstats = { ...s.qstats, [id]: [a + 1, m + (correct ? 0 : 1)] }; };
  const recordConceptLearning = (s, c) => {
    const id = teachRecordId(world.id, c.id);
    if ((s.learningRecords || []).some((r) => r.id === id)) return;
    s.learningRecords = [...(s.learningRecords || []), {
      id,
      worldId: world.id,
      title: c.name,
      summary: compactLore(c),
      evidence: `Won the critical encounter in ${region.name}.`,
      ts: Date.now(),
    }];
  };
  const worldLearningRecords = (w = world) => (save.learningRecords || []).filter((r) => r.worldId === w.id);
  const capturedConceptsFor = (w = world) => w.regions.flatMap((r) => r.concepts.map((c) => ({ ...c, regionName: r.name }))).filter((c) => capturedSet.has(c.id));
  const dexQuestionsFor = (w = world) => (save.dexQuestions || []).filter((q) => q.worldId === w.id);
  const addDexQuestion = (q, srcId = battleSrc, srcName = conceptName(srcId)) => {
    if (!q) return;
    const qid = `${world.id}:${srcId}:${String(q.q || "").slice(0, 80)}`;
    if ((save.dexQuestions || []).some((x) => x.id === qid)) { showToast("Already saved to Conceptdex."); return; }
    persist({ ...save, dexQuestions: [...(save.dexQuestions || []), { id: qid, worldId: world.id, src: srcId, sourceName: srcName, q: q.q, options: q.options, a: q.a, why: q.why, ts: Date.now() }] });
    showToast("Question saved to Conceptdex.");
  };
  const removeDexQuestion = (id) => persist({ ...save, dexQuestions: (save.dexQuestions || []).filter((q) => q.id !== id) });
  const testCustomModel = async () => {
    if (!cfg.baseUrl || !cfg.model) { setModelTest({ ok: false, msg: "Set a base URL and model first." }); return; }
    setModelTest({ ok: null, msg: "Testing model connection…" });
    try {
      const base = cfg.baseUrl.replace(/\/$/, "");
      const headers = { "Content-Type": "application/json" };
      if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
      const modelsRes = await fetch(base + "/models", { headers });
      if (!modelsRes.ok) throw new Error(`models endpoint HTTP ${modelsRes.status}`);
      const models = await modelsRes.json().catch(() => ({}));
      const names = (models.data || models.models || []).map((m) => m.id || m.name || m.model).filter(Boolean);
      const chatRes = await fetch(base + "/chat/completions", {
        method: "POST", headers,
        body: JSON.stringify({ model: cfg.model, max_tokens: 16, messages: [{ role: "user", content: "Reply with exactly: EDOKAI_OK" }] }),
      });
      const chat = await chatRes.json().catch(() => ({}));
      if (!chatRes.ok || chat.error) throw new Error(chat.error?.message || `chat endpoint HTTP ${chatRes.status}`);
      const out = chat.choices?.[0]?.message?.content || "";
      setModelTest({ ok: true, msg: `Connected to ${cfg.model}${names.length ? ` · ${names.length} model(s) visible` : ""}${out ? ` · sample: ${out.slice(0, 60)}` : ""}` });
    } catch (e) {
      setModelTest({ ok: false, msg: `${e.message || e}. Ollama: OLLAMA_ORIGINS=* ollama serve → http://localhost:11434/v1. MLX-LM: python -m mlx_lm.server --model <model> --port 8080 → http://localhost:8080/v1.` });
    }
  };
  const refreshDesktopModelStatus = async () => {
    if (!window.edokaiAuth || !window.edokaiAuth.desktopModelStatus) { setDesktopModelStatus({ error: "Desktop auth bridge unavailable in this browser session. Open the Electron desktop app to connect Codex/Claude Code subscriptions." }); return; }
    try { setDesktopModelStatus(await window.edokaiAuth.desktopModelStatus()); }
    catch (e) { setDesktopModelStatus({ error: e.message || String(e) }); }
  };
  const startDesktopLogin = async (provider) => {
    setModelTest({ ok: null, msg: `Opening ${provider} subscription login…` });
    try {
      if (!window.edokaiAuth || !window.edokaiAuth.startDesktopModelLogin) throw new Error("Desktop auth bridge unavailable in this browser session. Launch Edokai as the Electron desktop app, not a plain Vite browser tab, to connect subscriptions.");
      const res = await window.edokaiAuth.startDesktopModelLogin(provider);
      setModelTest({ ok: true, msg: res.message || `Started ${provider} login. Finish in the Terminal window, then refresh status.` });
      setTimeout(refreshDesktopModelStatus, 1000);
    } catch (e) { setModelTest({ ok: false, msg: e.message || String(e) }); }
  };
  const testDefaultModel = async () => {
    setModelTest({ ok: null, msg: "Testing default desktop provider…" });
    try {
      if (!window.edokaiAuth || !window.edokaiAuth.completeWithDefaultProvider) throw new Error("Desktop auth bridge unavailable in this browser session");
      const out = await window.edokaiAuth.completeWithDefaultProvider("Reply with exactly: EDOKAI_OK", { preferred: cfg.preferredAuth || "codex" });
      if (!/EDOKAI_OK/i.test(out)) throw new Error(`unexpected response: ${String(out).slice(0, 80)}`);
      setModelTest({ ok: true, msg: `Default provider ready (${cfg.preferredAuth || "codex"}) · ${String(out).slice(0, 80)}` });
      refreshDesktopModelStatus();
    } catch (e) {
      setModelTest({ ok: false, msg: e.message || String(e) });
      refreshDesktopModelStatus();
    }
  };

  /* ---------- battle ---------- */
  const DMG = 40, CRIT = 20;
  const startBattle = (kind, payload) => {
    let pool = null;
    if (kind === "side") {
      const extras = (aug[world.id] || []).filter((q) => q.src === payload.id || (payload.prereqs || []).includes(q.src));
      pool = [...payload.questions, ...extras];
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      pool = pool.slice(0, Math.max(3, Math.min(5, pool.length)));   // each visit: a different draw
    }
    const nQ = kind === "gym" ? region.gym.questions.length : kind === "side" ? pool.length : payload.questions.length;
    const max = nQ * DMG;
    if (kind === "critical") setBattle({ kind, concept: payload, phase: "question", showLore: true, enemyHp: max, enemyMax: max, qIdx: 0, streak: 0, ord: shuf4(), showCode: false, log: `${payload.name} blocks the path!` });
    else if (kind === "side") setBattle({ kind, side: payload, pool, phase: "briefing", enemyHp: max, enemyMax: max, qIdx: 0, streak: 0, ord: shuf4(), showCode: true, log: payload.desc });
    else setBattle({ kind, gym: region.gym, phase: "question", showLore: true, enemyHp: max, enemyMax: max, qIdx: 0, streak: 0, ord: shuf4(), showCode: false, log: `${region.gym.leader}: "${region.gym.taunt}"` });
    setScreen("battle");
  };
  const bQuestions = battle ? (battle.kind === "critical" ? battle.concept.questions : battle.kind === "side" ? (battle.pool || battle.side.questions) : battle.gym.questions) : [];
  const battleSrc = battle ? (battle.kind === "critical" ? battle.concept.id : battle.kind === "side" ? battle.side.id : "gym:" + region.id) : "";
  const answerBattle = (dispIdx) => {
    if (!battle || battle.phase !== "question") return;
    const q = bQuestions[battle.qIdx % bQuestions.length];
    const idx = battle.ord[dispIdx];
    const selectedText = q.options[idx];
    const correct = idx === q.a;
    const s = { ...save };
    recStat(s, battleSrc, correct);
    if (correct) {
      const crit = battle.streak >= 1;
      const dmg = DMG + (crit ? CRIT : 0);
      const newHp = Math.max(0, battle.enemyHp - dmg);
      const won = newHp <= 0;
      if (won) {
        if (battle.kind === "critical") { s.xp += 50; if (!capturedSet.has(battle.concept.id)) { s.captured = [...s.captured, battle.concept.id]; recordConceptLearning(s, battle.concept); } }
        else if (battle.kind === "side") { s.xp += 30; s.hp = Math.min(maxHp, s.hp + 25); s.pet = { mood: "heal", msg: "+25 HP" }; if (!sidesSet.has(battle.side.id)) s.sides = [...s.sides, battle.side.id]; }
        else { s.xp += 150; if (!s.badges.includes(region.gym.badge)) s.badges = [...s.badges, region.gym.badge]; }
      }
      persist(s);
      setBattle({ ...battle, enemyHp: newHp, streak: battle.streak + 1, phase: won ? "victory" : "feedback", wrong: false, selectedText, log: `${crit ? "CRITICAL HIT! " : ""}You chose: “${selectedText}”. Strike for ${dmg}! ${q.why}` });
    } else {
      const dmg = battle.kind === "gym" ? 22 : 16;
      const newHp = Math.max(0, s.hp - dmg);
      const fainted = newHp <= 0;
      s.hp = fainted ? maxHp : newHp;
      s.pet = { mood: fainted ? "faint" : "harm", msg: fainted ? "wake up healed" : `-${dmg} HP` };
      persist(s);
      setBattle({ ...battle, streak: 0, phase: fainted ? "defeat" : "feedback", wrong: true, selectedText, log: fainted ? `You chose: “${selectedText}”. You blacked out! ${q.why} — You wake at the region entrance, healed and wiser.` : `You chose: “${selectedText}”. Counterattack for ${dmg}! ${q.why}` });
    }
  };
  const continueBattle = () => {
    if (!battle) return;
    if (battle.phase === "victory") {
      if (battle.kind === "critical") showToast(`${battle.concept.name} captured! +50 XP`);
      else if (battle.kind === "side") { showToast(`Reinforced! +30 XP · +25 HP`); forgeVariants(battle.side); }
      else showToast(`${region.gym.badge} earned! +150 XP`);
      setBattle(null); setScreen("region");
    } else if (battle.phase === "defeat") { setBattle(null); setAtNode("start"); setScreen("region"); }
    else if (battle.phase === "feedback") setBattle({ ...battle, phase: "question", qIdx: battle.wrong ? battle.qIdx : battle.qIdx + 1, ord: shuf4(), wrong: false, showLore: false });
    else setBattle({ ...battle, phase: "question", ord: shuf4() });
  };

  /* ---------- board ---------- */
  const board = region ? buildBoard(region) : null;
  const nodeCleared = (id) => id === "start" ? true
    : id === "gym" ? (region && save.badges.includes(region.gym.badge))
    : id.startsWith("c:") ? capturedSet.has(id.slice(2))
    : id.startsWith("s:") ? sidesSet.has(id.slice(2)) : false;
  const nodeReachable = (id) => {
    if (!board) return false;
    if (id === "gym") return region.concepts.every((c) => capturedSet.has(c.id));
    return board.edges.some(([a, b]) => (b === id && nodeCleared(a)) || (a === id && nodeCleared(b)));
  };
  const tapNode = (id) => {
    if (!nodeReachable(id) && !nodeCleared(id)) { showToast("Path blocked — clear the connected encounter first."); return; }
    setAtNode(id);
    if (id === "start") { setDialog({ name: region.npc.name, text: region.npc.text }); return; }
    if (id === "gym") {
      if (save.badges.includes(region.gym.badge)) { setDialog({ name: region.gym.leader, text: `You already hold the ${region.gym.badge}. Drill sides or run the Trial Gauntlet to stay sharp.` }); return; }
      startBattle("gym"); return;
    }
    if (id.startsWith("c:")) {
      const c = region.concepts.find((x) => x.id === id.slice(2));
      if (nodeCleared(id)) { setDialog({ name: c.name + " (captured)", text: c.lore }); return; }
      startBattle("critical", c);
    }
    if (id.startsWith("s:")) startBattle("side", region.sides.find((x) => x.id === id.slice(2)));
  };

  /* ---------- gauntlet ---------- */
  const buildGauntletPool = () => {
    const pool = [];
    for (const r of regions) {
      r.concepts.forEach((c) => c.questions.forEach((q) => pool.push({ ...q, src: c.id, name: c.name })));
      (r.sides || []).forEach((sd) => sd.questions.forEach((q) => pool.push({ ...q, src: sd.id, name: sd.name })));
      r.gym.questions.forEach((q) => pool.push({ ...q, src: "gym:" + r.id, name: r.name + " Gym" }));
    }
    (aug[world.id] || []).forEach((q) => pool.push({ ...q, name: "🧪 Coach drill" }));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool;
  };
  const startGauntlet = (srcFilter) => {
    let pool = buildGauntletPool();
    if (srcFilter) pool = pool.filter((q) => q.src === srcFilter);
    if (!pool.length) { showToast("No questions found for that topic yet."); return; }
    setGaunt({ pool, idx: 0, lives: 3, score: 0, ord: shuf4(), fb: null, focus: srcFilter ? conceptName(srcFilter) : null });
    setScreen("gauntlet");
  };
  const answerGauntlet = (dispIdx) => {
    if (!gaunt || gaunt.fb) return;
    const q = gaunt.pool[gaunt.idx];
    const correct = gaunt.ord[dispIdx] === q.a;
    const s = { ...save };
    if (q.src) recStat(s, q.src, correct);
    if (correct) s.xp += 8;
    persist(s);
    setGaunt({ ...gaunt, score: gaunt.score + (correct ? 1 : 0), lives: gaunt.lives - (correct ? 0 : 1), fb: { ok: correct, msg: q.why } });
  };
  const nextGauntlet = () => {
    if (!gaunt) return;
    const idx = gaunt.idx + 1;
    if (gaunt.lives <= 0 || idx >= gaunt.pool.length) setGaunt({ ...gaunt, done: true, fb: null });
    else setGaunt({ ...gaunt, idx, ord: shuf4(), fb: null });
  };

  /* ---------- coach (self-improvement) ---------- */
  const coachRows = () => {
    const ids = [];
    for (const r of regions) { r.concepts.forEach((c) => ids.push(c.id)); (r.sides || []).forEach((sd) => ids.push(sd.id)); ids.push("gym:" + r.id); }
    return ids.map((id) => { const [a, m] = stat(id); return { id, name: conceptName(id), a, m, rate: a ? m / a : 0 }; })
      .filter((r) => r.a > 0).sort((x, y) => y.rate - x.rate || y.m - x.m);
  };
  const forgeDrills = async () => {
    const weak = coachRows().filter((r) => r.a >= 2 && r.m > 0).slice(0, 5);
    const targets = weak.length ? weak : coachRows().slice(0, 5);
    if (!targets.length) { showToast("Battle first — the coach needs data on your misses."); return; }
    const hints = targets.map((t) => {
      let lore = "";
      for (const r of regions) { const c = r.concepts.find((x) => x.id === t.id); if (c) lore = c.lore; }
      return { id: t.id, name: t.name, missRate: Math.round(t.rate * 100) + "%", hint: lore.slice(0, 180) };
    });
    setBusy("coach");
    try {
      const parsed = parseJSON(await askModel(
        `You are an adaptive tutor using this teaching paradigm: ${TEACH_PROMPT}\nThe learner's weakest topics in "${world.title}" (with miss rates):\n${JSON.stringify(hints)}\nWrite 4 NEW applied-scenario multiple-choice questions targeting these weaknesses (different angles than typical textbook phrasing; realistic engineering scenarios). Respond ONLY raw JSON:\n{"questions":[{"q":"SCENARIO: ...","options":["...","...","...","..."],"a":0,"why":"one line","src":"the id of the topic targeted"}]}\nReject any question where the correct answer is visibly longer or more specific than the distractors.
${QUALITY_RULES}`, cfg.provider === "builtin" ? cfg : cfg));
      const qs = keepFairQuestions(parsed.questions || []);
      if (!qs.length) throw new Error("empty");
      persistAug({ ...aug, [world.id]: [...(aug[world.id] || []), ...qs] });
      showToast(`Coach forged ${qs.length} new drills → they now appear in the Trial Gauntlet.`);
    } catch (e) { showToast("Drill forging failed — check model settings and try again."); }
    setBusy("");
  };

  // silent background generation: 2 fresh scenario variants per defeated side,
  // so revisits (heal-farming included) face a stochastic, ever-growing pool
  const forgeVariants = async (side) => {
    try {
      const seen = [...side.questions, ...((aug[world.id] || []).filter((q) => q.src === side.id))].map((q) => q.q).slice(0, 12);
      const parsed = parseJSON(await askModel(
        `Use this teaching paradigm: ${TEACH_PROMPT}\nGenerate 2 NEW variant scenario questions for the drill "${side.name}" (${side.desc}). Cover the same concepts from fresh angles — different surface scenarios, same underlying principles. Do NOT repeat these existing questions:\n${JSON.stringify(seen)}\nRespond ONLY raw JSON: {"questions":[{"q":"SCENARIO: ...","options":["...","...","...","..."],"a":0,"why":"one line"}]}\nReject any question where the correct answer is visibly longer or more specific than the distractors.
${QUALITY_RULES}`, cfg));
      const qs = keepFairQuestions(parsed.questions || []).map((q) => ({ ...q, src: side.id }));
      if (qs.length) persistAug({ ...aug, [world.id]: [...(aug[world.id] || []), ...qs] });
    } catch (e) { /* silent — variants are a bonus, never a blocker */ }
  };

  /* ---------- the WILDS: an RL environment over each world's knowledge ----------
     Env anatomy (see the Env Foundry region): TASKS are generated fresh each
     episode, grounded in the lore (the evidence); the VERIFIER is the answer
     key + quoted evidence; STATE is your per-topic miss telemetry, which the
     env uses to target weak areas; episodes never repeat questions. */
  const scopeLore = (scopeId) => {
    if (scopeId === "world") {
      let s = "";
      for (const r of regions) for (const c of r.concepts) { s += c.name + ": " + c.lore + "\n"; if (s.length > 5200) return s.slice(0, 5200); }
      return s;
    }
    for (const r of regions) { const c = r.concepts.find((x) => x.id === scopeId); if (c) return c.name + ": " + c.lore + (deepLore[c.id] ? "\n" + deepLore[c.id] : ""); }
    return "";
  };

  const localWildsFallback = (scopeId) => {
    const pool = [];
    for (const r of regions) {
      for (const c of r.concepts) {
        if (scopeId !== "world" && c.id !== scopeId) continue;
        (c.questions || []).forEach((q) => pool.push({ ...q, src: c.id, name: c.name, evidence: c.lore.slice(0, 110) + "…" }));
      }
      if (scopeId === "world") {
        (r.sides || []).forEach((sd) => (sd.questions || []).forEach((q) => pool.push({ ...q, src: sd.id, name: sd.name, evidence: sd.desc || "Side duel scenario" })));
      }
    }
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 3);
  };

  const runEpisode = async (scopeId, scopeName) => {
    setWilds({ scope: scopeId, name: scopeName, busy: true, qs: null, idx: 0, score: 0, ord: shuf4(), fb: null });
    setScreen("wilds");
    try {
      const seen = [...((aug[world.id] || []).map((q) => q.q))].slice(-14);
      const weak = coachRows().filter((r) => r.m > 0).slice(0, 3).map((r) => r.name);
      const parsed = parseJSON(await askModel(
        `You are an RL environment generating TASKS over study material. Use this teaching paradigm: ${TEACH_PROMPT}\nGenerate 3 NEW multiple-choice questions grounded STRICTLY in this material (every answer must be verifiable from it):\n"""${scopeLore(scopeId)}"""\n${weak.length ? "The learner is weakest on: " + weak.join(", ") + " — bias toward these where the material allows." : ""}\nDo NOT repeat: ${JSON.stringify(seen)}\nRespond ONLY raw JSON: {"questions":[{"q":"...","options":["...","...","...","..."],"a":0,"why":"one line","evidence":"short phrase quoted from the material that verifies the answer"}]}\nReject any question where the correct answer is visibly longer or more specific than the distractors.
${QUALITY_RULES}`, cfg));
      const qs = keepFairQuestions(parsed.questions || []).map((q) => ({ ...q, src: scopeId === "world" ? undefined : scopeId }));
      if (!qs.length) throw new Error("empty");
      if (scopeId !== "world") persistAug({ ...aug, [world.id]: [...(aug[world.id] || []), ...qs] });
      setWilds({ scope: scopeId, name: scopeName, busy: false, qs, idx: 0, score: 0, ord: shuf4(), fb: null });
    } catch (e) {
      const fallback = localWildsFallback(scopeId);
      if (fallback.length) {
        setWilds({ scope: scopeId, name: scopeName, busy: false, qs: fallback, idx: 0, score: 0, ord: shuf4(), fb: null, fallback: true });
        showToast("Model generation failed — using local verifier-backed review questions.");
      } else {
        setWilds({ scope: scopeId, name: scopeName, busy: false, error: `Episode generation failed from the model: ${e.message || "unknown error"}. Add an Anthropic key in Settings or use an environment with the Claude model bridge.`, qs: null });
      }
    }
  };
  const answerWilds = (dispIdx) => {
    if (!wilds || !wilds.qs || wilds.fb) return;
    const q = wilds.qs[wilds.idx];
    const correct = wilds.ord[dispIdx] === q.a;
    const s = { ...save };
    if (q.src) recStat(s, q.src, correct);
    if (correct) s.xp += 10;
    persist(s);
    setWilds({ ...wilds, score: wilds.score + (correct ? 1 : 0), fb: { ok: correct, msg: q.why, ev: q.evidence } });
  };
  const nextWilds = () => {
    if (!wilds) return;
    const idx = wilds.idx + 1;
    if (idx >= wilds.qs.length) setWilds({ ...wilds, done: true, fb: null });
    else setWilds({ ...wilds, idx, ord: shuf4(), fb: null });
  };

  /* ---------- spawn ---------- */
  const onPdfPick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setPdfName(f.name);
    const r = new FileReader();
    r.onload = () => setPdfB64(r.result.split(",")[1]);
    r.readAsDataURL(f);
  };
  const doScan = async () => {
    setBusy("scan"); setScan(null);
    try {
      let r, src;
      if (resTab === "url") { if (!url.trim()) throw 0; r = await scanUrl(url.trim(), null); src = { type: "url", desc: url.trim() }; }
      else if (resTab === "pdf") { if (!pdfB64) throw 0; r = await scanPdf(pdfB64, null); src = { type: "pdf", desc: pdfName }; }
      else if (resTab === "text") { if (!pasteText.trim()) throw 0; r = await scanText(pasteText, cfg); src = { type: "text", desc: `this material: """${pasteText.slice(0, 4000)}"""` }; }
      else { if (!conceptQ.trim()) throw 0; const f = await findResource(conceptQ.trim(), null); r = { title: f.title, worldName: f.worldName, sections: f.sections }; src = { type: "url", desc: f.url, foundUrl: f.url }; }
      setScan({ title: r.title || "Untitled", worldName: r.worldName || "", sections: r.sections || [], picked: new Set((r.sections || []).slice(0, 3)), src });
    } catch (e) {
      setScan({ error: e && e.message === "WEB_NEEDED" ? "Your custom model can't browse — URL/concept scans use the built-in model. Try the Paste tab for fully-local generation." : "Couldn't read that resource. Check it and try again." });
    }
    setBusy("");
  };
  const doBuild = async () => {
    if (!scan) return;
    if (goal === "implement") {
      setBusy("Forging implementation kata…");
      try {
        const k = await buildKataFrom(scan.src.desc, scan.src.type === "text" ? cfg : null, scan.src.type === "pdf" ? pdfB64 : null);
        persistUKatas([...uKatas, k]);
        setScan(null); setBusy(""); setScreen("dojo");
        showToast(`Kata forged: ${k.title}`); return;
      } catch (e) { setBusy(""); setScan({ ...scan, error: "Kata generation failed — try again or use Paste." }); return; }
    }
    if (!scan.picked.size) return;
    const picked = [...scan.picked]; const out = [];
    for (let i = 0; i < picked.length; i++) {
      setBusy(`Forging region ${i + 1}/${picked.length}: "${picked[i]}"…`);
      try { out.push(await buildRegionFrom(scan.src.desc, picked[i], Date.now() + i, scan.src.type === "text" ? cfg : null, scan.src.type === "pdf" ? pdfB64 : null)); } catch (e) { console.error(e); }
    }
    setBusy("");
    if (!out.length) { setScan({ ...scan, error: "Generation failed — try fewer sections." }); return; }
    const w = normalizeGeneratedWorld({ id: "w" + Date.now(), title: scan.worldName || scan.title, emoji: "🌀", blurb: scan.worldName ? `Custom world forged from "${scan.title}".` : "Custom world", links: scan.src.foundUrl ? [{ label: scan.title || "Source", url: scan.src.foundUrl }] : [], regions: out });
    persistWorlds([...worlds, w]);
    setScan(null); setUrl(""); setPasteText(""); setConceptQ(""); setPdfB64(null); setPdfName("");
    setActiveWorld(w.id); setRegionIdx(0); setAtNode("start"); setScreen("regionlist");
    showToast(`New world spawned: ${w.title}`);
  };

  /* ---------- dojo ---------- */
  const kata = allKatas.find((k) => k.id === kataId);
  const kProgress = (id) => save && save.katas[id] ? save.katas[id] : 0;
  const kHintKey = (id, idx) => `${id}:${idx}`;
  const kataHintRevealed = (id, idx) => !!(save && save.kataHints && save.kataHints[kHintKey(id, idx)]);
  const kataLore = (k) => k.lore || `${k.title} is a dojo drill: read the TODOs, implement the missing behavior, run the code, then use hints only when you have a concrete stuck point. The win condition is understanding the mechanism well enough to rebuild it without peeking at the final solution.`;
  const kataStepLore = (step, idx) => step.lore || `TODO ${idx + 1} isolates one moving part of the implementation. Translate the prompt into the smallest code change that makes the data shape or invariant true, then run before moving on.`;
  const kataStepHint = (step) => step.hint || step.why || "Compare the TODO against the reference invariant in the prompt; the missing expression should make the stated shape, gradient, or edge case work.";
  const getKataTodos = (k, lab) => {
    if (!k) return [];
    if (k.steps && k.steps.length) return k.steps;
    const source = (lab && lab.starter) || k.starter || "";
    const lines = source.split("\n");
    const todos = [];
    lines.forEach((line, i) => {
      if (!/TODO|____|None\s*(#|$)/i.test(line)) return;
      const cleaned = line.replace(/^\s*#?\s*/, "").replace(/TODO:?\s*/i, "").trim() || `Fill the missing implementation on line ${i + 1}`;
      todos.push({
        prompt: cleaned,
        code: lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join("\n"),
        lore: `This TODO is one checkpoint in the kata's implementation path. Solve it by asking what invariant this line is responsible for: object shape, loss choice, optimizer wiring, data flow, or the training-loop step order.`,
        hint: `Focus on line ${i + 1}: replace the placeholder with the smallest concrete PyTorch expression that satisfies the comment and keeps the surrounding code unchanged.`,
        why: "A TODO-level hint should unblock the local mechanism without revealing the whole final solution."
      });
    });
    return todos;
  };
  const recordKataAttempt = () => {
    if (!kata) return 0;
    const next = ((save.kataAttempts && save.kataAttempts[kata.id]) || 0) + 1;
    const s = { ...save, kataAttempts: { ...(save.kataAttempts || {}), [kata.id]: next } };
    persist(s); setKataAttempts(next);
    return next;
  };
  const revealKataHint = (idx) => {
    if (!kata) return;
    const key = kHintKey(kata.id, idx);
    if (kataHintRevealed(kata.id, idx)) return;
    const attempts = (save.kataAttempts && save.kataAttempts[kata.id]) || kataAttempts || 0;
    const penalty = attempts > 0 ? 5 : 0;
    const s = { ...save, xp: Math.max(0, save.xp - penalty), kataHints: { ...(save.kataHints || {}), [key]: true } };
    persist(s);
    showToast(penalty ? `Hint unlocked — ${penalty} XP focus tax because you already attempted this kata.` : "Hint unlocked free — no attempt logged yet.");
  };
  const openKata = (k) => {
    setKataId(k.id); setFw(k.frameworks[0] || "pytorch");
    setStepIdx(Math.min(kProgress(k.id), Math.max(0, k.steps.length - 1)));
    setKPhase("work"); setKFeedback(null); setKOrd(shuf4()); setReview("");
    setKataAttempts((save.kataAttempts && save.kataAttempts[k.id]) || 0);
    setMyCode("");   // showSol flag rides in myCode? no — dedicated state below
    const ek = enrichSWEKata(k);
    const starterBase = starterFromKata(ek);
    const starter = LABS[k.id] ? LABS[k.id].starter : (todoGuidance ? starterBase : (ek.unguidedStarter || stripGuidance(starterBase)));
    setLabCode(starter);
    setLabOut("");
    setScreen("kata");
  };
  const applyKataCompletion = (baseSave, k) => {
    const s = { ...baseSave, xp: baseSave.xp + 60, katas: { ...baseSave.katas, [k.id]: k.steps.length || 1 }, pet: { mood: "heal", msg: "dojo win!" } };
    const q = s.senzu;
    if (q && !q.claimed && q.required && [q.required.swe, q.required.ml].every((id) => s.katas[id])) {
      s.hp = maxHp;
      s.senzu = { ...q, claimed: true, claimedAt: Date.now() };
      s.pet = { mood: "senzu", msg: "full recovery!" };
      showToast("Senzu bean! Two random dojo trials cleared — HP fully recovered.");
    } else showToast("Kata complete! +60 XP");
    return s;
  };
  const codeLooksFilled = (code) => {
    const body = String(code || "").replace(/#.*$/gm, "").trim();
    return body.length > 20 && !/\bpass\b|TODO|YOUR CODE|____/i.test(body);
  };
  const markKataComplete = () => {
    if (!kata || kProgress(kata.id) >= (kata.steps.length || 1)) return;
    const ek = enrichSWEKata(kata);
    const hasRunnableTest = !!(LABS[kata.id]?.test || ek.test);
    if (!codeLooksFilled(labCode)) { showToast("Fill the code first — TODO/pass placeholders cannot be marked complete."); return; }
    if (hasRunnableTest && !kataValidated[kata.id]) { showToast("Run tests and pass them before marking this kata complete."); return; }
    persist(applyKataCompletion(save, kata));
  };
  const answerKata = (dispIdx) => {
    if (!kata || kFeedback) return;
    const st = kata.steps[stepIdx];
    const idx = kOrd[dispIdx];
    const correct = idx === st.a;
    const s = { ...save };
    recStat(s, kata.id, correct);
    if (correct) {
      s.xp += 15;
      const next = stepIdx + 1;
      if (next >= kata.steps.length) {
        const rewarded = applyKataCompletion(s, kata);
        persist(rewarded); setKFeedback({ ok: true, msg: st.why + " — ALL HINTS CLEARED! +60 XP bonus." });
        setTimeout(() => { setKPhase("work"); setKFeedback(null); }, 1800);
      } else {
        s.katas = { ...s.katas, [kata.id]: Math.max(kProgress(kata.id), next) };
        persist(s); setKFeedback({ ok: true, msg: st.why });
        setTimeout(() => { setStepIdx(next); setKOrd(shuf4()); setKFeedback(null); }, 1500);
      }
    } else { persist(s); setKFeedback({ ok: false, msg: st.why }); setTimeout(() => { setKOrd(shuf4()); setKFeedback(null); }, 1800); }
  };
  const doReview = async () => {
    if (!labCode.trim() || !kata) return;
    recordKataAttempt("review");
    setBusy("review"); setReview("");
    try { setReview(await reviewCode(kata.title, fw, labCode, cfg)); } catch (e) { setReview(`Review failed — ${e.message || "check Settings → Default desktop model auth. In browser dev, desktop Codex/Claude subscriptions are unavailable; launch the Electron app and connect them there."}`); }
    setBusy("");
  };
  const runLab = async (withTests) => {
    if (!kata) return;
    const ek = enrichSWEKata(kata);
    const test = LABS[kata.id]?.test || ek.test || "";
    const needs = LABS[kata.id]?.needs || null;
    if (withTests && !test) { showToast("No runnable tests authored yet — use AI review, then add tests before completion."); return; }
    recordKataAttempt(withTests ? "tests" : "run");
    setBusy("lab"); setLabOut("⏳ starting Python… (first run downloads the runtime, ~10-20s)");
    try {
      const out = await runPython(withTests ? labCode + "\n" + test : labCode, needs, (s) => setLabOut(s));
      setLabOut(out);
      if (withTests && out.includes("ALL TESTS PASSED")) {
        setKataValidated((v) => ({ ...v, [kata.id]: true }));
        showToast("Tests passed — completion unlocked.");
      }
    }
    catch (e) { setLabOut("⚠️ " + (e.message || e)); setKataValidated((v) => ({ ...v, [kata.id]: false })); }
    setBusy("");
  };
  const doPapers = async () => {
    if (!paperQ.trim()) return;
    setBusy("papers"); setPapers(null);
    try { setPapers((await fetchPapers(paperQ.trim(), null)).papers || []); } catch (e) { setPapers({ error: true }); }
    setBusy("");
  };

  /* ---------- code editor keybindings + lightweight Python highlighting ---------- */
  const PY_WORDS = ["import","from","as","def","class","return","if","elif","else","for","in","try","except","finally","with","yield","raise","pass","torch","numpy","np","nn","self","range","len","print","assert","tensor","Linear","Module","forward","backward","softmax","sigmoid","matmul","transpose","reshape","view","permute","randn","zeros","ones","float32","requires_grad","optimizer","gradient","enumerate","lambda","while","break","continue","True","False","None","shape","append","sum","mean","max","min","exp","sqrt","Dataset","DataLoader","ModuleList","Sequential","Parameter","CrossEntropyLoss","MSELoss","SGD","AdamW"];
  const completeStem = (value, s, en, extra = []) => {
    const before = value.slice(0, s);
    const m = before.match(/[A-Za-z_][A-Za-z0-9_]*$/);
    if (!m || m[0].length < 2) return null;
    const stem = m[0];
    const bufWords = [...new Set((value.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || []))];
    const cands = [...new Set([...bufWords, ...PY_WORDS, ...extra])].filter((w) => w.startsWith(stem) && w !== stem).sort();
    if (!cands.length) return null;
    let lcp = cands[0];
    for (const c of cands) { let i = 0; while (i < lcp.length && lcp[i] === c[i]) i++; lcp = lcp.slice(0, i); }
    const add = (lcp.length > stem.length ? lcp : cands[0]).slice(stem.length);
    return add ? { value: before + add + value.slice(en), pos: s + add.length, label: cands.slice(0, 4).join(", ") } : null;
  };
  const editorKeys = (e, value, setValue, onRun) => {
    const ta = e.target;
    const { selectionStart: s, selectionEnd: en } = ta;
    const set = (v, pos) => { setValue(v); requestAnimationFrame(() => { ta.focus({ preventScroll: true }); ta.selectionStart = ta.selectionEnd = pos; }); };
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (onRun) onRun(); return; }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const completed = completeStem(value, s, en);
      if (completed) { set(completed.value, completed.pos); showToast(`completed: ${completed.label}`); return; }
      set(value.slice(0, s) + "    " + value.slice(en), s + 4);   // plain indent
      return;
    }
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      const ls = value.lastIndexOf("\n", s - 1) + 1;
      const rm = value.slice(ls).startsWith("    ") ? 4 : value.slice(ls).startsWith("\t") ? 1 : 0;
      if (rm) set(value.slice(0, ls) + value.slice(ls + rm), Math.max(ls, s - rm));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const ls = value.lastIndexOf("\n", s - 1) + 1;
      const line = value.slice(ls, s);
      const indent = (line.match(/^\s*/) || [""])[0] + (line.trimEnd().endsWith(":") ? "    " : "");
      set(value.slice(0, s) + "\n" + indent + value.slice(en), s + 1 + indent.length);
    }
  };
  const tokenStyle = (tok) => {
    if (/^#/.test(tok)) return { color: "#7F8AA8", fontStyle: "italic" };
    if (/^(import|from|as|def|class|return|if|elif|else|for|in|try|except|finally|with|yield|raise|pass|lambda|while|break|continue)$/.test(tok)) return { color: darkMode ? "#FFB86C" : "#B54708", fontWeight: 800 };
    if (/^(True|False|None)$/.test(tok)) return { color: darkMode ? "#BD93F9" : "#6F42C1", fontWeight: 800 };
    if (/^(self|torch|nn|np|numpy)$/.test(tok)) return { color: darkMode ? "#8BE9FD" : "#0B7285", fontWeight: 800 };
    if (/^(print|len|range|enumerate|sum|mean|max|min|assert|shape|append)$/.test(tok)) return { color: darkMode ? "#50FA7B" : "#087F5B", fontWeight: 700 };
    if (/^(['\"]).*\1$/.test(tok)) return { color: darkMode ? "#F1FA8C" : "#2F9E44" };
    if (/^\d+(\.\d+)?$/.test(tok)) return { color: darkMode ? "#BD93F9" : "#7048E8" };
    return { color: T.codeText };
  };
  const highlightPython = (src) => {
    const out = [];
    src.split("\n").forEach((line, li) => {
      const commentAt = line.indexOf("#");
      const code = commentAt >= 0 ? line.slice(0, commentAt) : line;
      const comment = commentAt >= 0 ? line.slice(commentAt) : "";
      const parts = code.match(/\s+|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|(['\"])(?:\\.|(?!\1).)*\1|./g) || [""];
      parts.forEach((tok, i) => out.push(<span key={`${li}-${i}`} style={tokenStyle(tok)}>{tok}</span>));
      if (comment) out.push(<span key={`${li}-c`} style={tokenStyle(comment)}>{comment}</span>);
      if (li < src.split("\n").length - 1) out.push("\n");
    });
    return out;
  };
  const CodeEditor = useMemo(() => {
    const StableCodeEditor = ({ value, onChange, onRun, rows = 16 }) => {
      const preRef = useRef(null);
      const shared = { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.55, tabSize: 4 };
      const isolate = (e) => e.stopPropagation();
      return <div onMouseDown={isolate} onClick={isolate} style={{ position: "relative", marginTop: 8, border: `1px solid ${T.line}`, borderRadius: 10, background: T.code, minHeight: rows * 18.6, overflow: "hidden" }}>
        <pre ref={preRef} aria-hidden="true" style={{ ...shared, position: "absolute", inset: 0, margin: 0, padding: "11px 12px", whiteSpace: "pre-wrap", overflow: "auto", color: T.codeText, pointerEvents: "none" }}>{highlightPython(value || " ")}</pre>
        <textarea value={value} onChange={(e) => onChange(e.target.value)} onScroll={(e) => { if (preRef.current) { preRef.current.scrollTop = e.currentTarget.scrollTop; preRef.current.scrollLeft = e.currentTarget.scrollLeft; } }} onKeyDown={(e) => { e.stopPropagation(); editorKeys(e, value, onChange, onRun); }} onKeyUp={isolate} onInput={isolate} rows={rows} spellCheck={false} autoCapitalize="off" autoCorrect="off" style={{ ...shared, position: "relative", zIndex: 1, width: "100%", boxSizing: "border-box", border: "none", borderRadius: 10, padding: "11px 12px", resize: "vertical", background: "transparent", color: "transparent", caretColor: darkMode ? "#FFFFFF" : "#111827", outline: "none", overflow: "auto" }} />
      </div>;
    };
    return StableCodeEditor;
  }, [darkMode]);

  /* ---------- styles: twilight glass system ---------- */
  const appBg = darkMode
    ? `radial-gradient(1100px 720px at 82% -12%, rgba(104,133,246,0.16), transparent 62%),
       radial-gradient(900px 640px at -8% 26%, rgba(62,214,196,0.09), transparent 56%),
       radial-gradient(880px 600px at 52% 112%, rgba(208,95,175,0.10), transparent 60%), ${T.paper}`
    : `radial-gradient(1100px 720px at 82% -12%, rgba(122,143,255,0.20), transparent 62%),
       radial-gradient(900px 640px at -8% 26%, rgba(63,196,182,0.14), transparent 56%),
       radial-gradient(880px 600px at 52% 112%, rgba(235,142,205,0.15), transparent 60%), ${T.paper}`;
  const S = {
    app: { minHeight: "100vh", background: appBg, backgroundAttachment: "fixed", color: T.ink, fontFamily: "'Sora', 'Space Grotesk', system-ui, sans-serif" },
    wrap: { maxWidth: 1160, margin: "0 auto", padding: "0 clamp(14px, 4vw, 40px) 80px" },
    card: {
      background: T.card, border: `1px solid ${T.line}`, borderRadius: 18, padding: 18,
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      boxShadow: darkMode ? "0 14px 40px rgba(2,4,12,0.35), inset 0 1px 0 rgba(255,255,255,0.05)" : "0 14px 40px rgba(27,36,64,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
    },
    btn: (bg, c = "#fff") => (String(bg)[0] === "#"
      ? { background: `linear-gradient(180deg, ${tint(bg, 0.16)}, ${bg})`, color: c, border: "none", borderRadius: 12, padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 6px 20px ${withAlpha(bg, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.28)` }
      : { background: bg, color: c, border: "none", borderRadius: 12, padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }),
    btnGhost: { background: "rgba(148,163,214,0.08)", border: `1px solid ${T.line}`, color: T.inkSoft, borderRadius: 10, padding: "6px 13px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 },
    chip: (on) => ({ border: `1px solid ${on ? withAlpha(T.explore, 0.6) : T.line}`, background: on ? T.exploreSoft : (darkMode ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.6)"), color: on ? T.explore : T.inkSoft, borderRadius: 999, padding: "7px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
    mono: (size = 10.5, color = T.inkSoft) => ({ fontFamily: "'JetBrains Mono', monospace", fontSize: size, letterSpacing: "0.07em", color, fontWeight: 700 }),
    pre: { background: T.code, color: T.codeText, border: `1px solid ${darkMode ? "rgba(148,163,214,0.14)" : "transparent"}`, borderRadius: 12, padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, lineHeight: 1.6, overflowX: "auto", whiteSpace: "pre", margin: 0 },
    input: { width: "100%", boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 12, padding: "11px 12px", fontSize: 13.5, fontFamily: "'JetBrains Mono', monospace", background: darkMode ? "rgba(10,15,34,0.7)" : "rgba(255,255,255,0.85)", color: T.ink, outline: "none" },
    qbtn: { display: "block", width: "100%", textAlign: "left", marginBottom: 8, background: darkMode ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.75)", border: `1px solid ${T.line}`, color: T.ink, borderRadius: 12, padding: "12px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.45 },
    inkBtn: darkMode ? "#3A4374" : "#1C2442",
    grid: (min = 320) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap: 12 }),
  };

  const NarutoPet = ({ pet = {} }) => {
    const mood = pet.mood || "idle";
    const msg = pet.msg || "Believe it — keep training.";
    const frame = mood === "harm" ? 2 : mood === "heal" || mood === "senzu" ? 3 : mood === "quest" ? 4 : mood === "done" ? 5 : 0;
    return <div className="hudPet" title={`Naruto pet · ${msg}`} style={{ width: 54, minWidth: 54, textAlign: "center", border: `1px solid ${T.line}`, borderRadius: 14, padding: "3px 4px", background: mood === "harm" ? T.penaltySoft : mood === "heal" || mood === "senzu" ? T.rewardSoft : T.card }}>
      <div style={{ width: 40, height: 43, margin: "0 auto", backgroundImage: "url('/pets/naruto-spritesheet.webp')", backgroundSize: "320px 387px", backgroundPosition: `-${(frame % 8) * 40}px -${Math.floor(frame / 8) * 43}px`, imageRendering: "auto", animation: mood === "harm" ? "shake .25s ease" : "bob 1.6s ease-in-out infinite" }} />
      <div style={S.mono(7, T.inkSoft)}>{mood}</div>
    </div>;
  };

  if (!save) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={S.mono()}>loading save file…</span></div>;

  const iconBtn = () => ({ background: darkMode ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.7)", border: `1px solid ${T.line}`, color: T.ink, borderRadius: 11, width: 34, height: 34, cursor: "pointer", fontSize: 15, display: "grid", placeItems: "center", flexShrink: 0 });
  const xpIntoLevel = save ? save.xp - (level - 1) * 150 : 0;
  const HUD = ({ back }) => (
    <div style={{ position: "sticky", top: 0, zIndex: 20, background: T.hud, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderBottom: `1px solid ${T.line}` }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "10px clamp(14px, 4vw, 40px)", display: "flex", alignItems: "center", gap: 10 }}>
        {back && <button onClick={back} aria-label="Back" style={iconBtn()}>←</button>}
        <div title={`Level ${level} · ${xpIntoLevel}/150 XP into this level`} style={{ position: "relative", width: 40, height: 40, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", background: `conic-gradient(${T.explore} ${Math.round((xpIntoLevel / 150) * 360)}deg, ${darkMode ? "rgba(255,255,255,0.10)" : "rgba(28,36,66,0.12)"} 0deg)`, boxShadow: `0 0 16px ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.35)}` }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: darkMode ? "#10162E" : "#FFFFFF", display: "grid", placeItems: "center" }}>
            <span style={S.mono(10.5, T.ink)}>{level}</span>
          </div>
        </div>
        <div data-tour="hp" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <span style={{ ...S.mono(9.5, T.ink), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>LV.{level} · {save.xp} XP</span>
            <span style={{ ...S.mono(9.5, T.gold), whiteSpace: "nowrap" }}>🎖 {save.badges.length}</span>
          </div>
          <div style={{ height: 7, background: darkMode ? "rgba(255,255,255,0.08)" : "rgba(28,36,66,0.10)", borderRadius: 4, marginTop: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(save.hp / maxHp) * 100}%`, borderRadius: 4, background: save.hp / maxHp > 0.4 ? `linear-gradient(90deg, ${T.reward}, ${tint(darkMode ? "#3DDC97" : "#149E6E", 0.35)})` : `linear-gradient(90deg, ${T.penalty}, ${tint("#FF7A76", 0.25)})`, boxShadow: `0 0 10px ${withAlpha(save.hp / maxHp > 0.4 ? (darkMode ? "#3DDC97" : "#149E6E") : "#FF7A76", 0.5)}`, transition: "width .4s" }} />
          </div>
        </div>
        <NarutoPet pet={save.pet} />
        <button className="hideSm" onClick={() => setTourStep(0)} title="Replay the walkthrough" style={iconBtn()}>?</button>
        <button onClick={toggleMusic} title="Low-volume background music" style={iconBtn()}>{musicOn ? "🎵" : "🔇"}</button>
        <button onClick={toggleTheme} title={darkMode ? "Switch to daylight" : "Switch to twilight"} style={iconBtn()}>{darkMode ? "☀️" : "🌙"}</button>
        <button data-tour="dex" onClick={() => { setDexWorld(activeWorld); setDexOpen(true); }} title="Open the Conceptdex" style={{ ...S.btn(T.explore), padding: "8px 13px", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>📖 <span className="dexLabel" style={{ fontWeight: 800 }}>Dex</span></button>
        <button data-tour="settings" onClick={() => setScreen("settings")} title="Settings" style={iconBtn()}>⚙️</button>
      </div>
    </div>
  );
  const Tabs = () => (
    <div style={{ display: "inline-flex", gap: 4, marginTop: 16, flexWrap: "wrap", padding: 5, borderRadius: 999, background: darkMode ? "rgba(13,19,42,0.6)" : "rgba(255,255,255,0.55)", border: `1px solid ${T.line}`, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      {[["home", "🌍", "Learn"], ["dojo", "⌨️", "Dojo"], ["wildspick", "🌿", "Wilds"], ["coach", "🧪", "Coach"], ["teachspace", "📚", "Mission"], ["papers", "📡", "Papers"]].map(([id, icon, label]) => {
        const on = screen === id || (id === "home" && ["home", "regionlist", "region"].includes(screen));
        return (
          <button key={id} data-tour={"tab-" + id} onClick={() => setScreen(id)} style={{
            border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13,
            padding: "9px 16px", borderRadius: 999, display: "flex", alignItems: "center", gap: 7,
            background: on ? `linear-gradient(180deg, ${tint(T.explore, 0.14)}, ${T.explore})` : "transparent",
            color: on ? "#FFFFFF" : T.inkSoft,
            boxShadow: on ? `0 6px 18px ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.4)}, inset 0 1px 0 rgba(255,255,255,0.3)` : "none",
          }}><span>{icon}</span>{label}</button>
        );
      })}
    </div>
  );
  const Toast = () => toast ? <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", zIndex: 80, background: darkMode ? "rgba(19,26,54,0.92)" : "rgba(28,36,66,0.94)", color: "#F2F5FF", border: "1px solid rgba(148,163,214,0.35)", backdropFilter: "blur(12px)", padding: "11px 18px", borderRadius: 14, fontSize: 13.5, fontWeight: 700, animation: "slideUp .3s ease", maxWidth: "85%", textAlign: "center", boxShadow: "0 16px 44px rgba(2,4,12,0.45)" }}>{toast}</div> : null;
  const finishTour = () => { setTourStep(null); if (!save.tourDone) persist({ ...save, tourDone: true }); };
  const walkthrough = tourStep === null ? null : (() => {
    const step = TOUR_STEPS[Math.min(tourStep, TOUR_STEPS.length - 1)];
    const last = tourStep >= TOUR_STEPS.length - 1;
    // Spotlight: measure the step's target element and cut a glowing window
    // around it in the scrim so the walkthrough points at the real UI.
    let spot = null;
    if (step.target && typeof document !== "undefined") {
      const el = document.querySelector(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) spot = { left: r.left - 7, top: r.top - 7, width: r.width + 14, height: r.height + 14 };
      }
    }
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const placeLow = !!spot && spot.top + spot.height / 2 < vh * 0.45;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 85, display: "flex", alignItems: placeLow ? "flex-end" : "center", justifyContent: "center", padding: 18, paddingBottom: placeLow ? "max(28px, 6vh)" : 18, background: spot ? "transparent" : "rgba(4,7,18,0.6)", backdropFilter: spot ? "none" : "blur(6px)", WebkitBackdropFilter: spot ? "none" : "blur(6px)", animation: "fadeIn .3s ease" }}>
        {spot && <div aria-hidden style={{ position: "fixed", left: spot.left, top: spot.top, width: spot.width, height: spot.height, borderRadius: 16, border: `2px solid ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.95)}`, boxShadow: `0 0 0 9999px rgba(4,7,18,0.62), 0 0 26px ${withAlpha("#8D9BFF", 0.6)}`, pointerEvents: "none", animation: "glowPulse 2.4s ease-in-out infinite" }} />}
        <div key={tourStep} style={{ width: "min(560px, 100%)", borderRadius: 24, padding: "24px 24px 18px", background: darkMode ? "rgba(19,26,54,0.97)" : "rgba(255,255,255,0.97)", border: `1px solid ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.45)}`, boxShadow: "0 30px 90px rgba(2,4,12,0.55)", animation: "fadeScale .35s ease", position: "relative", zIndex: 1 }}>
          <button onClick={finishTour} style={{ position: "absolute", right: 14, top: 14, zIndex: 1, ...S.chip(false), padding: "5px 11px", fontSize: 11 }}>Skip tour</button>
          <div aria-hidden style={{ fontSize: 44, pointerEvents: "none", filter: `drop-shadow(0 8px 20px ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.45)})`, animation: "bob 2.6s ease-in-out infinite" }}>{step.icon}</div>
          <span style={S.mono(9.5, T.explore)}>STEP {tourStep + 1}/{TOUR_STEPS.length} · {step.kicker}</span>
          <h3 style={{ fontSize: 21, fontWeight: 800, margin: "6px 0 8px", fontFamily: "'Sora','Space Grotesk',sans-serif" }}>{step.title}</h3>
          <RichText text={step.body} style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.65 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {TOUR_STEPS.map((_, i) => <span key={i} onClick={() => setTourStep(i)} style={{ width: i === tourStep ? 18 : 7, height: 7, borderRadius: 4, cursor: "pointer", background: i === tourStep ? T.explore : (darkMode ? "rgba(255,255,255,0.18)" : "rgba(28,36,66,0.18)"), transition: "all .25s ease" }} />)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {tourStep > 0 && <button onClick={() => setTourStep(tourStep - 1)} style={S.btnGhost}>← Back</button>}
              <button onClick={() => (last ? finishTour() : setTourStep(tourStep + 1))} style={{ ...S.btn(T.explore), padding: "9px 18px", fontSize: 13 }}>{last ? "Begin the journey \u2192" : "Next \u2192"}</button>
            </div>
          </div>
        </div>
      </div>
    );
  })();
  const chrome = (
    <>
      <style>{CSS}</style>
      <Toast />
      {walkthrough}
      <ConceptdexDrawer
        open={dexOpen}
        onClose={() => setDexOpen(false)}
        worlds={allWorlds}
        dexWorld={dexWorld}
        setDexWorld={setDexWorld}
        capturedSet={capturedSet}
        savedQuestions={dexQuestionsFor(allWorlds.find((w) => w.id === dexWorld) || world)}
        onRemoveQuestion={removeDexQuestion}
        deepLore={deepLore}
        onDeepen={deepenLore}
        busy={busy}
        conceptNote={conceptNote}
      />
    </>
  );
  const SenzuPanel = ({ compact = false }) => {
    const q = save.senzu;
    const active = q && !q.claimed;
    const required = active ? [q.required.swe, q.required.ml].map((id) => allKatas.find((k) => k.id === id)).filter(Boolean) : [];
    const hpFull = save.hp >= maxHp;
    return (
      <div style={{ ...S.card, marginTop: compact ? 8 : 12, background: hpFull ? T.card : T.rewardSoft, border: `1px solid ${hpFull ? T.line : T.reward}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div>
            <span style={S.mono(10, T.reward)}>🫘 SENZU BEAN RECOVERY</span>
            <p style={{ fontSize: compact ? 12 : 13, color: T.inkSoft, lineHeight: 1.5, margin: "5px 0 0" }}>
              Concept-world healing now routes through the Dojo: complete one random uncompleted Blind 75 exercise and one ML Engineering exercise to fully recover HP.
            </p>
          </div>
          <button onClick={ensureSenzuQuest} style={{ ...S.btn(T.reward), padding: "7px 10px", fontSize: 12, whiteSpace: "nowrap" }}>{active ? "Reroll" : hpFull ? "Prep bean" : "Start heal"}</button>
        </div>
        {active && (
          <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
            {required.map((k) => {
              const done = !!save.katas[k.id];
              return <button key={k.id} onClick={() => openKata(k)} style={{ ...S.card, padding: 9, display: "flex", gap: 8, alignItems: "center", textAlign: "left", cursor: "pointer", background: done ? T.rewardSoft : T.card }}>
                <span>{done ? "✅" : "⌨️"}</span><span style={{ flex: 1, fontSize: 12.5 }}><b>{k.family === "swe" ? "Blind 75" : "ML Engineering"}</b>: {k.title}</span><span style={S.mono(9, done ? T.reward : T.explore)}>{done ? "DONE" : "VISIT DOJO →"}</span>
              </button>;
            })}
          </div>
        )}
        {q && q.claimed && <div style={{ marginTop: 7, ...S.mono(10, T.reward) }}>SENZU CLAIMED · HP FULLY RECOVERED</div>}
      </div>
    );
  };
  const QCard = ({ q, ord, onAnswer, label, color, onSave = null }) => (
    <div style={{ ...S.card, animation: "slideUp .25s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={S.mono(10, color || T.explore)}>{label}</span>
        {onSave && <button onClick={(e) => { e.stopPropagation(); onSave(q); }} style={{ ...S.chip(false), padding: "4px 8px", fontSize: 11 }}>＋ Conceptdex</button>}
      </div>
      <RichText text={q.q} style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.55, margin: "8px 0 12px" }} />
      {ord.map((optIdx, i) => (
        <button key={i} onClick={() => onAnswer(i)} style={S.qbtn}>
          <span style={S.mono(10, T.explore)}>{String.fromCharCode(65 + i)}</span>&nbsp;&nbsp;{q.options[optIdx]}
        </button>
      ))}
    </div>
  );
  const Collapsible = ({ id, title, children, color = T.explore, right = null, style = {} }) => {
    const open = sectionOpen[id] !== false;
    return (
      <div style={{ ...S.card, ...style }}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <button onClick={() => toggleSection(id)} style={{ flex: 1, background: "none", border: "none", color: T.ink, cursor: "pointer", padding: 0, fontFamily: "inherit", textAlign: "left" }}>
            <span style={S.mono(10, color)}>{open ? "⌄" : "›"} {title}</span>
          </button>
          {right || <button onClick={() => toggleSection(id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}><span style={S.mono(9, T.inkSoft)}>{open ? "collapse" : "expand"}</span></button>}
        </div>
        {open && <div style={{ marginTop: 8 }}>{children}</div>}
      </div>
    );
  };
  const TeachingPanel = ({ target = world, region: teachRegion = null, compact = false }) => {
    const tp = target.teaching || TEACHING_PARADIGM;
    const records = worldLearningRecords(target).length;
    const glossary = capturedConceptsFor(target).length;
    const chips = [
      ["🎯", compact ? "mission" : tp.mission],
      ["🔗", compact ? "resources" : (tp.resources && tp.resources.length ? `Resources: ${tp.resources.join(", ")}` : tp.resources)],
      ["🧠", compact ? "retrieval + spacing" : tp.retention],
      ["📚", compact ? `${glossary} glossary · ${records} records` : (teachRegion?.referenceHint || tp.reference)],
    ];
    return (
      <Collapsible
        id="teachPanel"
        title={`TEACH WORKSPACE · ${TEACH_SOURCE}`}
        color={T.explore}
        style={{ marginTop: 10, background: darkMode ? "#101832" : "#F7F8FD" }}
        right={<button onClick={(e) => { e.stopPropagation(); setDexWorld(target.id); setScreen("teachspace"); }} style={{ ...S.chip(false), fontSize: 11, padding: "5px 9px" }}>Open mission log →</button>}
      >
        {!compact && <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 8px" }}>This is now stateful, not just a banner: captured concepts become glossary terms, critical wins create learning records, resources stay attached to each world, and Coach/Wilds generate retrieval practice from your misses.</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chips.map(([icon, text], i) => <span key={i} style={{ ...S.mono(9.5, i === 0 ? T.action : i === 1 ? T.explore : i === 2 ? T.reward : T.gold), background: T.card, border: `1px solid ${T.line}`, borderRadius: 999, padding: "5px 9px" }}>{icon} {text}</span>)}
        </div>
      </Collapsible>
    );
  };

  /* ============ TITLE ============ */
  if (screen === "title") return (
    <div style={{ ...S.app, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20 }}>
      {chrome}
      <div aria-hidden style={{ position: "absolute", inset: "-25%", pointerEvents: "none", background: `radial-gradient(34% 30% at 26% 30%, ${withAlpha(darkMode ? "#6885F6" : "#7A8FFF", 0.22)}, transparent 70%), radial-gradient(30% 26% at 74% 22%, ${withAlpha("#3ED6C4", darkMode ? 0.13 : 0.18)}, transparent 70%), radial-gradient(36% 30% at 60% 84%, ${withAlpha("#D05FAF", darkMode ? 0.12 : 0.16)}, transparent 70%)`, animation: "auroraDrift 24s ease-in-out infinite alternate" }} />
      {["🌍", "⚛️", "🌊", "👁️", "🚄"].map((e, i) => (
        <span key={i} aria-hidden style={{ position: "absolute", fontSize: 24 + (i % 3) * 8, opacity: darkMode ? 0.5 : 0.55, filter: `saturate(1.1) drop-shadow(0 0 14px ${withAlpha("#8D9BFF", 0.55)})`, left: `${[8, 84, 14, 78, 48][i]}%`, top: `${[22, 18, 74, 70, 88][i]}%`, animation: `floatY ${7 + i * 1.7}s ease-in-out ${i * 0.9}s infinite`, pointerEvents: "none" }}>{e}</span>
      ))}
      <div style={{ position: "relative", animation: "fadeScale .7s ease" }}>
        <div style={{ fontSize: 62, animation: "bob 3s ease-in-out infinite", filter: `drop-shadow(0 10px 26px ${withAlpha("#8D9BFF", 0.45)})` }}>🧢</div>
        <h1 style={{ fontSize: "clamp(44px, 8vw, 72px)", fontWeight: 800, letterSpacing: "0.06em", margin: "10px 0 6px", fontFamily: "'Sora','Space Grotesk',sans-serif", background: `linear-gradient(115deg, ${darkMode ? "#EEF2FF" : "#1C2442"} 25%, ${T.explore} 55%, ${T.teal} 85%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", textShadow: "none" }}>EDOKAI</h1>
        <span style={S.mono(11, T.explore)}>CONCEPT WORLDS · TORCHLEET DOJO · SELF-IMPROVING COACH</span>
        <p style={{ color: T.inkSoft, maxWidth: 470, lineHeight: 1.65, fontSize: 15, margin: "16px auto 0" }}>
          A living atlas of <b style={{ color: T.action }}>concept worlds</b>, a <b style={{ color: T.explore }}>Dojo</b> with runnable Python katas, per-world <b style={{ color: T.gold }}>Trial Gauntlets</b>, and a <b style={{ color: T.reward }}>Coach</b> that watches your misses and forges new drills.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
          {[["🗺️", "force-directed atlas"], ["📖", "conceptdex"], ["⚔️", "gauntlets"], ["🐍", "live python"]].map(([icon, label]) => (
            <span key={label} style={{ ...S.mono(9.5, T.inkSoft), background: T.card, border: `1px solid ${T.line}`, borderRadius: 999, padding: "7px 12px", backdropFilter: "blur(10px)" }}>{icon} {label}</span>
          ))}
        </div>
        <button onClick={() => setScreen("home")} style={{ ...S.btn(T.explore), fontSize: 16.5, padding: "15px 38px", marginTop: 26, borderRadius: 16, boxShadow: `0 10px 34px ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.5)}, inset 0 1px 0 rgba(255,255,255,0.35)`, animation: "glowPulse 3.2s ease-in-out infinite" }}>{save.xp > 0 ? "Continue journey →" : "Begin journey →"}</button>
        {save.xp > 0 && <div style={{ ...S.mono(9.5, T.inkSoft), marginTop: 12 }}>LV.{level} · {save.xp} XP · {save.captured.length} CONCEPTS CAPTURED</div>}
      </div>
    </div>
  );

  /* ============ HOME ============ */
  if (screen === "home") return (
    <div style={S.app}>{chrome}<HUD back={() => setScreen("title")} />
      <div style={{ ...S.wrap }}>
        <Tabs />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "clamp(24px, 3.4vw, 32px)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em", fontFamily: "'Sora','Space Grotesk',sans-serif" }}>Concept Worlds</h2>
            <span style={S.mono(9.5, T.inkSoft)}>{allWorlds.length} WORLDS · {save.captured.length} CONCEPTS CAPTURED · LV.{level}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 999, background: darkMode ? "rgba(13,19,42,0.6)" : "rgba(255,255,255,0.55)", border: `1px solid ${T.line}` }}>
              <button onClick={() => setHomeView("atlas")} style={{ ...S.btn(homeView === "atlas" ? T.explore : "transparent", homeView === "atlas" ? "#fff" : T.inkSoft), padding: "7px 14px", fontSize: 12, borderRadius: 999 }}>🗺️ Atlas</button>
              <button onClick={() => setHomeView("list")} style={{ ...S.btn(homeView === "list" ? T.explore : "transparent", homeView === "list" ? "#fff" : T.inkSoft), padding: "7px 14px", fontSize: 12, borderRadius: 999 }}>☰ List</button>
            </div>
            <button onClick={() => { setScan(null); setScreen("spawn"); }} style={{ ...S.btn(T.action), padding: "9px 14px", fontSize: 12.5 }}>+ Bring your own</button>
          </div>
        </div>
        <TeachingPanel target={world} compact />
        <Collapsible id="liveDkg" title={`LIVE DKG · ${dkgSync.status.toUpperCase()}`} color={dkgSync.status === "error" ? T.penalty : T.explore} style={{ marginTop: 10, background: dkgSync.status === "error" ? T.penaltySoft : dkgSync.status === "disabled" ? T.card : T.exploreSoft }} right={<button onClick={(e) => { e.stopPropagation(); refreshDkgNow(); }} style={{ ...S.chip(false), fontSize: 11, padding: "5px 9px" }}>{dkgSync.status === "refreshing" ? "Pulling…" : "Pull latest"}</button>}>
          <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, margin: 0 }}>
            {dkgSync.status === "disabled"
              ? "No live DKG source is available yet. The app now tries browser Supabase, the Netlify DKG proxy, then GitHub raw knowledge files; configure Netlify server env or click Pull latest after GitHub deploys."
              : dkgSync.status === "error"
                ? `Live DKG sync error: ${dkgSync.error}`
                : dkgSync.stats
                  ? `${dkgSync.stats.node_count || 0} graph nodes · ${dkgSync.stats.edge_count || 0} edges · ${dkgSync.stats.macro_world_count || 0} macro worlds synced from ${dkgSync.source || "live DKG"}.`
                  : "Waiting for the latest live DKG snapshot from Supabase, Netlify proxy, or GitHub raw…"}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <span style={S.mono(9, T.inkSoft)}>source: {dkgSync.source || "auto"}</span>
            {dkgSync.updatedAt && <span style={S.mono(9, T.inkSoft)}>updated: {new Date(dkgSync.updatedAt).toLocaleString()}</span>}
            {dkgSync.realtimeStatus && <span style={S.mono(9, T.inkSoft)}>realtime: {dkgSync.realtimeStatus}</span>}
            {!dkgSync.browserSupabaseConfigured && <span style={S.mono(9, T.gold)}>browser anon key absent; using server proxy/GitHub fallback</span>}
          </div>
          {!!(dkgSync.recentSources || []).length && <Collapsible id="liveDkgSources" title="RECENT LIVE INGESTS / SOURCES" color={T.inkSoft} style={{ marginTop: 10, padding: 10, background: T.card }}>
            <div style={{ display: "grid", gap: 6 }}>
              {(dkgSync.recentSources || []).slice(0, 3).map((src) => (
                <a key={src.id} href={src.url || undefined} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", color: T.ink, background: darkMode ? "#101832" : "#FAFBFF", border: `1px solid ${T.line}`, borderRadius: 12, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <b style={{ fontSize: 12.5 }}>{src.title}</b>
                    {src.lastReadAt && <span style={S.mono(8.5, T.inkSoft)}>{new Date(src.lastReadAt).toLocaleString()}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 3 }}>{src.url || src.id}</div>
                </a>
              ))}
              {!!(dkgSync.recentRuns || []).length && <div style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45 }}>
                Latest run: {(dkgSync.recentRuns[0].nodesAdded || 0) > 0
                  ? `${dkgSync.recentRuns[0].nodesAdded} new nodes, ${dkgSync.recentRuns[0].edgesAdded || 0} new edges`
                  : `${dkgSync.recentRuns[0].nodesUpdated || 0} existing nodes refreshed · no new nodes`}
              </div>}
            </div>
          </Collapsible>}
        </Collapsible>
        {homeView === "atlas" && (
          <div data-tour="atlas" style={{ marginTop: 14, animation: "fadeScale .5s ease" }}>
            <AtlasGraph
              worlds={allWorlds}
              focusedWorld={focusedMapWorld}
              mapStats={mapStats}
              capturedSet={capturedSet}
              height={Math.max(440, Math.min(620, typeof window !== "undefined" ? window.innerHeight * 0.62 : 540))}
              onFocus={(id) => { setMapFocus(id); setActiveWorld(id); }}
              onStudy={(id) => { setActiveWorld(id); setRegionIdx(0); setAtNode("start"); setScreen("regionlist"); }}
            />
          </div>
        )}
        {homeView === "list" && (
          <div style={{ ...S.grid(330), marginTop: 14 }}>
            {allWorlds.map((w, wi) => {
              const total = w.regions.reduce((n, r) => n + r.concepts.length, 0);
              const got = w.regions.reduce((n, r) => n + r.concepts.filter((c) => capturedSet.has(c.id)).length, 0);
              const badges = w.regions.filter((r) => save.badges.includes(r.gym.badge)).length;
              const custom = !BUILTIN_WORLDS.find((b) => b.id === w.id);
              const pct = total ? Math.round((got / total) * 100) : 0;
              return (
                <div key={w.id} onClick={() => { setActiveWorld(w.id); setRegionIdx(0); setAtNode("start"); setScreen("regionlist"); }}
                  className="worldCard" style={{ ...S.card, display: "flex", flexDirection: "column", gap: 10, cursor: "pointer", position: "relative", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 15, display: "grid", placeItems: "center", fontSize: 25, flexShrink: 0, background: T.exploreSoft, border: `1px solid ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.3)}` }}>{w.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15.5, fontFamily: "'Sora','Space Grotesk',sans-serif" }}>{w.title} {badges === w.regions.length && badges > 0 ? "🎖" : ""}</div>
                      <span style={S.mono(9, got === total && total > 0 ? T.reward : T.inkSoft)}>{w.domain ? `${w.domain.toUpperCase()} · ` : ""}{got}/{total} CONCEPTS · {w.regions.length} REGION{w.regions.length === 1 ? "" : "S"}{custom ? " · CUSTOM" : ""}</span>
                    </div>
                    {custom && <button onClick={(e) => { e.stopPropagation(); persistWorlds(worlds.filter((x) => x.id !== w.id)); }} style={{ background: "none", border: "none", color: T.inkSoft, cursor: "pointer", fontSize: 15 }}>✕</button>}
                  </div>
                  {w.blurb && <div style={{ fontSize: 12.3, color: T.inkSoft, lineHeight: 1.5, flex: 1 }}>{w.blurb}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 5, background: darkMode ? "rgba(255,255,255,0.08)" : "rgba(28,36,66,0.10)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg, ${T.explore}, ${T.teal})`, boxShadow: `0 0 8px ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.55)}` }} />
                    </div>
                    <span style={S.mono(9, pct === 100 ? T.reward : T.inkSoft)}>{pct}%</span>
                    <span style={{ color: T.explore, fontWeight: 800, fontSize: 18 }}>›</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  /* ============ WORLDS MAP ============ */
  if (screen === "map") {
    const focusStats = mapStats(focusedMapWorld);
    return (
      <div style={S.app}>{chrome}<HUD back={() => setScreen("home")} />
        <div style={{ ...S.wrap }}>
          <Tabs />
          <div style={{ ...S.card, marginTop: 16 }}>
            <span style={S.mono(10, T.explore)}>EDOKAI ATLAS · LIVING CONSTELLATION</span>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 4px", fontFamily: "'Sora','Space Grotesk',sans-serif" }}>Your knowledge graph, laid out by physics.</h2>
            <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55, margin: 0 }}>Worlds are glowing hubs sized by concept count; regions orbit them as satellites; capture progress rings each node, and dashed golden threads join worlds that share sources. Drag anything — the layout breathes and settles on its own.</p>
          </div>

          <div style={{ marginTop: 12 }}>
            <AtlasGraph
              worlds={allWorlds}
              focusedWorld={focusedMapWorld}
              mapStats={mapStats}
              capturedSet={capturedSet}
              height={Math.max(460, Math.min(640, typeof window !== "undefined" ? window.innerHeight * 0.64 : 560))}
              onFocus={(id) => { setMapFocus(id); setActiveWorld(id); }}
              onStudy={(id) => { setActiveWorld(id); setRegionIdx(0); setAtNode("start"); setScreen("regionlist"); }}
            />
          </div>

          <div style={{ ...S.card, marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <span style={S.mono(10, T.action)}>FOCUSED WORLD · {focusStats.concepts} CONCEPTS</span>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0" }}>{focusedMapWorld.emoji} {focusedMapWorld.title}</h2>
                <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55, margin: 0 }}>{focusedMapWorld.blurb}</p>
              </div>
              <button onClick={() => { setActiveWorld(focusedMapWorld.id); setRegionIdx(0); setAtNode("start"); setScreen("regionlist"); }} style={{ ...S.btn(T.explore), padding: "8px 11px", fontSize: 12, whiteSpace: "nowrap" }}>Study →</button>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {focusedMapWorld.regions.map((r, i) => {
                const done = r.concepts.filter((c) => capturedSet.has(c.id)).length;
                return (
                  <div key={r.id} style={{ border: `1px solid ${T.line}`, borderRadius: 16, padding: 12, background: darkMode ? "#0D142A" : "#FAFBFF" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 34, height: 34, borderRadius: 12, background: T.exploreSoft, display: "grid", placeItems: "center", flexShrink: 0 }}>{r.emoji}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{i + 1}. {r.name}</div>
                          <span style={S.mono(9, done === r.concepts.length ? T.reward : T.inkSoft)}>{done}/{r.concepts.length}</span>
                        </div>
                        <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45, margin: "5px 0 8px" }}>{r.intro}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {r.concepts.map((c) => (
                            <span key={c.id} title={c.lore} style={{ ...S.chip(capturedSet.has(c.id)), fontSize: 11, padding: "5px 8px", maxWidth: "100%" }}>{capturedSet.has(c.id) ? "✓ " : "○ "}{c.name}</span>
                          ))}
                        </div>
                        {(r.sides || []).length > 0 && <div style={{ marginTop: 7, ...S.mono(9.5, T.gold) }}>⚔ {r.sides.length} contrast duel{r.sides.length === 1 ? "" : "s"}: {(r.sides || []).map((s) => s.name).slice(0, 2).join(" · ")}{r.sides.length > 2 ? " · …" : ""}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...S.card, marginTop: 12 }}>
            <span style={S.mono(10, T.explore)}>NEARBY TERRITORIES</span>
            <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, margin: "5px 0 10px" }}>Compressed neighbors keep the full DKG visible without turning the UI into an unreadable graph. Shared-source overlap is highlighted when present.</p>
            <div style={{ display: "grid", gap: 8 }}>
              {mapNeighbors.map(({ world: w, overlap, stats }) => (
                <button key={w.id} onClick={() => { setMapFocus(w.id); setActiveWorld(w.id); }} style={{ ...S.card, padding: 10, display: "flex", gap: 10, alignItems: "center", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ fontSize: 22 }}>{w.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{w.title}</div>
                    <div style={S.mono(9, T.inkSoft)}>{stats.concepts} concepts · {w.regions.length} regions{overlap ? ` · ${overlap} shared source${overlap === 1 ? "" : "s"}` : ""}</div>
                  </div>
                  <span style={{ color: T.explore, fontWeight: 800 }}>focus</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ============ REGION LIST ============ */
  if (screen === "regionlist") return (
    <div style={S.app}>{chrome}<HUD back={() => setScreen("home")} />
      <div style={{ ...S.wrap, paddingTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 28px)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em", fontFamily: "'Sora','Space Grotesk',sans-serif" }}>{world.emoji} {world.title}</h2>
            {world.domain && <span style={S.mono(9.5, T.inkSoft)}>{world.domain.toUpperCase()}</span>}
          </div>
          <button onClick={() => startGauntlet()} style={{ ...S.btn(T.gold), padding: "8px 12px", fontSize: 12 }}>⚔️ Trial Gauntlet</button>
        </div>
        {(world.links || []).length > 0 && (
          <Collapsible id="studySources" title="STUDY HALL / SOURCES" color={T.explore} style={{ marginTop: 10, padding: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {world.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ ...S.chip(false), textDecoration: "none", fontSize: 11.5, padding: "5px 10px" }}>🔗 {l.label}</a>)}
            </div>
          </Collapsible>
        )}
        <TeachingPanel target={world} />
        <SenzuPanel />
        {(() => {
          const renderRegion = (r, i) => {
            const locked = !(i === 0 || save.badges.includes(regions[i - 1].gym.badge));
            const got = r.concepts.filter((c) => capturedSet.has(c.id)).length;
            const sGot = (r.sides || []).filter((s) => sidesSet.has(s.id)).length;
            return (
              <div key={r.id} onClick={() => { if (!locked) { setRegionIdx(i); setAtNode("start"); setScreen("region"); } }}
                className="worldCard" style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, opacity: locked ? 0.55 : 1, cursor: locked ? "default" : "pointer" }}>
                <div style={{ fontSize: 32 }}>{locked ? "🔒" : r.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15.5 }}>{r.name} {save.badges.includes(r.gym.badge) && "🎖"}</div>
                  <div style={{ fontSize: 12.5, color: T.inkSoft }}>{r.intro}</div>
                  <span style={S.mono(9.5, got === r.concepts.length ? T.reward : T.inkSoft)}>{got}/{r.concepts.length} CRITICALS · {sGot}/{(r.sides || []).length} SIDES</span>
                </div>
                {!locked && <span style={{ color: T.explore, fontWeight: 800, fontSize: 20 }}>›</span>}
              </div>
            );
          };
          const arcs = [];
          regions.forEach((r) => { const a = r.arc || null; if (!arcs.includes(a)) arcs.push(a); });
          if (arcs.length === 1 && arcs[0] === null) return <div style={{ ...S.grid(340), marginTop: 14 }}>{regions.map(renderRegion)}</div>;
          return arcs.map((arc, ai) => {
            const members = regions.map((r, i) => [r, i]).filter(([r]) => (r.arc || null) === arc);
            const done = members.filter(([r]) => save.badges.includes(r.gym.badge)).length;
            const hue = hueFor(ai % 8);
            return (
              <div key={arc || "uncharted"} style={{ marginTop: ai ? 22 : 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ ...S.mono(10.5, tint(hue, darkMode ? 0.45 : 0)), letterSpacing: "0.1em" }}>◆ {String(arc || "Uncharted Paths").toUpperCase()}</span>
                  <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${withAlpha(hue, 0.45)}, transparent)` }} />
                  <span style={S.mono(8.5, done === members.length ? T.reward : T.inkSoft)}>{done}/{members.length} BADGES</span>
                </div>
                <div style={{ ...S.grid(340), marginTop: 10 }}>{members.map(([r, i]) => renderRegion(r, i))}</div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );

  /* ============ GAUNTLET ============ */
  if (screen === "gauntlet" && gaunt) {
    if (gaunt.done) {
      const weak = coachRows().slice(0, 3);
      return (
        <div style={S.app}>{chrome}<HUD back={() => { setGaunt(null); setScreen("regionlist"); }} />
          <div style={{ ...S.wrap, paddingTop: 20 }}>
            <div style={{ ...S.card, textAlign: "center" }}>
              <div style={{ fontSize: 42 }}>{gaunt.lives > 0 ? "🏆" : "💀"}</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "6px 0 2px" }}>{gaunt.lives > 0 ? "Gauntlet cleared!" : "Gauntlet over"}</h2>
              <span style={S.mono(11, T.reward)}>{gaunt.score}/{gaunt.pool.length} CORRECT · +{gaunt.score * 8} XP EARNED</span>
              {weak.length > 0 && (
                <p style={{ fontSize: 13, color: T.inkSoft, marginTop: 10, lineHeight: 1.55 }}>Weakest right now: <b>{weak.map((w) => w.name).join(", ")}</b>. Visit the 🧪 Coach to forge targeted drills.</p>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
                <button onClick={() => startGauntlet()} style={S.btn(T.gold)}>Run it again</button>
                <button onClick={() => setScreen("coach")} style={S.btn(T.explore)}>🧪 Coach</button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    const q = gaunt.pool[gaunt.idx];
    return (
      <div style={S.app}>{chrome}
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "16px clamp(14px, 3vw, 28px) 60px" }}>
          <button onClick={() => { setGaunt(null); setScreen("regionlist"); }} style={{ background: "rgba(148,163,214,0.10)", border: `1px solid ${T.line}`, color: T.inkSoft, borderRadius: 10, backdropFilter: "blur(8px)", padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, marginBottom: 8 }}>← Exit gauntlet</button>
          <div style={{ display: "flex", justifyContent: "space-between", color: T.inkSoft }}>
            <span style={S.mono(10, T.inkSoft)}>{gaunt.focus ? `FOCUSED DRILL · ${gaunt.focus.toUpperCase()}` : `TRIAL GAUNTLET · ${world.title.toUpperCase()}`}</span>
            <span style={S.mono(10, T.inkSoft)}>Q{gaunt.idx + 1}/{gaunt.pool.length} · {"❤️".repeat(gaunt.lives)}{"🖤".repeat(3 - gaunt.lives)} · {gaunt.score} ✓</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <QCard q={q} ord={gaunt.ord} onAnswer={answerGauntlet} label={`FROM: ${q.name} · +8 XP`} color={T.gold} onSave={(qq) => addDexQuestion(qq, q.src || "gauntlet", q.name || "Gauntlet")} />
          </div>
          {gaunt.fb && (
            <div style={{ ...S.card, background: gaunt.fb.ok ? T.rewardSoft : T.penaltySoft, border: `1px solid ${gaunt.fb.ok ? withAlpha(darkMode ? "#3DDC97" : "#149E6E", 0.4) : withAlpha("#FF7A76", 0.4)}`, marginTop: 12, animation: "slideUp .25s ease" }}>
              <b style={{ color: gaunt.fb.ok ? T.reward : T.penalty, fontSize: 13 }}>{gaunt.fb.ok ? "✓ Correct" : "✗ Miss"}</b>
              <RichText text={gaunt.fb.msg} style={{ fontSize: 13, lineHeight: 1.55, margin: "6px 0 10px" }} />
              <button onClick={nextGauntlet} style={{ ...S.btn(S.inkBtn), width: "100%" }}>Next →</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ============ COACH ============ */
  if (screen === "coach") {
    const rows = coachRows();
    const augCount = (aug[world.id] || []).length;
    return (
      <div style={S.app}>{chrome}<HUD back={() => setScreen("home")} />
        <div style={{ ...S.wrap }}>
          <Tabs />
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "14px 0 2px" }}>🧪 The Coach — {world.title}</h2>
          <p style={{ color: T.inkSoft, fontSize: 13, lineHeight: 1.55 }}>The teaching system improves itself: every answer you give is tracked per concept. The Coach reads your miss patterns and forges NEW scenario drills aimed at exactly what you get wrong — retrieval practice, spacing, and interleaving grow where you're weakest.</p>
          <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
            <button onClick={forgeDrills} disabled={busy === "coach"} style={{ ...S.btn(T.explore), flex: 1 }}>{busy === "coach" ? "Reflecting on your misses…" : "🔨 Reflect & forge new drills"}</button>
            <button onClick={() => startGauntlet()} style={S.btn(T.gold)}>⚔️ Gauntlet</button>
          </div>
          <span style={S.mono(10)}>{augCount} GENERATED QUESTIONS IN THIS WORLD'S POOL · 🌿 = fresh wilds episode on that topic · ⚔️ = pool drill</span>
          {rows.length === 0 && <div style={{ ...S.card, marginTop: 10, color: T.inkSoft, fontSize: 13.5 }}>No telemetry yet for this world — fight some encounters first, then come back.</div>}
          {rows.map((r) => (
            <div key={r.id} style={{ ...S.card, marginTop: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{r.name}</span>
                <div style={{ height: 6, background: T.line, borderRadius: 3, marginTop: 5 }}>
                  <div style={{ height: "100%", width: `${Math.round((1 - r.rate) * 100)}%`, background: r.rate > 0.4 ? T.penalty : r.rate > 0.15 ? T.gold : T.reward, borderRadius: 3 }} />
                </div>
              </div>
              <span style={S.mono(10, r.rate > 0.4 ? T.penalty : T.inkSoft)}>{Math.round((1 - r.rate) * 100)}% · {r.a} ans</span>
              <button onClick={() => runEpisode(r.id, r.name)} style={{ ...S.btn(T.explore), padding: "6px 10px", fontSize: 11 }}>🌿</button>
              <button onClick={() => startGauntlet(r.id)} style={{ ...S.btn(T.gold), padding: "6px 10px", fontSize: 11 }}>⚔️</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ============ WILDS PICKER ============ */
  if (screen === "wildspick") {
    return (
      <div style={S.app}>{chrome}<HUD back={() => setScreen("home")} />
        <div style={{ ...S.wrap }}>
          <Tabs />
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "14px 0 2px" }}>🌿 The Wilds — {world.title}</h2>
          <p style={{ color: T.inkSoft, fontSize: 13, lineHeight: 1.55 }}>An RL environment over any selected concept world (the Env Foundry region explains the machinery). Each episode creates resource-grounded retrieval practice from the world's lore; if the model call fails, Edokai falls back to local verifier-backed questions so the happy path still works.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>{allWorlds.map((w) => <button key={w.id} onClick={() => { setActiveWorld(w.id); setRegionIdx(0); }} style={S.chip(w.id === world.id)}>{w.emoji} {w.title}</button>)}</div>
          <button onClick={() => runEpisode("world", world.title)} style={{ ...S.btn(T.reward), width: "100%", marginTop: 8 }}>▶ Episode over {world.title}</button>
          <div style={{ marginTop: 14 }}><span style={S.mono(10)}>OR SCOPE TO ONE CONCEPT:</span></div>
          {regions.map((r) => (
            <div key={r.id} style={{ marginTop: 10 }}>
              <span style={S.mono(10, T.inkSoft)}>{r.emoji} {r.name.toUpperCase()}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {r.concepts.map((c) => <button key={c.id} onClick={() => runEpisode(c.id, c.name)} style={S.chip(false)}>{c.sprite} {c.name}</button>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ============ WILDS EPISODE ============ */
  if (screen === "wilds" && wilds) {
    if (wilds.busy) return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>{chrome}
        <div style={{ fontSize: 48, animation: "bob 1.6s ease-in-out infinite" }}>🌿</div>
        <span style={{ ...S.mono(11, T.inkSoft) }}>THE ENV IS FORGING TASKS: {wilds.name.toUpperCase()}…</span>
        <button onClick={() => { setWilds(null); setScreen("wildspick"); }} style={{ background: "rgba(148,163,214,0.10)", border: `1px solid ${T.line}`, color: T.inkSoft, borderRadius: 10, backdropFilter: "blur(8px)", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>← Back</button>
      </div>
    );
    if (wilds.error) return (
      <div style={S.app}>{chrome}<HUD back={() => { setWilds(null); setScreen("wildspick"); }} />
        <div style={{ ...S.wrap, paddingTop: 20 }}><div style={{ ...S.card, color: T.penalty, fontSize: 13.5 }}>{wilds.error}</div></div>
      </div>
    );
    if (wilds.done) return (
      <div style={S.app}>{chrome}<HUD back={() => { setWilds(null); setScreen("wildspick"); }} />
        <div style={{ ...S.wrap, paddingTop: 20 }}>
          <div style={{ ...S.card, textAlign: "center" }}>
            <div style={{ fontSize: 42 }}>🌿</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "6px 0 2px" }}>Episode complete</h2>
            <span style={S.mono(11, T.reward)}>{wilds.score}/{wilds.qs.length} · +{wilds.score * 10} XP · {wilds.fallback ? "local review set" : wilds.scope === "world" ? "fresh world episode" : "questions banked into pools"}</span>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
              <button onClick={() => runEpisode(wilds.scope, wilds.name)} style={S.btn(T.reward)}>▶ New episode (fresh tasks)</button>
              <button onClick={() => { setWilds(null); setScreen("coach"); }} style={S.btn(T.explore)}>🧪 Coach</button>
            </div>
          </div>
        </div>
      </div>
    );
    const q = wilds.qs[wilds.idx];
    return (
      <div style={S.app}>{chrome}
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "16px clamp(14px, 3vw, 28px) 60px" }}>
          <button onClick={() => { setWilds(null); setScreen("wildspick"); }} style={{ background: "rgba(148,163,214,0.10)", border: `1px solid ${T.line}`, color: T.inkSoft, borderRadius: 10, backdropFilter: "blur(8px)", padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, marginBottom: 8 }}>← Leave the Wilds</button>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={S.mono(10, T.inkSoft)}>🌿 WILDS EPISODE · {wilds.name.toUpperCase()}</span>
            <span style={S.mono(10, T.inkSoft)}>Q{wilds.idx + 1}/{wilds.qs.length} · {wilds.score} ✓</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <QCard q={q} ord={wilds.ord} onAnswer={answerWilds} label="FRESH TASK — GROUNDED IN LORE · +10 XP" color={T.reward} />
          </div>
          {wilds.fb && (
            <div style={{ ...S.card, background: wilds.fb.ok ? T.rewardSoft : T.penaltySoft, border: `1px solid ${wilds.fb.ok ? withAlpha(darkMode ? "#3DDC97" : "#149E6E", 0.4) : withAlpha("#FF7A76", 0.4)}`, marginTop: 12, animation: "slideUp .25s ease" }}>
              <b style={{ color: wilds.fb.ok ? T.reward : T.penalty, fontSize: 13 }}>{wilds.fb.ok ? "✓ Verified correct" : "✗ Miss"}</b>
              <RichText text={wilds.fb.msg} style={{ fontSize: 13, lineHeight: 1.55, margin: "6px 0 4px" }} />
              {wilds.fb.ev && <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 10px" }}>📜 EVIDENCE: "{wilds.fb.ev}"</p>}
              <button onClick={nextWilds} style={{ ...S.btn(S.inkBtn), width: "100%" }}>Next →</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ============ SPAWN ============ */
  if (screen === "spawn") return (
    <div style={S.app}>{chrome}<HUD back={() => setScreen("home")} />
      <div style={{ ...S.wrap, paddingTop: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Bring your own resource</h2>
        <p style={{ color: T.inkSoft, fontSize: 13.5, lineHeight: 1.55 }}>Paste a link or text, upload a PDF, or just name a concept — Edokai finds or uses the best resource first. Then choose: <b>learn</b> it as a mission-grounded board world, or <b>implement</b> it as a dojo kata with feedback loops.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {[["url", "🔗 URL"], ["pdf", "📄 PDF"], ["text", "📋 Paste"], ["concept", "💡 Concept"]].map(([id, label]) => (
            <button key={id} onClick={() => { setResTab(id); setScan(null); }} style={S.chip(resTab === id)}>{label}</button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          {resTab === "url" && <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://arxiv.org/abs/… or any blog/docs" style={S.input} />}
          {resTab === "pdf" && (
            <label style={{ ...S.card, display: "block", textAlign: "center", cursor: "pointer", borderStyle: "dashed" }}>
              <input type="file" accept="application/pdf" onChange={onPdfPick} style={{ display: "none" }} />
              <span style={{ fontSize: 26 }}>📄</span>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{pdfName || "Tap to choose a PDF"}</div>
              <span style={S.mono(9.5)}>read by the built-in model</span>
            </label>
          )}
          {resTab === "text" && <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste an article, paper section, or notes… (works with local models too)" rows={6} style={{ ...S.input, resize: "vertical", fontFamily: "'Space Grotesk', sans-serif" }} />}
          {resTab === "concept" && <input value={conceptQ} onChange={(e) => setConceptQ(e.target.value)} placeholder="e.g. speculative decoding, Mamba, FHIR resources" style={S.input} />}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={S.mono(10)}>GOAL:</span>
          <button onClick={() => setGoal("learn")} style={S.chip(goal === "learn")}>🌍 Learn concepts</button>
          <button onClick={() => setGoal("implement")} style={S.chip(goal === "implement")}>⌨️ Implement solution</button>
        </div>
        <button onClick={doScan} disabled={busy === "scan"} style={{ ...S.btn(S.inkBtn), width: "100%", marginTop: 12 }}>{busy === "scan" ? "Reading resource…" : "Scan resource"}</button>
        {scan && scan.error && <div style={{ marginTop: 12, color: T.penalty, fontSize: 13.5 }}>{scan.error}</div>}
        {scan && !scan.error && (
          <div style={{ ...S.card, marginTop: 14 }}>
            <div style={{ fontWeight: 800 }}>{scan.title}</div>
            {scan.src.foundUrl && <a href={scan.src.foundUrl} target="_blank" rel="noreferrer" style={{ ...S.mono(10, T.explore) }}>{scan.src.foundUrl}</a>}
            {goal === "learn" ? (
              <>
                <div style={{ marginTop: 4 }}><span style={S.mono(10)}>tap sections to become regions · {scan.picked.size} selected</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {scan.sections.map((s) => {
                    const on = scan.picked.has(s);
                    return <button key={s} onClick={() => { const n = new Set(scan.picked); on ? n.delete(s) : n.add(s); setScan({ ...scan, picked: n }); }} style={S.chip(on)}>{s}</button>;
                  })}
                </div>
              </>
            ) : <p style={{ fontSize: 13, color: T.inkSoft, margin: "8px 0 0" }}>An implementation kata will be forged: guided code steps + reference solution + AI review of your attempt.</p>}
            <button onClick={doBuild} disabled={!!busy} style={{ ...S.btn(T.explore), marginTop: 14, width: "100%" }}>
              {busy && busy !== "scan" ? busy : goal === "learn" ? `Forge ${scan.picked.size} region${scan.picked.size === 1 ? "" : "s"}` : "Forge the kata"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  /* ============ TEACH WORKSPACE ============ */
  if (screen === "teachspace") {
    const teachW = allWorlds.find((w) => w.id === dexWorld) || world;
    const tp = teachW.teaching || TEACHING_PARADIGM;
    const glossary = capturedConceptsFor(teachW);
    const records = worldLearningRecords(teachW);
    return (
      <div style={S.app}>{chrome}<HUD back={() => setScreen("home")} />
        <div style={{ ...S.wrap, paddingTop: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px" }}>📚 Teach Workspace</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {allWorlds.map((w) => <button key={w.id} onClick={() => { setDexWorld(w.id); setActiveWorld(w.id); }} style={S.chip(dexWorld === w.id)}>{w.emoji} {w.title}</button>)}
          </div>
          <Collapsible id="teachMission" title="MISSION.md" color={T.action} style={{ marginTop: 12 }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{tp.mission}</p>
            <div style={{ marginTop: 8 }}><span style={S.mono(9.5, T.inkSoft)}>Success: explain mechanisms · answer applied scenarios · transfer ideas into code/design decisions.</span></div>
          </Collapsible>
          <Collapsible id="teachResources" title="RESOURCES.md / SOURCES" color={T.explore} style={{ marginTop: 10 }}>
            {(teachW.links || []).length ? teachW.links.map((l) => <div key={l.url} style={{ marginTop: 7 }}><a href={l.url} target="_blank" rel="noreferrer" style={{ color: T.explore, fontWeight: 800, fontSize: 13 }}>{l.label}</a><div style={{ fontSize: 12, color: T.inkSoft }}>Use for source-grounded lore, examples, and follow-up reading.</div></div>) : <p style={{ fontSize: 12.5, color: T.inkSoft }}>Custom worlds built from pasted text/PDFs use that source as their resource.</p>}
          </Collapsible>
          <Collapsible id="teachGlossary" title={`GLOSSARY.md · ${glossary.length} captured concepts`} color={T.gold} style={{ marginTop: 10 }}>
            {glossary.length ? glossary.map((c) => { const n = conceptNote(c, deepLore[c.id]); return <div key={c.id} style={{ marginTop: 9, borderTop: `1px solid ${T.line}`, paddingTop: 8 }}><b style={{ fontSize: 13.5 }}>{c.sprite} {c.name}</b><p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.55, margin: "4px 0" }}>{n.mechanism}</p><span style={S.mono(9, T.explore)}>check: {n.checkpoint}</span></div>; }) : <p style={{ fontSize: 12.5, color: T.inkSoft }}>Defeat critical encounters to promote terms into the glossary. This keeps the reference layer honest: it only contains concepts you have demonstrated.</p>}
          </Collapsible>
          <Collapsible id="teachRecords" title={`LEARNING RECORDS · ${records.length}`} color={T.reward} style={{ marginTop: 10 }}>
            {records.length ? records.map((r) => <div key={r.id} style={{ marginTop: 9, borderTop: `1px solid ${T.line}`, paddingTop: 8 }}><b style={{ fontSize: 13.5 }}>{r.title}</b><p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.55, margin: "4px 0 0" }}>{r.summary}</p><span style={S.mono(9, T.reward)}>{r.evidence}</span></div>) : <p style={{ fontSize: 12.5, color: T.inkSoft }}>Learning records appear when a critical is won. They are evidence of understanding, not a session log.</p>}
          </Collapsible>
        </div>
      </div>
    );
  }

  /* ============ SETTINGS ============ */
  if (screen === "settings") return (
    <div style={S.app}>{chrome}<HUD back={() => setScreen("home")} />
      <div style={{ ...S.wrap, paddingTop: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Model settings</h2>
        <p style={{ color: T.inkSoft, fontSize: 13, lineHeight: 1.55 }}>Generation can run through the Claude bridge, the desktop Claude Code OAuth bridge, the Netlify Anthropic proxy, a user-supplied Anthropic key, or any OpenAI-compatible endpoint. On desktop, signing in once with <code>claude auth login</code> lets Edokai use Claude Code's browser-based authentication without an explicit API-key environment variable.</p>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button onClick={() => persistCfg({ ...cfg, provider: "builtin" })} style={S.chip(cfg.provider === "builtin")}>Claude</button>
          <button onClick={() => persistCfg({ ...cfg, provider: "custom" })} style={S.chip(cfg.provider === "custom")}>Custom endpoint</button>
        </div>
        <div style={{ ...S.card, marginTop: 12 }}>
          <span style={S.mono(10)}>CLAUDE CODE BROWSER AUTH</span>
          <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, margin: "6px 0 8px" }}>
            {claudeCodeAuth ? (claudeCodeAuth.loggedIn ? `Signed in via ${claudeCodeAuth.authMethod || "Claude Code"}${claudeCodeAuth.email ? ` · ${claudeCodeAuth.email}` : ""}` : `Not signed in${claudeCodeAuth.error ? ` · ${claudeCodeAuth.error}` : ""}`) : "Checking Claude Code auth…"}
          </p>
          <button onClick={() => window.edokaiAuth && window.edokaiAuth.claudeCodeStatus && window.edokaiAuth.claudeCodeStatus().then(setClaudeCodeAuth).catch((e) => setClaudeCodeAuth({ loggedIn: false, error: e.message || String(e) }))} style={{ ...S.chip(false), fontSize: 12 }}>Refresh Claude Code status</button>
          <p style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.5, margin: "8px 0 0" }}>If this says not signed in, run <code>claude auth login</code> once. Claude Code opens the browser and stores OAuth locally; Edokai reuses it at launch.</p>
        </div>
        <div style={{ ...S.card, marginTop: 12 }}>
          <span style={S.mono(10)}>DEFAULT DESKTOP MODEL AUTH</span>
          <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, margin: "6px 0 8px" }}>Deepen Lore uses the existing desktop provider before hosted proxy/API-key routes: Codex GPT-5.5 auth first, or Claude Opus auth if selected. No local fallback content is generated.</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => persistCfg({ ...cfg, preferredAuth: "codex" })} style={S.chip((cfg.preferredAuth || "codex") === "codex")}>Codex GPT-5.5</button>
            <button onClick={() => persistCfg({ ...cfg, preferredAuth: "claude" })} style={S.chip(cfg.preferredAuth === "claude")}>Claude Opus auth</button>
            <button onClick={() => startDesktopLogin("codex")} style={S.chip(false)}>Connect Codex subscription</button>
            <button onClick={() => startDesktopLogin("claude")} style={S.chip(false)}>Connect Claude Code subscription</button>
            <button onClick={testDefaultModel} style={S.chip(false)}>Test default provider</button>
            <button onClick={refreshDesktopModelStatus} style={S.chip(false)}>Refresh status</button>
          </div>
          {desktopModelStatus && <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {desktopModelStatus.error && <span style={S.mono(9.5, T.penalty)}>{desktopModelStatus.error}</span>}
            <span style={S.mono(9.5, desktopModelStatus.codex?.ok ? T.reward : T.penalty)}>Codex: {desktopModelStatus.codex?.ok ? "ready" : (desktopModelStatus.codex?.error || "not ready")}</span>
            <span style={S.mono(9.5, desktopModelStatus.claude?.ok ? T.reward : T.penalty)}>Claude: {desktopModelStatus.claude?.ok ? "ready" : (desktopModelStatus.claude?.error || "not ready")}</span>
          </div>}
          {modelTest && <p style={{ fontSize: 12, color: modelTest.ok ? T.reward : modelTest.ok === false ? T.penalty : T.inkSoft, lineHeight: 1.4, margin: "8px 0 0" }}>{modelTest.msg}</p>}
        </div>
        <div style={{ ...S.card, marginTop: 12 }}>
          <span style={S.mono(10)}>ANTHROPIC API KEY (optional fallback; Netlify can use ANTHROPIC_API_KEY server-side)</span>
          <input value={cfg.anthropicKey || ""} onChange={(e) => persistCfg({ ...cfg, anthropicKey: e.target.value })} type="password" placeholder="sk-ant-… (leave blank to use Claude Code OAuth when available)" style={{ ...S.input, margin: "6px 0 0" }} />
        </div>
        {cfg.provider === "custom" && (
          <div style={{ ...S.card, marginTop: 12 }}>
            <span style={S.mono(10)}>PRESETS</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 12px" }}>
              <button onClick={() => persistCfg({ ...cfg, baseUrl: "http://localhost:11434/v1", model: "llama3.1" })} style={S.chip(false)}>Ollama</button>
              <button onClick={() => persistCfg({ ...cfg, baseUrl: "http://localhost:8080/v1", model: "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit" })} style={S.chip(false)}>MLX-LM</button>
              <button onClick={() => persistCfg({ ...cfg, baseUrl: "http://localhost:1234/v1", model: "local-model" })} style={S.chip(false)}>LM Studio</button>
              <button onClick={() => persistCfg({ ...cfg, baseUrl: "http://localhost:8080/v1", model: "default" })} style={S.chip(false)}>llama.cpp</button>
            </div>
            <span style={S.mono(10)}>BASE URL (…/v1)</span>
            <input value={cfg.baseUrl} onChange={(e) => persistCfg({ ...cfg, baseUrl: e.target.value })} placeholder="https://api.provider.com/v1, http://localhost:11434/v1, or http://localhost:8080/v1" style={{ ...S.input, margin: "4px 0 10px" }} />
            <span style={S.mono(10)}>MODEL</span>
            <input value={cfg.model} onChange={(e) => persistCfg({ ...cfg, model: e.target.value })} placeholder="llama3.1, mlx-community/Qwen2.5-Coder-7B-Instruct-4bit, gpt-4o-mini…" style={{ ...S.input, margin: "4px 0 10px" }} />
            <span style={S.mono(10)}>API KEY (blank for local)</span>
            <input value={cfg.apiKey} onChange={(e) => persistCfg({ ...cfg, apiKey: e.target.value })} type="password" placeholder="sk-…" style={{ ...S.input, margin: "4px 0 6px" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <button onClick={testCustomModel} disabled={modelTest && modelTest.ok === null} style={{ ...S.btn(T.reward), padding: "8px 12px", fontSize: 12 }}>{modelTest && modelTest.ok === null ? "Testing…" : "Test connection"}</button>
              {modelTest && <span style={{ fontSize: 12, color: modelTest.ok ? T.reward : modelTest.ok === false ? T.penalty : T.inkSoft, lineHeight: 1.4 }}>{modelTest.msg}</span>}
            </div>
            <p style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.5, margin: "8px 0 0" }}>⚠️ Local endpoints need CORS enabled in browser builds. Ollama: <code>OLLAMA_ORIGINS=* ollama serve</code>. MLX-LM: <code>python -m mlx_lm.server --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit --host 127.0.0.1 --port 8080</code>, then use <code>http://localhost:8080/v1</code>. The test checks <code>/models</code> and a tiny <code>/chat/completions</code> call against the selected model. The desktop build has no browser sandbox limits.</p>
          </div>
        )}
        <div style={{ ...S.card, marginTop: 12 }}>
          <span style={S.mono(10)}>DISPLAY</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "8px 0 12px" }}>
            <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, margin: 0 }}>Dark mode is built for late-night dojo runs and paper-reading sessions.</p>
            <button onClick={toggleTheme} style={S.chip(darkMode)}>{darkMode ? "🌙 Dark" : "☀️ Light"}</button>
          </div>
        </div>
        <div style={{ ...S.card, marginTop: 12 }}>
          <span style={S.mono(10)}>SOUNDTRACK</span>
          <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, margin: "6px 0 8px" }}>The app now uses a tiny generated lo-fi synth loop by default instead of bundling a large audio file. You can still load your own audio file for this session.</p>
          <label style={{ ...S.chip(false), display: "inline-block", cursor: "pointer" }}>
            🎵 Choose audio file…
            <input type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (!f) return;
              music.setCustom(URL.createObjectURL(f));
              showToast(`Soundtrack loaded: ${f.name} — hit 🎵 to play`);
            }} />
          </label>
        </div>
        <div style={{ ...S.card, marginTop: 12 }}>
          <span style={S.mono(10)}>SAVE DATA</span>
          <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "6px 0 10px" }}>Player {save.player?.name || "local-player"} · UUID {save.player?.id || "pending"} · Session {save.player?.sessionId || "pending"}<br />XP {save.xp} · {save.captured.length} concepts · {save.badges.length} badges · {Object.keys(save.katas).length} katas · telemetry on {Object.keys(save.qstats).length} topics</p>
          <button onClick={() => { persist({ xp: 0, hp: 100, badges: [], captured: [], sides: [], katas: {}, qstats: {}, kataHints: {}, kataAttempts: {}, learningRecords: [], dexQuestions: [], senzu: null, pet: { mood: "idle", msg: "ready" }, player: save.player }); persistAug({}); showToast("Save reset."); }} style={{ ...S.btn(T.penalty), padding: "8px 14px", fontSize: 12.5 }}>Reset progress</button>
        </div>
      </div>
    </div>
  );

  /* ============ PAPER SCOUT ============ */
  if (screen === "papers") return (
    <div style={S.app}>{chrome}<HUD back={() => setScreen("home")} />
      <div style={{ ...S.wrap }}>
        <Tabs />
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "14px 0 4px" }}>📡 Paper Scout</h2>
        <p style={{ color: T.inkSoft, fontSize: 13, lineHeight: 1.55 }}>Live search over arXiv / Hugging Face Papers via the built-in model (Papers with Code was sunset in 2025). Found something good? Make it a world.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={paperQ} onChange={(e) => setPaperQ(e.target.value)} placeholder="e.g. JEPA world models, KV cache compression" style={{ ...S.input, flex: 1, minWidth: 0 }} />
          <button onClick={doPapers} disabled={busy === "papers"} style={S.btn(S.inkBtn)}>{busy === "papers" ? "…" : "Scout"}</button>
        </div>
        {papers && papers.error && <div style={{ marginTop: 12, color: T.penalty, fontSize: 13.5 }}>Scout failed — try a broader topic.</div>}
        {Array.isArray(papers) && papers.map((p, i) => (
          <div key={i} style={{ ...S.card, marginTop: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.4 }}>{p.title}</div>
            <span style={S.mono(9.5, T.explore)}>{p.venue}</span>
            <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55, margin: "6px 0 8px" }}>{p.summary}</p>
            <div style={{ display: "flex", gap: 8 }}>
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ ...S.chip(false), textDecoration: "none" }}>Read →</a>}
              <button onClick={() => { setResTab("url"); setUrl(p.url || ""); setGoal("learn"); setScan(null); setScreen("spawn"); }} style={S.chip(true)}>⚒️ Make it a world</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ============ DOJO ============ */
  if (screen === "dojo") {
    const fams = [["swe", "🧩 Software Engineering · Blind 75"], ["sys", "🏰 System Design"], ["ml", "🧠 ML Engineering · ranked for current interviews"], ["torchleet", "🔥 TorchLeet · PyTorch practice"], ["custom", "🌀 Your forged katas"]];
    return (
      <div style={S.app}>{chrome}<HUD back={() => setScreen("home")} />
        <div style={{ ...S.wrap }}>
          <Tabs />
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "14px 0 0" }}>⌨️ The Dojo</h2>
          <span style={S.mono(10)}>code-first workthroughs · TorchLeet set · in-browser Python lab · AI review</span>
          <div style={{ ...S.card, marginTop: 10, background: T.rewardSoft }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div><b>🫘 Senzu bean recovery quest</b><p style={{ fontSize: 12.5, color: T.inkSoft, margin: "4px 0 0" }}>Started from Concept Worlds: clear both exercises here, then return healed.</p></div>
              <button onClick={() => setScreen("regionlist")} style={S.btn(T.reward)}>Back to worlds</button>
            </div>
            {save.senzu && !save.senzu.claimed && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {[save.senzu.required.swe, save.senzu.required.ml].map((id) => { const k = allKatas.find((x) => x.id === id); const done = !!save.katas[id]; return k ? <button key={id} onClick={() => openKata(k)} style={S.chip(done)}>{done ? "✓" : "○"} {k.family === "swe" ? "Blind 75" : "ML"}: {k.title}</button> : null; })}
            </div>}
            {save.senzu && save.senzu.claimed && <span style={S.mono(10, T.reward)}>SENZU CLAIMED · HP FULLY RECOVERED</span>}
          </div>
          {fams.map(([fam, label]) => {
            const ks = allKatas.filter((k) => k.family === fam);
            if (!ks.length) return null;
            return (
              <div key={fam} style={{ marginTop: 16 }}>
                <button onClick={() => setDojoOpen({ ...dojoOpen, [fam]: !dojoOpen[fam] })} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: T.ink, fontWeight: 800, fontSize: 14.5, cursor: "pointer", padding: "4px 0", fontFamily: "inherit" }}>{dojoOpen[fam] ? "⌄" : "›"} {label} <span style={S.mono(9, T.inkSoft)}>({ks.length})</span></button>
                {dojoOpen[fam] && <div style={{ ...S.grid(360), marginTop: 10 }}>{ks.map((k, rankIdx) => {
                  const p = kProgress(k.id); const done = p >= (k.steps.length || 1);
                  return (
                    <div key={k.id} onClick={() => openKata(k)} className="worldCard" style={{ ...S.card, padding: 14, display: "flex", gap: 12, alignItems: "center", cursor: "pointer", background: done ? T.rewardSoft : T.card }}>
                      <span style={{ fontSize: 22 }}>{k.emoji || "⌨️"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{fam === "ml" && <span style={S.mono(9, T.gold)}>#{rankIdx + 1} interview&nbsp;</span>}{k.title} {LABS[k.id] ? "🧪" : ""}</div>
                        <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45 }}>{k.blurb}</div>
                        <span style={S.mono(9, done ? T.reward : T.inkSoft)}>{done ? "COMPLETE ✓" : k.steps.length ? `${p}/${k.steps.length} hints` : "code kata — not started"} · {k.frameworks.join(" / ")}{LABS[k.id] ? " · LIVE LAB" : ""}</span>
                      </div>
                      <span style={{ color: T.explore, fontWeight: 800 }}>›</span>
                    </div>
                  );
                })}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ============ KATA PLAYER — code-first workspace ============ */
  if (screen === "kata" && kata) {
    const lab = LABS[kata.id];
    const todoSteps = getKataTodos(kata, lab);
    const done = kProgress(kata.id) >= (kata.steps.length || 1);
    const st = todoSteps[stepIdx] || kata.steps[stepIdx];
    const showSol = kPhase === "sol";
    const showHints = kPhase === "hints";
    return (
      <div style={S.app}>{chrome}<HUD back={() => setScreen("dojo")} />
        <div style={{ ...S.wrap, paddingTop: 16 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{kata.emoji || "⌨️"} {kata.title} {done && "✓"}</h2>
          <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, margin: "4px 0 8px" }}>{kata.blurb}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {kata.tier && <span style={{ ...S.mono(10, T.gold) }}>{kata.tier}</span>}
            {kata.frameworks.map((f) => <button key={f} onClick={() => setFw(f)} style={S.chip(fw === f)}>{f}</button>)}
            {(kata.links || []).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ ...S.chip(false), textDecoration: "none" }}>🔗 {l.label}</a>)}
          </div>

          <div style={{ ...S.card, marginBottom: 10, background: darkMode ? "#101832" : "#F7F8FD" }}>
            <span style={S.mono(10, T.explore)}>DOJO LORE — WHY THIS KATA MATTERS</span>
            <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.65, margin: "8px 0 0" }}>{kataLore(kata)}</p>
            {kata.family === "swe" && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: T.card, border: `1px solid ${T.line}` }}><span style={S.mono(9, T.reward)}>TEST INPUTS → EXPECTED OUTPUTS</span><div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.55, marginTop: 4 }}>{kata.testIo || sweIo(kata)}</div></div>}
            <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5, margin: "8px 0 0" }}>Attempt counter: <b>{(save.kataAttempts && save.kataAttempts[kata.id]) || kataAttempts || 0}</b>. TODO hints are free before your first run/review; after that, each newly revealed hint costs 5 XP.</p>
          </div>

          {/* WORKSPACE — the primary surface */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={S.mono(10, T.action)}>⌨️ WORKSPACE — {todoGuidance ? "fill the TODOs" : "less-guided blank slate"}</span>
              <span style={S.mono(9)}>{(lab || kata.family === "swe") ? "runs in-browser (Pyodide)" : "PyTorch — run locally, review here"}</span>
            </div>
            {kata.family === "swe" && <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => { const next = !todoGuidance; setTodoGuidance(next); const ek = enrichSWEKata(kata); setLabCode(next ? (LABS[kata.id]?.starter || ek.starter || labCode) : (ek.unguidedStarter || stripGuidance(labCode))); }} style={S.chip(todoGuidance)}>{todoGuidance ? "🧭 TODO guidance on" : "🧭 TODO guidance off"}</button>
              <span style={S.mono(9)}>Toggle off removes scaffold comments for a more interview-like attempt.</span>
            </div>}
            <CodeEditor value={labCode} onChange={setLabCode} onRun={lab ? () => runLab(false) : null} rows={16} />
            <span style={S.mono(8.5)}>syntax-highlighted Python · TAB completes/indents · SHIFT+TAB dedents · ENTER auto-indents · {navigator.platform && navigator.platform.includes("Mac") ? "⌘" : "CTRL"}+ENTER runs</span>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {(lab || kata.family === "swe") && <button onClick={() => runLab(false)} disabled={busy === "lab"} style={{ ...S.btn(S.inkBtn), flex: 1, minWidth: 90 }}>{busy === "lab" ? "Running…" : "▶ Run"}</button>}
              {(LABS[kata.id]?.test || enrichSWEKata(kata).test) && <button onClick={() => runLab(true)} disabled={busy === "lab"} style={{ ...S.btn(kataValidated[kata.id] ? T.reward : T.card, kataValidated[kata.id] ? "#fff" : T.reward), border: `1px solid ${T.reward}`, flex: 1, minWidth: 110 }}>{busy === "lab" ? "Running…" : kataValidated[kata.id] ? "✓ Tests passed" : "✓ Run tests"}</button>}
              <button onClick={doReview} disabled={busy === "review"} style={{ ...S.btn(T.explore), flex: 1, minWidth: 120 }}>{busy === "review" ? "Reviewing…" : "🔍 AI review"}</button>
            </div>
            {labOut && <pre style={{ ...S.pre, marginTop: 8, maxHeight: 220, overflowY: "auto", background: "#0B0F1E" }}>{labOut}</pre>}
            {lab && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                <span style={{ ...S.mono(12, T.reward) }}>&gt;&gt;&gt;</span>
                <input value={repl} onChange={(e) => setRepl(e.target.value)} onKeyDown={async (e) => {
                  e.stopPropagation();
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const completed = completeStem(repl, el.selectionStart || repl.length, el.selectionEnd || repl.length, labCode.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || []);
                    if (completed) { setRepl(completed.value); requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = completed.pos; }); showToast(`REPL completed: ${completed.label}`); }
                    return;
                  }
                  if (e.key !== "Enter" || !repl.trim() || busy === "lab") return;
                  e.preventDefault();
                  const line = repl; setRepl(""); setBusy("lab");
                  setLabOut((o) => (o ? o + "\n" : "") + ">>> " + line);
                  try {
                    const py = await getPyodide();
                    let out = "";
                    py.setStdout({ batched: (s) => { out += s + "\n"; } });
                    py.setStderr({ batched: (s) => { out += s + "\n"; } });
                    let val;
                    try { val = await py.runPythonAsync(line); } catch (err) { out += String(err.message || err).split("\n").slice(-3).join("\n"); }
                    if (val !== undefined && val !== null) out += String(val);
                    setLabOut((o) => o + (out ? "\n" + out.trimEnd() : ""));
                  } catch (err) { setLabOut((o) => o + "\n⚠️ " + (err.message || err)); }
                  setBusy("");
                }} onKeyUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} placeholder="REPL — shares the session with ▶ Run (try: out.shape)" spellCheck={false} style={{ ...S.input, flex: 1, padding: "8px 10px", fontSize: 12 }} />
              </div>
            )}
            {review && <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", padding: "10px 12px", background: T.exploreSoft, borderRadius: 10 }}>{review}</div>}
          </div>

          {/* TODO lore / hints / solution / completion controls */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {todoSteps.length > 0 && <button onClick={() => setKPhase(showHints ? "work" : "hints")} style={{ ...S.btn(showHints ? S.inkBtn : T.card, showHints ? "#fff" : T.inkSoft), border: `1px solid ${T.line}`, flex: 1 }}>🧭 TODO lore & hints ({Object.keys(save.kataHints || {}).filter((h) => h.startsWith(kata.id + ":")).length}/{todoSteps.length})</button>}
            <button onClick={() => setKPhase(showSol ? "work" : "sol")} style={{ ...S.btn(showSol ? S.inkBtn : T.card, showSol ? "#fff" : T.inkSoft), border: `1px solid ${T.line}`, flex: 1 }}>{showSol ? "Hide solution" : "📖 Reveal final solution"}</button>
            {!done && <button onClick={markKataComplete} style={{ ...S.btn(kataValidated[kata.id] ? T.gold : T.card, kataValidated[kata.id] ? "#1B2440" : T.inkSoft), border: `1px solid ${kataValidated[kata.id] ? T.gold : T.line}`, flex: 1 }}>🏁 Mark complete {kataValidated[kata.id] ? "(+60 XP)" : "(locked)"}</button>}
          </div>

          {showHints && todoSteps.length > 0 && (
            <div style={{ ...S.card, marginTop: 10, animation: "slideUp .25s ease" }}>
              <span style={S.mono(10, T.explore)}>TODO LORE — hints are optional, not the whole answer</span>
              <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.55, margin: "6px 0 10px" }}>Each TODO has a mini-lore explanation and a separately unlockable hint. Unlocking a new hint after any run/review attempt costs 5 XP; rereading an unlocked hint is free.</p>
              {todoSteps.map((step, idx) => {
                const revealed = kataHintRevealed(kata.id, idx);
                return (
                  <div key={idx} style={{ borderTop: idx ? `1px solid ${T.line}` : "none", paddingTop: idx ? 12 : 0, marginTop: idx ? 12 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <span style={S.mono(10, idx === stepIdx ? T.action : T.explore)}>TODO {idx + 1}/{todoSteps.length}</span>
                      {idx === stepIdx && <span style={S.mono(9, T.action)}>CURRENT</span>}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.5, margin: "6px 0" }}>{step.prompt}</div>
                    <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, margin: "0 0 8px" }}>{kataStepLore(step, idx)}</p>
                    {step.code && <pre style={{ ...S.pre, marginBottom: 8 }}>{step.code}</pre>}
                    {revealed ? (
                      <div style={{ background: T.exploreSoft, color: T.ink, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, lineHeight: 1.55 }}><b>Hint:</b> {kataStepHint(step)}</div>
                    ) : (
                      <button onClick={() => revealKataHint(idx)} style={{ ...S.chip(false), fontSize: 12 }}>💡 Reveal hint {((save.kataAttempts && save.kataAttempts[kata.id]) || kataAttempts || 0) > 0 ? "(-5 XP)" : "(free before first attempt)"}</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {showSol && (
            <div style={{ ...S.card, marginTop: 10 }}>
              <span style={S.mono(10, T.gold)}>FINAL REFERENCE SOLUTION — reveal after you have wrestled with the TODOs</span>
              <pre style={{ ...S.pre, marginTop: 10 }}>{(kata.solutions && (kata.solutions[fw] || kata.solutions[Object.keys(kata.solutions)[0]])) || enrichSWEKata(kata).solution || kata.solution || "// reference not available"}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ============ BATTLE ============ */
  if (screen === "battle" && battle) {
    const q = bQuestions[battle.qIdx % bQuestions.length];
    const enemy = battle.kind === "critical" ? battle.concept : battle.kind === "side" ? battle.side : battle.gym;
    const enemyName = battle.kind === "gym" ? battle.gym.leader : enemy.name;
    const enemyPct = (battle.enemyHp / battle.enemyMax) * 100;
    const kindLabel = battle.kind === "critical" ? "CRITICAL ENCOUNTER · NEW CONCEPT" : battle.kind === "side" ? "SIDE DUEL · REINFORCEMENT" : "GYM BATTLE";
    const kindColor = battle.kind === "critical" ? T.action : battle.kind === "side" ? T.explore : T.gold;
    const side = battle.kind === "side" ? battle.side : null;
    return (
      <div style={S.app}>{chrome}
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "16px clamp(14px, 3vw, 28px) 60px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <button onClick={() => { setBattle(null); setScreen("region"); }} style={{ background: "rgba(148,163,214,0.10)", border: `1px solid ${T.line}`, color: T.inkSoft, borderRadius: 10, backdropFilter: "blur(8px)", padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>← Retreat & review</button>
            <span style={{ ...S.mono(10, T.inkSoft) }}>{kindLabel} · {Math.min(battle.qIdx + 1, bQuestions.length)}/{bQuestions.length} Q</span>
          </div>
          <div style={{ position: "relative", overflow: "hidden", background: "radial-gradient(120% 130% at 50% -20%, #2A3468 0%, #1B2450 42%, #101736 78%, #0B102A 100%)", borderRadius: 20, padding: "12px 14px 10px", border: "1px solid rgba(148,163,214,0.28)", marginTop: 8, boxShadow: "0 18px 48px rgba(3,6,18,0.5), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
            <div aria-hidden style={{ position: "absolute", inset: "-30%", pointerEvents: "none", background: `radial-gradient(36% 30% at 26% 22%, ${withAlpha(String(kindColor)[0] === "#" ? kindColor : "#8D9BFF", 0.22)}, transparent 70%), radial-gradient(30% 26% at 76% 78%, rgba(62,214,196,0.10), transparent 70%)`, animation: "auroraDrift 18s ease-in-out infinite alternate" }} />
            {(() => {
              const plate = { position: "relative", background: "rgba(9,13,30,0.72)", border: "1px solid rgba(148,163,214,0.3)", backdropFilter: "blur(10px)", borderRadius: 12, padding: "6px 11px", minWidth: 150, color: "#EEF2FF" };
              const track = { height: 7, background: "rgba(255,255,255,0.10)", borderRadius: 4, marginTop: 6, overflow: "hidden" };
              const fill = (pct, good) => ({ height: "100%", width: `${pct}%`, borderRadius: 4, background: good ? "linear-gradient(90deg,#3DDC97,#7FF0C0)" : "linear-gradient(90deg,#FF7A76,#FFA69E)", boxShadow: `0 0 10px ${good ? "rgba(61,220,151,0.6)" : "rgba(255,122,118,0.6)"}`, transition: "width .5s" });
              return (
                <>
                  <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={plate}>
                      <div style={{ fontWeight: 800, fontSize: 12.5 }}>{battle.kind === "gym" ? "👑 " : ""}{enemyName}</div>
                      <div style={track}><div style={fill(enemyPct, enemyPct > 40)} /></div>
                      <span style={S.mono(9, "#A5B1D6")}>HP {battle.enemyHp}/{battle.enemyMax}</span>
                    </div>
                    <div style={{ fontSize: 40, filter: "drop-shadow(0 8px 22px rgba(141,155,255,0.4))", animation: battle.phase === "feedback" && !battle.wrong ? "hit .4s" : "bob 2.4s ease-in-out infinite" }}>{enemy.sprite}</div>
                  </div>
                  <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
                    <div style={{ fontSize: 32, filter: "drop-shadow(0 6px 16px rgba(62,214,196,0.35))", animation: battle.wrong && battle.phase === "feedback" ? "hit .4s" : "none" }}>🧢</div>
                    <div style={plate}>
                      <div style={{ fontWeight: 800, fontSize: 12.5 }}>YOU · LV.{level}</div>
                      <div style={track}><div style={fill((save.hp / maxHp) * 100, save.hp / maxHp > 0.4)} /></div>
                      <span style={S.mono(9, "#A5B1D6")}>HP {save.hp}/{maxHp} · STREAK ×{battle.streak}</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {battle.phase === "briefing" && side && (
            <div style={{ ...S.card, marginTop: 12, animation: "slideUp .3s ease" }}>
              <span style={S.mono(10, kindColor)}>MISSION BRIEFING — RETENTION DUEL</span>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: "8px 0 10px" }}>{side.desc}</p>
              <span style={{ ...S.mono(10, level >= (side.recLevel || 1) ? T.reward : T.penalty), background: level >= (side.recLevel || 1) ? T.rewardSoft : T.penaltySoft, padding: "5px 10px", borderRadius: 999 }}>
                RECOMMENDED LV.{side.recLevel || 1} {level >= (side.recLevel || 1) ? "✓ you qualify" : `· you are LV.${level}`}
              </span>
              {(side.prereqs || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <span style={S.mono(9.5)}>PREREQ LORE — capture these criticals first for optimal retention:</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {side.prereqs.map((pid) => {
                      const met = capturedSet.has(pid);
                      return <span key={pid} style={{ ...S.mono(10, met ? T.reward : T.penalty), background: met ? T.rewardSoft : T.penaltySoft, padding: "5px 10px", borderRadius: 999 }}>{met ? "✓" : "✗"} {conceptName(pid)}</span>;
                    })}
                  </div>
                </div>
              )}
              {side.code && (
                <div style={{ marginTop: 12 }}>
                  <span style={S.mono(9.5, T.explore)}>CODE WALKTHROUGH — the scenarios reference this:</span>
                  <pre style={{ ...S.pre, marginTop: 6 }}>{side.code}</pre>
                  {side.codeNote && <p style={{ fontSize: 12, color: T.inkSoft, margin: "6px 0 0", lineHeight: 1.5 }}>{side.codeNote}</p>}
                </div>
              )}
              <button onClick={continueBattle} style={{ ...S.btn(T.explore), width: "100%", marginTop: 14 }}>⚔️ Accept the duel</button>
            </div>
          )}

          {battle.phase === "question" && battle.kind !== "side" && (
            <div style={{ ...S.card, marginTop: 12, animation: "slideUp .3s ease" }}>
              <button onClick={() => setBattle({ ...battle, showLore: !battle.showLore })} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={S.mono(10, kindColor)}>{battle.showLore ? "⌄" : "›"} {battle.kind === "critical" ? "LORE — READ TO ARM YOURSELF" : "GYM RECAP — EVERYTHING THIS REGION TAUGHT"}</span>
                <span style={S.mono(9, T.inkSoft)}>{battle.showLore ? "collapse" : "expand"}</span>
              </button>
              {battle.showLore && (battle.kind === "critical" ? (
                <>
                  <RichText text={battle.concept.lore} style={{ fontSize: 14, lineHeight: 1.65, marginTop: 8 }} />
                  {deepLore[battle.concept.id]
                    ? <div style={{ fontSize: 13.5, lineHeight: 1.65, margin: "10px 0 0", padding: "10px 12px", background: T.exploreSoft, borderRadius: 10 }}><RichText text={`🔍 ${deepLore[battle.concept.id]}`} /></div>
                    : <button onClick={() => deepenLore(battle.concept)} disabled={busy === "lore"} style={{ ...S.btn(T.card, T.explore), border: `1.5px solid ${T.explore}`, width: "100%", marginTop: 10, fontSize: 13 }}>{busy === "lore" ? "Asking the sage…" : "🔍 Deepen this lore (intuition + worked example)"}</button>}
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55, margin: "8px 0 0" }}>{battle.log} The gym tests every concept below — review before answering. You can retreat and replay any encounter.</p>
                  <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 10, paddingRight: 4 }}>
                    {region.concepts.map((c) => (
                      <div key={c.id} style={{ marginBottom: 10, padding: "10px 12px", background: T.paper, borderRadius: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 13.5 }}>{c.sprite} {c.name}</div>
                        <RichText text={c.lore} style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 4 }} />
                      </div>
                    ))}
                  </div>
                </>
              ))}
            </div>
          )}

          {battle.phase === "question" && q && (
            <div style={{ ...S.card, marginTop: 12, animation: "slideUp .3s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <span style={S.mono(10, kindColor)}>{battle.kind === "side" ? "APPLIED SCENARIO" : "CHOOSE YOUR MOVE"} · wrong = −{battle.kind === "gym" ? 22 : 16} HP</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => addDexQuestion(q)} style={{ ...S.chip(false), padding: "4px 10px", fontSize: 11 }}>＋ dex</button>
                  <button onClick={() => setBattle({ ...battle, showNotes: !battle.showNotes })} style={{ ...S.chip(battle.showNotes), padding: "4px 10px", fontSize: 11 }}>📜 notes</button>
                  {side && side.code && <button onClick={() => setBattle({ ...battle, showCode: !battle.showCode })} style={{ ...S.chip(battle.showCode), padding: "4px 10px", fontSize: 11 }}>{"</>"}</button>}
                </span>
              </div>
              {battle.showNotes && (
                <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8, padding: "10px 12px", background: T.paper, borderRadius: 10 }}>
                  {battleNotes().map((c) => {
                    const n = conceptNote(c, deepLore[c.id]);
                    return <div key={c.id} style={{ marginBottom: 10, borderBottom: `1px solid ${T.line}`, paddingBottom: 8 }}>
                      <b style={{ fontSize: 12.5 }}>{c.sprite} {c.name}</b>
                      <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: "4px 0 0" }}>{n.mechanism}</p>
                      <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: "4px 0 0", color: T.inkSoft }}><b>Use it:</b> {n.consequence}</p>
                      <p style={{ fontSize: 12, lineHeight: 1.5, margin: "4px 0 0", color: T.explore }}>{n.checkpoint}</p>
                      {n.deep && <p style={{ fontSize: 12, lineHeight: 1.5, margin: "4px 0 0", color: T.inkSoft }}>🔍 {n.deep}</p>}
                    </div>;
                  })}
                  <span style={S.mono(9)}>notes are compact decision aids: mechanism → consequence → answer check</span>
                </div>
              )}
              {side && side.code && battle.showCode && <pre style={{ ...S.pre, marginTop: 8, maxHeight: 180, overflowY: "auto" }}>{side.code}</pre>}
              <RichText text={q.q} style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.55, margin: "8px 0 12px" }} />
              {battle.ord.map((optIdx, i) => (
                <button key={i} onClick={() => answerBattle(i)} style={S.qbtn}>
                  <span style={S.mono(10, T.explore)}>{String.fromCharCode(65 + i)}</span>&nbsp;&nbsp;{q.options[optIdx]}
                </button>
              ))}
            </div>
          )}

          {["feedback", "victory", "defeat"].includes(battle.phase) && (
            <div style={{ ...S.card, background: battle.phase === "victory" ? T.rewardSoft : battle.wrong || battle.phase === "defeat" ? T.penaltySoft : T.rewardSoft, border: `1px solid ${battle.phase === "victory" ? withAlpha(darkMode ? "#3DDC97" : "#149E6E", 0.4) : battle.wrong || battle.phase === "defeat" ? withAlpha("#FF7A76", 0.4) : withAlpha(darkMode ? "#3DDC97" : "#149E6E", 0.4)}`, marginTop: 12, animation: "slideUp .3s ease" }}>
              <span style={S.mono(10, battle.phase === "victory" ? T.reward : battle.wrong || battle.phase === "defeat" ? T.penalty : T.reward)}>
                {battle.phase === "victory" ? (battle.kind === "critical" ? "CONCEPT CAPTURED!" : battle.kind === "side" ? "KNOWLEDGE REINFORCED!" : "BADGE EARNED!") : battle.phase === "defeat" ? "YOU BLACKED OUT" : battle.wrong ? "COUNTERATTACK!" : "DIRECT HIT!"}
              </span>
              <RichText text={battle.log} style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8 }} />
              <button onClick={continueBattle} style={{ ...S.btn(battle.phase === "victory" ? T.reward : S.inkBtn), width: "100%", marginTop: 12 }}>
                {battle.phase === "victory" ? "Return to the board →" : battle.phase === "defeat" ? "Wake up at entrance" : battle.wrong ? "Face the question again (reshuffled)" : "Next question →"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ============ REGION BOARD ============ */
  if (screen === "region" && region && board) {
    const criticalsDone = region.concepts.filter((c) => capturedSet.has(c.id)).length;
    const gymUnlocked = criticalsDone === region.concepts.length;
    const at = board.nodes.find((n) => n.id === atNode) || board.nodes[0];
    return (
      <div style={S.app}>{chrome}<HUD back={() => setScreen("regionlist")} />
        <div style={{ ...S.wrap, paddingTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{region.emoji} {region.name}</div>
            <span style={S.mono(10, gymUnlocked ? T.reward : T.inkSoft)}>{criticalsDone}/{region.concepts.length} criticals{gymUnlocked ? " · GYM OPEN" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 12, margin: "4px 0 8px", flexWrap: "wrap" }}>
            <span style={S.mono(9.5, T.action)}>⬡ CRITICAL = new concept</span>
            <span style={S.mono(9.5, T.explore)}>◇ SIDE = retention duel (heals)</span>
            <span style={S.mono(9.5, T.gold)}>🏛 GYM = badge</span>
          </div>
          <TeachingPanel target={world} region={region} compact />
          <SenzuPanel compact />
          <div style={{ position: "relative", width: "100%", maxWidth: 900, margin: "12px auto 0", aspectRatio: "16/10", background: "radial-gradient(130% 110% at 50% -14%, #9FDCAE 0%, #5CBB88 40%, #35997A 74%, #237664 100%)", borderRadius: 26, border: "1px solid rgba(16,64,52,0.35)", overflow: "hidden", boxShadow: "0 24px 60px rgba(8,34,28,0.35), inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -30px 60px rgba(12,50,42,0.35)" }}>
            <div style={{ position: "absolute", inset: 0, opacity: 0.4, fontSize: 26, pointerEvents: "none" }}>
              <span style={{ position: "absolute", left: "4%", top: "8%" }}>🌲</span>
              <span style={{ position: "absolute", left: "88%", top: "12%" }}>🌲</span>
              <span style={{ position: "absolute", left: "14%", top: "78%" }}>🌳</span>
              <span style={{ position: "absolute", left: "78%", top: "82%" }}>🌳</span>
              <span style={{ position: "absolute", left: "46%", top: "6%" }}>⛰️</span>
              <span style={{ position: "absolute", left: "60%", top: "88%" }}>🌼</span>
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              {board.edges.map(([a, b], i) => {
                const na = board.nodes.find((n) => n.id === a), nb = board.nodes.find((n) => n.id === b);
                const open = nodeCleared(a) || nodeCleared(b);
                return <path key={i} d={`M ${na.x} ${na.y} Q ${(na.x + nb.x) / 2} ${(na.y + nb.y) / 2 - 6} ${nb.x} ${nb.y}`} stroke={open ? "#2F6E45" : "rgba(47,110,69,0.35)"} strokeDasharray={open ? "none" : "2.5 2.5"} fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" style={{ strokeWidth: open ? 3 : 2 }} />;
              })}
            </svg>
            {board.nodes.map((n) => {
              const cleared = nodeCleared(n.id);
              const reachable = nodeReachable(n.id) || cleared || n.id === "start";
              const isCrit = n.id.startsWith("c:"), isSide = n.id.startsWith("s:"), isGym = n.id === "gym";
              const sprite = n.id === "start" ? "🧙" : isGym ? (cleared ? "🎖" : "🏛") : isCrit ? (region.concepts.find((c) => c.id === n.id.slice(2)) || {}).sprite : (region.sides.find((s) => s.id === n.id.slice(2)) || {}).sprite;
              const ring = isGym ? T.gold : isCrit ? T.action : isSide ? T.explore : T.ink;
              return (
                <button key={n.id} onClick={() => tapNode(n.id)} aria-label={n.id} style={{
                  position: "absolute", left: `${n.x}%`, top: `${n.y}%`, transform: "translate(-50%,-50%)",
                  width: 46, height: 46, borderRadius: isSide ? 12 : "50%",
                  background: cleared ? "rgba(255,255,255,0.96)" : reachable ? "#FFFDF4" : "rgba(255,255,255,0.45)",
                  border: `3px solid ${reachable || cleared ? ring : "rgba(27,36,64,0.25)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, cursor: "pointer",
                  boxShadow: reachable && !cleared ? `0 0 0 5px ${ring}33, 0 3px 10px rgba(0,0,0,0.25)` : "0 2px 6px rgba(0,0,0,0.18)",
                  animation: reachable && !cleared ? "pulse 1.8s ease-in-out infinite" : "none",
                  filter: reachable || cleared ? "none" : "grayscale(0.8)", padding: 0,
                }}>
                  {sprite}
                  {cleared && <span style={{ position: "absolute", right: -5, top: -5, background: T.reward, color: "#fff", borderRadius: "50%", width: 17, height: 17, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>✓</span>}
                </button>
              );
            })}
            <div style={{ position: "absolute", left: `${at.x}%`, top: `${at.y}%`, fontSize: 22, transition: "left .5s ease, top .5s ease", pointerEvents: "none", animation: "tokenBob 1.6s ease-in-out infinite", textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>🧢</div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
            <button onClick={() => startGauntlet()} style={{ ...S.btn(T.gold), padding: "6px 12px", fontSize: 12 }}>⚔️ Trial Gauntlet</button>
            <button onClick={() => setScreen("coach")} style={{ ...S.btn(T.explore), padding: "6px 12px", fontSize: 12 }}>🧪 Coach</button>
          </div>
          {(world.links || []).length > 0 && <Collapsible id={`sources-${world.id}-${region.id}`} title="SOURCES / STUDY HALL" color={T.explore} style={{ marginTop: 10, padding: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(world.links || []).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ ...S.chip(false), textDecoration: "none", fontSize: 11.5, padding: "5px 10px" }}>🔗 {l.label}</a>)}
            </div>
          </Collapsible>}

          <div style={{ ...S.grid(340), marginTop: 14 }}>
            {region.concepts.map((c) => (
              <div key={c.id} onClick={() => tapNode("c:" + c.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 14, background: capturedSet.has(c.id) ? T.rewardSoft : T.card, border: `1px solid ${capturedSet.has(c.id) ? withAlpha(darkMode ? "#3DDC97" : "#149E6E", 0.35) : T.line}`, cursor: "pointer", backdropFilter: "blur(10px)" }}>
                <span style={{ fontSize: 18 }}>{c.sprite}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>{c.name}</span>
                <span style={S.mono(9, capturedSet.has(c.id) ? T.reward : T.action)}>{capturedSet.has(c.id) ? "CAPTURED · re-read lore" : `CRITICAL · ${c.questions.length}Q`}</span>
              </div>
            ))}
            {(region.sides || []).map((s) => {
              const met = (s.prereqs || []).every((p) => capturedSet.has(p));
              return (
                <div key={s.id} onClick={() => tapNode("s:" + s.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 14, background: sidesSet.has(s.id) ? T.exploreSoft : T.card, border: `1px dashed ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.55)}`, cursor: "pointer", backdropFilter: "blur(10px)" }}>
                  <span style={{ fontSize: 18 }}>{s.sprite}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</span>
                    <div style={{ fontSize: 11, color: T.inkSoft }}>
                      REC LV.{s.recLevel || 1} · prereqs {met ? "✓" : `${(s.prereqs || []).filter((p) => capturedSet.has(p)).length}/${(s.prereqs || []).length}`}{s.code ? " · </> code" : ""}
                    </div>
                  </div>
                  <span style={S.mono(9, T.explore)}>{sidesSet.has(s.id) ? "REPLAY" : "SIDE"}</span>
                </div>
              );
            })}
          </div>
        </div>
        {dialog && (
          <div onClick={() => setDialog(null)} style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, padding: 12 }}>
            <div style={{ maxWidth: 720, margin: "0 auto", background: darkMode ? "rgba(19,26,54,0.94)" : "rgba(255,255,255,0.96)", border: `1px solid ${withAlpha(darkMode ? "#8D9BFF" : "#5B5BD6", 0.4)}`, borderRadius: 18, padding: "16px 18px", animation: "slideUp .25s ease", backdropFilter: "blur(16px)", boxShadow: "0 -8px 40px rgba(2,4,12,0.45)" }}>
              <span style={S.mono(10.5, T.explore)}>{dialog.name.toUpperCase()}</span>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: "6px 0 8px" }}>{dialog.text}</p>
              <span style={S.mono(9.5)}>tap to close ▾</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Space+Grotesk:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600;800&display=swap');
@keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes tokenBob { 0%,100% { transform: translate(-50%,-130%) translateY(0); } 50% { transform: translate(-50%,-130%) translateY(-5px); } }
@keyframes hit { 0%,100% { transform: translateX(0); filter: none; } 30% { transform: translateX(-7px); filter: brightness(1.6); } 60% { transform: translateX(7px); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.08); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeScale { from { opacity: 0; transform: scale(.975) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes floatY { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-14px) rotate(2deg); } }
@keyframes auroraDrift { 0% { transform: translate3d(-2.5%, -1.5%, 0) scale(1); } 100% { transform: translate3d(2.5%, 2%, 0) scale(1.06); } }
@keyframes glowPulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.12); } }
@keyframes starTwinkle { 0%,100% { opacity: .85; } 50% { opacity: .4; } }
html { scrollbar-color: rgba(140,158,220,.35) transparent; }
body { margin: 0; }
::selection { background: rgba(141,155,255,.35); }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(140,158,220,.28); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: rgba(140,158,220,.45); border: 2px solid transparent; background-clip: content-box; }
button { transition: filter .18s ease, box-shadow .25s ease, background .2s ease, border-color .2s ease, color .2s ease, opacity .2s ease; }
button:hover:not(:disabled) { filter: brightness(1.09) saturate(1.05); }
button:active:not(:disabled) { filter: brightness(.96); }
button:disabled { opacity: .6; cursor: default; }
a { transition: color .2s ease, filter .2s ease; }
a:hover { filter: brightness(1.15); }
input, textarea { transition: border-color .2s ease, box-shadow .25s ease; }
input:focus, textarea:focus { border-color: rgba(141,155,255,.65) !important; box-shadow: 0 0 0 3px rgba(141,155,255,.18); }
.worldCard { transition: transform .22s cubic-bezier(.3,.7,.3,1), box-shadow .25s ease, border-color .25s ease; }
.rt ul, .rt ol { margin: .55em 0 0; }
@media (max-width: 640px) {
  .hudPet { display: none !important; }
  .hideSm { display: none !important; }
}
@media (max-width: 500px) {
  .dexLabel { display: none; }
}
.worldCard:hover { transform: translateY(-3px); box-shadow: 0 22px 55px rgba(2,4,12,.4); border-color: rgba(141,155,255,.45); }
button:focus-visible, [tabindex]:focus-visible { outline: 2px solid #8D9BFF; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
