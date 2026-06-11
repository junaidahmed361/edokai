# Edokai v3

Edokai is a gamified learning interface for people who want technical study to feel less like forcing themselves through a giant blog tab and more like moving across a game board looking for the next fight.

The original inspiration was Dragon Ball Z: Budokai 2: board layout, main-path encounters, optional side fights, and boss battles that make a world feel clearable. Edokai takes that shape and points it at learning. Instead of grinding capsules, the encounters are concepts. Instead of plain LeetCode repetition, the Dojo gives you coding katas, live tests, and a reason to keep going.

I started this because my self-prescribed ADHD makes the normal study flow hard. Long papers matter, but I bounce off them. Dense blogs are useful, but I rarely want to sit there passively reading. Plain LeetCode can be valuable, but it often feels mind-numbing: submit, pass, forget why I cared. This is an attempt to make the effort more directed and more playful without pretending the material is easy.

The app is now branded Edokai end-to-end: repo, browser title, desktop app name, DMG name, and in-app title screen.

## v3 status

Edokai v3 is now in this repo as both:

- a source artifact: `edokai-v3.jsx`
- a complete Electron + Vite desktop project: `package.json`, `src/`, `electron/`, `index.html`, `vite.config.js`

The old `rollout-ultimate.jsx` file has also been updated with Edokai v3 branding so older links still point at the newest prototype.

Verified locally:

- main app file: 2,860 lines
- Vite production build: 375.83 kB JS bundle, 127.26 kB gzip
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

1. Agentic RL & Agent Systems
   - the 6 RL regions
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

For built-in Claude-powered generation outside claude.ai, paste an Anthropic API key. This is needed for:

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

The macOS DMG is packaged as a GitHub release candidate. Download the attached `Edokai-3.0.0-arm64.dmg` from the latest `v3.0.0-rc.1` prerelease on GitHub.

