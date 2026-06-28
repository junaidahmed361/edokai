import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

for (const f of [path.join(process.cwd(), ".env"), path.join(os.homedir(), ".hermes", ".env")]) {
  try {
    for (const line of (await fs.readFile(f, "utf8")).split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i < 1 || line.trim().startsWith("#")) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {}
}

const url = (process.env.EDOKAI_SUPABASE_URL || "https://lfnpcgcxezyjcgnpcagq.supabase.co").replace(/\/$/, "");
const key = process.env.EDOKAI_SUPABASE_SERVICE_ROLE_KEY;
const res = await fetch(`${url}/rest/v1/edokai_dkg_snapshots?id=eq.latest&select=payload,updated_at`, {
  headers: { apikey: key, authorization: `Bearer ${key}` },
});
const rows = await res.json();
const payload = rows[0].payload;
const { snapshotToEdokaiWorlds } = await import("../src/dkgLiveSync.js");
const live = snapshotToEdokaiWorlds(payload);
console.log("Round-trip from Supabase row updated_at:", rows[0].updated_at);
console.log("Live worlds rendered:", live.map((w) => `${w.title} [${w.regions.length} regions / ${w.regions.reduce((n, r) => n + r.concepts.length, 0)} concepts]`).join("; "));
console.log("Total concepts surfaced:", live.reduce((n, w) => n + w.regions.reduce((m, r) => m + r.concepts.length, 0), 0));
