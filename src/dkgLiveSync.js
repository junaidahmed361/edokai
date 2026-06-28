import { createClient } from "@supabase/supabase-js";

const viteEnv = import.meta.env || {};

export const SUPABASE_URL = viteEnv.VITE_SUPABASE_URL || "https://lfnpcgcxezyjcgnpcagq.supabase.co";
export const SUPABASE_ANON_KEY = viteEnv.VITE_SUPABASE_ANON_KEY || "";
export const DKG_TABLE = viteEnv.VITE_EDOKAI_DKG_TABLE || "edokai_dkg_snapshots";
export const DKG_ROW_ID = viteEnv.VITE_EDOKAI_DKG_ROW_ID || "latest";

let client = null;

export function getDkgClient() {
  if (!SUPABASE_ANON_KEY) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

export function dkgSyncConfigStatus() {
  return {
    configured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    url: SUPABASE_URL,
    table: DKG_TABLE,
    rowId: DKG_ROW_ID,
  };
}

export async function loadDkgSnapshot() {
  const supabase = getDkgClient();
  if (!supabase) {
    return { ok: false, disabled: true, message: "Set VITE_SUPABASE_ANON_KEY to enable live DKG sync." };
  }
  const { data, error } = await supabase
    .from(DKG_TABLE)
    .select("id,payload,updated_at")
    .eq("id", DKG_ROW_ID)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, empty: true, payload: null, updatedAt: null };
  return { ok: true, payload: data.payload, updatedAt: data.updated_at };
}

export function subscribeDkgSnapshot(onSnapshot, onStatus = () => {}) {
  const supabase = getDkgClient();
  if (!supabase) {
    onStatus({ ok: false, disabled: true, message: "Supabase anon key missing." });
    return () => {};
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

const slug = (value) => String(value || "concept").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "concept";

const defaultQuestion = (label) => ({
  q: `What should you remember about ${label}?`,
  options: ["source-grounded mechanism", "random memorized token", "unrelated UI detail", "unsupported claim"],
  a: 0,
  why: "Edokai imports DKG concepts only when they have source-grounded provenance.",
});

function normalizeConcept(raw, sourceIds = []) {
  const label = raw.name || raw.label || raw.title || raw.id || "Imported Concept";
  return {
    id: slug(raw.id || label),
    name: label,
    sprite: raw.sprite || "🧠",
    lore: raw.lore || raw.summary || raw.description || `Imported from the live Edokai DKG.${sourceIds.length ? ` Sources: ${sourceIds.join(", ")}.` : ""}`,
    questions: Array.isArray(raw.questions) && raw.questions.length ? raw.questions : [defaultQuestion(label)],
  };
}

function normalizeRegion(raw, idx, fallbackConcepts = []) {
  const name = raw.name || raw.label || raw.title || `Imported Region ${idx + 1}`;
  const concepts = Array.isArray(raw.concepts) && raw.concepts.length
    ? raw.concepts.map((c) => normalizeConcept(c))
    : fallbackConcepts;
  if (!concepts.length) return null;
  return {
    id: slug(raw.id || name),
    name,
    emoji: raw.emoji || "🛰️",
    intro: raw.intro || raw.description || "A live DKG region synced from Supabase.",
    npc: raw.npc || { name: "Graph Curator", text: raw.description || "These concepts came from the live Edokai dynamic knowledge graph." },
    concepts,
    sides: Array.isArray(raw.sides) ? raw.sides : [],
    gym: raw.gym || {
      leader: "Graph Curator",
      badge: `${name} Badge`,
      sprite: "🏛️",
      taunt: "Show that you understand the source-grounded mechanism.",
      questions: concepts.slice(0, 3).map((c) => defaultQuestion(c.name)),
    },
  };
}

export function snapshotToEdokaiWorlds(payload) {
  if (!payload) return [];
  const dkg = payload.dkg || payload.edokai_dkg || payload.graph || {};
  const index = payload.conceptWorldIndex || payload.concept_world_index || payload.worlds || {};
  const macroWorlds = index.macro_worlds || index.macroWorlds || {};
  const nodes = Object.values(dkg.nodes || {});

  return Object.entries(macroWorlds).flatMap(([worldId, world]) => {
    const hintedNodes = nodes
      .filter((node) => (node.world_hint || node.worldHint || node.macro_world || node.macroWorld) === worldId)
      .slice(0, 12)
      .map((node) => normalizeConcept(node, node.source_ids || node.sourceIds || []));
    const regions = Array.isArray(world.regions)
      ? world.regions.map((region, idx) => normalizeRegion(region, idx)).filter(Boolean)
      : [];
    if (!regions.length && hintedNodes.length) {
      regions.push(normalizeRegion({ id: `${worldId}-live`, name: "Live DKG Concepts", emoji: "🛰️", description: world.description }, 0, hintedNodes));
    }
    if (!regions.length) return [];
    return [{
      id: `dkg-${slug(worldId)}`,
      title: world.label || world.title || worldId,
      emoji: world.emoji || "🧬",
      summary: world.description || "Live concept world synced from the Edokai DKG.",
      mission: world.mission || `Master ${world.label || worldId} through source-grounded DKG concepts.`,
      links: Array.isArray(world.links) ? world.links : [],
      regions,
    }];
  });
}
