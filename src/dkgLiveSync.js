import { createClient } from "@supabase/supabase-js";

const viteEnv = import.meta.env || {};

export const SUPABASE_URL = viteEnv.VITE_SUPABASE_URL || "https://lfnpcgcxezyjcgnpcagq.supabase.co";
export const SUPABASE_ANON_KEY = viteEnv.VITE_SUPABASE_ANON_KEY || "";
export const DKG_TABLE = viteEnv.VITE_EDOKAI_DKG_TABLE || "edokai_dkg_snapshots";
export const DKG_ROW_ID = viteEnv.VITE_EDOKAI_DKG_ROW_ID || "latest";
export const DKG_NETLIFY_FUNCTION = viteEnv.VITE_EDOKAI_DKG_FUNCTION || "/.netlify/functions/dkg-snapshot";
export const DKG_GITHUB_OWNER = viteEnv.VITE_EDOKAI_DKG_GITHUB_OWNER || "junaidahmed361";
export const DKG_GITHUB_REPO = viteEnv.VITE_EDOKAI_DKG_GITHUB_REPO || "edokai";
export const DKG_GITHUB_REF = viteEnv.VITE_EDOKAI_DKG_GITHUB_REF || "fix-lore-model-fallback";
export const DKG_GITHUB_RAW_BASE = (viteEnv.VITE_EDOKAI_DKG_GITHUB_RAW_BASE || `https://raw.githubusercontent.com/${DKG_GITHUB_OWNER}/${DKG_GITHUB_REPO}/${DKG_GITHUB_REF}/knowledge`).replace(/\/$/, "");

let client = null;

export function getDkgClient() {
  if (!SUPABASE_ANON_KEY) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

export function dkgSyncConfigStatus() {
  const hasBrowserSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  return {
    configured: hasBrowserSupabase || Boolean(DKG_NETLIFY_FUNCTION) || Boolean(DKG_GITHUB_RAW_BASE),
    browserSupabaseConfigured: hasBrowserSupabase,
    url: SUPABASE_URL,
    table: DKG_TABLE,
    rowId: DKG_ROW_ID,
    netlifyFunction: DKG_NETLIFY_FUNCTION,
    githubRawBase: DKG_GITHUB_RAW_BASE,
    githubRef: DKG_GITHUB_REF,
  };
}

async function loadSupabaseDkgSnapshot() {
  const supabase = getDkgClient();
  if (!supabase) return { ok: false, disabled: true, source: "supabase-browser", message: "Browser Supabase anon key not configured." };
  const { data, error } = await supabase
    .from(DKG_TABLE)
    .select("id,payload,updated_at")
    .eq("id", DKG_ROW_ID)
    .maybeSingle();
  if (error) return { ok: false, source: "supabase-browser", error: error.message };
  if (!data) return { ok: true, empty: true, payload: null, updatedAt: null, source: "supabase-browser" };
  return { ok: true, payload: data.payload, updatedAt: data.updated_at, source: "supabase-browser" };
}

async function loadNetlifyDkgSnapshot() {
  if (!DKG_NETLIFY_FUNCTION || typeof fetch !== "function") return { ok: false, disabled: true, source: "netlify-function", message: "No DKG function configured." };
  try {
    const res = await fetch(`${DKG_NETLIFY_FUNCTION}?row=${encodeURIComponent(DKG_ROW_ID)}&table=${encodeURIComponent(DKG_TABLE)}`, { headers: { accept: "application/json" } });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) return { ok: false, source: "netlify-function", error: (json && (json.error || json.message)) || `HTTP ${res.status}` };
    if (!json || !json.payload) return { ok: true, empty: true, payload: null, updatedAt: json?.updated_at || null, source: "netlify-function" };
    return { ok: true, payload: json.payload, updatedAt: json.updated_at || json.payload.synced_at || null, source: "netlify-function" };
  } catch (e) {
    return { ok: false, source: "netlify-function", error: e.message || String(e) };
  }
}

async function loadGithubDkgSnapshot() {
  if (!DKG_GITHUB_RAW_BASE || typeof fetch !== "function") return { ok: false, disabled: true, source: "github-raw", message: "No GitHub raw DKG base configured." };
  try {
    const [dkgRes, idxRes] = await Promise.all([
      fetch(`${DKG_GITHUB_RAW_BASE}/edokai-dkg.json`, { cache: "no-store", headers: { accept: "application/json" } }),
      fetch(`${DKG_GITHUB_RAW_BASE}/concept-world-index.json`, { cache: "no-store", headers: { accept: "application/json" } }),
    ]);
    if (!dkgRes.ok || !idxRes.ok) return { ok: false, source: "github-raw", error: `GitHub raw fetch failed: graph HTTP ${dkgRes.status}, index HTTP ${idxRes.status}` };
    const [dkg, conceptWorldIndex] = await Promise.all([dkgRes.json(), idxRes.json()]);
    const payload = {
      synced_at: new Date().toISOString(),
      dkg,
      conceptWorldIndex,
      stats: {
        source_count: Object.keys(dkg.sources || {}).length,
        node_count: Object.keys(dkg.nodes || {}).length,
        edge_count: Array.isArray(dkg.edges) ? dkg.edges.length : 0,
        macro_world_count: Object.keys(conceptWorldIndex.macro_worlds || {}).length,
      },
    };
    return { ok: true, payload, updatedAt: payload.synced_at, source: "github-raw" };
  } catch (e) {
    return { ok: false, source: "github-raw", error: e.message || String(e) };
  }
}

export async function loadDkgSnapshot({ force = false } = {}) {
  const attempts = [];
  const sources = force ? [loadSupabaseDkgSnapshot, loadNetlifyDkgSnapshot, loadGithubDkgSnapshot] : [loadSupabaseDkgSnapshot, loadNetlifyDkgSnapshot, loadGithubDkgSnapshot];
  for (const loader of sources) {
    const result = await loader();
    if (result.ok) return result;
    attempts.push(`${result.source || "source"}: ${result.error || result.message || "unavailable"}`);
  }
  return { ok: false, disabled: true, source: "all", message: `No live DKG source available. ${attempts.join(" | ")}` };
}

export function subscribeDkgSnapshot(onSnapshot, onStatus = () => {}) {
  const supabase = getDkgClient();
  if (!supabase) {
    let cancelledNoRealtime = false;
    const refreshWithoutRealtime = async () => {
      const result = await loadDkgSnapshot();
      if (cancelledNoRealtime) return;
      if (result.ok) onSnapshot(result);
      else onStatus(result);
    };
    refreshWithoutRealtime();
    const pollTimerNoRealtime = window.setInterval(refreshWithoutRealtime, 60000);
    onStatus({ ok: true, realtimeStatus: "polling-fallback" });
    return () => { cancelledNoRealtime = true; window.clearInterval(pollTimerNoRealtime); };
  }

  let cancelled = false;
  let pollTimer = null;
  let lastUpdatedAt = null;

  const refresh = async () => {
    const result = await loadDkgSnapshot();
    if (cancelled) return;
    if (result.ok && result.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = result.updatedAt;
      onSnapshot(result);
    }
    if (!result.ok) onStatus(result);
  };

  refresh();
  pollTimer = window.setInterval(refresh, 60000);

  const channel = supabase
    .channel("edokai-dkg-live-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: DKG_TABLE, filter: `id=eq.${DKG_ROW_ID}` },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        lastUpdatedAt = row.updated_at || new Date().toISOString();
        onSnapshot({ ok: true, payload: row.payload, updatedAt: row.updated_at, realtime: true });
      }
    )
    .subscribe((status) => onStatus({ ok: true, realtimeStatus: status }));

  return () => {
    cancelled = true;
    if (pollTimer) window.clearInterval(pollTimer);
    supabase.removeChannel(channel);
  };
}

/* ============================================================
   DKG snapshot -> Edokai world adapter

   The Hermes ingest loop writes:
   - knowledge/edokai-dkg.json      -> payload.dkg      { sources, nodes }
   - knowledge/concept-world-index.json -> payload.conceptWorldIndex { macro_worlds }

   macro_worlds[id] = {
     label, description, emoji?,
     regions: [{
       id, label, summary, source_ids[],
       concept_ids[],            // string refs into dkg.nodes
       critical_concepts[],      // subset of concept_ids
       prerequisite_links[],     // {from,to,why}
       side_retention_duels[],   // {id,prompt,left,right,answer}
       quiz_questions[],         // {question,choices,answer_index,source_ids}
     }]
   }

   The Edokai app expects each world:
   { id, title, emoji, blurb, links[], regions[] }
   and each region:
   { id, name, emoji, intro, npc{name,text},
     concepts[{ id, name, sprite, lore, questions[{q,options,a,why}] }],
     sides[{ id, name, sprite, anchor, recLevel, prereqs[], desc, questions[] }],
     gym{ leader, badge, sprite, taunt, questions[] } }
   ============================================================ */

const slug = (value) =>
  String(value || "concept")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "concept";

const truncate = (s, n = 96) => {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

const compactSentence = (s, fallback = "source-backed mechanism") => {
  const clean = String(s || fallback).replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  const first = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  return first.replace(/[.…]+$/g, "").trim() || fallback;
};
const titleCase = (s) => String(s || "").replace(/[-_]+/g, " ").replace(/\w/g, (m) => m.toUpperCase()).trim();
function friendlyName(raw, fallback = "Source Realm") {
  let text = String(raw || fallback).replace(/^https?:\/\//, "").replace(/^www\./, "");
  text = text.split(/[?#]/)[0].replace(/\/$/, "");
  const parts = text.split("/").filter(Boolean);
  text = parts.length > 1 ? parts.slice(-2).join(" ") : parts[0] || text;
  text = text.replace(/\.(com|org|net|ai|io|dev|edu)$/i, "").replace(/\.(pdf|html|md)$/i, "");
  return titleCase(text).replace(/Llm/g, "LLM").replace(/Rag/g, "RAG").replace(/Ai/g, "AI") || fallback;
}
function regionRelevanceRank(region) {
  const t = `${region.label || ""} ${region.summary || ""} ${(region.concept_ids || []).join(" ")}`.toLowerCase();
  const rules = [
    [/foundation|overview|full-stack|architecture|system|stack|harness|orchestrat/, 0],
    [/context|memory|tool|mcp|protocol|state|handoff/, 1],
    [/environment|benchmark|evaluation|supervision|safety|reliab/, 2],
    [/data|self-improvement|synthetic|continual|plasticity/, 3],
    [/world model|language world model|simulation|agentworld/, 4],
    [/serving|deployment|compression|distillation/, 5],
  ];
  for (const [re, rank] of rules) if (re.test(t)) return rank;
  return 9;
}

const optionWords = (o) => String(o || "").trim().split(/\s+/).filter(Boolean).length;
const optionWordList = (o) => String(o || "").trim().split(/\s+/).filter(Boolean);
const cleanRepeatedWords = (text) => String(text || "").replace(/\b([A-Za-z][A-Za-z0-9'-]*)\b(?:\s+\1\b)+/gi, "$1").replace(/\s+/g, " ").trim();
function compactOptionText(text) {
  // Options are NEVER truncated (CLAUDE.md rule 3): only cleaned.
  let out = String(text || "").replace(/\s+/g, " ").replace(/[.…]+$/g, "").trim();
  if (!out) out = "nearby but wrong mechanism";
  out = out[0].toUpperCase() + out.slice(1);
  return cleanRepeatedWords(out).replace(/[;:]+$/g, "");
}
const OPTION_TAILS = [
  "in this workflow", "for this scenario", "during this stage", "across these tasks",
  "in this system", "under these constraints", "for this pipeline", "at this step",
  "in day-to-day practice", "for the task at hand",
];
function balanceOptions(options, seed = "question") {
  const base = (options || []).slice(0, 4).map(compactOptionText);
  while (base.length < 4) base.push(compactOptionText(`nearby distractor ${base.length}`));
  // Dissolve length tells by EXPANDING short options with varied natural
  // tails (never by cutting long ones) until the spread is small.
  const seedN = Math.abs(hashCode(seed));
  const maxLen = Math.max(...base.map(optionWords));
  const used = new Set();
  return base.map((o, i) => {
    let out = o;
    let guard = 0;
    while (maxLen - optionWords(out) > 3 && guard < 3) {
      const tail = OPTION_TAILS[(seedN + i * 3 + guard * 7 + out.length) % OPTION_TAILS.length];
      if (!used.has(tail) && !out.toLowerCase().includes(tail)) { out = `${out} ${tail}`; used.add(tail); }
      guard += 1;
    }
    return cleanRepeatedWords(out);
  });
}

function normalizeOptions(options, answerIndex, seed = "question") {
  const raw = Array.isArray(options) ? options.map((o) => String(o || "").replace(/\s+/g, " ").trim()).filter(Boolean) : [];
  const a = Math.max(0, Math.min(Number.isInteger(answerIndex) ? answerIndex : 0, Math.max(raw.length - 1, 0)));
  const correct = raw[a] || "source-backed mechanism";
  const fallbacks = [
    "neighboring mechanism in the region",
    "unrelated implementation detail",
    "evaluation only surface signal",
    "low level runtime constraint",
  ];
  const unique = [correct, ...raw.filter((_, i) => i !== a), ...fallbacks]
    .map((o) => o.replace(/[.…]+$/g, ""))
    .filter((o, i, arr) => o && arr.indexOf(o) === i)
    .slice(0, 4);
  const balanced = balanceOptions(unique, seed);
  const idx = hashCode(seed) % 4;
  [balanced[0], balanced[idx]] = [balanced[idx], balanced[0]];
  return { options: balanced, a: idx };
}

// Small deterministic hash so the correct answer is not always option 0.
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i += 1) {
    h = (h * 31 + String(str).charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function nodeLabel(node, fallback = "Imported Concept") {
  return friendlyName(node.label || node.name || node.title || node.id || fallback, fallback);
}

// Convert an authored quiz_question (real answer_index) to the app's question shape.
function quizToQuestion(quiz) {
  if (!quiz || !Array.isArray(quiz.choices) || !quiz.choices.length) return null;
  const normalized = normalizeOptions(quiz.choices, Number.isInteger(quiz.answer_index) ? quiz.answer_index : 0, quiz.question || quiz.choices.join("|"));
  return {
    q: cleanRepeatedWords(quiz.question || "Which source-grounded fact matters most here?"),
    options: normalized.options,
    a: normalized.a,
    why: quiz.explanation || quiz.why || "Source-grounded from the ingested DKG entry.",
  };
}

// Synthesize an honest recall question for a node using sibling summaries as distractors.
function nodeRecallQuestion(node, siblingSummaries) {
  const label = nodeLabel(node);
  const correct = compactSentence(node.summary || node.description || node.lore || label);
  const distractors = siblingSummaries
    .filter((s) => s && s !== (node.summary || node.description || node.lore))
    .map((s) => compactSentence(s))
    .filter((s, i, arr) => s !== correct && arr.indexOf(s) === i);
  const normalized = normalizeOptions([correct, ...distractors], 0, node.id || label);
  return {
    q: cleanRepeatedWords(`Which source-backed mechanism advances mastery of "${label}"?`),
    options: normalized.options,
    a: normalized.a,
    why: compactSentence(node.summary || node.description || `Source-grounded summary for ${label}.`, `Source-grounded summary for ${label}`),
  };
}


function nodeToConcept(node, regionSlug, siblingSummaries, assignedQuiz, usedNames, regionName) {
  const baseLabel = nodeLabel(node);
  let label = baseLabel;
  let suffix = 2;
  while (usedNames.has(label.toLowerCase())) {
    label = regionName ? `${baseLabel} · ${regionName} ${suffix}` : `${baseLabel} · Facet ${suffix}`;
    suffix += 1;
  }
  usedNames.add(label.toLowerCase());
  const questions = [];
  if (assignedQuiz) questions.push(assignedQuiz);
  questions.push(nodeRecallQuestion(node, siblingSummaries));
  const sourceNote = Array.isArray(node.source_ids) && node.source_ids.length
    ? ` Sources: ${node.source_ids.join(", ")}.`
    : "";
  return {
    id: `${regionSlug}-${slug(node.id || label)}`,
    name: label,
    sprite: node.sprite || node.emoji || "🧠",
    lore: `In this Edokai region, ${label} is the encounter that turns source evidence into usable judgment: ${compactSentence(node.summary || node.description || node.lore || `Imported from the live Edokai DKG.`, "the source-backed mechanism")}. Capture it by explaining what problem it solves, how the mechanism moves information, and what evidence would show it worked.${sourceNote}`,
    questions,
  };
}


function duelToSide(duel, idx, regionSlug, conceptIds, fallbackQuestions) {
  const prompt = duel.prompt || duel.question || "Retention check";
  // Duels do not carry a reliable answer index, so present the contrast in the
  // side's description/lore and battle with the region's real quiz questions.
  const desc = [duel.left ? `A: ${duel.left}` : null, duel.right ? `B: ${duel.right}` : null]
    .filter(Boolean)
    .join("  •  ");
  return {
    id: `${regionSlug}-duel-${slug(duel.id || String(idx))}`,
    name: duel.name || `Recall Trial ${idx + 1}`,
    sprite: "⚔️",
    anchor: 1,
    recLevel: 2,
    prereqs: conceptIds.slice(0, 2),
    desc: `Healing retention duel: answer these side questions to recover HP while reinforcing the prerequisite path. ${prompt}${desc ? `  —  ${desc}` : ""}${duel.answer ? `  →  ${duel.answer}` : ""}`,
    questions: fallbackQuestions.length ? fallbackQuestions.slice(0, 2) : [],
  };
}

function buildRegion(region, idx, nodesById, worldLabel) {
  const regionSlug = `dkg-${slug(region.id || region.label || `region-${idx}`)}`;
  const plainName = friendlyName(region.label || region.name || region.title || `Imported Region ${idx + 1}`, `Imported Region ${idx + 1}`);
  const lore = regionLore(plainName);
  const name = (lore && lore.name) || plainName;

  // Resolve concept_ids -> DKG nodes (skip refs that have no matching node).
  const conceptIds = Array.isArray(region.concept_ids) ? region.concept_ids : [];
  const resolved = conceptIds
    .map((cid) => nodesById[cid] || nodesById[slug(cid)])
    .filter(Boolean);
  if (!resolved.length) return null;

  const siblingSummaries = resolved.map((n) => n.summary || n.description || nodeLabel(n));
  const realQuizzes = (Array.isArray(region.quiz_questions) ? region.quiz_questions : [])
    .map(quizToQuestion)
    .filter(Boolean);

  // Distribute real quizzes across concepts (first-come), the rest get synthesized recall Qs.
  const usedNames = new Set();
  const concepts = resolved.map((node, i) =>
    nodeToConcept(node, regionSlug, siblingSummaries, realQuizzes[i] || null, usedNames, name)
  );
  const conceptIdsResolved = concepts.map((c) => c.id);

  const sides = (Array.isArray(region.side_retention_duels) ? region.side_retention_duels : [])
    .map((duel, i) => duelToSide(duel, i, regionSlug, conceptIdsResolved, realQuizzes))
    .filter((s) => s.questions.length);

  const gymQuestions = (realQuizzes.length ? realQuizzes : concepts.flatMap((c) => c.questions)).slice(0, 4);

  return {
    id: regionSlug,
    name,
    emoji: region.emoji || "🛰️",
    arc: region.arc || (lore && lore.arc) || inferArc(plainName),
    intro: region.summary || region.description || `${plainName} — live DKG region synced into ${worldLabel}.`,
    npc: {
      name: "Graph Curator",
      text: region.summary || region.description || "These concepts came from the live Edokai dynamic knowledge graph.",
    },
    concepts,
    sides,
    gym: {
      leader: "Graph Curator",
      badge: `${name} Badge`,
      sprite: "🏛️",
      taunt: "Show that you understand the source-grounded mechanism.",
      questions: gymQuestions,
    },
  };
}

function linksFromSources(sources, sourceIds) {
  const out = [];
  const seen = new Set();
  for (const sid of sourceIds) {
    const src = sources[sid];
    if (!src || !src.url || seen.has(src.url)) continue;
    seen.add(src.url);
    out.push({ label: friendlyName(src.title || src.label || src.url || sid, "Source"), url: src.url });
    if (out.length >= 6) break;
  }
  return out;
}

/* Lore identities for live macro worlds (CLAUDE.md rule 1). Titles that match
   a builtin world's lore title merge into it via mergeDkgWorlds; "agents" is
   deliberately distinct from the RL-focused builtin frontier. */
const DKG_WORLD_LORE = {
  agents: { title: "The Agentworks", emoji: "\u{1F3D7}\uFE0F", domain: "Agent Systems & Production" },
  "transformer-architecture": { title: "The Attention Citadel" },
  "generative-models": { title: "The Dreaming Depths" },
  "perception-world-models": { title: "The Worldseer Observatory" },
  "llm-systems-serving": { title: "The Throughput Shogunate" },
  "retrieval-augmented-generation": { title: "The Retrieval Archives", emoji: "\u{1F5C4}\uFE0F", domain: "Retrieval-Augmented Generation" },
};

/* Lore case names for live regions (CLAUDE.md rule 1): the DKG hands us dry
   taxonomy labels ("Agent Systems Foundations"); each becomes an evocative
   case name while its arc consolidates related boards (every arc aims for
   2+ cases). The technical label stays visible via the region summary/intro.
   Ordered: first match wins, so keep specific patterns above generic ones. */
const DKG_REGION_LORE = [
  [/full.?stack/i, "The Stack Spire", "Foundations of Systems"],
  [/harness|context and tools/i, "The Harness Works", "Foundations of Systems"],
  [/systems? foundations/i, "The Bedrock Yards", "Foundations of Systems"],
  [/workflow adoption/i, "The Adoption Trailheads", "Foundations of Systems"],
  [/multi.?agent|protocols?.*supervision|supervision/i, "The Envoy Halls", "The Councils of Many"],
  [/safety|misalign/i, "The Inner Sentinels", "The Councils of Many"],
  [/reasoning scaffold|deliberation/i, "The Deliberation Chambers", "The Councils of Many"],
  [/world models?/i, "The Mirror Cartographers", "The Forge of Self-Improvement"],
  [/self.?improvement/i, "The Datasmith Forge", "The Forge of Self-Improvement"],
  [/continual|plasticity/i, "The Everlearn Gardens", "The Forge of Self-Improvement"],
  [/verification|reward design/i, "The Proving Grounds", "The Forge of Self-Improvement"],
  [/long.?horizon|agent scaling/i, "The Long Road Caravans", "The Forge of Self-Improvement"],
  [/token distribution|losses/i, "The Loss Ledgers", "The Deep Mechanics"],
  [/sparse attention|emergence/i, "The Sparse Constellations", "The Deep Mechanics"],
  [/depth.?aware|allocation/i, "The Depth Wardens", "The Deep Mechanics"],
  [/distillation serving|serving systems/i, "The Relay Kitchens", "The Way of Throughput"],
  [/teacher deployment|deployment constraints/i, "The Titan Docks", "The Way of Throughput"],
  [/evaluation efficiency|benchmark/i, "The Gauntlet Scales", "The Way of Throughput"],
  [/knowledge distillation|compression/i, "The Distiller's Cauldron", "The Craft of Distillation"],
  [/local students|specialized/i, "The Apprentice Ateliers", "The Craft of Distillation"],
  [/agent.?native memory|memory systems/i, "The Memory Holds", "The Craft of Memory"],
  [/sensemaking|global/i, "The Sensemaking Observatory", "The Craft of Retrieval"],
  [/index construction|community hierarchy/i, "The Index Masons", "The Craft of Retrieval"],
  [/agentic rag|rag and memory/i, "The Recall Envoys", "The Craft of Retrieval"],
];
const regionLore = (label) => {
  for (const [re, name, arc] of DKG_REGION_LORE) if (re.test(String(label || ""))) return { name, arc };
  return null;
};

/* Lore arc inference fallback for regions no rule names yet: group case
   boards into chaptered arcs in the style of the builtin worlds
   ("Foundations of…", "The Craft of…", "The Way of…"). Explicit region.arc
   always wins. */
const DKG_ARC_RULES = [
  [/world model|imagin|simulat/i, "The Way of Imagining"],
  [/safety|alignment|misalign|vigilan/i, "The Way of Vigilance"],
  [/protocol|supervision|multi-agent|coordinat|council/i, "The Councils of Many"],
  [/harness|context|tool/i, "The Craft of Harnesses"],
  [/verification|reward/i, "The Craft of Reward"],
  [/data|self-improvement|continual|plasticity/i, "The Forge of Self-Improvement"],
  [/scaling|long.?horizon|reasoning|deliberation|scaffold/i, "The Long Roads"],
  [/foundation|full.?stack/i, "Foundations of Systems"],
  [/distillation|compression|student|teacher/i, "The Craft of Distillation"],
  [/serving|deployment|throughput|latency/i, "The Way of Throughput"],
  [/memory|cache|benchmark|evaluation|efficiency/i, "The Craft of Memory"],
  [/retrieval|rag|graph|index|sensemaking/i, "The Craft of Retrieval"],
  [/token|loss|attention|emergence|sparse|depth|embedding/i, "The Deep Mechanics"],
];
const inferArc = (name) => {
  for (const [re, arc] of DKG_ARC_RULES) if (re.test(String(name || ""))) return arc;
  return "Uncharted Paths";
};

export function snapshotToEdokaiWorlds(payload) {
  if (!payload) return [];
  const dkg = payload.dkg || payload.edokai_dkg || payload.graph || {};
  const index = payload.conceptWorldIndex || payload.concept_world_index || payload.worlds || {};
  const macroWorlds = index.macro_worlds || index.macroWorlds || {};
  const nodesById = dkg.nodes || {};
  const sources = dkg.sources || {};

  return Object.entries(macroWorlds).flatMap(([worldId, world]) => {
    const rawRegions = (Array.isArray(world.regions) ? world.regions : [])
      .slice()
      .sort((a, b) => regionRelevanceRank(a) - regionRelevanceRank(b));
    const regions = rawRegions
      .map((region, idx) => buildRegion(region, idx, nodesById, friendlyName(world.label || worldId, worldId)))
      .filter(Boolean);
    if (!regions.length) return []; // empty umbrellas (e.g. seeded but unrouted) add nothing.

    const sourceIds = [...new Set(rawRegions.flatMap((r) => (Array.isArray(r.source_ids) ? r.source_ids : [])))];

    const lore = DKG_WORLD_LORE[worldId] || {};
    return [{
      id: `dkg-${slug(worldId)}`,
      macroId: worldId,
      title: lore.title || friendlyName(world.label || world.title || worldId, worldId),
      domain: lore.domain || friendlyName(world.label || world.title || worldId, worldId),
      emoji: lore.emoji || world.emoji || "🧬",
      blurb: world.description || "Live concept world synced from the Edokai DKG.",
      mission: world.mission || `Master ${friendlyName(world.label || worldId, worldId)} through source-grounded DKG concepts.`,
      links: linksFromSources(sources, sourceIds),
      regions,
    }];
  });
}

export function summarizeDkgSnapshot(payload) {
  if (!payload) return { recentSources: [], recentRuns: [] };
  const dkg = payload.dkg || payload.edokai_dkg || payload.graph || {};
  const sources = dkg.sources || {};
  const recentSources = Object.entries(sources)
    .map(([id, src]) => ({
      id,
      title: src.title || src.label || id,
      url: src.url || "",
      type: src.type || src.kind || "source",
      lastReadAt: src.last_read_at || src.lastReadAt || src.discovered_at || src.first_seen || null,
    }))
    .sort((a, b) => String(b.lastReadAt || "").localeCompare(String(a.lastReadAt || "")))
    .slice(0, 5);
  const recentRuns = (Array.isArray(dkg.run_history) ? dkg.run_history : [])
    .slice()
    .sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")))
    .slice(0, 3)
    .map((run) => ({
      id: run.run_id || run.id || "run",
      trigger: run.trigger || "ingest",
      completedAt: run.completed_at || null,
      nodesAdded: run.nodes_added || 0,
      nodesUpdated: run.nodes_updated || 0,
      edgesAdded: run.edges_added || 0,
      note: Array.isArray(run.notes) && run.notes.length ? run.notes[0] : "",
    }));
  return { recentSources, recentRuns };
}

/* ============================================================
   Merge live DKG worlds into the app's world list.
   - If a live world's title matches an existing world (builtin or stored),
     append its NEW regions to that world (enhance an existing concept world).
   - Otherwise add it as a brand-new concept world.
   Pure function over (existingWorlds, liveWorlds) -> mergedWorlds.
   ============================================================ */
const normTitle = (t) => String(t || "").trim().toLowerCase();

export function mergeDkgWorlds(existing, live) {
  if (!Array.isArray(live) || !live.length) return existing;
  const out = existing.map((w) => ({ ...w, regions: [...(w.regions || [])] }));
  const byTitle = new Map();
  out.forEach((w, i) => byTitle.set(normTitle(w.title), i));
  const extras = [];

  for (const lw of live) {
    const matchIdx = byTitle.has(normTitle(lw.title)) ? byTitle.get(normTitle(lw.title)) : -1;
    if (matchIdx >= 0) {
      const target = out[matchIdx];
      const haveRegionIds = new Set(target.regions.map((r) => r.id));
      const newRegions = (lw.regions || []).filter((r) => !haveRegionIds.has(r.id));
      if (newRegions.length) target.regions = [...target.regions, ...newRegions];
      const haveLinks = new Set((target.links || []).map((l) => l.url));
      const newLinks = (lw.links || []).filter((l) => l.url && !haveLinks.has(l.url));
      if (newLinks.length) target.links = [...(target.links || []), ...newLinks];
    } else {
      extras.push(lw);
    }
  }
  return [...out, ...extras];
}
