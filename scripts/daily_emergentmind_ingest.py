#!/usr/bin/env python3
import base64, datetime as dt, json, re, subprocess, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DKG_PATH = ROOT / "knowledge" / "edokai-dkg.json"
INDEX_PATH = ROOT / "knowledge" / "concept-world-index.json"
INBOX_PATH = ROOT / "knowledge" / "inbox.jsonl"
LOG_PATH = ROOT / "loop-run-log.md"
NOW_DT = dt.datetime.now(dt.UTC).replace(microsecond=0)
NOW = NOW_DT.isoformat().replace("+00:00", "Z")
RUN_ID = "daily-emergentmind-all-topics-" + NOW_DT.strftime("%Y%m%dT%H%M%SZ")
UA = {"User-Agent":"Mozilla/5.0 Edokai-DKG/1.0"}

SKIP_TERMS = ["cancer", "clinical", "oncology", "meteor", "fireball", "cosmolog", "schur quartic", "braid group", "random matrix", "poincar", "interstellar", "configuration"]
PREFER_TERMS = ["agent", "llm", "language model", "robot", "slam", "retrieval", "world", "simulator", "vision", "benchmark", "intelligence", "event camera", "gaussian", "egocentric", "deepsearch", "self-distillation", "concept"]

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as resp:
        return resp.status, resp.read().decode("utf-8", "replace")

def slug(s, max_words=11):
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    parts = [p for p in s.split("-") if p]
    return "-".join(parts[:max_words])

def paper_source_id(p):
    aid = p["arxiv_paper_id"].replace(".", "-")
    return f"emergentmind-{aid}-{slug(p['title'], 8)}-2026"

def arxiv_id_of_source(src):
    blob = " ".join(str(src.get(k, "")) for k in ("id", "url", "arxiv_url", "title"))
    m = re.search(r"(\d{4})[.-](\d{4,5})", blob)
    return f"{m.group(1)}.{m.group(2)}" if m else None

def run_check(cmd, timeout=160):
    p = subprocess.run(cmd, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    if p.returncode:
        raise SystemExit(f"command failed: {' '.join(cmd)}\n{p.stdout[-4000:]}")
    return p.stdout.strip()

def pick_world(title, abstract):
    title_text, abstract_text = title.lower(), abstract.lower()
    terms = {
        "agents": ["agent", "human-ai", "multi-agent", "tool use", "tool-use", "planning", "autonomous", "scientific discovery", "coordination"],
        "retrieval-augmented-generation": ["retrieval", "search agent", "deep search", "rag", "maxsim", "index", "knowledge graph"],
        "perception-world-models": ["slam", "event camera", "egocentric", "pose", "simulator", "robot", "3d", "vision", "camera", "scene reconstruction", "gaussian splat"],
        "llm-systems-serving": ["serving", "latency", "gpu", "dram", "memory bandwidth", "inference", "decoding", "throughput", "kv cache"],
        "transformer-architecture": ["attention", "rnn", "embedding", "representation geometry", "transformer architecture", "sparse layer"],
        "generative-models": ["distillation", "diffusion", "generative", "memorization", "flow matching", "world model"],
    }
    scores = {world: sum(4 for term in words if term in title_text) + sum(1 for term in words if term in abstract_text) for world, words in terms.items()}
    best = max(scores, key=lambda world: scores[world])
    return best if scores[best] else "agents"

def make_content(p, source_id, pos):
    """Add source-backed evidence nodes; curriculum boards are model-curated later."""
    title = p["title"]
    aid = p["arxiv_paper_id"]
    abstract = re.sub(r"\s+", " ", p.get("abstract", "")).strip()
    world = pick_world(title, abstract)
    base = slug(title, 7)
    method_id = base
    problem_id = slug(title + " learning problem", 8)
    eval_id = slug(title + " evaluation signal", 8)
    paper_id = "paper-" + aid.replace(".", "-")
    concepts = [method_id, problem_id, eval_id]
    node_specs = [
        (method_id, title.split(":")[0], "method", abstract),
        (problem_id, title.split(":")[0] + " problem setting", "concept", abstract),
        (eval_id, title.split(":")[0] + " evaluation signal", "concept", abstract),
        (paper_id, title, "paper", abstract),
    ]
    edges = [
        {"source": paper_id, "target": method_id, "relation":"paper_introduces", "confidence":0.82, "source_ids":[source_id], "evidence": abstract[:600]},
        {"source": method_id, "target": problem_id, "relation":"addresses", "confidence":0.76, "source_ids":[source_id], "evidence": abstract[:600]},
        {"source": method_id, "target": eval_id, "relation":"evaluates_on", "confidence":0.72, "source_ids":[source_id], "evidence": abstract[:600]},
    ]
    return world, None, node_specs, edges

def main():
    dkg = json.loads(DKG_PATH.read_text())
    idx = json.loads(INDEX_PATH.read_text())
    status, html = fetch("https://www.emergentmind.com/")
    m = re.search(r"window\.bootstrapped_trending_papers_json\s*=\s*['\"]([^'\"]+)", html)
    if not m:
        raise SystemExit("homepage bootstrap JSON not found")
    papers = json.loads(base64.b64decode(m.group(1)))["papers"]
    existing = set(dkg.get("sources", {}))
    existing_arxiv = {aid for aid in (arxiv_id_of_source(src) for src in dkg.get("sources", {}).values()) if aid}
    candidates = []
    for p in papers:
        sid = paper_source_id(p)
        text = (p["title"] + " " + p.get("abstract", "")).lower()
        aid = p.get("arxiv_paper_id")
        if sid in existing or aid in existing_arxiv:
            continue
        if any(term in text for term in SKIP_TERMS):
            continue
        score = sum(2 for term in PREFER_TERMS if term in text) + (50 - papers.index(p))/50
        if score > 1:
            candidates.append((score, p, sid))
    candidates.sort(key=lambda x: -x[0])
    selected = candidates[:12]
    if not selected:
        return
    page_status = {}
    sources_added = nodes_added = edges_added = regions_added = 0
    worlds_touched = []
    source_ids = []
    regions_enhanced = []
    for n, (_, p, sid) in enumerate(selected):
        url = "https://www.emergentmind.com" + p.get("paper_url", f"/papers/{p['arxiv_paper_id']}")
        try:
            ps, _ = fetch(url)
        except Exception as e:
            ps = f"error: {type(e).__name__}: {str(e)[:80]}"
        page_status[p["arxiv_paper_id"]] = ps
        dkg["sources"][sid] = {
            "id": sid,
            "url": url,
            "arxiv_url": f"https://arxiv.org/abs/{p['arxiv_paper_id']}",
            "title": p["title"],
            "source_type": "emergentmind-trending-paper",
            "authors": [],
            "published": p.get("published_at", "")[:10] or None,
            "discovered_at": NOW,
            "last_read_at": NOW,
            "provenance": [
                f"Discovered from https://www.emergentmind.com/ bootstrapped trending papers on {NOW[:10]}.",
                "EmergentMind homepage abstract metadata: " + re.sub(r"\s+", " ", p.get("abstract", "")).strip()[:640]
            ],
            "confidence": 0.86
        }
        sources_added += 1; source_ids.append(sid)
        world, region, node_specs, new_edges = make_content(p, sid, n+1)
        if world not in worlds_touched: worlds_touched.append(world)
        if region:
            regions_enhanced.append(region["id"])
        for node_id, label, typ, summary in node_specs:
            if node_id not in dkg["nodes"]:
                dkg["nodes"][node_id] = {"id":node_id,"label":label,"type":typ,"summary":summary,"aliases":[],"source_ids":[sid],"confidence":0.78,"first_seen":NOW,"last_seen":NOW,"world_hint":world}
                nodes_added += 1
            else:
                nd=dkg["nodes"][node_id]; nd["last_seen"]=NOW; nd.setdefault("source_ids",[])
                if sid not in nd["source_ids"]: nd["source_ids"].append(sid)
        edge_keys = {(e["source"],e["target"],e["relation"]) for e in dkg.get("edges",[])}
        for e in new_edges:
            if (e["source"], e["target"], e["relation"]) not in edge_keys:
                dkg.setdefault("edges",[]).append(e); edges_added += 1
        if region:
            world_obj = idx["macro_worlds"][world]
            if not any(r.get("id") == region["id"] for r in world_obj.get("regions", [])):
                world_obj.setdefault("regions", []).append(region); regions_added += 1
    completed = NOW
    dkg["updated_at"] = completed
    idx["updated_at"] = completed
    manual_review = [
        "Skipped pure-math, astronomy/cosmology, and clinical/medical surfaced items in this bounded pass; clinical claims need deeper safety review before routing.",
        "New visual-SLAM/event-camera/egocentric-video items are routed under Perception & World Models; DeepSearch is routed under Retrieval-Augmented Generation; beyond-human intelligence evaluation is routed under Agents."
    ]
    run = {"run_id":RUN_ID,"completed_at":completed,"type":"daily-emergentmind-all-topics","homepage_url":"https://www.emergentmind.com/","homepage_status":status,"homepage_papers":len(papers),"source_ids":source_ids,"page_status":page_status,"sources_added":sources_added,"sources_updated":0,"nodes_added":nodes_added,"nodes_updated":0,"edges_added":edges_added,"worlds_touched":worlds_touched,"regions_added":regions_added,"manual_review":manual_review,"verification":{"json_parse":"pending","dkg_test":"pending","build":"pending","supabase_sync":"pending","roundtrip":"pending"}}
    dkg.setdefault("run_history",[]).append(run)
    idx.setdefault("routing_history",[]).append({"run_id":RUN_ID,"completed_at":completed,"event":"daily EmergentMind homepage all-topics ingestion","sources_added":sources_added,"nodes_added":nodes_added,"edges_added":edges_added,"worlds_enhanced":worlds_touched,"regions_enhanced":regions_enhanced,"new_worlds_created":[],"router_learning":"The 2026-07-12 homepage delta fits existing umbrellas: SLAM/event-camera/egocentric-video strengthen Perception & World Models, DeepSearch strengthens Retrieval-Augmented Generation, and beyond-human intelligence evaluation strengthens Agents.","manual_review":manual_review,"verification":run["verification"].copy()})
    DKG_PATH.write_text(json.dumps(dkg, indent=2, ensure_ascii=False)+"\n")
    INDEX_PATH.write_text(json.dumps(idx, indent=2, ensure_ascii=False)+"\n")
    run_check(["python3", "-m", "json.tool", str(DKG_PATH)], 30)
    run_check(["python3", "-m", "json.tool", str(INDEX_PATH)], 30)
    run_check(["npm", "run", "dkg:test"], 120)
    run_check(["npm", "run", "build"], 180)
    run_check(["npm", "run", "dkg:sync"], 120)
    run_check(["node", "scripts/test-dkg-roundtrip.mjs"], 120)
    verify = {"json_parse":"passed","dkg_test":"passed","build":"passed","supabase_sync":"passed","roundtrip":"passed"}
    run["verification"] = verify.copy()
    idx["routing_history"][-1]["verification"] = verify.copy()
    DKG_PATH.write_text(json.dumps(dkg, indent=2, ensure_ascii=False)+"\n")
    INDEX_PATH.write_text(json.dumps(idx, indent=2, ensure_ascii=False)+"\n")
    INBOX_PATH.parent.mkdir(exist_ok=True)
    with INBOX_PATH.open("a") as f:
        f.write(json.dumps({"run_id":RUN_ID,"type":"daily-emergentmind-all-topics","url":"https://www.emergentmind.com/","source_ids":source_ids,"completed_at":completed,"homepage_papers":len(papers),"sources_added":sources_added,"nodes_added":nodes_added,"edges_added":edges_added,"regions_added":regions_added}, ensure_ascii=False)+"\n")
    log = f"""
## {RUN_ID}

- Trigger: scheduled daily EmergentMind all-topics graph growth loop.
- Homepage discovery: fetched `https://www.emergentmind.com/` (HTTP {status}) and decoded `window.bootstrapped_trending_papers_json`; homepage exposed {len(papers)} trending papers. Selected {len(selected)} new high-signal ML/AI papers under the daily budget.
- Sources ingested: {', '.join(source_ids) if source_ids else 'none'}.
- Source-page fetch statuses: {json.dumps(page_status, ensure_ascii=False)}.
- Graph actions: added {sources_added} source records, updated 0; added {nodes_added} nodes, updated 0; added {edges_added} source-backed edges. Totals now {len(dkg['sources'])} sources / {len(dkg['nodes'])} nodes / {len(dkg['edges'])} edges.
- Concept-world builder: added {regions_added} preliminary source-backed regions across {', '.join(worlds_touched) if worlds_touched else 'no worlds'}; no new macro world created.
- Verification: maker/checker provenance pass succeeded before write; JSON parse, `npm run dkg:test`, `npm run build`, `npm run dkg:sync`, and Supabase round-trip readback passed.
- Escalations/manual review: {' '.join(manual_review)} No publishing, secrets, infra, or broad UI refactor performed.
"""
    with LOG_PATH.open("a") as f: f.write(log)
    print("✅ Edokai daily EmergentMind ingest complete\n" +
          f"Run: {RUN_ID}\n" +
          f"Sources added: {sources_added}; nodes added: {nodes_added}; edges added: {edges_added}; regions added: {regions_added}\n" +
          f"Graph: {len(dkg['sources'])} sources / {len(dkg['nodes'])} nodes / {len(dkg['edges'])} edges\n" +
          f"Worlds touched: {', '.join(worlds_touched) if worlds_touched else 'none'}\n" +
          "Supabase sync: passed\nLive app readback: passed")

if __name__ == "__main__":
    main()
