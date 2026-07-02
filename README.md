# Edokai v3

Edokai is a gamified learning interface for people who want technical study to feel less like forcing themselves through a giant blog tab and more like moving across a game board looking for the next fight.

The original inspiration was Dragon Ball Z: Budokai 2: board layout, main-path encounters, optional side fights, and boss battles that make a world feel clearable. Edokai takes that shape and points it at learning. Instead of grinding capsules, the encounters are concepts. Instead of plain LeetCode repetition, the Dojo gives you coding katas, live tests, and a reason to keep going.

I started this because my self-prescribed ADHD makes the normal study flow hard. Long papers matter, but I bounce off them. Dense blogs are useful, but I rarely want to sit there passively reading. Plain LeetCode can be valuable, but it often feels mind-numbing: submit, pass, forget why I cared. This is an attempt to make the effort more directed and more playful without pretending the material is easy.

The app is now branded Edokai end-to-end: repo, browser title, desktop app name, DMG name, and in-app title screen.

## Twilight redesign

The UI got a full game-like overhaul inspired by polished stylized-world sites (Elysium-style): a twilight-first glass design system with aurora gradients, glow accents, and a Sora/JetBrains Mono type pairing; a daylight theme remains one toggle away.

- The placeholder three.js atlas is replaced by a smooth force-directed constellation (`src/ForceGraph.jsx` + `src/AtlasGraph.jsx`): worlds are glowing hubs sized by concept count, regions orbit as satellites, capture progress rings every node, dashed golden threads join worlds sharing sources, and the layout stays gently alive. Drag nodes, pan, zoom; click a world to focus, click again to enter.
- The Conceptdex is now a slide-in panel from the right (`src/ConceptdexDrawer.jsx`), available from every screen via the HUD 📖 Dex button (Esc closes). Each world renders as its own mini-constellation: captured concepts shine in their region's colour, undiscovered ones are ghost "?" stars, and the saved-question deck plus per-region field notes live below the graph.
- Graph node hues were chosen with a colour-vision-deficiency validator: all 8 world colours pass the all-pairs CVD separation target (ΔE ≥ 12) against the atlas sky, alongside direct labels on every node.
- Screens use the available real estate generously (1160px shell, responsive card grids for worlds/regions/katas, a wider 16:10 board) without crowding: one hero surface per screen, everything else in quiet glass panels.
- Persistent content rules (lore-appropriate naming, human-readable formatted lore, tell-free untruncated answers, arc-based scaling) live in `CLAUDE.md` and are embedded in the runtime generation prompts. Builtin worlds carry lore names now ("The Agentic Frontier", "The Attention Citadel", "The Dreaming Depths", "The Worldseer Observatory", "The Throughput Shogunate") with plain-language `domain` labels, and case boards group into lore-named arcs so worlds can absorb regions without sprawl.
- A first-run walkthrough explains every tab and why it exists (Wilds = fresh lore-grounded episodes, Coach = telemetry-forged drills, Gauntlet = the 3-life world exam …), re-openable from the HUD "?" button. Lore and questions render through `src/RichText.jsx` (paragraphs, bullets, bold), the Conceptdex constellation is bigger and condenses as you scroll into the list, and the whole app is verified down to 390px-wide screens.

The launch web version is live here:

https://sprightly-paprenjak-d963a0.netlify.app/

That site is the quickest way to try the current launch build: board worlds for concepts, the TorchLeet Dojo with runnable Python katas, per-world Trial Gauntlets, and the self-improving Coach loop that watches misses and forges targeted drills.

The built-in Claude generation path now uses a valid Claude Opus API route (`claude-opus-4-20250514`) or the hosted Claude bridge when available, so Deepen Lore, Wilds, coaching, imports, and review are real model calls instead of local fallbacks. You can still bring your own local/OpenAI-compatible model from Settings.

Launch polish added after the first public cut:
- Netlify function proxy for Claude generation so Deepen Lore/Wilds can run on the launch site with `ANTHROPIC_API_KEY` configured server-side

- dark mode for late-night study sessions
- an Agentic Workflows lab inside the Agents world covering post-training, agent workflows, planning research, eval rigor, inference optimization, cross-functional production, and AI field tracking
- bundled low-volume background music from `public/audio/dbz_songs.mp3` at 5% default volume
- Wilds now exposes world selection, uses the model path directly for fresh episodes, and filters generated options to remove “longest correct answer” tells
- Dojo coding problems now include kata-level lore, SWE test input/output cards, TODO-level lore, unlockable per-TODO hints, syntax-highlighted Python editors, tab completion in the editor/REPL, collapsible sections with SWE first, 75 Blind 75-style SWE drills, a TODO-guidance toggle for less-guided practice, and an XP penalty for hints after you have already made a run/review attempt


## v3 status

Edokai v3 is now in this repo as both:

- a source artifact: `edokai-v3.jsx`
- a complete Electron + Vite desktop project: `package.json`, `src/`, `electron/`, `index.html`, `vite.config.js`

The old `rollout-ultimate.jsx` file has also been updated with Edokai v3 branding so older links still point at the newest prototype.

Verified locally:

- main app file: 4,338 lines
- Vite production build: 518.65 kB JS bundle, 158.52 kB gzip
- macOS desktop package built with electron-builder
- mac artifact: `release/Edokai-3.0.0-arm64.dmg`

Note: the mac build is ad-hoc signed so the Electron bundle is internally valid, but it is not Developer ID signed or notarized because there is no Apple Developer ID signing identity on this machine. macOS may still show Gatekeeper warnings for the downloaded app.

## What changed in v3

### Per-world Conceptdex

The 📖 dex is no longer one giant global bucket. It now opens with world-selector chips, and each world has its own Conceptdex with its own capture count, organized by region.

That matters because the whole point of Edokai is map-shaped learning. A dex should answer: what did I capture in this world, not just what did I ever touch anywhere.

### New World Models content

There is now a World Models region called "The Imagination Engine" covering:

- latent world models and Dreamer-style imagined rollouts
- JEPA-style prediction in representation space, including I-JEPA / V-JEPA and the collapse problem
- LeJEPA and SIGReg, including the isotropic-Gaussian objective

There is also an honest acronym-disambiguation note baked into gameplay: GEPA is not a world model. It is DSPy's reflective prompt optimizer that happens to rhyme with JEPA. Instead of quietly dropping that confusion, v3 turns it into a side encounter called "Mirage of Acronyms" that drills the difference.

### Umbrella worlds

The 11 old flat worlds have been reorganized into 5 umbrella worlds, closer to the multi-region structure that Agentic RL already had:

1. Agents
   - Agentic Workflows lab first
   - the RL/post-training regions
   - orchestration content

2. Transformer Architecture
   - embeddings
   - attention
   - MoE
   - modern architectures

3. Generative Models
   - KL divergence
   - autoencoders
   - diffusion
   - dependency-ordered instead of random-topic ordered

4. Perception & World Models
   - VLMs
   - the new Imagination Engine region

5. LLM Systems & Serving
   - inference split into Cache Vaults and Throughput Works
   - new quantization, speculative decoding, and disaggregation concepts

### Question quality pass

Question quality got both a manual cleanup and a structural fix.

A regex audit found that 98 of 230 questions had the correct answer as the longest option. That made the quiz gameable in a bad way. I repaired this with roughly 190 hand edits: trimming verbose correct answers, lengthening thin distractors, and generally making the options less obviously patterned. The audit ended at 29 marginal cases, with gaps under about 16 characters.

Then v3 adds the more important structural fix: options are shuffled at render time. They reshuffle every question and every retry, so the answer position and any leftover length pattern cannot just be memorized.

Repetition is also structurally fixed: enemy HP now equals question count times damage. A battle should not recycle questions just because the enemy had too much HP.

### Interactive coding

The Dojo now has a live Code Lab powered by Pyodide: real Python + NumPy in the browser/desktop app.

Six katas support editable starter code, ▶ Run, and ✓ Run tests with assertions:

- self-attention
- MLP forward/backward
- attention backward, including numeric gradient checks in the tests
- Two Sum
- sliding window
- PagedAttention

Caveat: the claude.ai sandbox can sometimes block the Pyodide runtime CDN. The app falls back gracefully there. The desktop build runs the Code Lab without those sandbox CORS headaches.

### Comprehensiveness + self-improvement

Fixed nodes plus fixed questions can never be truly exhaustive, so v3 makes coverage grow.

Every answer feeds per-topic telemetry. The 🧪 Coach shows an accuracy table per concept and can forge new scenario drills targeting your weakest topics. Those drills join the per-world Trial Gauntlet.

The Trial Gauntlet gives you:

- 3 lives
- the entire world's question pool shuffled
- coach-forged drills included
- weakest-topic report at the end

In other words, self-improvement and comprehensiveness are one mechanism: the system teaches harder where you are weakest.

### Desktop executable/package

The zip provided for this update contained a complete Electron + Vite project. I integrated it into the repo and built the mac desktop package locally.

The app file in `src/App.jsx` is byte-identical to the provided v3 artifact. The desktop entry point adds a `window.storage` to `localStorage` shim so the artifact code can run as a normal desktop app.

Settings now includes an Anthropic API key field. That field is irrelevant inside claude.ai, but it powers generation, Coach, Paper Scout, PDF/URL import, and code review in the desktop app. Local Ollama / LM Studio / llama.cpp endpoints also work from the desktop app without the usual browser CORS gymnastics.

## Run from source

Requires Node.js and npm.

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal.

## Launch the desktop app locally

```bash
npm install
npm run start
```

`npm run start` builds the Vite app and launches Electron.

## Build installers

Installers should be built on the OS you are targeting.

On macOS:

```bash
npm install
npm run dist:mac
```

Output:

```text
release/Edokai-3.0.0-arm64.dmg
```

On Windows:

```bash
npm install
npm run dist:win
```

Expected output:

```text
release/Edokai Setup 3.0.0.exe
```

## First-run setup for generation features

Open ⚙️ Settings in the app.

For built-in Claude-powered generation outside claude.ai, paste an Anthropic API key. The default built-in model is Claude Opus 4.8 (`claude-opus-4-8`). This is needed for:

- world generation
- Coach drill generation
- Paper Scout
- PDF / URL import
- code review

For local models, point the custom endpoint at an OpenAI-compatible server:

- Ollama: `http://localhost:11434/v1`
- LM Studio: `http://localhost:1234/v1`
- llama.cpp server: `http://localhost:8080/v1`

The desktop app avoids the browser sandbox issues that made local endpoints annoying in web-only prototypes.

## Project layout

```text
.
├── electron/main.cjs              # Electron shell
├── src/App.jsx                    # Edokai v3 app
├── src/main.jsx                   # React entry + storage shim
├── edokai-v3.jsx           # standalone v3 artifact
├── rollout-ultimate.jsx           # compatibility copy, updated to v3
├── package.json                   # Vite/Electron scripts
├── vite.config.js
└── release/Edokai-3.0.0-arm64.dmg
```

## Prototype notes

This is still very much an exploratory prototype. The gameplay loop exists, but future cleanup should probably include:

- splitting the large app file into components and content modules
- adding automated tests for board progression, question shuffling, telemetry, and gauntlets
- improving keyboard navigation and accessibility
- adding icons/signing/notarization for the desktop release
- expanding the MLE interview and systems-design kata library

## License

Apache-2.0. See `LICENSE`.

## Release candidate

The macOS DMG is packaged as a GitHub release candidate. Download the attached `Edokai-3.0.0-arm64.dmg` from the latest prerelease on GitHub.

Important macOS Gatekeeper note: Edokai is ad-hoc signed but not Apple Developer ID signed/notarized yet. On some macOS versions, a browser-downloaded DMG can still produce the misleading "app is damaged/broken and should be moved to Trash" dialog before Privacy & Security offers an unblock button. That is Gatekeeper quarantine behavior for an unnotarized app, not a failed DMG checksum.

The next iterative release candidate is **v3.3.0** — the twilight redesign build (force-directed atlas, Conceptdex drawer, spotlight walkthrough, lore arcs and case names, combined battle page, untruncated tell-free answers). Build it on macOS with `npm install && npm run dist:mac` → `release/Edokai-3.3.0-arm64.dmg`.

For the previous RC, use `Edokai-3.0.0-arm64-installer.dmg`. It packages Edokai.app together with an `Install Edokai.command` helper. Open the DMG, then run the helper instead of launching the app directly from the DMG. The helper copies Edokai to `/Applications`, strips the quarantine xattr from the installed copy, verifies the local code signature, and opens the app.

If macOS blocks the helper too, Control-click `Install Edokai.command` and choose Open. You can also use the terminal-only helper attached to the release:

```bash
curl -L https://github.com/junaidahmed361/edokai/releases/download/v3.0.0-rc.4/install-edokai-macos.sh | bash
```

If you installed a previous RC manually, delete `/Applications/Edokai.app` first or let the helper replace it.

A fully normal double-click install requires Apple Developer ID signing and notarization.

