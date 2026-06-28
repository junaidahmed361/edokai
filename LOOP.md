# Edokai Dynamic Knowledge Graph Loops

Edokai uses loop-engineering style automation to grow a source-grounded dynamic knowledge graph (DKG) and route new knowledge into concept-world umbrellas.

## Loops

### 1. Daily EmergentMind all-topics graph growth

**Goal:** discover current topics/trending papers from `https://www.emergentmind.com/`, extract source-grounded ML/AI concepts, and update `knowledge/edokai-dkg.json`.

**Non-goals:** do not ingest only one fixed topic; do not fabricate sources; do not redesign Edokai broadly; do not touch secrets/auth/infra.

**Cadence:** daily morning.

**Scope:** `/Users/junaidahmed/Downloads/edokai`, especially `knowledge/` and content indices.

### 2. Telegram manual link ingest

**Trigger:** `/edokai_ingest <URL>` in the connected Hermes Telegram bot.

**Goal:** treat the shared link as a high-priority source, update the DKG, then immediately run concept-world routing/enhancement.

### 3. Concept world builder

**Goal:** sort DKG concepts into existing macro-level concept-world umbrellas or create new macro worlds when existing umbrellas are insufficient.

**Cadence:** runs after manual ingest and daily after automatic ingest.

## State spine

- `knowledge/edokai-dkg.json` — graph nodes, edges, sources, confidence, provenance.
- `knowledge/concept-world-index.json` — macro-world/region/concept routing map.
- `knowledge/inbox.jsonl` — append-only source/run queue log.
- `loop-run-log.md` — human-readable run history.
- `loop-budget.md` — budget, limits, and kill-switch rules.

## Loop-engineering readiness

- Scheduling: Hermes cron + Telegram slash command.
- Skills: `edokai-dkg-loop-engineering`, `research-intelligence-workflows`, `software-development-workflows`.
- State: repo-local JSON and run log.
- Human handoff: low-confidence facts, ambiguous new macro worlds, broad app refactors, or repeated failed runs.
- Safety: report-only/no-op on blocked sources; no secret/auth/infra edits.
- Observability: every run appends summary fields: run_id, sources, nodes/edges changed, worlds changed, escalations.
