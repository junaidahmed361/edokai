# Edokai — persistent content & design rules

These rules apply to **every future update**, whether content is hand-authored,
model-generated at runtime, or added by an agent editing this repo. The same
rules are embedded in the runtime generation prompts (`NAMING_RULES` and
`QUALITY_RULES` in `src/App.jsx`) — keep the two in sync.

## 1. Lore-appropriate naming

- Every world, arc, region ("case board"), concept encounter, and side duel gets
  an evocative in-world name — a place, character, or artifact that hints at the
  mechanism. Never a bare publication/section title and never a dry taxonomy
  label. Good: "The Cache Vaults", "The Asymmetry Chasm", "Mirage of Acronyms".
  Bad: "KV Caching", "Section 3: Attention", "Lilian Weng Blog World".
- Pair the lore name with the plain technical term inside the blurb/lore/`domain`
  field so learners still recognize the topic at a glance.
- When enhancing existing content, rename boring titles to match (world `title`s
  live in `BUILTIN_WORLDS`; each carries a plain-language `domain` for clarity).
  World/region/concept **ids must never change** — saves key off ids.

## 2. Human-readable questions & lore

- Lore and question stems are written for humans: short paragraphs, `- ` bullet
  lists where structure helps, `**bold**` for the key term, appropriate length
  (lore ~90–150 words; stems complete scenarios, not fragments).
- The UI renders this via `src/RichText.jsx` (paragraphs / bullets / bold /
  inline code). Any new surface that displays lore or stems must render through
  `RichText`, not raw text.

## 3. Fair, untruncated answers

- The correct option must never be identifiable by length or specificity: all 4
  options are complete, similar-length, plausible sentences. No trailing "…",
  no cut-off options, no "the only option with numbers/examples" tells.
- Enforced at generation time by `QUALITY_RULES` + `balanceQuestion` /
  `keepFairQuestions`, and at render time by shuffling (`shuf4`). Never bypass
  these helpers when adding question paths.
- Never apply `text-overflow: ellipsis` (or slicing) to question stems, options,
  or lore in the UI.

## 4. Scaling: arcs consolidate case boards

- Worlds will grow; regions within a world are grouped into **arcs** (a short
  categorical chapter name) via the optional `arc` field on a region.
- Arc names follow the house style set by The Agentic RL Frontier:
  "Foundations of …", "The Craft of …", "The Way of …", "The Councils of …",
  "The Forge of …", "The Long Roads" — short, evocative, categorical. Live DKG
  regions get arcs from `DKG_ARC_RULES` in `src/dkgLiveSync.js`; extend those
  rules when new content categories appear.
- World identity: the builtin **The Agentic RL Frontier** is the RL/post-training
  world; the live-DKG **The Agentworks** is agent systems & production. Live
  macro worlds take lore titles from `DKG_WORLD_LORE` — titles matching a
  builtin world merge into it, so keep them in sync when renaming.
- The region list renders arc sections automatically whenever regions carry
  arcs; generated worlds with more than 4 regions must assign each region an
  arc (see `REGION_JSON_SPEC`). Use 2–4 arcs per world; arcs get lore names too.
- If a world outgrows its arcs, split it into a new world rather than exceeding
  ~5 regions per arc.

## 5. Walkthrough

- First run opens a guided walkthrough (`TOUR_STEPS` in `src/App.jsx`)
  explaining each tab and the reasoning behind it (Wilds = fresh lore-grounded
  episodes; Coach = telemetry-driven drill forging; Gauntlet = 3-life world
  exam; etc.). New top-level features must add a step there, and the tour stays
  re-openable from the HUD "?" button.

## 6. Mobile responsiveness

- Every new surface must work at 390px wide: use `S.grid(...)` for card lists,
  `clamp()` padding, the responsive classes in the `CSS` block (`.hudPet`,
  `.dexLabel`, `.hideSm`), and test at 390×844 before shipping.

## Design system quick reference

- Twilight-first glass aesthetic (see `THEMES`/`S`/`CSS` in `src/App.jsx`);
  graph hues in `src/uiTheme.js` are CVD-validated — re-run the dataviz palette
  validator if you change them.
- Graph surfaces: `src/ForceGraph.jsx` (engine), `src/AtlasGraph.jsx` (world
  atlas), `src/ConceptdexDrawer.jsx` (dex constellation drawer).
