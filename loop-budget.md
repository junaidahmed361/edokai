# Loop Budget — Edokai DKG

## Daily limits

- Max daily automatic source pages: 12 EmergentMind topic/article pages.
- Max fallback arXiv/deep links: 8 per daily run.
- Max manual link fan-out: 8 secondary links unless the user explicitly asks for deeper crawl.
- Max subagent/verifier spawns per run: 2.
- If no new useful source signal is found, exit early and log a no-op.

## Kill / pause criteria

Pause and notify the user if:

- source extraction is blocked or rate-limited for 3 consecutive daily runs;
- JSON state fails validation after repair attempt;
- the same concept-world routing ambiguity appears in 2 consecutive runs;
- a run would require broad Edokai app architecture changes instead of knowledge/content updates;
- token/cost use becomes disproportionate to new sources found.

## Human review required

- Creating a brand-new macro concept world from low-confidence or single-source evidence.
- Editing core app architecture outside content/knowledge surfaces.
- Any source that makes safety, medical, legal, or financial claims.
