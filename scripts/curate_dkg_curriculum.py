#!/usr/bin/env python3
"""Curate source-level DKG evidence into stable, mechanism-first Edokai boards."""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DKG_PATH = ROOT / "knowledge" / "edokai-dkg.json"
INDEX_PATH = ROOT / "knowledge" / "concept-world-index.json"
OUT_DIR = ROOT / "knowledge" / "curriculum"

CATALOG = {
    "agents": {
        "title": "The Agentworks",
        "boards": {
            "agent-foundations": ("The Agency Proving Grounds", "Foundations of Agency", ["state-action-loop", "planning-and-control", "tool-use-policy"]),
            "coordination": ("The Coordination Council", "The Councils of Coordination", ["multi-agent-communication", "exploration-and-diversity", "credit-and-accountability"]),
            "reliability": ("The Reliability Tribunal", "The Councils of Judgment", ["robustness-under-shift", "verification-and-authority", "human-ai-complementarity"]),
            "discovery": ("The Discovery Foundry", "The Long Roads", ["long-horizon-research", "memory-and-versioning", "scientific-evaluation"]),
        },
    },
    "transformer-architecture": {
        "title": "The Attention Citadel",
        "boards": {
            "representation": ("The Representation Galleries", "Foundations of Representation", ["embedding-geometry", "feature-formation", "representation-transfer"]),
            "sequence": ("The Sequence Engine", "The Way of Attention", ["attention-routing", "state-and-recurrence", "long-context-dynamics"]),
            "adaptation": ("The Adaptation Atelier", "The Craft of Adaptation", ["parameter-updates", "in-context-adaptation", "concept-learning"]),
            "architecture": ("The Architecture Crucible", "The Deep Mechanics", ["depth-and-iteration", "sparsity-and-routing", "architectural-tradeoffs"]),
        },
    },
    "generative-models": {
        "title": "The Dreaming Depths",
        "boards": {
            "objectives": ("The Objective Wells", "Foundations of Generation", ["likelihood-and-score", "latent-structure", "conditioning-and-control"]),
            "dynamics": ("The Generative Currents", "The Way of Generation", ["diffusion-and-flow", "iterative-refinement", "sampling-dynamics"]),
            "world-models": ("The Dreaming Simulator", "The Craft of World Models", ["predictive-state", "counterfactual-rollouts", "model-based-evaluation"]),
            "compression": ("The Distillation Forge", "The Craft of Distillation", ["teacher-student-transfer", "self-distillation", "memorization-and-generalization"]),
        },
    },
    "perception-world-models": {
        "title": "The Worldseer Observatory",
        "boards": {
            "global-geometry": ("The Global Geometry Workshop", "The Way of Seeing", ["geometric-priors", "global-consistency", "correspondence-and-optimization"]),
            "localization": ("The Localization Labyrinth", "The Way of Seeing", ["camera-pose-estimation", "drift-and-loop-closure", "sensor-and-view-fusion"]),
            "temporal-perception": ("The Temporal Lensworks", "The Way of Seeing", ["motion-and-event-streams", "egocentric-context", "temporal-correspondence"]),
            "embodied-perception": ("The Embodied Sensorium", "The Craft of Reconstruction", ["active-perception", "tactile-and-visual-fusion", "perception-for-control"]),
            "neural-rendering": ("The Neural Rendering Foundry", "The Craft of Reconstruction", ["scene-representation", "novel-view-synthesis", "scalable-reconstruction"]),
        },
    },
    "llm-systems-serving": {
        "title": "The Throughput Shogunate",
        "boards": {
            "memory": ("The Memory Holds", "The Craft of Memory", ["kv-and-state-caching", "data-movement", "capacity-and-precision"]),
            "inference": ("The Inference Engine", "The Way of Throughput", ["decoding-strategies", "batching-and-scheduling", "latency-throughput-tradeoff"]),
            "serving": ("The Serving Exchange", "The Way of Throughput", ["request-routing", "resource-allocation", "tail-latency-and-reliability"]),
            "evaluation": ("The Systems Gauntlet", "The Councils of Measurement", ["benchmark-design", "quality-efficiency-frontier", "workload-aware-evaluation"]),
        },
    },
    "retrieval-augmented-generation": {
        "title": "The Retrieval Archives",
        "boards": {
            "retrieval": ("The Retrieval Causeway", "Foundations of Retrieval", ["query-and-candidate-generation", "ranking-and-relevance", "evidence-grounding"]),
            "indexing": ("The Index Masons", "The Craft of Retrieval", ["representation-and-indexing", "hierarchy-and-partitioning", "update-and-freshness"]),
            "graph-memory": ("The Graph Memory Halls", "The Craft of Memory", ["entity-and-relation-memory", "multi-hop-reasoning", "persistent-agent-memory"]),
            "search-agents": ("The Search Expedition", "The Long Roads", ["iterative-search", "verification-and-stopping", "deep-research-planning"]),
        },
    },
}

WORLD_TERMS = {
    "agents": ["agent", "human-ai", "multi-agent", "tool use", "tool-use", "planning", "autonomous", "scientific discovery", "coordination", "collective cognition"],
    "retrieval-augmented-generation": ["retrieval", "search agent", "deep search", "rag", "maxsim", "index", "knowledge graph"],
    "perception-world-models": ["slam", "event camera", "egocentric", "pose", "simulator", "robot", "3d", "vision", "camera", "scene reconstruction", "gaussian splat"],
    "llm-systems-serving": ["serving", "latency", "gpu", "dram", "memory bandwidth", "inference", "decoding", "throughput", "kv cache"],
    "transformer-architecture": ["attention", "rnn", "embedding", "representation geometry", "transformer architecture", "sparse layer"],
    "generative-models": ["distillation", "diffusion", "generative", "memorization", "flow matching", "world model"],
}

FORBIDDEN = re.compile(r"\b(?:in|from|according to) (?:the )?(?:source|paper|study)\b|learner-facing|edokai (?:learners|should preserve)|shared technical mechanism|what role does|role .{0,60} play|primarily contribute|belong on (?:the )?same|paper[- ]specific|paper[- ]title|source-grounded fact matters most", re.I)


def source_text(src):
    provenance = " ".join(str(x) for x in src.get("provenance", []))
    provenance = re.sub(r"^.*?abstract metadata:\s*", "", provenance, flags=re.I)
    return re.sub(r"\s+", " ", provenance).strip()


def route_world(src):
    title = src.get("title", "").lower()
    abstract = source_text(src).lower()
    scores = {
        world: sum(4 for term in terms if term in title) + sum(1 for term in terms if term in abstract)
        for world, terms in WORLD_TERMS.items()
    }
    best = max(scores, key=lambda world: scores[world])
    return best if scores[best] else "agents"


def source_packets(dkg, world):
    packets = []
    for sid, src in dkg.get("sources", {}).items():
        if src.get("source_type") != "emergentmind-trending-paper" or route_world(src) != world:
            continue
        packets.append({"id": sid, "title": src.get("title", ""), "abstract": source_text(src)[:1100]})
    return packets


def schema_for(world):
    board_keys = list(CATALOG[world]["boards"])
    concept_keys = [key for _, _, keys in CATALOG[world]["boards"].values() for key in keys]
    question = {
        "type": "object", "additionalProperties": False,
        "required": ["q", "options", "a", "why", "source_ids"],
        "properties": {
            "q": {"type": "string"},
            "options": {"type": "array", "minItems": 4, "maxItems": 4, "items": {"type": "string"}},
            "a": {"type": "integer", "minimum": 0, "maximum": 3},
            "why": {"type": "string"},
            "source_ids": {"type": "array", "minItems": 1, "maxItems": 4, "items": {"type": "string"}},
        },
    }
    concept = {
        "type": "object", "additionalProperties": False,
        "required": ["concept_key", "name", "lore", "source_ids", "questions"],
        "properties": {
            "concept_key": {"type": "string", "enum": concept_keys},
            "name": {"type": "string"}, "lore": {"type": "string"},
            "source_ids": {"type": "array", "minItems": 1, "maxItems": 4, "items": {"type": "string"}},
            "questions": {"type": "array", "minItems": 2, "maxItems": 2, "items": question},
        },
    }
    side = {
        "type": "object", "additionalProperties": False,
        "required": ["name", "description", "questions"],
        "properties": {"name": {"type": "string"}, "description": {"type": "string"}, "questions": {"type": "array", "minItems": 2, "maxItems": 2, "items": question}},
    }
    gym = {
        "type": "object", "additionalProperties": False,
        "required": ["leader", "badge", "taunt", "questions"],
        "properties": {"leader": {"type": "string"}, "badge": {"type": "string"}, "taunt": {"type": "string"}, "questions": {"type": "array", "minItems": 3, "maxItems": 3, "items": question}},
    }
    board = {
        "type": "object", "additionalProperties": False,
        "required": ["board_key", "summary", "npc_name", "npc_text", "concepts", "side", "gym"],
        "properties": {
            "board_key": {"type": "string", "enum": board_keys},
            "summary": {"type": "string"}, "npc_name": {"type": "string"}, "npc_text": {"type": "string"},
            "concepts": {"type": "array", "minItems": 3, "maxItems": 3, "items": concept},
            "side": side, "gym": gym,
        },
    }
    assignment = {
        "type": "object", "additionalProperties": False,
        "required": ["source_id", "board_key", "concept_key"],
        "properties": {
            "source_id": {"type": "string"},
            "board_key": {"type": "string", "enum": board_keys},
            "concept_key": {"type": "string", "enum": concept_keys},
        },
    }
    return {
        "type": "object", "additionalProperties": False,
        "required": ["boards", "source_assignments"],
        "properties": {
            "boards": {"type": "array", "minItems": len(board_keys), "maxItems": len(board_keys), "items": board},
            "source_assignments": {"type": "array", "minItems": 1, "items": assignment},
        },
    }


def prompt_for(world, packets):
    board_spec = [{"board_key": k, "label": v[0], "arc": v[1], "concept_keys": v[2]} for k, v in CATALOG[world]["boards"].items()]
    priority = "11. For Glob3R, assign it to global-geometry and use its global SfM consistency mechanism in at least one lore passage and one direct technical or engineering-scenario question. Do not ask about the name Glob3R itself." if world == "perception-world-models" else ""
    return f"""You are Edokai's curriculum editor. Build the live world {CATALOG[world]['title']} from the supplied research abstracts.

The pedagogical reference is Edokai's hand-authored The Agentic RL Frontier:
- A board teaches a causal mechanism, not a list of papers.
- Lore moves through problem -> mechanism -> changed state/information flow -> evidence -> failure boundary in 90-150 coherent words.
- Concept questions directly test technical understanding (for example: 'Why does exploration from a random policy fail?' or 'What changes when gamma increases?').
- Side questions are concrete engineering scenarios requiring transfer.
- Gym questions integrate multiple concepts and expose trade-offs.
- Papers are evidence and provenance. Never ask what a paper's role is, where it fits, what Edokai should preserve, why concepts share a board, or which title said something.

Use exactly these stable boards and exactly their three concept_keys:
{json.dumps(board_spec, indent=2)}

Hard rules:
1. Return every board once and every listed concept_key once on its board.
2. Synthesize across relevant abstracts. Do not make an encounter for each paper.
2a. Position every research packet exactly once in source_assignments by choosing the board_key and concept_key that best capture its technical contribution. This map is internal provenance, not quiz wording.
3. Every concept gets 90-150 word lore and exactly two direct technical questions.
4. Each side gets exactly two applied scenario questions; each gym gets exactly three synthesis questions.
5. Four options per question: complete, plausible, similar-length technical statements. Correct answers vary positions. No silly UI/clinical/pure-math distractors.
6. Each why explains the causal mechanism in one or two sentences.
7. source_ids must be copied character-for-character from the supplied packets and support the exact claim. Use 1-4 per item. Never shorten, reconstruct, or normalize an ID.
8. Avoid paper names in question stems unless comparing named methods is technically essential.
9. Do not invent metrics, results, or mechanisms absent from the abstracts. If evidence is incomplete, teach the limitation honestly.
10. No meta-curriculum language such as source, paper, study, role, shared mechanism, case board, learner, Edokai, preserve, belongs, or fits.
{priority}

Research packets:
{json.dumps(packets, ensure_ascii=False)}
"""


def validate(world, data, valid_sources, source_titles=()):
    boards = data.get("boards", [])
    expected = CATALOG[world]["boards"]
    if {b.get("board_key") for b in boards} != set(expected):
        raise ValueError(f"board keys mismatch for {world}")
    for board in boards:
        expected_concepts = set(expected[board["board_key"]][2])
        if {c.get("concept_key") for c in board.get("concepts", [])} != expected_concepts:
            raise ValueError(f"concept keys mismatch in {world}/{board['board_key']}")
        questions = [q for c in board["concepts"] for q in c["questions"]] + board["side"]["questions"] + board["gym"]["questions"]
        for q in questions:
            if FORBIDDEN.search(q["q"]):
                raise ValueError(f"meta question in {world}: {q['q']}")
            if any(len(title) > 20 and title.lower() in q["q"].lower() for title in source_titles):
                raise ValueError(f"paper-title question in {world}: {q['q']}")
            if len(q["options"]) != 4 or q["a"] not in range(4):
                raise ValueError(f"invalid question in {world}: {q['q']}")
            if not set(q["source_ids"]).issubset(valid_sources):
                raise ValueError(f"unknown source id in {world}: {q['source_ids']}")
    assignments = data.get("source_assignments", [])
    assigned_ids = [a.get("source_id") for a in assignments]
    if len(assigned_ids) != len(set(assigned_ids)) or set(assigned_ids) != valid_sources:
        missing = sorted(valid_sources - set(assigned_ids))[:5]
        extra = sorted(set(assigned_ids) - valid_sources)[:5]
        raise ValueError(f"source assignment mismatch in {world}: missing={missing} extra={extra}")
    for assignment in assignments:
        expected_concepts = set(expected[assignment["board_key"]][2])
        if assignment["concept_key"] not in expected_concepts:
            raise ValueError(f"cross-board concept assignment in {world}: {assignment}")
    return data


def generate_world(world, packets, output):
    if not packets:
        raise SystemExit(f"no source packets for {world}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    schema_path = OUT_DIR / f".{world}-schema.json"
    schema_path.write_text(json.dumps(schema_for(world), indent=2))
    prompt_path = OUT_DIR / f".{world}-prompt.txt"
    prompt = prompt_for(world, packets)
    prompt_path.write_text(prompt)
    candidate = OUT_DIR / f".{world}-candidate.json"
    try:
        last_error = None
        for attempt in range(2):
            retry_prompt = prompt if not last_error else f"{prompt}\n\nYour previous candidate failed deterministic validation: {last_error}. Correct that failure and return the complete JSON again."
            cmd = ["codex", "exec", "--ephemeral", "--sandbox", "read-only", "--output-schema", str(schema_path), "--output-last-message", str(candidate), "-"]
            proc = subprocess.run(cmd, cwd=ROOT, input=retry_prompt, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=1200)
            if proc.returncode:
                last_error = f"Codex exited {proc.returncode}: {proc.stdout[-2000:]}"
                continue
            try:
                data = json.loads(candidate.read_text())
                validate(world, data, {p["id"] for p in packets}, [p["title"] for p in packets])
                output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
                return
            except (ValueError, json.JSONDecodeError) as exc:
                last_error = str(exc)
        rejected = OUT_DIR / f"{world}.rejected.json"
        if candidate.exists(): candidate.replace(rejected)
        raise SystemExit(f"Curriculum candidate rejected for {world}; last valid snapshot preserved. {last_error}")
    finally:
        schema_path.unlink(missing_ok=True)
        prompt_path.unlink(missing_ok=True)
        candidate.unlink(missing_ok=True)


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def apply_world(world, data, dkg, index):
    catalog = CATALOG[world]
    regions = []
    assigned_by_concept = {}
    for assignment in data["source_assignments"]:
        assigned_by_concept.setdefault((assignment["board_key"], assignment["concept_key"]), []).append(assignment["source_id"])
    for board in data["boards"]:
        board_key = board["board_key"]
        label, arc, expected_keys = catalog["boards"][board_key]
        concept_ids = []
        quiz_questions = []
        board_sources = set()
        for concept in board["concepts"]:
            cid = f"curriculum-{world}-{board_key}-{concept['concept_key']}"
            concept_ids.append(cid)
            positioned_sources = sorted(set(concept["source_ids"] + assigned_by_concept.get((board_key, concept["concept_key"]), [])))
            board_sources.update(positioned_sources)
            dkg.setdefault("nodes", {})[cid] = {
                "id": cid, "label": concept["name"], "type": "curriculum-concept", "summary": concept["lore"],
                "aliases": [], "source_ids": positioned_sources, "confidence": 0.9, "world_hint": world,
            }
            for q_idx, q in enumerate(concept["questions"], 1):
                quiz_questions.append({"id": f"q-{world}-{board_key}-{concept['concept_key']}-{q_idx}", "question": q["q"], "choices": q["options"], "answer_index": q["a"], "explanation": q["why"], "source_ids": q["source_ids"], "concept_id": cid, "kind": "direct_technical"})
        side_questions = [{"id": f"q-{world}-{board_key}-side-{i}", "question": q["q"], "choices": q["options"], "answer_index": q["a"], "explanation": q["why"], "source_ids": q["source_ids"], "kind": "applied_scenario"} for i, q in enumerate(board["side"]["questions"], 1)]
        gym_questions = [{"id": f"q-{world}-{board_key}-gym-{i}", "question": q["q"], "choices": q["options"], "answer_index": q["a"], "explanation": q["why"], "source_ids": q["source_ids"], "kind": "transfer"} for i, q in enumerate(board["gym"]["questions"], 1)]
        for q in side_questions + gym_questions:
            board_sources.update(q["source_ids"])
        regions.append({
            "id": f"curriculum-{board_key}", "board_key": f"{world}/{board_key}", "label": label, "technical_label": " · ".join(c["name"] for c in board["concepts"]), "arc": arc if len(catalog["boards"]) > 4 else None, "summary": board["summary"],
            "learner_goal": f"Diagnose and apply the mechanisms taught in {label} under new constraints.",
            "npc": {"name": board["npc_name"], "text": board["npc_text"]},
            "source_ids": sorted(board_sources), "concept_ids": concept_ids, "critical_concepts": concept_ids,
            "prerequisite_links": [{"from": concept_ids[i - 1], "to": concept_ids[i], "why": "The earlier mechanism supplies the state or invariant needed to reason about the next one."} for i in range(1, len(concept_ids))],
            "quiz_questions": quiz_questions,
            "side_retention_duels": [{"id": f"{board_key}-scenario", "name": board["side"]["name"], "description": board["side"]["description"], "questions": side_questions}],
            "gym": {"leader": board["gym"]["leader"], "badge": board["gym"]["badge"], "taunt": board["gym"]["taunt"], "questions": gym_questions},
        })
    index["macro_worlds"][world]["regions"] = regions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--world", choices=[*CATALOG, "all"], default="all")
    parser.add_argument("--generate", action="store_true", help="invoke Codex before applying")
    parser.add_argument("--apply", action="store_true", help="write curated boards into DKG/index")
    args = parser.parse_args()
    worlds = list(CATALOG) if args.world == "all" else [args.world]
    dkg = json.loads(DKG_PATH.read_text())
    index = json.loads(INDEX_PATH.read_text())
    for world in worlds:
        output = OUT_DIR / f"{world}.json"
        packets = source_packets(dkg, world)
        if args.generate:
            generate_world(world, packets, output)
            print(f"generated {world}: {len(packets)} source packets -> {output}")
        if args.apply:
            data = validate(world, json.loads(output.read_text()), {p["id"] for p in packets}, [p["title"] for p in packets])
            apply_world(world, data, dkg, index)
            print(f"applied {world}: {len(data['boards'])} boards")
    if args.apply:
        DKG_PATH.write_text(json.dumps(dkg, indent=2, ensure_ascii=False) + "\n")
        INDEX_PATH.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
