# Edokai

Edokai is a small experiment in making hard learning material feel less like homework and more like wandering around a game board looking for the next fight.

The original vibe in my head was Dragon Ball Z: Budokai 2: a board layout, a main route with boss encounters, little side encounters off the path, and that feeling of slowly clearing a world instead of staring at a giant wall of text. But instead of grinding capsules or beating up Cell for the tenth time, the enemies here are concepts: agentic RL, attention, KL divergence, diffusion, inference systems, model architectures, and all the other stuff I keep wanting to understand without forcing myself through another endless blog post.

I called it Edokai because the pitch is basically: Budokai, but for education.

## Why this exists

I have a self-prescribed ADHD problem with learning technical material the normal way.

Long papers are important, but my brain bounces off them. Huge blogs are useful, but only if I can actually stay with them. Plain LeetCode is valuable, but a lot of the time it feels mind-numbing: solve the box, submit, move on, forget why I cared.

Edokai is an attempt to turn that loop into something with a little friction, reward, and play:

- concepts become "critical encounters"
- deeper checks become boss/gym battles
- side encounters reinforce what you just learned instead of letting it evaporate
- XP, HP, badges, captured concepts, and progress tracking give the session a shape
- implementation katas make the learning code-first instead of just read-and-nod
- paper/blog/PDF ingestion can turn outside material into a new mini-world

This is not trying to make learning effortless. The point is to make effort feel directed. If I am going to struggle with a dense topic anyway, I would rather struggle through a map, a duel, a dojo, and a boss fight than through a blank tab and vibes.

## What is in this repo right now

The main prototype is `rollout-ultimate.jsx`.

It is a single-file React app prototype currently titled "Rollout World" in the UI. Edokai is the repo/project name and the broader idea around it.

The file includes:

- a Budokai-style board map for learning worlds
- critical concept encounters with lore and multiple-choice battles
- side duels for reinforcement and prerequisite checks
- gym/boss battles that unlock badges
- XP, HP, captured concepts, side clears, kata progress, and local save state
- a small WebAudio chiptune music engine, no external audio assets needed
- a "Bring your own resource" flow for URLs, PDFs, pasted text, or concept names
- built-in model routing for Claude plus OpenAI-compatible local endpoints like Ollama, LM Studio, and llama.cpp
- a Paper Scout flow for finding papers and turning them into study worlds
- a Dojo with guided implementation katas and code review

The built-in learning content currently covers Agentic RL in the most detail, plus atlas-style worlds for topics like diffusion models, VLMs, mixture of experts, orchestration, embeddings, attention, inference systems, autoencoders, KL divergence, and LLM architectures.

The Dojo includes examples such as self-attention from scratch, transformer blocks, Flash/PagedAttention-style systems ideas, LoRA, training loops, Blind 75-style coding, and LLM inference server design.

## How I imagine using it

A normal study session should feel more like this:

1. Pick a world.
2. Walk the board.
3. Read just enough lore to fight the current concept.
4. Answer questions and take damage if I am hand-waving.
5. Clear the main route.
6. Hit side duels to reinforce the stuff I am likely to forget.
7. Fight the boss/gym once the core concepts are captured.
8. Jump into the Dojo when the topic needs implementation, not just recognition.

The important part is that the interface gives me a reason to continue without pretending that learning is just "consume content until enlightened."

## Running the prototype

This repo currently ships the prototype as a single React component file. The quickest way to play with it is to drop it into a Vite React app as the app component.

Example:

```bash
npm create vite@latest edokai-playground -- --template react
cd edokai-playground
cp /path/to/rollout-ultimate.jsx src/App.jsx
npm install
npm run dev
```

Then open the local Vite URL.

If you use a local model endpoint for generation or review, make sure it is OpenAI-compatible and has browser CORS enabled. For Ollama, that usually means starting it with an origin that allows the dev server.

## Notes on the prototype

This is intentionally rough and exploratory.

The current app is packed into one big JSX file because the priority was to get the interaction loop into existence: map, encounters, retention, katas, generation, and save state. A later pass should split it into real components, move the world/kata content into data files, and wire up a cleaner app scaffold.

Things I would like to improve next:

- rename the in-app branding from Rollout World to Edokai
- split the single-file prototype into components and content modules
- add a proper Vite/React project scaffold
- add tests for board progression and battle state
- make the generated worlds easier to export/import
- improve accessibility and keyboard navigation
- tune the question generation rules so distractors stay fair
- add more code-first MLE interview and systems katas

## License

Apache-2.0. See `LICENSE`.
