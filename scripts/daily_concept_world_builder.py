#!/usr/bin/env python3
"""Deterministic Edokai daily concept-world builder.

This script is cron-safe: it does not call an LLM, finishes quickly, appends a
builder observability entry only when needed, validates the DKG/app adapter, syncs
Supabase, and prints the exact Telegram-ready completion message.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DKG = ROOT / "knowledge" / "edokai-dkg.json"
INDEX = ROOT / "knowledge" / "concept-world-index.json"
LOG = ROOT / "loop-run-log.md"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run(cmd: list[str], timeout: int = 120) -> tuple[bool, str]:
    p = subprocess.run(cmd, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    return p.returncode == 0, p.stdout.strip()


def load() -> tuple[dict, dict]:
    return json.loads(DKG.read_text()), json.loads(INDEX.read_text())


def save(dkg: dict, idx: dict) -> None:
    DKG.write_text(json.dumps(dkg, indent=2, ensure_ascii=False) + "\n")
    INDEX.write_text(json.dumps(idx, indent=2, ensure_ascii=False) + "\n")


def latest_growth_run(dkg: dict) -> dict | None:
    runs = [r for r in dkg.get("run_history", []) if r.get("type") == "daily-emergentmind-all-topics"]
    return runs[-1] if runs else None


def count_state(dkg: dict, idx: dict) -> dict:
    regions = quizzes = duels = 0
    answer_positions = Counter()
    one_case_arcs: list[str] = []
    for wid, world in idx.get("macro_worlds", {}).items():
        arc_counts = Counter(r.get("arc") for r in world.get("regions", []) if r.get("arc"))
        for arc, n in arc_counts.items():
            if n == 1:
                one_case_arcs.append(f"{wid}:{arc}")
        for r in world.get("regions", []):
            regions += 1
            qs = r.get("quiz_questions", []) or []
            quizzes += len(qs)
            duels += len(r.get("side_retention_duels", []) or [])
            for q in qs:
                if isinstance(q.get("answer_index"), int):
                    answer_positions[q["answer_index"]] += 1
    return {
        "sources": len(dkg.get("sources", {})),
        "nodes": len(dkg.get("nodes", {})),
        "edges": len(dkg.get("edges", [])),
        "worlds": len(idx.get("macro_worlds", {})),
        "regions": regions,
        "quizzes": quizzes,
        "duels": duels,
        "answer_positions": dict(sorted(answer_positions.items())),
        "one_case_arcs": one_case_arcs,
    }


def scan_quality(idx: dict) -> list[str]:
    issues: list[str] = []
    generic = re.compile(r"generic paper-title|memorized paper title|\.\.\.", re.I)
    for wid, world in idx.get("macro_worlds", {}).items():
        for r in world.get("regions", []):
            for q in r.get("quiz_questions", []) or []:
                choices = q.get("choices", []) or []
                if len(choices) != 4:
                    issues.append(f"{wid}/{r.get('id')}: quiz has {len(choices)} choices")
                if not isinstance(q.get("answer_index"), int) or q.get("answer_index") not in range(4):
                    issues.append(f"{wid}/{r.get('id')}: bad answer_index")
                if any(str(c).rstrip().endswith("...") or str(c).rstrip().endswith("…") for c in choices):
                    issues.append(f"{wid}/{r.get('id')}: clipped quiz choice")
            for d in r.get("side_retention_duels", []) or []:
                blob = " ".join(str(d.get(k, "")) for k in ("prompt", "left", "right", "answer"))
                if generic.search(blob):
                    issues.append(f"{wid}/{r.get('id')}: generic/clipped side duel {d.get('id')}")
    return issues


def mark_latest_verification(dkg: dict, idx: dict, status: dict) -> None:
    latest = latest_growth_run(dkg)
    if latest:
        latest["verification"] = status.copy()
        rid = latest.get("run_id")
        for h in idx.get("routing_history", []):
            if h.get("run_id") == rid:
                h["verification"] = status.copy()


def append_builder_if_needed(dkg: dict, idx: dict, counts: dict, issues: list[str], status: dict) -> str | None:
    latest = latest_growth_run(dkg)
    if not latest:
        return None
    latest_id = latest.get("run_id")
    if any(h.get("event") == "daily concept-world builder pass" and h.get("upstream_run_id") == latest_id for h in idx.get("routing_history", [])):
        return None
    ts = now_iso()
    run_id = "daily-concept-world-builder-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    entry = {
        "run_id": run_id,
        "completed_at": ts,
        "event": "daily concept-world builder pass",
        "upstream_run_id": latest_id,
        "sources_added": 0,
        "nodes_added": 0,
        "edges_added": 0,
        "regions_added": 0,
        "new_worlds_created": [],
        "quality_findings": issues,
        "verification": status.copy(),
    }
    idx.setdefault("routing_history", []).append(entry)
    dkg.setdefault("run_history", []).append({
        "run_id": run_id,
        "completed_at": ts,
        "type": "daily-concept-world-builder",
        "upstream_run_id": latest_id,
        "sources_added": 0,
        "nodes_added": 0,
        "edges_added": 0,
        "regions_added": 0,
        "quality_findings": issues,
        "verification": status.copy(),
    })
    LOG.write_text(LOG.read_text() + f"\n## {run_id}\n\n"
        f"- Trigger: scheduled deterministic concept-world builder after `{latest_id}`.\n"
        f"- Maker/checker result: upstream already added {latest.get('sources_added', 0)} sources, {latest.get('nodes_added', 0)} nodes, {latest.get('edges_added', 0)} edges, and {latest.get('regions_added', 0)} preliminary regions. Builder found {len(issues)} quality findings and made no broad app/UI changes.\n"
        f"- Counts before sync: {counts['sources']} sources / {counts['nodes']} nodes / {counts['edges']} edges / {counts['worlds']} macro worlds / {counts['regions']} regions / {counts['quizzes']} quizzes / {counts['duels']} duels.\n"
        f"- Verification: JSON parse passed; `npm run dkg:test` passed; `npm run build` passed; `npm run dkg:sync` passed; `node scripts/test-dkg-roundtrip.mjs` passed.\n"
        f"- Escalations/manual review: {('quality findings need manual review: ' + '; '.join(issues[:5])) if issues else 'none.'}\n", encoding="utf-8")
    return run_id


def main() -> int:
    dkg, idx = load()
    issues = scan_quality(idx)
    counts = count_state(dkg, idx)
    if counts["one_case_arcs"]:
        issues.extend(f"one-case arc {x}" for x in counts["one_case_arcs"])

    checks = []
    for cmd, label, timeout in [
        (["python3", "-m", "json.tool", str(DKG)], "json_dkg", 30),
        (["python3", "-m", "json.tool", str(INDEX)], "json_index", 30),
        (["npm", "run", "dkg:test"], "dkg_test", 120),
        (["npm", "run", "build"], "build", 180),
        (["npm", "run", "dkg:sync"], "supabase_sync", 120),
        (["node", "scripts/test-dkg-roundtrip.mjs"], "roundtrip", 120),
    ]:
        ok, out = run(cmd, timeout=timeout)
        checks.append((label, ok, out))
        if not ok:
            print(f"❌ Edokai daily builder failed at {label}.\n\n{out[-4000:]}")
            return 1

    status = {"json_parse": "passed", "dkg_test": "passed", "build": "passed", "supabase_sync": "passed", "roundtrip": "passed"}
    mark_latest_verification(dkg, idx, status)
    run_id = append_builder_if_needed(dkg, idx, counts, issues, status)
    save(dkg, idx)

    counts = count_state(dkg, idx)
    latest = latest_growth_run(dkg)
    if not run_id and (not latest or latest.get("verification", {}).get("roundtrip") == "passed"):
        return 0
    print(
        "✅ Edokai daily concept-world builder complete\n"
        f"Upstream run: {latest.get('run_id') if latest else 'none'}\n"
        f"Builder run: {run_id or 'already recorded'}\n"
        f"Graph: {counts['sources']} sources / {counts['nodes']} nodes / {counts['edges']} edges\n"
        f"Worlds: {counts['worlds']} macro worlds / {counts['regions']} regions / {counts['quizzes']} quizzes / {counts['duels']} duels\n"
        "Supabase sync: passed\n"
        "Live app readback: passed via scripts/test-dkg-roundtrip.mjs\n"
        f"Quality findings: {len(issues)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
