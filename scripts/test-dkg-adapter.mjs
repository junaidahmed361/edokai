import fs from "node:fs/promises";
import { snapshotToEdokaiWorlds, mergeDkgWorlds } from "../src/dkgLiveSync.js";

const dkg = JSON.parse(await fs.readFile(new URL("../knowledge/edokai-dkg.json", import.meta.url)));
const conceptWorldIndex = JSON.parse(await fs.readFile(new URL("../knowledge/concept-world-index.json", import.meta.url)));

const payload = { dkg, conceptWorldIndex, synced_at: new Date().toISOString() };
const live = snapshotToEdokaiWorlds(payload);

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures += 1; console.error("FAIL:", msg); } else console.log("ok:", msg); };
const META_QUESTION = /\b(?:in|from|according to) (?:the )?(?:source|paper|study)\b|learner-facing|edokai (?:learners|should preserve)|shared technical mechanism|what role does|role .{0,60} play|primarily contribute|belong on (?:the )?same|paper[- ]specific|paper[- ]title|source-grounded fact matters most/i;
const SOURCE_TITLES = Object.values(dkg.sources || {}).map((s) => String(s.title || "").trim()).filter((title) => title.length > 20);
const titleTrivia = (stem) => SOURCE_TITLES.some((title) => String(stem || "").toLowerCase().includes(title.toLowerCase()));
const checkQuestion = (q, placement) => {
  ok(Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.a) && q.a >= 0 && q.a < 4, `${placement} has four options and a valid answer`);
  ok(!META_QUESTION.test(q.q), `${placement} directly teaches or applies a mechanism`);
  ok(!titleTrivia(q.q), `${placement} does not quiz a paper title`);
};

ok(live.length > 0, `produced ${live.length} live worlds from non-empty umbrellas`);

for (const w of live) {
  ok(w.title && w.id && Array.isArray(w.regions), `world ${w.title} has shape`);
  ok(w.regions.length > 0, `world ${w.title} has ${w.regions.length} regions`);
  ok(w.regions.length <= 5, `world ${w.title} consolidated to ${w.regions.length} mechanism boards`);
  for (const r of w.regions) {
    ok(Array.isArray(r.concepts) && r.concepts.length > 0, `region ${w.title}/${r.name} has ${(r.concepts||[]).length} concepts`);
    for (const c of r.concepts) {
      ok(c.id && c.name && c.lore && Array.isArray(c.questions) && c.questions.length >= 2, `concept ${c.name} fully formed with direct technical checks`);
      for (const q of c.questions) {
        checkQuestion(q, `critical question in ${c.name}`);
        ok(!/Glob3R/i.test(q.q), `question tests 3D/SfM mechanics rather than the Glob3R title in ${c.name}`);
      }
    }
    ok(r.gym && Array.isArray(r.gym.questions), `region ${r.name} has gym`);
    for (const side of r.sides || []) for (const q of side.questions || []) checkQuestion(q, `side question in ${side.name}`);
    for (const q of r.gym.questions || []) checkQuestion(q, `gym question in ${r.name}`);
  }
}

const worldseer = live.find((w) => w.title === "The Worldseer Observatory");
const worldseerQuestions = (worldseer?.regions || []).flatMap((r) => [...r.concepts.flatMap((c) => c.questions || []), ...(r.sides || []).flatMap((s) => s.questions || []), ...(r.gym?.questions || [])]);
const glob3rSourceIds = new Set(Object.entries(dkg.sources || {}).filter(([, s]) => /Glob3R/i.test(String(s.title || ""))).map(([id]) => id));
const glob3rQuestions = worldseerQuestions.filter((q) => (q.sourceIds || []).some((id) => glob3rSourceIds.has(id)));
ok(glob3rSourceIds.size > 0 && glob3rQuestions.length > 0, "Glob3R evidence is positioned into authored Worldseer questions");
ok(glob3rQuestions.every((q) => !/Glob3R/i.test(q.q) && !META_QUESTION.test(q.q)), "Glob3R-linked questions test the mechanism, not paper positioning");
ok(glob3rQuestions.some((q) => /global|structure.from.motion|sfm|drift|consisten/i.test(`${q.q} ${q.why}`)), "Glob3R-linked questions teach global-consistency and SfM mechanics");
console.log("Glob3R acceptance examples:", glob3rQuestions.slice(0, 3).map((q) => q.q));

// Verify enhancement: a builtin world must GAIN regions, not duplicate.
// Live DKG worlds use lore titles from DKG_WORLD_LORE, so this smoke fixture
// must mirror the titles that mergeDkgWorlds actually sees in the app.
const builtin = [
  { id: "w-rl", title: "Agents", emoji: "🤖", regions: [{ id: "fields", name: "Foundation Fields", concepts: [] }] },
  { id: "w-gen", title: "The Dreaming Depths", emoji: "🌫️", regions: [{ id: "kl-region", name: "KL", concepts: [] }] },
  { id: "w-sys", title: "The Throughput Shogunate", emoji: "⚙️", regions: [{ id: "infer", name: "Inference", concepts: [] }] },
  { id: "w-tf", title: "The Attention Citadel", emoji: "🏛️", regions: [{ id: "attn", name: "Attention", concepts: [] }] },
];
const merged = mergeDkgWorlds(builtin, live);

ok(merged.length === builtin.length || merged.length === builtin.length + live.filter(l => !builtin.some(b => b.title.toLowerCase() === l.title.toLowerCase())).length, "no unexpected world count");

const genTitles = merged.filter((w) => w.title === "The Dreaming Depths");
ok(genTitles.length === 1, `The Dreaming Depths NOT duplicated (count=${genTitles.length})`);
const gen = genTitles[0];
ok(gen.regions.length > 1, `The Dreaming Depths enhanced: ${gen.regions.length} regions (was 1)`);
ok(gen.regions.some((r) => r.id === "kl-region"), "original builtin region preserved");
ok(gen.regions.some((r) => r.id.startsWith("dkg-")), "new DKG region appended to existing world");

// idempotency: merging again should not duplicate regions
const merged2 = mergeDkgWorlds(merged, live);
const gen2 = merged2.find((w) => w.title === "The Dreaming Depths");
ok(gen2.regions.length === gen.regions.length, `idempotent re-merge (${gen2.regions.length} == ${gen.regions.length})`);

console.log("\nSummary:", failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
console.log("Live worlds:", live.map((w) => `${w.title} (${w.regions.length} regions, ${w.regions.reduce((n,r)=>n+r.concepts.length,0)} concepts)`).join("; "));
process.exit(failures === 0 ? 0 : 1);
