import fs from "node:fs/promises";
import { snapshotToEdokaiWorlds, mergeDkgWorlds } from "../src/dkgLiveSync.js";

const dkg = JSON.parse(await fs.readFile(new URL("../knowledge/edokai-dkg.json", import.meta.url)));
const conceptWorldIndex = JSON.parse(await fs.readFile(new URL("../knowledge/concept-world-index.json", import.meta.url)));

const payload = { dkg, conceptWorldIndex, synced_at: new Date().toISOString() };
const live = snapshotToEdokaiWorlds(payload);

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures += 1; console.error("FAIL:", msg); } else console.log("ok:", msg); };

ok(live.length > 0, `produced ${live.length} live worlds from non-empty umbrellas`);

for (const w of live) {
  ok(w.title && w.id && Array.isArray(w.regions), `world ${w.title} has shape`);
  ok(w.regions.length > 0, `world ${w.title} has ${w.regions.length} regions`);
  for (const r of w.regions) {
    ok(Array.isArray(r.concepts) && r.concepts.length > 0, `region ${w.title}/${r.name} has ${(r.concepts||[]).length} concepts`);
    for (const c of r.concepts) {
      ok(c.id && c.name && c.lore && Array.isArray(c.questions) && c.questions.length > 0, `concept ${c.name} fully formed`);
      for (const q of c.questions) {
        ok(Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.a) && q.a >= 0 && q.a < q.options.length, `question answer index valid in ${c.name}`);
      }
    }
    ok(r.gym && Array.isArray(r.gym.questions), `region ${r.name} has gym`);
  }
}

// Verify enhancement: a builtin "Generative Models" world must GAIN regions, not duplicate.
const builtin = [
  { id: "w-rl", title: "Agents", emoji: "🤖", regions: [{ id: "fields", name: "Foundation Fields", concepts: [] }] },
  { id: "w-gen", title: "Generative Models", emoji: "🌫️", regions: [{ id: "kl-region", name: "KL", concepts: [] }] },
  { id: "w-sys", title: "LLM Systems & Serving", emoji: "⚙️", regions: [{ id: "infer", name: "Inference", concepts: [] }] },
  { id: "w-tf", title: "Transformer Architecture", emoji: "🏛️", regions: [{ id: "attn", name: "Attention", concepts: [] }] },
];
const merged = mergeDkgWorlds(builtin, live);

ok(merged.length === builtin.length || merged.length === builtin.length + live.filter(l => !builtin.some(b => b.title.toLowerCase() === l.title.toLowerCase())).length, "no unexpected world count");

const genTitles = merged.filter((w) => w.title === "Generative Models");
ok(genTitles.length === 1, `Generative Models NOT duplicated (count=${genTitles.length})`);
const gen = genTitles[0];
ok(gen.regions.length > 1, `Generative Models enhanced: ${gen.regions.length} regions (was 1)`);
ok(gen.regions.some((r) => r.id === "kl-region"), "original builtin region preserved");
ok(gen.regions.some((r) => r.id.startsWith("dkg-")), "new DKG region appended to existing world");

// idempotency: merging again should not duplicate regions
const merged2 = mergeDkgWorlds(merged, live);
const gen2 = merged2.find((w) => w.title === "Generative Models");
ok(gen2.regions.length === gen.regions.length, `idempotent re-merge (${gen2.regions.length} == ${gen.regions.length})`);

console.log("\nSummary:", failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
console.log("Live worlds:", live.map((w) => `${w.title} (${w.regions.length} regions, ${w.regions.reduce((n,r)=>n+r.concepts.length,0)} concepts)`).join("; "));
process.exit(failures === 0 ? 0 : 1);
