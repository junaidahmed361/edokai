# Edokai DKG Loop Run Log

Append-only operational log for automatic EmergentMind ingestion, Telegram manual ingestion, and concept-world builder runs.

## manual-telegram-trl-distillation-20260628T021239Z

- Trigger: manual Telegram link ingest / loop-engineered run.
- Source read: `https://huggingface.co/spaces/HuggingFaceTB/trl-distillation-trainer` plus bounded secondary provenance from the Space API, raw article MDX, TRL Distillation Trainer docs, and the article bibliography.
- Extracted signal: TRL `DistillationTrainer`, on-policy vs off-policy distillation, generation buffer, external vLLM teacher-server logprob serving, request batching, binary logprob encoding, top-k KL approximation, forward/reverse KL trade-offs, domain-specific reasoning distillation, and capacity-gap limitations.
- Graph actions: added 4 source records, 15 concept/system/method/article nodes, and 14 source-backed edges to `knowledge/edokai-dkg.json`.
- Concept-world builder: enhanced existing `Generative Models`, `LLM Systems & Serving`, and `Transformer Architecture` worlds with regions, critical concepts, prerequisite links, side retention duels, and source-backed quiz questions. No new macro world created.
- Verification: `knowledge/edokai-dkg.json`, `knowledge/concept-world-index.json`, and `knowledge/inbox.jsonl` parsed successfully; DKG has 15 unique nodes, 14 edges, and no edge missing refs/provenance. `npm run build` completed successfully with Vite's existing CJS API deprecation/chunk-size warnings.
- Escalations/manual review: capacity-gap concepts are routed under `Generative Models` for now; review later if Edokai adds a dedicated evaluation/compression world. No app refactor or publishing performed.

## manual-telegram-graphrag-20260628T070500Z

- Trigger: manual Telegram link ingest / loop-engineered run.
- Source read: `https://arxiv.org/abs/2404.16130` — "From Local to Global: A Graph RAG Approach to Query-Focused Summarization" (Edge, Trinh, Cheng, Bradley, Chao, Mody, Truitt, Metropolitansky, Ness, Larson; Microsoft, arXiv 2024-04-24). Verified arXiv metadata + PDF body pages 1-14 locally (pdftotext).
- DATA INTEGRITY NOTE: the `web_extract` tool returned a *mismatched/fabricated* paper ("Advancing Intelligent Personal Assistants for Human Spaceflight") for this arXiv ID. Caught via maker/checker; discarded entirely. All extraction below comes from the verified arXiv abstract metadata and the real downloaded PDF. No fabricated citation entered state.
- Extracted signal: GraphRAG method, global sensemaking / query-focused summarization (QFS), conventional vector RAG contrast, LLM-derived entity knowledge graph index (nodes/edges/covariate-claims), Leiden hierarchical community detection, bottom-up community summaries, map-reduce partial-then-final answering, and LLM-judged sensemaking metrics (Comprehensiveness/Diversity/Empowerment with Directness as control).
- Graph actions: added 1 source, 8 nodes, 8 source-backed edges, and 1 open question to `knowledge/edokai-dkg.json`. Totals now 23 nodes / 22 edges / 5 sources. No duplicate nodes introduced.
- Concept-world builder: initially routed GraphRAG under `LLM Systems & Serving`, then corrected by router self-improvement: promoted the two regions ("Graph RAG & Global Sensemaking", "Graph Index Construction & Community Hierarchy") into a new `Retrieval-Augmented Generation` macro world. Regions, critical concepts, prerequisite links, side retention duels, and source-backed quizzes preserved.
- Verification: all JSON parses; edge/provenance/source-ref validation OK; `npm run dkg:test` => ALL PASS (GraphRAG regions render live, no world duplication, idempotent merge); `npm run build` => built in ~0.8s (only pre-existing Vite chunk-size warning).
- Router learning: RAG/GraphRAG/hybrid retrieval/reranking/index construction/query-focused summarization now belongs in `Retrieval-Augmented Generation`, not generic `LLM Systems & Serving`, unless the source is strictly about low-level inference serving infrastructure. No app refactor, no publish/commit performed during the ingest itself.

