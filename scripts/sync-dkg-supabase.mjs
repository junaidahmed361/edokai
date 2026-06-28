#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

async function loadEnvFile(file) {
  try {
    const text = await fs.readFile(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = line.indexOf("=");
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Optional env file.
  }
}

const repo = process.env.EDOKAI_DIR || process.cwd();
await loadEnvFile(path.join(repo, ".env"));
await loadEnvFile(path.join(os.homedir(), ".hermes", ".env"));

const supabaseUrl = (process.env.EDOKAI_SUPABASE_URL || process.env.SUPABASE_URL || "https://lfnpcgcxezyjcgnpcagq.supabase.co").replace(/\/$/, "");
const serviceRoleKey = process.env.EDOKAI_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const table = process.env.EDOKAI_DKG_TABLE || "edokai_dkg_snapshots";
const rowId = process.env.EDOKAI_DKG_ROW_ID || "latest";

if (!serviceRoleKey) {
  console.error("Missing EDOKAI_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY. Refusing to sync.");
  process.exit(2);
}

async function readJson(rel) {
  const file = path.join(repo, rel);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

const [dkg, conceptWorldIndex] = await Promise.all([
  readJson("knowledge/edokai-dkg.json"),
  readJson("knowledge/concept-world-index.json"),
]);

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

const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    apikey: serviceRoleKey,
    authorization: ["Bearer", serviceRoleKey].join(" "),
    prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify([{ id: rowId, payload, source: "hermes", updated_at: payload.synced_at }]),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Supabase DKG sync failed: HTTP ${res.status}`);
  console.error(text);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, table, rowId, ...payload.stats, synced_at: payload.synced_at }, null, 2));
