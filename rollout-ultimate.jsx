import React, { useState, useEffect, useRef } from "react";

/* ============================================================
   ROLLOUT WORLD — ULTIMATE EDITION
   Two modes:
   🌍 LEARN — Budokai-style board worlds. Criticals teach, sides
      drill retention (with recommended level + prereq lore).
   ⌨️ DOJO — implementation katas: attention, LoRA, training
      loops, Blind-75 ties, system design. PyTorch/NumPy/JAX.
   Bring your own model (Claude built-in, or any OpenAI-compatible
   endpoint: Ollama, LM Studio, llama.cpp, cloud). Bring your own
   resource (URL, PDF, pasted text, or just a concept name).
   ============================================================ */

const T = {
  paper: "#EBEFF6", card: "#FFFFFF", ink: "#1B2440", inkSoft: "#5A6480",
  line: "#D4DAE8", reward: "#1F9D6B", rewardSoft: "#E2F4EC",
  penalty: "#D9534F", penaltySoft: "#FBE9E8", action: "#E8643F",
  explore: "#5B4FD6", exploreSoft: "#ECEAFB", gold: "#C99A2C", night: "#232B47",
  code: "#141A2E", codeText: "#D6DEF5",
};

/* ============================================================
   MUSIC ENGINE — generative lo-fi chiptune (WebAudio, no assets)
   ============================================================ */
class MusicEngine {
  constructor() { this.ctx = null; this.playing = false; this.timer = null; this.step = 0; }
  start() {
    if (this.playing) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.playing = true;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.16; this.master.connect(this.ctx.destination);
      const lead = [0, 3, 5, 7, 10, 7, 5, 3];     // minor pentatonic steps
      const bass = [0, 0, -5, -5, -7, -7, -5, -5];
      const base = 220; // A3
      const f = (semi) => base * Math.pow(2, semi / 12);
      const bpm = 92, spb = 60 / bpm / 2; // eighth notes
      this.timer = setInterval(() => {
        if (!this.playing) return;
        const t = this.ctx.currentTime + 0.05;
        const i = this.step % 8;
        // lead (triangle, gentle)
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = "triangle"; o.frequency.value = f(lead[i] + (Math.floor(this.step / 8) % 2 ? 12 : 7));
        g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.9);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + spb);
        // bass every other step (sine)
        if (i % 2 === 0) {
          const ob = this.ctx.createOscillator(), gb = this.ctx.createGain();
          ob.type = "sine"; ob.frequency.value = f(bass[i]) / 2;
          gb.gain.setValueAtTime(0.0, t); gb.gain.linearRampToValueAtTime(0.55, t + 0.03); gb.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.8);
          ob.connect(gb); gb.connect(this.master); ob.start(t); ob.stop(t + spb * 2);
        }
        // soft hat (noise-ish via high square blip)
        if (i % 2 === 1) {
          const oh = this.ctx.createOscillator(), gh = this.ctx.createGain();
          oh.type = "square"; oh.frequency.value = 6000 + Math.random() * 1500;
          gh.gain.setValueAtTime(0.03, t); gh.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          oh.connect(gh); gh.connect(this.master); oh.start(t); oh.stop(t + 0.05);
        }
        this.step++;
      }, spb * 1000);
    } catch (e) { console.error("audio", e); this.playing = false; }
  }
  stop() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.master) { try { this.master.disconnect(); } catch (e) {} }
  }
}
const music = new MusicEngine();

/* ============================================================
   MODEL ROUTING — built-in Claude or any OpenAI-compatible API
   (Ollama: http://localhost:11434/v1 · LM Studio: :1234/v1 ·
    llama.cpp server: :8080/v1 · or a cloud base URL + key)
   ============================================================ */
async function askModel(prompt, cfg, opts = {}) {
  const { needsWeb = false, pdfBase64 = null } = opts;
  if (!cfg || cfg.provider === "builtin") {
    const content = pdfBase64
      ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } }, { type: "text", text: prompt }]
      : prompt;
    const body = {
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      messages: [{ role: "user", content }],
    };
    if (needsWeb) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  // custom OpenAI-compatible endpoint
  if (needsWeb) throw new Error("WEB_NEEDED");
  if (pdfBase64) throw new Error("PDF_NEEDS_BUILTIN");
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  const res = await fetch(cfg.baseUrl.replace(/\/$/, "") + "/chat/completions", {
    method: "POST", headers,
    body: JSON.stringify({ model: cfg.model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Endpoint error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("no json");
  return JSON.parse(clean.slice(s, e + 1));
}

const QUALITY_RULES = `CRITICAL QUALITY RULES for questions: all 4 options similar length (within ~5 words); the correct option must NOT be the longest; distractors technically plausible; vary "a" (0-3) across questions.`;

async function scanUrl(url, cfg) {
  return parseJSON(await askModel(
    `Read the content at this URL (use web search): ${url}\nIdentify the title and 3-6 main learnable sections.\nRespond ONLY raw JSON: {"title":"...","sections":["...","..."]}`, cfg, { needsWeb: true }));
}
async function scanText(text, cfg) {
  return parseJSON(await askModel(
    `Here is learning material:\n"""${text.slice(0, 6000)}"""\nIdentify a title and 3-6 main learnable sections.\nRespond ONLY raw JSON: {"title":"...","sections":["...","..."]}`, cfg));
}
async function scanPdf(b64, cfg) {
  return parseJSON(await askModel(
    `Identify this document's title and 3-6 main learnable sections.\nRespond ONLY raw JSON: {"title":"...","sections":["...","..."]}`, cfg, { pdfBase64: b64 }));
}
async function findResource(concept, cfg) {
  return parseJSON(await askModel(
    `Find the single best free online resource (article/primer/docs) with optimal coverage for learning: "${concept}". Use web search.\nRespond ONLY raw JSON: {"title":"...","url":"...","sections":["3-6 main learnable sections of that resource"]}`, cfg, { needsWeb: true }));
}
const REGION_JSON_SPEC = `{"npcText":"40-word NPC summary of the key principle","concepts":[{"name":"...","sprite":"emoji","lore":"dense 60-80 word teaching of intricate details","questions":[{"q":"...","options":["...","...","...","..."],"a":0,"why":"one line"},{...}]}],"side":{"name":"creature name","sprite":"emoji","recLevel":2,"questions":[{"q":"SCENARIO: applied real-world scenario","options":[4 options],"a":0,"why":"..."},{...}]}}
Exactly 2 concepts (2 questions each) + 1 side (2 scenario questions). ${QUALITY_RULES}`;

async function buildRegionFrom(sourceDesc, section, idx, cfg, pdfB64) {
  const prompt = pdfB64
    ? `From this document's section "${section}", build RPG learning content. Respond ONLY raw JSON:\n${REGION_JSON_SPEC}`
    : `Read ${sourceDesc}, section "${section}"${cfg && cfg.provider !== "builtin" ? "" : " (use web search)"}. Build RPG learning content. Respond ONLY raw JSON:\n${REGION_JSON_SPEC}`;
  const parsed = parseJSON(await askModel(prompt, cfg, { needsWeb: !pdfB64 && (!cfg || cfg.provider === "builtin"), pdfBase64: pdfB64 }));
  const concepts = (parsed.concepts || []).map((c, i) => ({ ...c, id: `g${idx}c${i}` }));
  const sides = parsed.side ? [{ ...parsed.side, id: `g${idx}s0`, anchor: 1, prereqs: concepts.map((c) => c.id), recLevel: parsed.side.recLevel || 2, desc: "A generated reinforcement duel." }] : [];
  return {
    id: `gr${idx}`, name: section, emoji: "🌀", intro: `Generated region: ${section}`,
    npc: { name: "The Archivist", text: parsed.npcText || "Study this region's concepts carefully." },
    concepts, sides,
    gym: { leader: "Region Warden", badge: `${section} Badge`, sprite: "🏛️", taunt: "Prove you absorbed everything in this region!", questions: concepts.flatMap((c) => c.questions || []).slice(0, 4) },
  };
}
async function buildKataFrom(sourceDesc, cfg, pdfB64) {
  const prompt = `${pdfB64 ? "From this document" : "Read " + sourceDesc + (cfg && cfg.provider !== "builtin" ? "" : " (use web search)")}, design ONE hands-on implementation kata for its core method. Respond ONLY raw JSON:
{"title":"Implement <method>","blurb":"40 words on what gets built","frameworks":["pytorch"],"steps":[{"prompt":"step instruction referencing the code","code":"short python snippet with ____ blank","options":["...","...","...","..."],"a":0,"why":"one line"},{...},{...}],"solution":"complete commented reference implementation, <60 lines"}
Exactly 3 steps. ${QUALITY_RULES}`;
  const parsed = parseJSON(await askModel(prompt, cfg, { needsWeb: !pdfB64 && (!cfg || cfg.provider === "builtin"), pdfBase64: pdfB64 }));
  return { id: "uk" + Date.now(), family: "custom", title: parsed.title || "Custom kata", blurb: parsed.blurb || "", frameworks: parsed.frameworks || ["pytorch"], steps: parsed.steps || [], solutions: { pytorch: parsed.solution || "" }, links: [] };
}
async function fetchPapers(topic, cfg) {
  return parseJSON(await askModel(
    `Search the web for the 5 most notable/recent ML papers about "${topic}" (arXiv, Hugging Face Papers — note: Papers with Code was sunset in 2025, do not cite it). Respond ONLY raw JSON:
{"papers":[{"title":"...","summary":"25-word plain-language summary","venue":"arXiv id or venue","url":"..."}]}`, cfg, { needsWeb: true }));
}
async function reviewCode(kataTitle, framework, code, cfg) {
  return askModel(
    `You are a strict but encouraging ML code reviewer. The learner attempted the kata "${kataTitle}" in ${framework}. Review their code: correctness first (shapes, math, gradients, edge cases), then style. Give a grade out of 10, the top 3 issues, and one concrete improvement. Be concise (<200 words).\n\nCODE:\n${code.slice(0, 5000)}`, cfg);
}

/* ============================================================
   STORAGE
   ============================================================ */
async function loadStore(key, fb) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; }
}
async function saveStore(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch (e) { console.error("storage", e); }
}

/* ============================================================
   CONTENT — WORLD 1: AGENTIC RL (6 regions, full primer)
   Sides carry recLevel + prereqs (concept ids) for optimal
   retention, and some carry code walkthroughs.
   ============================================================ */
const RL_REGIONS = [
  {
    id: "fields", name: "Foundation Fields", emoji: "🌾",
    intro: "The raw mathematics of decision-making.",
    npc: { name: "Professor Bellman", text: "An MDP is the tuple (S, A, P, R, γ). The agent's whole life is maximizing J(π) = E[Σ γᵗ·R(sₜ,aₜ)] — expected discounted return. Everything ahead is built on that one equation." },
    concepts: [
      { id: "mdp", name: "MDP", sprite: "🎲",
        lore: "The Markov Decision Process is the formal arena of RL: a tuple (S, A, P, R, γ). S is every state the world can be in; A is every action available; P(s′|s,a) says how the world changes when you act; R(s,a) is the feedback signal; γ ∈ [0,1] discounts the future. The Markov property means the current state contains everything needed to decide. For LLM agents, the 'state' is the serialized context: user query, reasoning so far, past tool calls and their outputs.",
        questions: [
          { q: "In the MDP tuple, what does P(s′|s,a) represent?", options: ["The environment's transition dynamics", "The agent's action-selection policy", "The reward attached to reaching s′", "The discount applied to future states"], a: 0, why: "P is how the world changes when you act — the environment's side, not the agent's." },
          { q: "For a tool-calling LLM agent, the state sₜ is…", options: ["the model's current weight values", "the single most recent output token", "the full serialized context and tool history", "the list of available tool schemas only"], a: 2, why: "State = query + reasoning + past tool calls and outputs, serialized into the prompt." },
          { q: "The Markov property guarantees that…", options: ["rewards are always positive", "the current state suffices for deciding", "transitions are fully deterministic", "the episode ends in finite steps"], a: 1, why: "No hidden history needed — sₜ carries everything decision-relevant." },
        ] },
      { id: "policy", name: "Policy & Return", sprite: "🧭",
        lore: "The policy π(a|s) is the agent's brain: a probability distribution over actions given state. Training never edits the world — it edits π. The objective is the expected return J(π) = E[Σₜ γᵗ R(sₜ,aₜ)]. The discount γ shapes temperament: γ→1 makes a far-sighted planner; γ→0 makes a greedy reflex machine. RL is distinct from supervised learning because no labels exist — the agent must act, observe consequences, and adapt.",
        questions: [
          { q: "Raising γ from 0.5 toward 0.99 makes the agent…", options: ["explore far less of the state space", "ignore everything past the next step", "act with much higher randomness", "weigh distant rewards far more heavily"], a: 3, why: "γᵗ decays slower, so far-future rewards keep real weight — patience emerges." },
          { q: "RL differs from supervised learning because…", options: ["no correct labels exist, only consequences", "it requires far larger neural networks", "it cannot use gradient-based optimization", "it never evaluates on held-out data"], a: 0, why: "Act, observe reward, adapt — the label never exists." },
        ] },
      { id: "explore", name: "Exploration", sprite: "🔦",
        lore: "Rewards must be discovered, creating RL's deepest tension: exploit the best-known action, or explore in case something better hides. Pure exploitation locks into mediocre habits; pure exploration never banks a win. For LLM agents the action space is astronomically large — every possible token sequence — so unguided exploration is hopeless. This is why systems warm-start with imitation (SFT) before RL: it collapses the search space to sane behavior so exploration refines instead of flailing.",
        questions: [
          { q: "Exploration from a randomly-initialized LLM policy fails because…", options: ["the GPU memory required is too large", "valid useful actions are almost never sampled", "rewards cannot be computed for text", "the discount factor becomes undefined"], a: 1, why: "Random token sequences essentially never form valid tool calls — zero signal." },
          { q: "A pure-exploitation agent's characteristic failure:", options: ["it spends all compute on simulation", "it produces malformed actions constantly", "it never banks any reward at all", "it locks into a suboptimal habit forever"], a: 3, why: "Without exploration, better actions stay invisible — the local optimum trap." },
        ] },
      { id: "advantage", name: "Value & Advantage", sprite: "📈",
        lore: "The value function V(s) estimates expected future return from a state; the advantage A(s,a) = how much better a specific action was than expected: actual return minus baseline V(s). Advantages are the currency of policy-gradient training: positive → make that action more likely; negative → less. GAE blends multi-step returns to trade bias against variance. In PPO a learned value network supplies the baseline; GRPO replaces it with the group's mean reward.",
        questions: [
          { q: "Advantage A(s,a) measures…", options: ["the action's return relative to expectation", "the raw reward emitted by the environment", "the policy's entropy at that state", "the distance to the goal state"], a: 0, why: "Surprise relative to the baseline V(s) — centered signal, not absolute reward." },
          { q: "An action with negative advantage should become…", options: ["the new deterministic default", "less probable under the policy", "the baseline for future actions", "exempt from gradient updates"], a: 1, why: "Worse than expected → push its probability down. That's the policy gradient." },
        ] },
    ],
    sides: [
      { id: "s-gamma", name: "Bandit Gamma", sprite: "🦝", anchor: 1, recLevel: 1, prereqs: ["mdp", "policy"],
        desc: "Tests whether you can actually TUNE the math you just learned.",
        questions: [
          { q: "SCENARIO: A trading agent's position today pays off in 60 steps. Training stalls. First suspect?", options: ["γ set too low — the payoff discounts to near zero", "Too many states in the environment", "The reward is accidentally positive", "Batch size is one step too small"], a: 0, why: "0.9⁶⁰ ≈ 0.002 — the future payoff barely registers. Raise γ for long horizons." },
          { q: "SCENARIO: A clinical agent can interrupt a doctor now (small cost) to prevent a likely error in 20 minutes (big payoff). Which agent intervenes?", options: ["The γ ≈ 0 agent, acting on reflex", "Neither — RL can't trade off costs", "The γ ≈ 0.99 agent, valuing the future", "Both behave identically here"], a: 2, why: "High γ keeps the distant prevented-error reward valuable enough to outweigh the cost." },
          { q: "SCENARIO: Your agent found one decent strategy and repeats it forever. Standard countermeasure?", options: ["lowering the learning rate to zero", "maintaining exploration (e.g., entropy bonus)", "removing the reward baseline", "shortening every episode to one step"], a: 1, why: "Exploitation lock-in is broken by keeping exploration pressure alive." },
        ] },
      { id: "s-baseline", name: "Baseline Wisp", sprite: "👻", anchor: 3, recLevel: 2, prereqs: ["advantage"],
        desc: "Haunts trainers who confuse rewards with advantages.",
        code: `# advantage in five lines
returns = compute_returns(rewards, gamma)   # discounted sums
values  = value_net(states)                 # baseline V(s)
adv     = returns - values                  # surprise!
adv     = (adv - adv.mean()) / (adv.std() + 1e-8)
loss    = -(logprobs * adv.detach()).mean() # policy gradient`,
        codeNote: "The policy-gradient core: every scenario below happens inside these five lines.",
        questions: [
          { q: "SCENARIO: Two actions both earned +50, but V(s) predicted +80 and +20 respectively. The gradient pushes…", options: ["both actions up equally hard", "both actions down equally hard", "the first up, the second down", "the first down, the second up"], a: 3, why: "Advantages: 50−80 = −30 (push down); 50−20 = +30 (push up)." },
          { q: "SCENARIO: In the code above, why .detach() on adv?", options: ["it frees GPU memory between steps", "gradients must not flow into the critic here", "it converts the tensor to numpy", "it normalizes the advantage scale"], a: 1, why: "The policy loss should move the policy only; the critic trains on its own MSE loss." },
        ] },
    ],
    gym: {
      leader: "Professor Bellman", badge: "Foundation Badge", sprite: "🏛️",
      taunt: "Show me you've internalized the loop itself!",
      questions: [
        { q: "Order the RL loop correctly:", options: ["reward → update → action → state", "state → action → reward+next state → update", "update → state → reward → action", "action → state → update → reward"], a: 1, why: "Observe, act, get consequence, learn. That loop IS reinforcement learning." },
        { q: "+5 now vs +100 in 50 steps, γ = 0.9 (0.9⁵⁰ ≈ 0.005). The agent takes…", options: ["the +5: the +100 discounts to ≈0.5", "the +100: bigger raw value wins", "neither: both discount to zero", "both: rewards stack across branches"], a: 0, why: "100 × 0.005 ≈ 0.5 < 5 — γ shapes patience." },
        { q: "Which pairing is WRONG?", options: ["π(a|s) — the agent's behavior", "V(s) — expected future return", "γ — transition probability", "A(s,a) — return vs baseline"], a: 2, why: "γ is the discount factor. Transitions are P(s′|s,a)." },
      ] },
  },
  {
    id: "village", name: "Imitation Village", emoji: "🏘️",
    intro: "Agents learn by copying — and discover copying isn't enough.",
    npc: { name: "Elder Clone", text: "SFT is behavior cloning: L_SFT(θ) = −Σ log p_θ(aₜᵉˣᵖᵉʳᵗ|sₜ). Maximize the likelihood of the expert's action at every state. Notice what's absent from that loss: outcomes. That absence is everything." },
    concepts: [
      { id: "bc", name: "Behavior Cloning", sprite: "🪞",
        lore: "Imitation learning trains a policy by directly copying expert actions — no rewards, no exploration, no environment. Given demonstrations of (state, action) pairs, it maximizes the likelihood of the expert's action at each state: L = −Σ log p_θ(aᵉˣᵖᵉʳᵗ|s). SFT on tool-call traces is exactly this — behavior cloning. It teaches what tool calls look like: syntax, schemas, argument shapes, answer formatting, and rough human patterns of tool use.",
        questions: [
          { q: "SFT's loss depends on which quantities?", options: ["States, actions, and received rewards", "States and expert actions only", "Rewards and future states only", "Tool outputs and final answers"], a: 1, why: "Pure likelihood of demonstrations — outcomes are structurally absent." },
          { q: "SFT reliably teaches which competency?", options: ["Cost-aware timing of tool calls", "Recovery from execution failures", "Valid tool-call syntax and schemas", "Optimal stopping in long pipelines"], a: 2, why: "Form, not decisions: JSON shape, schemas, formatting patterns." },
        ] },
      { id: "sftfails", name: "SFT's Blind Spots", sprite: "🕳️",
        lore: "SFT cannot: decide WHEN (it never sees the cost of calling or of not calling); choose WHICH among tools (it replicates demo choices without learning trade-offs); use execution feedback (tool success/failure never reaches the loss); handle multi-step workflows and stopping (demos have fixed lengths); penalize over-use or under-use; generalize past the demonstration distribution; or optimize multi-component objectives — one monolithic loss can't separately punish timing vs selection vs argument errors.",
        questions: [
          { q: "An SFT-only model calls the weather API on 'define photosynthesis'. Root cause?", options: ["Cost signals can't enter SFT's loss", "The training set was far too small", "Weather data corrupts embeddings", "The discount factor was set too low"], a: 0, why: "Over-calling is a consequence problem; the likelihood loss has nowhere to encode cost." },
          { q: "SFT struggles with multi-step workflows because…", options: ["attention cannot span multiple calls", "JSON grows too long to tokenize", "demos have fixed lengths, so stopping isn't learned", "tools reject repeated invocations"], a: 2, why: "'Enough info — ANSWER now' is a policy decision RL learns via episodic returns." },
        ] },
      { id: "warmstart", name: "Warm-Start", sprite: "🔥",
        lore: "Why SFT before RL, always? RL from random init over raw text collapses: malformed JSON everywhere, runaway tool-call loops, zero successful episodes, noisy gradients, degenerate policies. SFT anchors the policy with baseline competencies — tool syntax literacy, a heuristic when/which/how prior, drastically reduced exploration burden — so early RL is stable. Imitation provides competence, then RL provides policy mastery. Skipping the warm-start doesn't make training purer; it makes it impossible.",
        questions: [
          { q: "Which is NOT a listed failure of RL-from-scratch on text?", options: ["Runaway tool-call loops", "An excess of valid JSON output", "Zero successful early episodes", "Degenerate collapsed policies"], a: 1, why: "The problem is the opposite — random policies almost never emit valid JSON." },
          { q: "SFT helps subsequent RL chiefly by…", options: ["shrinking the effective search space", "eliminating the reward function", "freezing the value network early", "guaranteeing positive advantages"], a: 0, why: "A sane prior means correct calls get sampled often enough to learn from." },
        ] },
    ],
    sides: [
      { id: "s-debug", name: "Copycat Golem", sprite: "🗿", anchor: 1, recLevel: 2, prereqs: ["bc", "sftfails"],
        desc: "Built entirely from demonstrations. Diagnose its malfunctions.",
        questions: [
          { q: "SCENARIO: An SFT clinical agent formats lab-lookup calls perfectly but fires them on 'good morning'. 10× more demos helps a little; novel phrasings still trigger calls. Why?", options: ["The model is too small for the task", "Greetings are out-of-vocabulary tokens", "Lab tools have ambiguous schemas", "WHEN is a consequence decision SFT can't optimize"], a: 3, why: "Demos patch the seen distribution; only cost-bearing reward teaches restraint that generalizes." },
          { q: "SCENARIO: A new FHIR API has a schema unseen in training. SFT model's calls fail and never improve. Missing ingredient?", options: ["execution feedback flowing into learning", "a larger demonstration dataset", "a longer context window", "lower sampling temperature"], a: 0, why: "SFT can't use tool success/failure; RL turns outcomes into adaptation." },
          { q: "SCENARIO: Budget for ONE training stage on a new tool-use task, zero existing competence. Choose:", options: ["RL alone — exploration finds syntax", "SFT alone — RL would collapse without it", "either works equally well", "neither; prompting suffices"], a: 1, why: "RL at random init produces no valid episodes. Competence first." },
        ] },
      { id: "s-retain1", name: "Echo of the Fields", sprite: "🌀", anchor: 2, recLevel: 2, prereqs: ["mdp", "bc"],
        desc: "Tests whether Foundation Fields stuck.",
        questions: [
          { q: "RETENTION: In MDP terms, what does behavior cloning ignore?", options: ["The state space S", "The action space A", "P, R, and γ — dynamics, rewards, the future", "The existence of a policy π"], a: 2, why: "Cloning keeps (s,a) pairs and discards the entire consequence machinery." },
          { q: "RETENTION: Why does exploration become tractable after SFT?", options: ["The reward function becomes denser", "Sampling concentrates near valid behaviors", "Advantages are guaranteed positive", "The MDP's horizon becomes shorter"], a: 1, why: "The prior collapses the search space — same exploration concept from the Fields." },
        ] },
    ],
    gym: {
      leader: "Elder Clone", badge: "Imitation Badge", sprite: "🏛️",
      taunt: "Prove you know why copying alone would have doomed you!",
      questions: [
        { q: "Which term would the SFT loss need for cost-aware timing — and lacks?", options: ["A dependence on action outcomes", "A log-likelihood over tokens", "A sum across trajectory steps", "A parameter vector θ"], a: 0, why: "States and expert actions only; consequences are structurally absent." },
        { q: "The pipeline SFT → RL works because…", options: ["each stage covers the other's weakness", "RL is cheaper after SFT converges", "SFT prevents all reward hacking", "RL cannot run without a value net"], a: 0, why: "Imitation gives stability and competence; RL optimizes what imitation can't express." },
        { q: "Even with infinite perfect demos, which problem persists?", options: ["Malformed JSON output", "Answer formatting errors", "Adapting to tools unseen in demos", "Learning what calls look like"], a: 2, why: "SFT overfits the demo distribution; adaptation needs exploration + returns." },
      ] },
  },
  {
    id: "forest", name: "Tool-Calling Forest", emoji: "🌲",
    intro: "Three trails: WHEN, WHICH, HOW.",
    npc: { name: "Ranger ReAct", text: "Every tool decision factors into WHEN (call or answer?), WHICH (which tool?), and HOW (valid, correct arguments). ToolRL and ReTool proved decomposed rewards along these axes stabilize RL — reward tells the model WHICH sub-skill failed." },
    concepts: [
      { id: "when", name: "WHEN", sprite: "⏱️",
        lore: "The timing decision: is a tool invocation necessary, optional, or wasteful right here? Over-calling burns cost and latency; under-calling degrades correctness. It's a policy decision that must be explicitly learned and rewarded. Supervision: rule-based intent detectors (math → calculator; 'define X' → no tool; factual → search), a discriminative classifier predicting P(call needed), or a generative LLM-judge asked 'should the agent call a tool here?' converted to scalar reward.",
        questions: [
          { q: "User asks 'explain what recursion means'. Optimal WHEN decision:", options: ["CALL search to verify the definition", "CALL calculator for the base case", "ANSWER directly — no tool needed", "CALL both, then merge results"], a: 2, why: "Definitional queries → no tool. Calling here is penalized over-use." },
          { q: "The three supervision sources for the WHEN reward:", options: ["SGD, Adam, and RMSProp variants", "rules, discriminative models, LLM judges", "temperature, top-p, and top-k tuning", "unit tests, linters, and type checkers"], a: 1, why: "Every reward component can be scored by rules, discriminators, or judges." },
        ] },
      { id: "which", name: "WHICH", sprite: "🔀",
        lore: "Given a call will happen, selection among the library is classification over a structured action space. SFT only echoes demo choices; RL teaches discrimination via negative reward for wrong picks. Supervision: rules mapping task types to tools (+r match, −r otherwise), a discriminative model f(s,a) judging whether the choice matches human expectation, or a judge prompt — 'was TOOL_X the best choice here?' — scored and normalized.",
        questions: [
          { q: "WHICH is formally framed as…", options: ["classification over the available toolset", "regression onto a tool-quality score", "clustering of similar tool schemas", "ranking every token in the vocabulary"], a: 0, why: "Pick the right class among K tools; rewards teach trade-offs SFT can't." },
          { q: "Wrong-tool picks need explicitly NEGATIVE reward because…", options: ["negative values speed up convergence", "the surrogate loss requires both signs", "rewards must sum to zero per episode", "absence of bonus alone doesn't discourage"], a: 3, why: "Merely-unrewarded wrong picks persist; penalties teach discrimination." },
        ] },
      { id: "how", name: "HOW", sprite: "🔧",
        lore: "Argument construction is structured generation: valid JSON, schema-consistent fields, semantically correct values. Decomposes into syntax correctness (parses? required fields? types? → ±1 by rule), execution correctness (HTTP 200 → +r; exception → −r), and argument quality — numeric args: r = −|a_pred − a_gold|; strings: embedding similarity or fuzzy match; or discriminative models catching bad values; or a judge scoring plausibility against the query.",
        questions: [
          { q: "Valid JSON, schema OK, but city = 'Brelin' not 'Berlin'. Which reward catches it?", options: ["The syntax-correctness component", "The argument-quality component", "The when-to-call component", "No component can catch this"], a: 1, why: "Syntax passed; semantic argument errors are quality's job." },
          { q: "The rule-based quality reward for numeric arguments:", options: ["+1 if the number parses as a float", "cosine similarity of hidden states", "−|a_pred − a_gold|, growing with distance", "binary match against a regex pattern"], a: 2, why: "Graded distance gives smoother signal than binary right/wrong." },
        ] },
      { id: "actionspace", name: "Factored Actions", sprite: "🧩",
        lore: "The policy emits two action types as strict JSON in <action> tags. ANSWER(final_text): when=false, ends the episode. CALL(tool, args): when=true, carries which (tool name) and how (args); the tool executes and its output is appended to context, producing the next state. The explicit 'when' flag aids debugging and credit assignment. Episodes run until ANSWER or a max-step limit. Gradients flow over the whole structured action while reward decomposes along the axes.",
        questions: [
          { q: "What terminates an episode?", options: ["Any failed tool execution", "The first CALL action emitted", "Any negative reward component", "ANSWER, or the max-step limit"], a: 3, why: "CALL continues the loop; ANSWER ends it." },
          { q: "Why an explicit 'when' flag in the action JSON?", options: ["It makes the decision inspectable and rewardable", "The JSON spec requires boolean fields", "It compresses the action encoding", "Tools refuse calls without the flag"], a: 0, why: "Explicit structure aids debugging and credit assignment on the timing axis." },
        ] },
      { id: "malformed", name: "Malformed Actions", sprite: "💢",
        lore: "When the model emits invalid when/which/how output, the episode must NOT terminate. Instead: assign a negative syntax/validity reward, return an error message into context, and continue. This reward-shaping (lineage of Christiano et al.'s preference RL) converts failures into learning signal and teaches self-correction — the agent experiences the error AND the recovery within one trajectory, far better credit assignment than a death penalty.",
        questions: [
          { q: "Correct handling of a malformed CALL:", options: ["terminate the episode with a large penalty", "penalize, inject the error, continue the episode", "silently auto-repair the JSON and proceed", "restart training from the last checkpoint"], a: 1, why: "Keep it alive: the agent learns the penalty AND the recovery." },
          { q: "'Survive and retry' beats 'episode over' because…", options: ["shorter episodes waste GPU cycles", "termination inflates the value estimates", "recovery gets demonstrated and rewarded in-trajectory", "errors increase the policy's entropy"], a: 2, why: "Termination hides the path back to success; continuation makes self-correction learnable." },
        ] },
    ],
    sides: [
      { id: "s-trace", name: "Trail Mimic", sprite: "🦎", anchor: 2, recLevel: 3, prereqs: ["when", "which", "how"],
        desc: "Replays agent trajectories and dares you to judge them.",
        questions: [
          { q: "SCENARIO: 'What's 847 × 392, and will it rain in Tokyo tomorrow?' Ideal trajectory:", options: ["one search CALL covering both, then ANSWER", "ANSWER immediately from parametric knowledge", "CALL calculator, CALL weather, then ANSWER", "five calculator CALLs for numerical safety"], a: 2, why: "Two sub-tasks → two when/which/how decisions; ANSWER when both results are in." },
          { q: "SCENARIO: Call has right tool, but schema requires a date field that's missing. What fires?", options: ["negative syntax/schema reward; episode continues", "positive execution reward; episode continues", "the WHEN penalty; episode terminates", "final-task penalty only, at episode end"], a: 0, why: "Schema validation fails → rule-based penalty, error injected, agent retries." },
          { q: "SCENARIO: Agent answers correctly but made 4 pointless search calls first. Total return is…", options: ["maximal — final correctness dominates", "exactly zero — terms cancel by design", "reduced — success minus call penalties", "undefined — rewards conflict"], a: 2, why: "Efficiency is part of the objective: cost penalties coexist with success." },
        ] },
      { id: "s-retain2", name: "Echo of the Village", sprite: "🌀", anchor: 4, recLevel: 3, prereqs: ["bc", "malformed"],
        desc: "Connects the Forest back to Imitation Village.",
        questions: [
          { q: "RETENTION: Of when/which/how, which can SFT approximate best?", options: ["WHEN — demos show timing perfectly", "HOW (syntax) — formats are visible in demos", "WHICH — selection is just classification", "None — SFT teaches nothing useful"], a: 1, why: "Form is imitable; timing and selection trade-offs need consequences." },
          { q: "RETENTION: Penalize-and-continue is good credit assignment because…", options: ["the recovery path stays observable and rewardable", "it maximizes the episode's total length", "it keeps all advantages strictly positive", "errors reset the value network baseline"], a: 0, why: "Keep the causal chain visible to learning — same principle as decomposed rewards." },
        ] },
    ],
    gym: {
      leader: "Ranger ReAct", badge: "Forest Badge", sprite: "🏛️",
      taunt: "Three trails, one policy!",
      questions: [
        { q: "Reward decomposition primarily solves…", options: ["GPU memory fragmentation", "credit assignment across sub-skills", "tokenizer schema collisions", "sampling temperature drift"], a: 1, why: "A monolithic score can't localize the error; decomposed terms can." },
        { q: "Continue-or-stop before a third search call is which axis?", options: ["WHEN — the timing reward", "WHICH — the selection reward", "HOW — the argument reward", "Final-task — the outcome reward"], a: 0, why: "Call-vs-answer is the timing axis." },
        { q: "Why do gradients flow over the WHOLE action while rewards stay decomposed?", options: ["JSON cannot be split across loss terms", "one policy must learn all three skills jointly", "decomposed gradients would explode", "the value network requires full actions"], a: 1, why: "Single policy, factored feedback." },
      ] },
  },
  {
    id: "foundry", name: "Reward Foundry", emoji: "⚒️",
    intro: "Where the teaching signal is forged.",
    npc: { name: "Smith Shaper", text: "Seven components leave this foundry: when, which, syntax, execution, argument quality, final success, preference judgment. Each forged three ways — rules, discriminative models, or LLM judges. And heed: rewards must be ASYMMETRIC." },
    concepts: [
      { id: "components", name: "Reward Components", sprite: "🧱",
        lore: "The unified reward sums per-axis terms: r_when, r_which, r_syntax (±1), r_exec, r_args, r_final (unit tests, exact match, tolerance-based numeric match), plus optional preference terms. Each component can be independently trained and debugged — that modularity is why decomposition wins. Preference pairs can be built per-axis: two trajectories differing only in timing, only in tool choice, or only in arguments.",
        questions: [
          { q: "'Unit tests pass' supervises which component?", options: ["r_syntax — format validity", "r_when — call timing", "r_args — argument quality", "r_final — task success"], a: 3, why: "Final success rules: unit tests, exact match, tolerance-based numeric match." },
          { q: "Preference pairs differing ONLY in tool choice train…", options: ["the timing signal, isolated", "the selection signal, isolated", "the syntax signal, isolated", "all axes simultaneously"], a: 1, why: "Controlled pairs isolate one axis." },
        ] },
      { id: "supervision", name: "The Supervision Trio", sprite: "⚖️",
        lore: "RULES: deterministic — JSON parses, schema validates, HTTP 200, exact match. Cheap, exact, unhackable, rigid. DISCRIMINATIVE reward models: classifiers trained on human labels (InstructGPT lineage); for final success, the Bradley-Terry preference loss L = −log(e^r(τA)/(e^r(τA)+e^r(τB))) from Christiano et al. GENERATIVE judges: prompt a strong LLM — 'should the agent call a tool here?' — and extract scalar reward. Judges capture nuance rules can't, at the cost of noise and gaming risk.",
        questions: [
          { q: "The Bradley-Terry loss trains…", options: ["the policy network directly", "the environment's dynamics", "a reward model from preference pairs", "the tokenizer's merge table"], a: 2, why: "Fit a scalar reward so preferred trajectories score higher." },
          { q: "Generative judges beat rules specifically when…", options: ["checking whether JSON parses", "quality is nuanced and contextual", "verifying HTTP status codes", "counting tokens in the output"], a: 1, why: "Rules for the checkable; judges for the nuanced." },
        ] },
      { id: "asymmetric", name: "Asymmetric Rewards", sprite: "⚡",
        lore: "Penalties and bonuses are deliberately unequal. Unnecessary calls (cost, latency) penalized harder than routine correct calls are rewarded; malformed syntax earns a small consistent negative; catastrophic failures hit hardest. Asymmetry encodes deployment economics, biases the policy's risk profile away from expensive failure modes, and stabilizes PPO/GRPO — bounded negatives prevent both spam-calling reward hacks and collapse from over-punishment.",
        questions: [
          { q: "Core rationale for asymmetric magnitudes:", options: ["symmetric rewards break PPO's clipping", "reward should mirror real deployment costs", "negative values compress to fewer bits", "asymmetry guarantees faster convergence"], a: 1, why: "The policy inherits the risk profile implied by the reward's economics." },
          { q: "Equal small penalties and bonuses likely yield…", options: ["a policy that tolerates over-calling", "perfectly calibrated tool restraint", "immediate training divergence", "zero gradient on the WHEN axis"], a: 0, why: "Weak symmetric penalties under-price cost; asymmetry teaches restraint." },
        ] },
      { id: "procout", name: "Process vs Outcome", sprite: "🔬",
        lore: "Outcome rewards score only the final result: clean, hard to game, but sparse — over a 12-step trajectory one scalar must explain everything. Process rewards score intermediate steps: dense signal, faster learning, finer control — but gameable: the model can optimize looking-good-per-step over being-right. The synthesis: blend both — process rewards shaping early training or guiding search, outcome rewards anchoring final correctness.",
        questions: [
          { q: "Pure outcome reward on long tasks suffers from…", options: ["reward hacking of step proxies", "sparsity — brutal credit assignment", "excessive compute per episode", "over-constrained exploration"], a: 1, why: "Which of 30 clicks mattered? One terminal scalar can't say." },
          { q: "The characteristic RISK of process rewards:", options: ["the signal becomes too sparse", "they require terminal verification", "gaming — looking good beats being right", "they cannot guide tree search"], a: 2, why: "Dense proxies invite proxy-optimization." },
        ] },
      { id: "tarm", name: "TARM", sprite: "🛠️",
        lore: "Tool-Augmented Reward Modeling: the reward model itself gets tools. Instead of judging from parametric memory, a TARM invokes calculators, search, or code execution while evaluating — verifying claims before scoring. Trained on the TARA dataset with SFT then RL, TARMs outperform tool-free reward models on verification-heavy domains. A reward model that can check facts gives cleaner signal, making downstream RL more trustworthy.",
        questions: [
          { q: "TARM's key move:", options: ["scaling reward models past the policy size", "letting the judge verify with tools before scoring", "replacing rewards with retrieval scores", "training judges only on synthetic data"], a: 1, why: "Verification beats vibes." },
          { q: "TARM matters downstream because…", options: ["it eliminates the SFT warm-start stage", "it doubles effective context length", "it removes the need for preference pairs", "reward quality upper-bounds policy quality"], a: 3, why: "Cleaner verified signal → less noise and hacking in the agent's RL." },
        ] },
    ],
    sides: [
      { id: "s-design", name: "Forge Imp", sprite: "👺", anchor: 1, recLevel: 4, prereqs: ["components", "supervision", "asymmetric"],
        desc: "Throws real reward-design jobs at you and cackles at mistakes.",
        code: `# decomposed asymmetric reward (sketch)
def reward(traj):
    r  = 0.0
    r += 0.2 if traj.syntax_valid else -0.3
    r += 0.3 if traj.right_tool   else -0.6   # asymmetric!
    r += 0.2 if traj.executed_ok  else -0.4
    r -= 0.5 * traj.unnecessary_calls          # cost pressure
    r += 2.0 if traj.task_success else -1.5    # anchor
    return r`,
        codeNote: "Note every penalty outweighs its sibling bonus — the asymmetry lives in the constants.",
        questions: [
          { q: "SCENARIO: syntax ✓, right tool ✓, executed ✓, final wrong ✗, one wasted call. Under the code above, net return is…", options: ["+0.7 — the per-step bonuses win", "−1.3 — failure terms dominate", "exactly 0 — terms cancel", "+2.0 — success anchor fires"], a: 1, why: "0.2+0.3+0.2−0.5−1.5 = −1.3. Asymmetry makes failure dominate." },
          { q: "SCENARIO: Match the mechanism. 'HTTP 200 → +r' / 'classifier predicts P(call needed)' / 'judge rates plausibility':", options: ["judge / rule / discriminator", "rule / discriminator / judge", "discriminator / judge / rule", "rule / judge / discriminator"], a: 1, why: "Rules check facts; discriminators are trained classifiers; judges generate verdicts." },
          { q: "SCENARIO: 'Plan adheres to sepsis protocol' — too nuanced for rules, no labeled data yet. Best immediate scorer?", options: ["a generative judge with the protocol in-prompt", "exact string match against one gold plan", "a discriminator trained on zero labels", "uniform +1 reward to keep training moving"], a: 0, why: "Judges handle nuance without labels; distill a discriminator later." },
        ] },
      { id: "s-hack", name: "Proxy Phantom", sprite: "🎭", anchor: 3, recLevel: 4, prereqs: ["procout", "tarm"],
        desc: "Wears the mask of good metrics over rotten behavior.",
        questions: [
          { q: "SCENARIO: Agent emits 8 plausible steps and a confident wrong answer — and scores well. Diagnosis + fix?", options: ["sparse rewards; densify with step bonuses", "process-reward gaming; re-anchor on outcomes", "skill collapse; restart from SFT checkpoint", "under-exploration; raise the entropy bonus"], a: 1, why: "Dense proxies outweighed the outcome anchor — rebalance toward verified outcomes." },
          { q: "SCENARIO: Milestone 'submitted ✓' fires on empty forms; the agent exploits it. The TARM-flavored fix:", options: ["remove every milestone, go outcome-only", "raise the milestone bonus to encourage honesty", "verify the milestone's state condition before paying", "add three more unverified milestones"], a: 2, why: "Reward hacking → harden the proxy's verification." },
        ] },
    ],
    gym: {
      leader: "Smith Shaper", badge: "Foundry Badge", sprite: "🏛️",
      taunt: "A policy is only as good as the signal that forged it!",
      questions: [
        { q: "Why are decomposed rewards more DEBUGGABLE than one scalar?", options: ["fewer floating-point operations per step", "each component can be ablated independently", "scalars cannot be logged efficiently", "decomposition removes all reward noise"], a: 1, why: "You see which axis misbehaves." },
        { q: "Rank by hackability, least-hackable first:", options: ["judges < discriminators < rules", "rules < discriminators < judges", "discriminators < rules < judges", "all three are equally gameable"], a: 1, why: "Deterministic checks can't be charmed; learned models can be probed; judges persuaded." },
        { q: "Blending process + outcome works best when…", options: ["process shapes early, outcome anchors correctness", "outcome shapes early, process anchors late", "both weighted equally at every step", "they alternate every other episode"], a: 0, why: "Dense guidance to get moving; verified outcomes to keep it honest." },
      ] },
  },
  {
    id: "peaks", name: "Optimization Peaks", emoji: "🏔️",
    intro: "Three summits — PPO, DPO, GRPO — and the curriculum trail.",
    npc: { name: "Guide Gradient", text: "All three summits share one flow: sample, score, update. PPO climbs with a critic and clipped steps. DPO skips rollouts, learning from preference pairs. GRPO drops the critic — each sample competes against its group's mean. The rope that saves every climber: KL regularization to the SFT reference." },
    concepts: [
      { id: "ppo", name: "PPO", sprite: "🗜️",
        lore: "Sample trajectories, estimate advantages with GAE using a learned value network V_φ, then maximize the clipped surrogate: L = E[min(ρ·Â, clip(ρ, 1−ε, 1+ε)·Â)] where ρ = π_new/π_old. Clipping caps how far one batch can move the policy — a trust region. The value loss trains the critic; an entropy bonus keeps exploration alive; a KL penalty to the frozen SFT reference prevents drift into degenerate text. Full objective: surrogate − c₁·value loss + c₂·entropy − β·KL(π‖π_ref).",
        questions: [
          { q: "Clipping ρ to [1−ε, 1+ε] exists to…", options: ["bound per-update policy movement", "normalize rewards across batches", "accelerate trajectory sampling", "regularize the value network"], a: 0, why: "A soft trust region — no single batch can destructively yank the policy." },
          { q: "The KL penalty in LLM-PPO is measured against…", options: ["the value network's predictions", "a uniform distribution over tokens", "the frozen SFT reference policy", "last epoch's policy snapshot"], a: 2, why: "The anchor keeps optimization from drifting into degenerate high-reward text." },
        ] },
      { id: "dpo", name: "DPO", sprite: "🤝",
        lore: "Direct Preference Optimization removes the reward model AND rollouts. Data: preference pairs (y_w chosen, y_l rejected). Loss: −log σ(β[log π(y_w)/π_ref(y_w) − log π(y_l)/π_ref(y_l)]) — push the winner up relative to the loser, measured against the reference. Remarkably, this is the closed-form optimum of the same KL-regularized objective PPO chases. No value net, no environment. Strength: simple preference alignment. Weakness: no exploration, no execution feedback — ill-suited for multi-step tool interaction.",
        questions: [
          { q: "DPO requires ___ and skips ___:", options: ["rollouts / preference data", "preference pairs / reward model and rollouts", "a critic / the reference model", "milestones / the KL anchor"], a: 1, why: "Comparisons in, direct policy update out." },
          { q: "DPO is weak for multi-step tool agents because…", options: ["its loss diverges on long sequences", "preference pairs cannot include tool calls", "execution feedback never shapes the policy", "it lacks any reference anchor"], a: 2, why: "Offline preferences can't capture what only acting reveals." },
        ] },
      { id: "grpo", name: "GRPO", sprite: "👥",
        lore: "For each prompt, sample a group of G responses, score them all, set each sample's advantage to its normalized deviation from the group mean — Âᵢ = (rᵢ − mean(r))/std(r). The group IS the baseline, so the value network is deleted: huge memory savings. Updates use a PPO-style clipped surrogate plus KL regularization. The engine behind DeepSeek-R1-style reasoning training. It shines when rewards are cheaply checkable (math, code, tool execution) so large groups can be scored automatically.",
        questions: [
          { q: "GRPO's replacement for the learned critic:", options: ["a frozen copy of the policy", "the group's reward statistics", "human-in-the-loop scoring", "a Monte Carlo tree estimate"], a: 1, why: "Beat your G−1 siblings → positive advantage." },
          { q: "GRPO's economics depend on…", options: ["scoring many samples cheaply per prompt", "very small group sizes (G ≤ 2)", "human preference labels per group", "deterministic environment transitions"], a: 0, why: "Checkable rewards let whole groups be scored automatically." },
        ] },
      { id: "curriculum", name: "The Curriculum", sprite: "🪜",
        lore: "Six stages, each isolating a skill: Stage 0 SFT bootstrap → Stage 1 binary WHEN → Stage 2 WHICH among growing libraries → Stage 3 HOW with syntax/quality rewards → Stage 4 multi-step pipelines, conditional logic, stopping → Stage 5 open-domain tasks. Scheduling interleaves and revisits stages; jumping straight to Stage 5 produces uninterpretable failure — when everything is hard at once, reward can't localize which sub-skill broke.",
        questions: [
          { q: "Stage 1 trains specifically…", options: ["argument JSON construction", "multi-tool pipeline chaining", "the binary call-vs-answer decision", "open-domain task completion"], a: 2, why: "Isolate timing first on cleanly separable queries." },
          { q: "The deep reason staging works:", options: ["it reduces total GPU-hours linearly", "credit assignment stays legible per skill", "later stages reuse earlier checkpoints", "it removes the need for KL anchoring"], a: 1, why: "Reward decomposition's principle, applied across training time." },
        ] },
      { id: "diagnostics", name: "Diagnostics", sprite: "🩺",
        lore: "Track each axis or fly blind. Process metrics: when-accuracy, which-accuracy, argument validity rate, executability rate, tool-call frequency, steps-per-episode. Outcome metrics: final accuracy, return, cost. The dreaded failure: SKILL COLLAPSE — one axis silently degrades while aggregate reward looks fine (the model stops calling tools but compensates on easy tasks, or spams one favored tool). Per-axis dashboards catch collapse early; aggregate-only monitoring catches it after deployment.",
        questions: [
          { q: "Aggregate reward stable, which-accuracy quietly down 30%. This is…", options: ["skill collapse masked by compensation", "healthy curriculum stage transition", "a guaranteed logging artifact", "normal variance in advantage noise"], a: 0, why: "Exactly why per-axis tracking exists." },
          { q: "Which is a PROCESS-level metric?", options: ["final task accuracy per episode", "total deployment cost per query", "executability rate of tool calls", "cumulative return per trajectory"], a: 2, why: "Process watches the steps; outcome watches the ending." },
        ] },
    ],
    sides: [
      { id: "s-pick", name: "Summit Sphinx", sprite: "🦅", anchor: 1, recLevel: 5, prereqs: ["ppo", "dpo", "grpo"],
        desc: "Every riddle is 'which algorithm, and why'.",
        code: `# the PPO clipped surrogate, in code
ratio  = (logp_new - logp_old).exp()        # ρ
unclip = ratio * adv
clip   = ratio.clamp(1-eps, 1+eps) * adv
policy_loss = -torch.min(unclip, clip).mean()
loss = policy_loss \\
     + c1 * F.mse_loss(values, returns) \\
     - c2 * entropy.mean() \\
     + beta * kl(policy, ref_policy)`,
        codeNote: "Read each term: surrogate, critic, exploration, anchor. The Sphinx asks about all four.",
        questions: [
          { q: "SCENARIO: Unit-test rewards (cheap, automatic), memory-constrained on critics. Pick:", options: ["PPO — the critic stabilizes everything", "GRPO — group baselines exploit cheap scoring", "DPO — preferences avoid rollouts entirely", "SFT only — RL is unnecessary here"], a: 1, why: "Checkable rewards + no value network = GRPO's sweet spot." },
          { q: "SCENARIO: 50k static preference pairs, no simulator, no verifiable reward. Pick:", options: ["PPO with a hand-written reward", "GRPO with groups of size one", "DPO — it consumes pairs directly", "MCTS over candidates"], a: 2, why: "No environment, no checkable reward → the rollout-free method." },
          { q: "SCENARIO: Mid-PPO, generations drift toward repetitive high-reward gibberish. Which knob in the code above, which direction?", options: ["raise beta on the KL term", "raise eps to widen the clip", "lower c2 toward zero", "delete the value loss term"], a: 0, why: "Drift from sane language is exactly what the KL anchor restrains." },
        ] },
      { id: "s-curves", name: "Curve Reader", sprite: "📉", anchor: 4, recLevel: 5, prereqs: ["curriculum", "diagnostics", "explore"],
        desc: "Shows you training dashboards and demands diagnosis. Pure retention.",
        questions: [
          { q: "RETENTION: Argument-validity crashes mid-training; when-accuracy holds. Response?", options: ["full restart from random initialization", "revisit Stage 3 and inspect the HOW rewards", "remove all tools from the environment", "double the discount factor immediately"], a: 1, why: "Per-axis diagnosis enables per-axis repair." },
          { q: "RETENTION: PPO's entropy bonus exists to…", options: ["shrink the value network's loss", "keep exploration from collapsing early", "enforce the trust-region clipping", "anchor the policy to the reference"], a: 1, why: "Foundation Fields callback: exploration pressure prevents premature determinism." },
          { q: "RETENTION: All three algorithms keep a KL/reference anchor because…", options: ["it is required for advantage estimation", "regulators mandate reference models", "reward optimization alone drifts into degeneracy", "it halves the memory footprint"], a: 2, why: "PPO penalizes KL, DPO embeds the reference, GRPO adds explicit KL." },
        ] },
    ],
    gym: {
      leader: "Guide Gradient", badge: "Summit Badge", sprite: "🏛️",
      taunt: "Three algorithms, one objective!",
      questions: [
        { q: "Which component appears in ALL THREE methods?", options: ["a learned value network", "group-relative advantages", "preference pair construction", "KL regularization to a reference"], a: 3, why: "The anchor is universal; critics, groups, pairs are method-specific." },
        { q: "DPO secretly optimizes…", options: ["a completely unrelated objective", "the same KL-regularized objective, closed-form", "pure likelihood, identical to SFT", "the group-relative GRPO advantage"], a: 1, why: "Its loss is the closed-form optimum of the KL-regularized RL objective." },
        { q: "GRPO advantage for a sample exactly at the group mean:", options: ["zero advantage — no gradient push", "maximum positive advantage", "a penalty proportional to std", "excluded from the update batch"], a: 0, why: "Average performance = no surprise = no push." },
      ] },
  },
  {
    id: "citadel", name: "Agent Citadel", emoji: "🏰",
    intro: "Environments, reliability, multi-agent politics, search, memory, safety.",
    npc: { name: "Champion Horizon", text: "The architecture law: START SINGLE-AGENT. Under equal compute, unified context usually beats a committee — every inter-agent message is a lossy bottleneck. Escalate only deliberately: parallel exploration, specialization, verification, or noise so bad that decomposition is filtering." },
    concepts: [
      { id: "envtypes", name: "Environment Types", sprite: "🗺️",
        lore: "Three regimes, rising difficulty. SINGLE-TURN: one prompt → one response → one reward; trivial credit assignment. TOOL-USE: episodes interleave reasoning, tool calls, observations; moderate horizon; rewards can attach to steps. MULTI-TURN SEQUENTIAL: long horizons, persistent state, delayed consequences — web/computer-use agents across 30 clicks. Each step up makes rewards sparser, exploration harder, credit crueler; environment design shapes everything downstream.",
        questions: [
          { q: "Rank by credit-assignment difficulty, easiest first:", options: ["multi-turn, tool-use, single-turn", "tool-use, single-turn, multi-turn", "single-turn, tool-use, multi-turn", "all three are equally difficult"], a: 2, why: "Horizon length and action-consequence delay drive difficulty." },
          { q: "Multi-turn sequential environments are distinguished by…", options: ["persistent state and delayed consequences", "guaranteed dense per-step rewards", "the absence of any tool calls", "single-token action spaces"], a: 0, why: "An early wrong click silently dooms the booking 25 steps later." },
        ] },
      { id: "milestones", name: "Milestone Rewards", sprite: "🚩",
        lore: "For long-horizon agents, milestones densify the sparse end-signal: decompose the task into verifiable checkpoints — logged in ✓, results loaded ✓, item in cart ✓, form submitted ✓ — each emitting partial reward. Example: r = Σ milestone bonuses + final success bonus − step costs − error penalties. Process-reward thinking applied to web/computer-use: a gradient of progress instead of a verdict at the end.",
        questions: [
          { q: "Milestones primarily fix…", options: ["sparse terminal rewards on long tasks", "the cost of running web browsers", "ambiguity in user instructions", "the size of the action space"], a: 0, why: "Checkpoint bonuses turn a 30-step desert into breadcrumbs." },
          { q: "A usable milestone must be…", options: ["subjective enough to allow nuance", "programmatically verifiable in state", "terminal — only at episode end", "secret from the training policy"], a: 1, why: "If you can't reliably detect 'logged in', you can't pay for it." },
        ] },
      { id: "passk", name: "pass@k vs pass^k", sprite: "🎯",
        lore: "pass@k: success in AT LEAST ONE of k attempts — CAPABILITY, the ceiling. pass^k: success in ALL k attempts — RELIABILITY, the floor. Agents routinely post high pass@k with dismal pass^k: capable but flaky. Gap sources: sampling stochasticity, instruction ambiguity, planning variability. Production cares about pass^k — a booking agent that succeeds 1-in-5 tries is a demo, not a product.",
        questions: [
          { q: "pass@5 = 95%, pass^5 = 20% means…", options: ["reliable but barely capable", "capable but highly unreliable", "both metrics indicate failure", "the metrics contradict each other"], a: 1, why: "High ceiling, low floor — the classic agentic gap." },
          { q: "NOT a listed source of unreliability:", options: ["sampling stochasticity", "instruction ambiguity", "insufficient GPU memory", "planning variability"], a: 2, why: "The triad: stochasticity, ambiguity, planning variability." },
        ] },
      { id: "singlemulti", name: "Single vs Multi-Agent", sprite: "♟️",
        lore: "Single-agent: unified reasoning, full context, simplicity — under budget-aware comparison (equal compute) it usually wins; apparent multi-agent gains often vanish when compute is normalized. Multi-agent costs: every message is a lossy information bottleneck, coordination overhead, error propagation. Multi-agent earns its keep when: context is noisy (decomposition = filtering), tasks need parallel search, specialization or independent verification helps. Law: single-agent baseline first; escalate with a named reason.",
        questions: [
          { q: "Many multi-agent 'wins' evaporate when…", options: ["agents share a single context window", "total compute is normalized across setups", "the task contains any tool calls", "the coordinator agent is removed"], a: 1, why: "The gain often came from extra compute, not architecture." },
          { q: "The information-bottleneck critique says…", options: ["handoffs compress context lossily", "agents compete for the same tools", "networks add latency per message", "memory stores overflow at scale"], a: 0, why: "Each summarized handoff discards information a single agent would keep." },
        ] },
      { id: "mcts", name: "Search & MCTS", sprite: "🌳",
        lore: "MCTS gives agents foresight: SELECT promising branches (UCB-style), EXPAND a node, SIMULATE/evaluate, BACKPROPAGATE values up the tree — then commit. Neural guidance makes it tractable: the policy provides priors over branches, a value model scores leaves without full rollouts (the AlphaGo pattern). Search results can be distilled back into the policy, and process-wise reward shaping scores intermediate nodes.",
        questions: [
          { q: "MCTS's four phases, in order:", options: ["expand, select, backprop, simulate", "simulate, expand, select, backprop", "select, expand, simulate, backpropagate", "backprop, select, simulate, expand"], a: 2, why: "The canonical loop, repeated until budget is spent." },
          { q: "Neural guidance solves MCTS's core problem of…", options: ["intractable branching in huge spaces", "non-differentiable tree structures", "reward sparsity at the root node", "memory leaks in deep trees"], a: 0, why: "Priors focus expansion; value nets replace expensive rollouts." },
        ] },
      { id: "memory", name: "Memory & Credit", sprite: "🧠",
        lore: "EXPLICIT memory: external stores (episodic buffers, retrieval) read/written by the agent — inspectable. IMPLICIT: everything in context/weights — simple, decays with length. World models learn predictive representations enabling latent rollouts and model-predictive control: plan in imagination, act in reality. Credit over hundreds of steps leans on advantage estimation and HIERARCHICAL RL — high-level policy sets subgoals, low-level executes, so credit flows over short horizons at each level.",
        questions: [
          { q: "Hierarchical RL eases long-horizon credit by…", options: ["increasing the discount factor", "splitting policies into subgoal levels", "storing every state in a buffer", "removing intermediate rewards"], a: 1, why: "Two short credit chains beat one enormous one." },
          { q: "A world model enables…", options: ["unlimited context windows", "automatic reward decomposition", "planning via internal latent rollouts", "exact transition probabilities"], a: 2, why: "Imagination as cheap exploration: predict, evaluate, commit in reality." },
        ] },
      { id: "safety", name: "Eval & Safety", sprite: "🛡️",
        lore: "Five evaluation dimensions: task performance, behavioral efficiency, robustness/generalization, alignment/ethical compliance, interpretability of the trace. Safety challenges: reward hacking, unsafe tool misuse, distribution shift. Mitigations: safety-aware RL (constrained optimization, penalties for unsafe actions), human-in-the-loop gates for high-stakes actions, traceable reasoning logs, benchmarks testing safety alongside capability.",
        questions: [
          { q: "Reward hacking is…", options: ["exploiting the proxy without achieving the goal", "stealing compute from other training jobs", "any use of negative reward components", "overfitting the value network to returns"], a: 0, why: "Agents optimize what you measure, not what you meant." },
          { q: "Human-in-the-loop gates belong on…", options: ["every intermediate reasoning token", "high-stakes irreversible actions", "read-only documentation lookups", "all tool calls without exception"], a: 1, why: "Gate the irreversible; automate the recoverable." },
        ] },
    ],
    sides: [
      { id: "s-arch", name: "Council Shade", sprite: "🌑", anchor: 3, recLevel: 6, prereqs: ["singlemulti"],
        desc: "A shadowy committee that wants MORE AGENTS for everything. Resist it.",
        questions: [
          { q: "SCENARIO: A teammate proposes 6 sub-agents, citing a paper with multi-agent wins. Your first question:", options: ["'Which orchestration framework did they use?'", "'Was the comparison compute-normalized?'", "'How many tools does each agent get?'", "'What temperature were the agents run at?'"], a: 1, why: "Apparent gains often vanish under equal total compute." },
          { q: "SCENARIO: Your single agent drowns in 200-page noisy intake docs. Escalation is justified because…", options: ["more agents always read faster", "committees vote out hallucinations", "decomposition acts as noise filtering", "sub-agents share a clean context"], a: 2, why: "Context degradation is a legitimate escalation trigger." },
          { q: "SCENARIO: You split the task and accuracy DROPS despite more compute. Likeliest culprit:", options: ["lossy handoffs between the sub-agents", "the discount factor across agents", "too few emoji in the prompts", "sub-agents sharing too much context"], a: 0, why: "Information bottlenecks: each handoff discards decision-relevant detail." },
        ] },
      { id: "s-ship", name: "Gatekeeper Golem", sprite: "🤖", anchor: 2, recLevel: 6, prereqs: ["passk", "milestones", "procout"],
        desc: "Stands before the deployment gate. Only respects reliability math.",
        questions: [
          { q: "SCENARIO: Stakeholders see pass@10 = 90% and want to ship. Your read:", options: ["ship — capability is demonstrated", "not yet — pass^k reveals the reliability floor", "ship with a larger model behind it", "the two metrics are interchangeable"], a: 1, why: "1-in-k success is a demo; production needs all-k consistency." },
          { q: "SCENARIO: To CLOSE the pass^k gap, which lever set matches the unreliability sources?", options: ["bigger model, longer context, more tools", "reduce stochasticity, disambiguate, stabilize planning", "more agents, more milestones, more search", "higher γ, lower ε, larger groups"], a: 1, why: "The triad of causes maps to the triad of fixes." },
          { q: "RETENTION: Deployed agent games 'submitted ✓' with empty forms. Name it, fix it:", options: ["skill collapse / restart the curriculum", "distribution shift / collect fresh data", "reward hacking / verify the milestone condition", "under-exploration / raise entropy"], a: 2, why: "Foundry callback: harden the proxy — checked conditions, not vibes." },
        ] },
    ],
    gym: {
      leader: "Champion Horizon", badge: "Champion Badge", sprite: "👑",
      taunt: "The final battle. Everything you've captured — all at once!",
      questions: [
        { q: "Design a reward for a 40-step insurance-form agent:", options: ["one terminal success reward, kept clean", "milestones + final bonus − step costs − error penalties", "uniform +1 per step to encourage progress", "judge-only scoring of the final screenshot"], a: 1, why: "Long horizon → densify with verifiable checkpoints; asymmetric costs price reality." },
        { q: "The full primer-style training stack:", options: ["DPO on static pairs, then deploy directly", "MCTS at inference with no training at all", "SFT → curriculum → PPO/GRPO with decomposed rewards + KL → per-axis diagnostics", "pure RL from random init with dense rewards"], a: 2, why: "The complete recipe this world taught." },
        { q: "One principle unifies warm-starts, reward decomposition, curricula, AND dashboards:", options: ["minimize total GPU expenditure", "make credit assignment legible everywhere", "maximize the policy's entropy floor", "prefer rules over learned judges"], a: 1, why: "Every design choice localizes which skill produced which outcome." },
        { q: "MCTS + world models + HRL all attack the same enemy:", options: ["long-horizon credit assignment and foresight", "tokenizer fragmentation at scale", "reward model parameter count", "inter-agent message bandwidth"], a: 0, why: "Search simulates ahead, world models imagine, hierarchy shortens credit chains." },
      ] },
  },
];

/* ============================================================
   THE ATLAS — compact concept worlds (one region each)
   ============================================================ */
const ATLAS = [
{
  id: "w-diffusion", title: "Diffusion Models", emoji: "🌫️",
  links: [
    { label: "3b1b · Neural networks series", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi" },
    { label: "Lilian Weng · What are Diffusion Models?", url: "https://lilianweng.github.io/posts/2021-07-11-diffusion-models/" },
  ],
  regions: [{
    id: "diff-r", name: "The Noise Gardens", emoji: "🌫️",
    intro: "Destroy data slowly; learn to reverse the destruction.",
    npc: { name: "Gardener Epsilon", text: "Diffusion is two processes. Forward: gradually add Gaussian noise over T steps until data becomes pure noise — fixed, no learning. Reverse: a network learns to undo one noising step at a time. Train it to predict the noise ε that was added, and sampling becomes iterative denoising from random Gaussian." },
    concepts: [
      { id: "fwdrev", name: "Forward/Reverse", sprite: "🌀",
        lore: "Forward process q(xₜ|xₜ₋₁): add a little Gaussian noise each step per a variance schedule βₜ; after T steps, x_T ≈ N(0, I). A closed form jumps straight to any t: xₜ = √(ᾱₜ)x₀ + √(1−ᾱₜ)ε. The reverse process p_θ(xₜ₋₁|xₜ) is learned: a network (typically U-Net or DiT transformer) predicts how to denoise one step. Generation = start from pure noise, apply the reverse step T times.",
        questions: [
          { q: "Which process involves NO learning?", options: ["the forward noising process", "the reverse denoising process", "both require trained networks", "neither involves any computation"], a: 0, why: "Forward is fixed Gaussian corruption per schedule; only the reverse is learned." },
          { q: "The closed form xₜ = √(ᾱₜ)x₀ + √(1−ᾱₜ)ε matters for training because…", options: ["it removes the need for noise", "any timestep is sampled in one jump", "it defines the reverse process", "it eliminates the variance schedule"], a: 1, why: "Train on random t without simulating t sequential noising steps." },
        ] },
      { id: "objective", name: "The ε Objective", sprite: "🎯",
        lore: "The ELBO of the diffusion model simplifies (Ho et al., DDPM) to something shockingly clean: L = E[‖ε − ε_θ(xₜ, t)‖²] — just MSE between the true noise added and the network's prediction of it. The network sees a noisy image and the timestep, and answers 'what noise was mixed in?'. Equivalent parameterizations exist (predict x₀, predict velocity v), trading stability at different noise levels.",
        questions: [
          { q: "The DDPM training loss is essentially…", options: ["cross-entropy over pixel classes", "MSE between true and predicted noise", "a GAN-style adversarial game", "KL between two learned networks"], a: 1, why: "The ELBO reduces to noise-prediction MSE — diffusion's famous simplicity." },
          { q: "ε_θ takes which inputs?", options: ["the clean image and a class label", "only the variance schedule β", "the noisy image and the timestep", "the previous predicted noise only"], a: 2, why: "It must know how corrupted the input is — t conditions the denoiser." },
        ] },
      { id: "guidance", name: "Sampling & CFG", sprite: "🧪",
        lore: "DDPM sampling needs T (~1000) sequential steps; DDIM reformulates it as a deterministic ODE-like process allowing big jumps (50 steps). Classifier-free guidance (CFG): train the model both with and without conditioning (drop the prompt ~10% of the time), then at sampling extrapolate: ε̂ = ε_uncond + w·(ε_cond − ε_uncond). Guidance scale w trades fidelity/prompt-adherence against diversity; too high w fries images. Latent diffusion (Stable Diffusion) runs the whole thing in a VAE's compressed latent space — far cheaper than pixel space.",
        questions: [
          { q: "Classifier-free guidance requires training…", options: ["a separate classifier on noisy images", "with conditioning randomly dropped", "two entirely separate diffusion models", "only on unconditional samples"], a: 1, why: "Random condition-dropping gives one model both ε_cond and ε_uncond." },
          { q: "Latent diffusion's core economy:", options: ["denoising in a VAE's compressed space", "skipping the forward process entirely", "using fewer attention heads per layer", "replacing Gaussian noise with uniform"], a: 0, why: "A 64×64 latent beats a 512×512 pixel grid — most cost vanishes." },
        ] },
    ],
    sides: [
      { id: "diff-s1", name: "Schedule Serpent", sprite: "🐍", anchor: 2, recLevel: 3, prereqs: ["fwdrev", "objective", "guidance"],
        desc: "Coils around your sampler settings and squeezes.",
        code: `# classifier-free guidance at sampling time
eps_c = model(x_t, t, prompt_emb)     # conditional
eps_u = model(x_t, t, null_emb)       # unconditional
eps   = eps_u + w * (eps_c - eps_u)   # w = guidance scale
x_prev = ddim_step(x_t, eps, t)       # 50 steps, not 1000`,
        codeNote: "Two forward passes per step — that's CFG's hidden 2× cost.",
        questions: [
          { q: "SCENARIO: Generations match prompts perfectly but look oversaturated and same-y. First knob?", options: ["lower the guidance scale w", "raise the number of DDIM steps", "increase the noise schedule's β", "switch the U-Net to a transformer"], a: 0, why: "High w over-extrapolates toward the condition — fidelity up, diversity and realism down." },
          { q: "SCENARIO: Inference is too slow at 1000 steps. The standard first fix:", options: ["a smaller U-Net backbone", "DDIM-style sampling with ~50 steps", "removing the timestep embedding", "training a second faster model"], a: 1, why: "Deterministic samplers take big jumps along the denoising trajectory." },
          { q: "SCENARIO: Pixel-space diffusion at 1024² blows your VRAM. The Stable-Diffusion answer:", options: ["gradient checkpointing everywhere", "tiling the image into patches", "compress with a VAE, diffuse in latents", "quantize the model to 4 bits"], a: 2, why: "Latent diffusion — do the expensive iteration in compressed space." },
        ] },
    ],
    gym: { leader: "Gardener Epsilon", badge: "Diffusion Badge", sprite: "🏛️", taunt: "Reverse my garden's entropy!",
      questions: [
        { q: "Generation in diffusion is…", options: ["one forward pass through a decoder", "iterative denoising from pure Gaussian noise", "sampling from a discrete codebook", "adversarial refinement of a draft"], a: 1, why: "Start at N(0,I), apply the learned reverse step repeatedly." },
        { q: "Why does predicting ε work as well as predicting x₀?", options: ["they are linearly related given xₜ and t", "noise has lower dimensionality", "ε is always Gaussian at test time", "x₀ prediction is mathematically invalid"], a: 0, why: "The closed form ties x₀, xₜ, and ε together — parameterizations are interconvertible." },
        { q: "CFG with w = 0 gives…", options: ["pure conditional sampling", "pure unconditional sampling", "an average of both predictions", "a divergent sampler"], a: 1, why: "ε̂ = ε_u + 0·(…) = ε_u. w=1 is plain conditional; w>1 extrapolates." },
      ] },
  }],
},
{
  id: "w-vlm", title: "Vision-Language Models", emoji: "👁️",
  links: [
    { label: "CNN Explainer (interactive)", url: "https://poloclub.github.io/cnn-explainer/" },
    { label: "Transformer Explainer (interactive)", url: "https://poloclub.github.io/transformer-explainer/" },
  ],
  regions: [{
    id: "vlm-r", name: "The Seeing Tower", emoji: "👁️",
    intro: "Where pixels learn to speak.",
    npc: { name: "Oracle CLIP", text: "Modern VLMs are three parts: a vision encoder (often a ViT pre-trained contrastively), a projector that maps image features into the LLM's token space, and the LLM itself. Images become 'soft tokens' the language model attends over like any other words." },
    concepts: [
      { id: "clip", name: "Contrastive Pretraining", sprite: "🧲",
        lore: "CLIP trains an image encoder and text encoder jointly on (image, caption) pairs with a contrastive loss: in a batch of N pairs, maximize cosine similarity of the N matched pairs while minimizing the N²−N mismatched ones (symmetric InfoNCE). Result: a shared embedding space where 'photo of a dog' lands near dog images — enabling zero-shot classification by comparing an image against text prompts for each class.",
        questions: [
          { q: "CLIP's training signal comes from…", options: ["pixel-level reconstruction loss", "matching vs mismatching image-text pairs", "human preference rankings", "next-token prediction on captions"], a: 1, why: "Symmetric contrastive loss over the batch's similarity matrix." },
          { q: "Zero-shot classification with CLIP works by…", options: ["fine-tuning a linear head per task", "comparing image embeddings to class-prompt text embeddings", "generating a caption and parsing it", "clustering the image embeddings"], a: 1, why: "The shared space makes 'nearest text prompt' a classifier." },
        ] },
      { id: "llava", name: "The Projector Pattern", sprite: "🌉",
        lore: "The LLaVA recipe: freeze a strong vision encoder, freeze (initially) a strong LLM, and train only a small projector — an MLP mapping ViT patch features to LLM embedding dimensions. Image patches become a sequence of soft tokens prepended to the text. Stage 1 trains the projector on captions (alignment); stage 2 fine-tunes projector + LLM on visual instruction data. Cheap, modular, and the dominant open-VLM pattern.",
        questions: [
          { q: "In stage 1, LLaVA trains…", options: ["the vision encoder from scratch", "only the projector MLP", "the full LLM end-to-end", "a contrastive text encoder"], a: 1, why: "Alignment first: teach the bridge, keep both towers frozen." },
          { q: "Images enter the LLM as…", options: ["a sequence of soft tokens in embedding space", "base64 strings in the prompt text", "a single pooled CLS vector", "discrete codebook indices only"], a: 0, why: "Patch features, projected to embedding dim, attended like words." },
        ] },
      { id: "patches", name: "Resolution & Tokens", sprite: "🧩",
        lore: "A ViT splits images into patches (e.g., 14×14 px), each becoming one token: a 336² image → 576 tokens. Higher resolution = quadratically more tokens = quadratic attention cost, so VLMs use tricks: tiling (split high-res images into crops processed separately, e.g., LLaVA-NeXT 'AnyRes'), token pooling/merging, or resamplers (Perceiver-style cross-attention to a fixed token budget). Document and medical imagery especially need high resolution — fine text and subtle findings vanish at 224².",
        questions: [
          { q: "Doubling image resolution does what to token count?", options: ["doubles it", "quadruples it", "leaves it unchanged", "halves it via pooling"], a: 1, why: "Tokens scale with area: 2× side length → 4× patches." },
          { q: "A Perceiver-style resampler exists to…", options: ["compress patches to a fixed token budget", "increase the effective resolution", "replace the vision encoder entirely", "convert tokens to discrete codes"], a: 0, why: "Cross-attend many patch features into k learned queries — constant LLM cost." },
        ] },
    ],
    sides: [
      { id: "vlm-s1", name: "Pixel Sphinx", sprite: "🦉", anchor: 1, recLevel: 3, prereqs: ["clip", "llava", "patches"],
        desc: "Asks how you'd ACTUALLY build a medical VLM.",
        questions: [
          { q: "SCENARIO: Building a chest-X-ray VLM for a clinical sim. CLIP-336 misses small nodules entirely. First architectural lever?", options: ["a bigger LLM behind the projector", "higher input resolution via tiling/AnyRes", "more instruction-tuning epochs", "a second contrastive text encoder"], a: 1, why: "Subtle findings die at low res — resolution strategy before model scale." },
          { q: "SCENARIO: Budget allows training ~20M parameters total on 100k caption pairs. The LLaVA-style move:", options: ["LoRA the vision encoder only", "train the projector, freeze both towers", "train the LLM's embedding layer", "distill CLIP into a smaller ViT"], a: 1, why: "The projector IS the cheap alignment stage — exactly this budget." },
          { q: "SCENARIO: Your VLM hallucinates objects not in the image. A grounded mitigation at the data level:", options: ["raise the sampling temperature", "negative/contrastive instruction data ('is there a X? no')", "remove all text-only data", "shrink the patch size further"], a: 1, why: "Teaching 'no' explicitly counters the LM prior's tendency to confabulate objects." },
        ] },
    ],
    gym: { leader: "Oracle CLIP", badge: "Vision Badge", sprite: "🏛️", taunt: "See clearly, answer precisely!",
      questions: [
        { q: "The three-part modern VLM:", options: ["encoder, projector, LLM", "tokenizer, decoder, sampler", "GAN, VAE, diffusion head", "retriever, ranker, reader"], a: 0, why: "Vision tower → bridge → language tower." },
        { q: "Why is contrastive pretraining a good vision-tower base for VLMs?", options: ["its features already align with language semantics", "it produces the smallest models", "it requires no image data", "it outputs discrete tokens natively"], a: 0, why: "CLIP's space was forged against text — the projector's job is short." },
        { q: "576 tokens for one 336² image implies what cost concern?", options: ["attention cost grows with image tokens", "the vocabulary must expand", "gradients vanish past 500 tokens", "the KV cache becomes unnecessary"], a: 0, why: "Image tokens crowd the context — hence pooling, tiling, resamplers." },
      ] },
  }],
},
{
  id: "w-moe", title: "Mixture of Experts", emoji: "🔀",
  links: [
    { label: "Raschka · Big LLM Architecture Comparison", url: "https://magazine.sebastianraschka.com/p/the-big-llm-architecture-comparison" },
  ],
  regions: [{
    id: "moe-r", name: "The Expert Bazaar", emoji: "🔀",
    intro: "A market of specialists; a router decides who works.",
    npc: { name: "Broker Router", text: "MoE replaces each FFN with many expert FFNs plus a router. Per token, the router picks top-k experts (often k=8 of 256 fine-grained ones, plus a shared expert that always fires). Total parameters explode; ACTIVE parameters per token stay small. Capacity without proportional compute." },
    concepts: [
      { id: "routing", name: "Sparse Routing", sprite: "🚦",
        lore: "The router is a small linear layer producing logits over experts; top-k are selected, their outputs combined weighted by softmax gate values. Sparsity means each token's FLOPs touch only k experts — a 671B-total model can run ~37B active (DeepSeek-V3 pattern). Routing is per-token, per-layer: the same token can visit different experts at different depths. Discrete top-k breaks differentiability; gradients flow through the gate weights of selected experts.",
        questions: [
          { q: "'Active parameters' means…", options: ["parameters updated during training", "parameters touched per token at inference", "the router's parameter count", "parameters stored in fp32"], a: 1, why: "Total capacity is huge; per-token compute touches only k experts." },
          { q: "Routing decisions are made…", options: ["once per sequence, globally", "per token, per MoE layer", "once at model load time", "per attention head"], a: 1, why: "Each token at each MoE layer gets its own top-k expert set." },
        ] },
      { id: "balance", name: "Load Balancing", sprite: "⚖️",
        lore: "Routers naturally collapse: a few experts win early, get more gradient, win more — leaving dead experts and hot ones that bottleneck parallel hardware. Fixes: auxiliary load-balancing losses pushing uniform expert utilization, expert capacity limits with token dropping, and auxiliary-loss-free bias tweaks (DeepSeek-V3 adjusts per-expert bias terms online). A shared expert (always active) absorbs common patterns so routed experts can specialize.",
        questions: [
          { q: "Router collapse means…", options: ["the router's weights become NaN", "a few experts dominate while others die", "all experts produce identical outputs", "tokens skip the MoE layer entirely"], a: 1, why: "Rich-get-richer dynamics in routing — the classic MoE pathology." },
          { q: "The shared expert's purpose:", options: ["absorbing common patterns so others specialize", "serving as a fallback when routing fails", "reducing the total parameter count", "balancing gradients across GPUs"], a: 0, why: "Commonality goes to the always-on expert; routed ones get the long tail." },
        ] },
      { id: "moeinfra", name: "MoE at Inference", sprite: "🏗️",
        lore: "MoE's catch: ALL experts must live in memory even though few fire per token — memory scales with total parameters, FLOPs with active. Multi-GPU serving uses expert parallelism: experts sharded across devices, tokens routed over the interconnect (all-to-all communication, a real cost). Batch effects matter: a large batch touches most experts anyway, so MoE shines at large-batch serving and hurts at batch-1 local inference where you pay memory for unused capacity.",
        questions: [
          { q: "MoE memory footprint scales with ___ while FLOPs scale with ___:", options: ["active / total parameters", "total / active parameters", "expert count / router size", "batch size / sequence length"], a: 1, why: "Everything must be resident; only the routed slice computes." },
          { q: "Expert parallelism's characteristic cost:", options: ["all-to-all token routing over the interconnect", "duplicated experts on every device", "router recomputation per device", "synchronous gradient averaging"], a: 0, why: "Tokens travel to wherever their experts live — communication is the tax." },
        ] },
    ],
    sides: [
      { id: "moe-s1", name: "Bazaar Haggler", sprite: "🧞", anchor: 1, recLevel: 3, prereqs: ["routing", "balance", "moeinfra"],
        desc: "Haggles over deployment trade-offs.",
        questions: [
          { q: "SCENARIO: Choosing between a 30B dense and a 100B-total/12B-active MoE for a single 24GB consumer GPU. The MoE problem:", options: ["routing latency dominates decoding", "100B must fit in memory despite 12B active", "MoEs cannot be quantized at all", "the dense model has more capacity"], a: 1, why: "Memory pays for total parameters — batch-1 local inference is MoE's worst case." },
          { q: "SCENARIO: Mid-training, 80% of tokens route to 3 of 64 experts. Standard remedies?", options: ["balance losses / bias tweaks, capacity limits", "delete the 61 unpopular experts", "freeze the router permanently", "raise the learning rate 10×"], a: 0, why: "Push utilization uniform before the dead experts waste all that capacity." },
          { q: "SCENARIO: Your serving fleet runs huge batches. Why does MoE economics improve?", options: ["the router amortizes to zero cost", "large batches touch most experts anyway, so memory earns its keep", "all-to-all traffic disappears", "experts merge automatically at scale"], a: 1, why: "Utilization rises with batch size — capacity stops being dead weight." },
        ] },
    ],
    gym: { leader: "Broker Router", badge: "Expert Badge", sprite: "🏛️", taunt: "Route wisely!",
      questions: [
        { q: "MoE's fundamental trade:", options: ["capacity up, per-token compute roughly flat", "compute up, capacity flat", "memory down, FLOPs up", "latency down, quality down"], a: 0, why: "More parameters to specialize, same active FLOPs per token." },
        { q: "Fine-grained experts (many small, higher k) vs few large ones — the argued benefit:", options: ["more flexible combinations of specializations", "lower total memory usage", "no need for load balancing", "simpler all-to-all communication"], a: 0, why: "The DeepSeek lineage: many small experts compose more expressively." },
        { q: "Why does top-k routing complicate gradients?", options: ["selection is discrete and non-differentiable", "softmax cannot handle k > 1", "experts share no parameters", "the router has no loss term"], a: 0, why: "Hard selection blocks gradient flow; gating weights carry what signal there is." },
      ] },
  }],
},
{
  id: "w-orch", title: "Multi-Agent Orchestration", emoji: "🕸️",
  links: [
    { label: "Anthropic · Building Effective Agents", url: "https://www.anthropic.com/research/building-effective-agents" },
  ],
  regions: [{
    id: "orch-r", name: "The Orchestra Pit", emoji: "🕸️",
    intro: "Many players, one score — if the conductor is good.",
    npc: { name: "Maestro Topology", text: "Workflows are fixed pipelines (predictable, debuggable); agents are loops that decide their own next step (flexible, expensive, riskier). Orchestration patterns are reusable shapes: routing, chaining, parallelization, orchestrator-workers, evaluator-optimizer. Pick the simplest shape that fits the task — escalate complexity only when the simple shape demonstrably fails." },
    concepts: [
      { id: "patterns", name: "Core Patterns", sprite: "🎼",
        lore: "CHAINING: fixed sequence, each step's output feeding the next — for decomposable tasks with stable structure. ROUTING: a classifier sends inputs down specialized paths — when input types differ. PARALLELIZATION: sectioning (independent subtasks at once) or voting (same task, multiple samples, aggregate). ORCHESTRATOR-WORKERS: a lead agent dynamically decomposes, delegates to workers, synthesizes — for unpredictable subtask structure. EVALUATOR-OPTIMIZER: generator loops against a critic until quality passes.",
        questions: [
          { q: "Subtasks unknown until runtime → which pattern?", options: ["fixed chaining", "orchestrator-workers", "simple routing", "voting parallelization"], a: 1, why: "Dynamic decomposition is exactly what the orchestrator provides." },
          { q: "Evaluator-optimizer fits best when…", options: ["clear evaluation criteria exist and iteration helps", "the task is one deterministic transformation", "latency must be absolutely minimal", "no model can judge the output"], a: 0, why: "A loop needs a meaningful stop condition: the critic's pass." },
        ] },
      { id: "comms", name: "Handoffs & State", sprite: "📨",
        lore: "Inter-agent communication is the failure surface. Every handoff is a serialization: full-context transfer (expensive, faithful) vs summaries (cheap, lossy) vs structured artifacts (schemas, files — inspectable middle ground). Shared state (a blackboard/workspace all agents read-write) trades coupling for fidelity. Design questions: what does each agent SEE, what can it WRITE, and who arbitrates conflicts? Untracked state mutation by parallel agents is the classic heisenbug source.",
        questions: [
          { q: "The most inspectable handoff medium:", options: ["raw chat transcripts between agents", "structured artifacts with schemas", "implicit shared model weights", "summaries of summaries"], a: 1, why: "Schemas make handoffs checkable, diffable, and debuggable." },
          { q: "Parallel agents writing shared state risks…", options: ["conflicting untracked mutations", "deterministic but slow execution", "automatic deduplication", "improved context fidelity"], a: 0, why: "Two workers editing one workspace without arbitration = race conditions in prose." },
        ] },
      { id: "governance", name: "Governance & Cost", sprite: "🏛️",
        lore: "Agent systems multiply cost (~4× tokens for single agents, ~15× for multi-agent vs chat, per Anthropic's measurements) and multiply failure modes: error cascades (one bad subtask poisons synthesis), infinite delegation loops, and unobservable decisions. Governance: budgets per task (token/step/time caps), tracing every decision with structured logs, gates on irreversible actions, and evals on the SYSTEM level, not just per-agent — the orchestra can fail while every instrument plays correctly.",
        questions: [
          { q: "System-level evals matter beyond per-agent evals because…", options: ["coordination failures emerge between correct agents", "individual agents cannot be tested", "system evals are cheaper to run", "per-agent metrics are always wrong"], a: 0, why: "Every instrument in tune; the symphony still wrong — emergent failure." },
          { q: "The first defense against runaway delegation loops:", options: ["hard budgets: step, token, and time caps", "more capable worker agents", "removing the orchestrator entirely", "lowering sampling temperature"], a: 0, why: "Caps convert infinite loops into bounded, diagnosable failures." },
        ] },
    ],
    sides: [
      { id: "orch-s1", name: "Cascade Wraith", sprite: "🌊", anchor: 1, recLevel: 4, prereqs: ["patterns", "comms", "governance"],
        desc: "Feeds on error cascades in agent pipelines. It has seen your architecture diagrams.",
        questions: [
          { q: "SCENARIO: A clinical-sim platform runs patient-twin, nurse-twin, and scenario-director agents. The director's summaries to twins keep dropping vital constraints. Best structural fix?", options: ["a louder system prompt for the director", "structured artifacts: constraints as schema'd state all agents read", "have twins re-derive constraints themselves", "merge everything into one mega-prompt"], a: 1, why: "Lossy summaries → move invariants into shared, schema'd state instead of prose handoffs." },
          { q: "SCENARIO: Tickets are one of: billing, technical, refund. Each has a stable resolution flow. Simplest correct shape?", options: ["orchestrator-workers with dynamic planning", "routing into three specialized chains", "evaluator-optimizer on every reply", "a single agent with all instructions"], a: 1, why: "Known categories + stable flows = routing. Don't pay orchestrator complexity." },
          { q: "SCENARIO: Your 5-agent system's cost is 15× chat and one task looped for 2 hours overnight. Triage order:", options: ["budgets/caps first, then tracing, then architecture review", "rewrite all prompts immediately", "add a sixth supervisor agent", "switch every agent to a larger model"], a: 0, why: "Stop the bleeding (caps), see the system (traces), then redesign with evidence." },
        ] },
    ],
    gym: { leader: "Maestro Topology", badge: "Orchestration Badge", sprite: "🏛️", taunt: "Conduct, don't just multiply agents!",
      questions: [
        { q: "Workflow vs agent — the dividing line:", options: ["who decides the next step: code or the model", "the number of LLM calls made", "whether tools are involved", "the size of the model used"], a: 0, why: "Fixed control flow = workflow; model-directed control flow = agent." },
        { q: "Voting-style parallelization buys…", options: ["reliability through sample diversity", "lower total token cost", "guaranteed determinism", "elimination of handoff loss"], a: 0, why: "Multiple attempts + aggregation hedge against per-sample flakiness." },
        { q: "The RL-world principle that transfers directly to orchestration:", options: ["start simple; escalate architecture only with a named, evidenced reason", "always maximize the number of components", "rewards must be symmetric", "exploration is unnecessary in production"], a: 0, why: "Single-agent-first is the same law as simplest-pattern-first." },
      ] },
  }],
},
{
  id: "w-embed", title: "Embeddings & Position", emoji: "🧭",
  links: [
    { label: "Transformer Explainer (interactive)", url: "https://poloclub.github.io/transformer-explainer/" },
    { label: "3b1b · But what is a GPT?", url: "https://www.youtube.com/watch?v=wjZofJX0v4M" },
  ],
  regions: [{
    id: "emb-r", name: "The Rotating Library", emoji: "🧭",
    intro: "Where tokens learn where they are.",
    npc: { name: "Librarian Theta", text: "Attention is permutation-invariant — without positional information, 'dog bites man' equals 'man bites dog'. Position must be injected. The old way: add a position vector to each token embedding. The modern way: rotate the queries and keys themselves." },
    concepts: [
      { id: "sinusoidal", name: "Sinusoidal PE", sprite: "〰️",
        lore: "The original transformer adds fixed sinusoidal vectors: PE(pos, 2i) = sin(pos/10000^(2i/d)), PE(pos, 2i+1) = cos(…). Each dimension oscillates at a different frequency — low dims wiggle fast (fine position), high dims slowly (coarse position) — like binary counting in continuous form. Properties: no learned parameters, unique encoding per position, and relative offsets are expressible as linear transforms of the encodings. Limit: it's ABSOLUTE position added to content, entangling the two.",
        questions: [
          { q: "Why multiple frequencies across dimensions?", options: ["fine and coarse position at different scales", "to randomize the initialization", "to keep the norm exactly one", "frequencies are an implementation accident"], a: 0, why: "A multi-scale ruler: fast dims resolve neighbors, slow dims resolve regions." },
          { q: "Sinusoidal PE's structural limitation:", options: ["it encodes absolute position, entangled with content", "it requires training extra parameters", "it cannot represent position 0", "it only works for even dimensions"], a: 0, why: "Added to embeddings, position and meaning mix; attention often cares about RELATIVE offsets." },
        ] },
      { id: "rope", name: "RoPE", sprite: "🌀",
        lore: "Rotary Position Embedding rotates each query/key 2D-pair by an angle proportional to its position: q at position m becomes R(mθᵢ)q per frequency θᵢ. The magic: the dot product q_m·k_n then depends only on (m−n) — relative position emerges from absolute rotations, with zero added parameters and no vectors added to the residual stream. Long-context extension: positions beyond training length extrapolate poorly, so methods rescale θ — NTK-aware scaling, YaRN — stretching the rotation frequencies to cover longer sequences.",
        questions: [
          { q: "RoPE's central property: q_m·k_n depends on…", options: ["only the relative offset m−n", "the absolute positions separately", "the token embeddings' norms", "the layer index"], a: 0, why: "Rotation angles subtract inside the dot product — relativity for free." },
          { q: "NTK/YaRN-style scaling addresses…", options: ["extrapolation past the trained context length", "the memory cost of rotations", "gradient explosion in deep layers", "tokenizer vocabulary growth"], a: 0, why: "Stretch the frequency spectrum so longer positions stay in-distribution." },
        ] },
      { id: "semantic", name: "Semantic Embeddings", sprite: "💠",
        lore: "Separate concern: representation embeddings for retrieval/similarity. Trained contrastively (like CLIP's text tower, or sentence-transformers): pull paired texts together, push negatives apart — hard negatives matter enormously. Pooling turns token vectors into one (CLS, mean, or last-token for decoder models). Practical knobs: cosine similarity as metric, dimension truncation via Matryoshka training (a 1024-d model whose first 256 dims still work), and the asymmetry of query vs document prompts.",
        questions: [
          { q: "Hard negatives in contrastive training are…", options: ["similar-but-wrong pairs that sharpen boundaries", "examples with corrupted labels", "the largest gradient batches", "tokens outside the vocabulary"], a: 0, why: "Easy negatives teach nothing; near-misses define the decision surface." },
          { q: "Matryoshka embeddings allow…", options: ["truncating dimensions with graceful degradation", "infinitely long input sequences", "training without any negatives", "lossless compression of the corpus"], a: 0, why: "Information ordered by prefix importance — cut to 256-d and keep most quality." },
        ] },
    ],
    sides: [
      { id: "emb-s1", name: "Context Stretcher", sprite: "🦒", anchor: 1, recLevel: 3, prereqs: ["sinusoidal", "rope"],
        desc: "Pulls your sequences far past training length and watches what breaks.",
        code: `# RoPE in ~10 lines (pytorch)
def rope(x, pos):                  # x: [seq, dim]
    d = x.shape[-1]
    theta = 10000 ** (-torch.arange(0, d, 2) / d)
    ang = pos[:, None] * theta[None, :]      # [seq, d/2]
    cos, sin = ang.cos(), ang.sin()
    x1, x2 = x[..., 0::2], x[..., 1::2]
    return torch.stack(
        [x1*cos - x2*sin, x1*sin + x2*cos], -1
    ).flatten(-2)   # rotate each 2D pair`,
        codeNote: "Apply to q and k (never v). The dot product then sees only m−n.",
        questions: [
          { q: "SCENARIO: Model trained at 8k context degrades sharply at 32k. Looking at the code, the fix targets…", options: ["theta — rescale frequencies (NTK/YaRN style)", "the .flatten(-2) reshape order", "applying rope to v as well", "removing cos and keeping only sin"], a: 0, why: "Out-of-range angles are the problem; stretch the spectrum." },
          { q: "SCENARIO: A bug applies RoPE to values too. The observable symptom:", options: ["degraded outputs — v carries content that's now position-warped", "no change — v rotation cancels out", "a shape mismatch crash", "doubled attention scores"], a: 0, why: "Values are the payload; rotating them corrupts content with position." },
          { q: "RETENTION: Why does relative beat absolute position for language?", options: ["'the adjective before this noun' matters; 'token #847' doesn't", "absolute encodings overflow integers", "relative encodings are smaller tensors", "absolute position breaks the causal mask"], a: 0, why: "Linguistic structure is built from offsets, not coordinates." },
        ] },
    ],
    gym: { leader: "Librarian Theta", badge: "Position Badge", sprite: "🏛️", taunt: "Locate yourself!",
      questions: [
        { q: "Without positional information, self-attention treats input as…", options: ["a bag of tokens — order-invariant", "a strictly ordered sequence", "a tree of dependencies", "a single pooled vector"], a: 0, why: "Permutation invariance is attention's default; position must be injected." },
        { q: "RoPE adds how many learned parameters?", options: ["zero", "one per attention head", "d per layer", "a full position embedding table"], a: 0, why: "Pure deterministic rotation — that's part of its elegance." },
        { q: "Retrieval embeddings vs LLM token embeddings differ chiefly in…", options: ["training objective: contrastive vs next-token", "numerical precision used", "whether positions are encoded", "vocabulary size"], a: 0, why: "Same idea (vectors for meaning), different forces shaping the space." },
      ] },
  }],
},
{
  id: "w-attn", title: "Attention Mechanisms", emoji: "🔍",
  links: [
    { label: "3b1b · Attention, visually explained", url: "https://www.youtube.com/watch?v=eMlx5fFNoYc" },
    { label: "Raschka · Visual Guide to Attention Variants", url: "https://magazine.sebastianraschka.com/p/visual-attention-variants" },
  ],
  regions: [{
    id: "attn-r", name: "The Head Court", emoji: "🔍",
    intro: "MHA's royal court, and the pretenders trimming its costs.",
    npc: { name: "Judge QKV", text: "Every attention variant you'll meet exists for one reason: the KV cache. At inference, every generated token attends over all cached keys/values — cache size = layers × kv_heads × seq × head_dim × 2. Shrink kv_heads (MQA/GQA), shrink seq (sliding window), or compress the cache itself (MLA). Memory is the battlefield." },
    concepts: [
      { id: "mqagqa", name: "MQA & GQA", sprite: "👥",
        lore: "Multi-Head Attention gives every query head its own K and V heads. Multi-Query Attention (MQA) keeps all query heads but shares ONE K/V head — cache shrinks by n_heads×, with some quality cost. Grouped-Query Attention interpolates: groups of query heads share a K/V head (e.g., 32 q-heads, 8 kv-heads → 4× cache reduction, near-MHA quality). GQA is the modern default (Llama, Gemma, Qwen). The cache formula's kv_heads term is exactly what these attack.",
        questions: [
          { q: "GQA with 32 query heads and 8 KV heads reduces the KV cache by…", options: ["4× versus full MHA", "32× versus full MHA", "8× versus full MHA", "it doesn't change the cache"], a: 0, why: "Cache scales with KV heads: 32/8 = 4× reduction." },
          { q: "MQA is the special case of GQA where…", options: ["kv_heads = 1", "kv_heads = n_heads", "queries are shared instead", "the cache is disabled"], a: 0, why: "One K/V head serving every query head — maximum sharing." },
        ] },
      { id: "swa", name: "Sliding Window", sprite: "🪟",
        lore: "Sliding-window attention restricts each token to attend only the last W tokens — cache and compute become O(W) instead of O(seq). Information still propagates beyond W through depth: layer L sees an effective receptive field of ~L×W. Modern designs interleave: Gemma-style patterns run several sliding-window layers per full-attention layer (e.g., 4:1 ratio), keeping a few global layers for long-range retrieval while most layers stay cheap. Cousin ideas: attention sinks (always-attended first tokens) stabilize long streaming contexts.",
        questions: [
          { q: "With window W and depth L, information can propagate roughly…", options: ["L×W tokens through stacked layers", "exactly W tokens, hard limit", "only within one layer", "the full sequence at every layer"], a: 0, why: "Each layer extends reach by W — depth buys range." },
          { q: "Why interleave full-attention layers among sliding ones?", options: ["a few global layers preserve long-range retrieval", "full layers are cheaper than windowed", "windowed layers cannot be trained", "the cache requires at least one"], a: 0, why: "Most layers local and cheap; occasional global layers keep needle-in-haystack ability." },
        ] },
      { id: "mla", name: "MLA & Compression", sprite: "🗜️",
        lore: "Multi-head Latent Attention (DeepSeek) compresses K and V into a small shared latent vector cached instead of full heads; at attention time the latent is up-projected. Cache shrinks dramatically while, per DeepSeek's ablations, quality can exceed GQA. The 2025-26 frontier pushes further: cross-layer KV sharing (Gemma 4 — later layers reuse earlier layers' KV tensors, halving the cache), per-layer attention budgets, and compressed/convolutional attention variants — all chasing long-context memory for reasoning and agent workloads.",
        questions: [
          { q: "MLA caches…", options: ["a compressed latent, up-projected at use", "every head's full K and V", "only the values, never keys", "attention scores directly"], a: 0, why: "Store small, decompress on demand — the latent IS the cache." },
          { q: "Cross-layer KV sharing (Gemma-4 style) means…", options: ["later layers reuse earlier layers' K/V tensors", "all layers share one query projection", "KV tensors are shared across batch items", "the cache moves to CPU memory"], a: 0, why: "Layers keep their own queries but borrow KV — roughly halving cache." },
        ] },
    ],
    sides: [
      { id: "attn-s1", name: "Cache Goblin", sprite: "👹", anchor: 1, recLevel: 4, prereqs: ["mqagqa", "swa", "mla"],
        desc: "Hoards your VRAM. Do the memory math to drive it out.",
        code: `# KV cache size, bytes (bf16 = 2 bytes)
cache = (n_layers * n_kv_heads * head_dim
         * seq_len * 2 * 2)
# ex: 32 layers, 8 kv-heads, 128 dim, 128k ctx
#   = 32*8*128*131072*4 bytes ≈ 17.2 GB
# MHA (32 kv-heads) would be ≈ 68.7 GB!`,
        codeNote: "This formula is the whole reason MQA/GQA/MLA/SWA exist. Memorize its terms.",
        questions: [
          { q: "SCENARIO: Using the formula, switching that model from 8 kv-heads to MQA (1 kv-head) gives a cache of roughly…", options: ["≈ 2.1 GB", "≈ 8.6 GB", "≈ 34 GB", "≈ 17.2 GB (unchanged)"], a: 0, why: "17.2 GB × (1/8) ≈ 2.15 GB — kv_heads is a linear factor." },
          { q: "SCENARIO: An agent workload keeps 200k-token traces and your retrieval quality on far-back tool outputs matters. Pure sliding-window everywhere risks…", options: ["losing direct access to distant context in most layers", "quadratic memory growth", "router collapse", "broken causal masking"], a: 0, why: "Local windows trade away global lookback — hence interleaved full layers." },
          { q: "RETENTION: Why is KV-cache pressure WORSE in the reasoning/agent era specifically?", options: ["long chains-of-thought and tool traces keep far more tokens resident", "models stopped using attention", "GPUs lost memory capacity", "tokenizers became less efficient"], a: 0, why: "Reasoning + agents = long-lived contexts; cache cost dominates serving." },
        ] },
    ],
    gym: { leader: "Judge QKV", badge: "Attention Badge", sprite: "🏛️", taunt: "Order in the court of heads!",
      questions: [
        { q: "Rank by KV-cache size, smallest first (same dims):", options: ["MQA < GQA < MHA", "MHA < GQA < MQA", "GQA < MQA < MHA", "all identical"], a: 0, why: "1 head < grouped heads < all heads." },
        { q: "MLA differs from GQA fundamentally by…", options: ["compressing the cache rather than reducing head count", "removing queries entirely", "using convolution instead of attention", "caching attention probabilities"], a: 0, why: "GQA shares heads; MLA stores a learned low-rank latent." },
        { q: "The unifying motive across MQA, GQA, SWA, MLA, and cross-layer sharing:", options: ["shrink KV-cache memory for long contexts", "increase parameter counts", "improve tokenizer throughput", "eliminate positional encodings"], a: 0, why: "Judge QKV's opening statement: memory is the battlefield." },
      ] },
  }],
},
{
  id: "w-infer", title: "Inference Systems", emoji: "⚙️",
  links: [
    { label: "Raschka · Coding the KV Cache from Scratch", url: "https://magazine.sebastianraschka.com/p/coding-the-kv-cache-in-llms" },
  ],
  regions: [{
    id: "inf-r", name: "The Serving Forge", emoji: "⚙️",
    intro: "Where tokens-per-second is hammered out.",
    npc: { name: "Foreman Throughput", text: "Two phases rule serving: PREFILL (process the whole prompt — compute-bound, parallel) and DECODE (one token at a time — memory-bandwidth-bound, the cache read dominates). Most serving wisdom is managing decode's memory traffic and keeping GPUs busy across requests." },
    concepts: [
      { id: "kvcache", name: "KV Cache", sprite: "📦",
        lore: "Without caching, generating token N recomputes attention over all N−1 prior tokens' K/V from scratch — O(N²) per token, O(N³) per sequence. The KV cache stores each token's keys/values once; each new token computes only its own q/k/v and attends over the cache: O(N) per token. The price: memory that grows linearly with sequence and batch, which is why cache size (not FLOPs) usually caps concurrent users, and why attention variants attack it.",
        questions: [
          { q: "The KV cache converts per-token generation cost from…", options: ["O(N²) recomputation to O(N) lookup+attend", "O(N) to O(1)", "memory-bound to compute-bound", "linear to logarithmic"], a: 0, why: "Compute each K/V once, reuse forever." },
          { q: "In long-context serving, concurrency is usually capped by…", options: ["KV-cache memory, not FLOPs", "the tokenizer's speed", "disk I/O bandwidth", "the optimizer state size"], a: 0, why: "Decode is memory-bound; cache bytes are the scarce resource." },
        ] },
      { id: "paged", name: "PagedAttention & Batching", sprite: "📑",
        lore: "Naive serving pre-allocates max-length cache per request — most of it wasted (fragmentation). PagedAttention (vLLM) borrows OS virtual memory: cache lives in fixed-size blocks, a block table maps each sequence's logical positions to scattered physical blocks; allocation is on demand, and identical prefixes can SHARE blocks (copy-on-write) — huge for system prompts. Continuous batching evicts finished sequences and admits new ones at token granularity instead of waiting for the whole batch, keeping the GPU saturated.",
        questions: [
          { q: "PagedAttention's core idea borrowed from operating systems:", options: ["block tables mapping logical to physical cache pages", "swapping the model weights to disk", "scheduling requests round-robin", "compressing pages with zlib"], a: 0, why: "Virtual-memory-style paging kills fragmentation and enables sharing." },
          { q: "Continuous batching improves throughput by…", options: ["admitting/evicting requests at token granularity", "making all requests the same length", "batching only identical prompts", "skipping the prefill phase"], a: 0, why: "No GPU idle time waiting for the batch's slowest member." },
        ] },
      { id: "parallel", name: "Parallelism", sprite: "🔱",
        lore: "When a model exceeds one GPU: TENSOR PARALLELISM splits individual matrices across devices (each holds a slice of every layer; all-reduce syncs activations every layer — needs fast interconnect like NVLink). PIPELINE PARALLELISM assigns whole layer ranges to devices, micro-batching to keep stages busy (bubble overhead). EXPERT PARALLELISM shards MoE experts with all-to-all token routing. Real deployments compose them: TP within a node, PP across nodes, EP for the MoE layers — plus speculative decoding to cut decode latency.",
        questions: [
          { q: "Tensor parallelism's defining communication cost:", options: ["all-reduce on activations every layer", "one transfer at the pipeline boundary", "no communication at all", "gradient averaging per epoch"], a: 0, why: "Sliced matrices must reassemble activations constantly — interconnect-hungry." },
          { q: "Pipeline parallelism's characteristic inefficiency:", options: ["bubbles — stages idle awaiting upstream", "duplicated weights on all devices", "all-to-all token shuffling", "cache fragmentation"], a: 0, why: "Stage dependencies leave idle gaps; micro-batches shrink but don't erase them." },
        ] },
    ],
    sides: [
      { id: "inf-s1", name: "Latency Leech", sprite: "🦠", anchor: 1, recLevel: 4, prereqs: ["kvcache", "paged", "parallel"],
        desc: "Sucks milliseconds from your p99. Diagnose its bite marks.",
        questions: [
          { q: "SCENARIO: Your chat service has a 3k-token system prompt shared by all users. PagedAttention's gift here:", options: ["prefix blocks shared copy-on-write across requests", "the system prompt skips attention", "prompts compress to one block", "decode becomes compute-bound"], a: 0, why: "One physical copy of the shared prefix serves every request." },
          { q: "SCENARIO: GPU utilization graphs show sawtooth idle gaps between batches; some users wait for unrelated long generations. The fix:", options: ["continuous batching at token granularity", "tensor parallelism across more GPUs", "a larger maximum batch size", "longer max sequence lengths"], a: 0, why: "Static batching's lockstep is the sawtooth; continuous batching erases it." },
          { q: "SCENARIO: Serving a 70B dense model across 2 nodes (8 GPUs each, NVLink within, slow Ethernet between). Sensible layout:", options: ["TP within each node, PP across the nodes", "TP across all 16 GPUs uniformly", "PP within nodes, TP across them", "EP everywhere — it's dense anyway"], a: 0, why: "Match communication patterns to interconnects: chatty TP on NVLink, boundary-only PP on Ethernet." },
        ] },
    ],
    gym: { leader: "Foreman Throughput", badge: "Serving Badge", sprite: "🏛️", taunt: "Tokens per second or perish!",
      questions: [
        { q: "Prefill vs decode bottlenecks:", options: ["compute-bound vs memory-bandwidth-bound", "both compute-bound", "memory-bound vs compute-bound", "both network-bound"], a: 0, why: "Parallel prompt math saturates FLOPs; one-token decode drowns in cache reads." },
        { q: "Speculative decoding accelerates…", options: ["decode, by verifying cheap draft tokens in parallel", "prefill, by skipping the prompt", "training, by reusing gradients", "tokenization, by caching merges"], a: 0, why: "Draft model proposes; target model verifies several tokens per pass." },
        { q: "This world and the Attention world meet at:", options: ["KV-cache size as the central serving constraint", "the choice of optimizer", "the tokenizer's vocabulary", "weight initialization schemes"], a: 0, why: "Architecture (GQA/MLA/SWA) and systems (paging) attack the same bytes." },
      ] },
  }],
},
{
  id: "w-ae", title: "Autoencoders", emoji: "🪞",
  links: [
    { label: "CNN Explainer (interactive)", url: "https://poloclub.github.io/cnn-explainer/" },
    { label: "Lilian Weng · From AE to VAE", url: "https://lilianweng.github.io/posts/2018-08-12-vae/" },
  ],
  regions: [{
    id: "ae-r", name: "The Bottleneck Mines", emoji: "🪞",
    intro: "Compress to understand; reconstruct to prove it.",
    npc: { name: "Miner Latent", text: "An autoencoder squeezes input through a bottleneck and tries to rebuild it. The bottleneck forces the network to keep only what matters — the latent code IS the learned understanding. Everything in this mine is a variation on what to do with that code." },
    concepts: [
      { id: "vanilla", name: "The Bottleneck", sprite: "⏳",
        lore: "Encoder f: x → z (low-dimensional), decoder g: z → x̂, loss ‖x − x̂‖². With z smaller than x, perfect copying is impossible — the network must learn structure. Uses: dimensionality reduction (nonlinear PCA), denoising (corrupt input, reconstruct clean — forces robust features), and anomaly detection: train on normal data; anomalies reconstruct poorly, so reconstruction error becomes the anomaly score. The latent is deterministic and unstructured — fine for compression, useless for sampling new data.",
        questions: [
          { q: "Why must the bottleneck be smaller (or otherwise constrained) than the input?", options: ["otherwise identity copying learns nothing", "decoders cannot handle equal dimensions", "gradients vanish in wide latents", "the loss is undefined otherwise"], a: 0, why: "Constraint is the teacher — no squeeze, no structure." },
          { q: "Anomaly detection with an AE works because…", options: ["unseen patterns reconstruct with high error", "anomalies have larger latent norms", "the encoder rejects unknown inputs", "the decoder memorizes anomalies"], a: 0, why: "The AE learned 'normal'; anything off-manifold comes back mangled." },
        ] },
      { id: "vae", name: "VAE", sprite: "🎲",
        lore: "The Variational Autoencoder makes the latent a distribution: the encoder outputs μ and σ; z is sampled as z = μ + σ⊙ε (the reparameterization trick — moving randomness to ε ~ N(0,I) so gradients flow through μ, σ). The loss is the ELBO: reconstruction + KL(q(z|x) ‖ N(0,I)). The KL term packs latents into a smooth standard-normal ball, so decoding a random z yields coherent samples — a true generative model. Tension: heavy KL → blurry reconstructions; light KL → broken sampling.",
        questions: [
          { q: "The reparameterization trick exists so that…", options: ["gradients can flow through the sampling step", "the decoder sees discrete codes", "KL becomes computable in closed form", "the encoder needs fewer parameters"], a: 0, why: "z = μ + σ⊙ε makes sampling differentiable w.r.t. μ and σ." },
          { q: "The KL term in the ELBO does what to latent space?", options: ["regularizes it toward a smooth standard normal", "expands it to higher dimensions", "discretizes it into clusters", "removes it entirely"], a: 0, why: "Smooth, centered latents make random sampling decode coherently." },
        ] },
      { id: "vqvae", name: "VQ-VAE", sprite: "🧊",
        lore: "Vector-Quantized VAE makes latents DISCRETE: encoder outputs are snapped to the nearest entry in a learned codebook; the decoder reconstructs from codebook vectors. The straight-through estimator copies gradients past the non-differentiable snap. Why discrete? Tokens! Images become grids of codebook indices that autoregressive transformers (or diffusion) can model — the foundation of modern image/audio tokenization (and the VAE inside latent diffusion is its continuous cousin). Codebook collapse (few codes used) is the classic failure, fought with commitment losses and EMA updates.",
        questions: [
          { q: "VQ-VAE's discrete codes matter because…", options: ["they let sequence models treat images as token grids", "discrete values train faster than continuous", "they eliminate the decoder", "they require no codebook"], a: 0, why: "Quantization turns perception into a language transformers speak." },
          { q: "The straight-through estimator handles…", options: ["gradients across the non-differentiable quantization", "codebook initialization", "decoder upsampling", "KL annealing schedules"], a: 0, why: "Forward snaps to nearest code; backward pretends it was identity." },
        ] },
    ],
    sides: [
      { id: "ae-s1", name: "Reconstruction Wraith", sprite: "🫥", anchor: 0, recLevel: 2, prereqs: ["vanilla", "vae"],
        desc: "Returns your inputs slightly wrong and grades your diagnosis.",
        questions: [
          { q: "SCENARIO: Detecting anomalous ECG beats with no anomaly labels. The AE recipe:", options: ["train on normal beats; flag high reconstruction error", "train on anomalies; flag low error", "train a classifier with random labels", "cluster latents and discard small clusters"], a: 0, why: "Learn normal; let error expose the abnormal — label-free." },
          { q: "SCENARIO: Your VAE samples are coherent but reconstructions look blurry and generic. The dial to examine:", options: ["KL weight — it's crushing latent information", "the learning rate warmup", "batch normalization momentum", "the codebook size"], a: 0, why: "Over-regularized latents lose instance detail — the classic VAE trade-off (β tuning)." },
          { q: "RETENTION: Latent diffusion (from the Diffusion world) runs inside which component from THIS world?", options: ["a VAE's compressed latent space", "a VQ codebook's index grid", "the encoder's gradient buffer", "the anomaly score map"], a: 0, why: "Stable Diffusion = diffusion model living in a VAE latent — the worlds connect." },
        ] },
    ],
    gym: { leader: "Miner Latent", badge: "Latent Badge", sprite: "🏛️", taunt: "Compress me if you can!",
      questions: [
        { q: "AE vs VAE vs VQ-VAE latents:", options: ["deterministic / Gaussian-distributed / discrete codes", "discrete / deterministic / Gaussian", "all three are Gaussian", "all three are discrete"], a: 0, why: "Point, distribution, codebook index — the family's axis of variation." },
        { q: "Which can natively GENERATE new samples from noise?", options: ["the VAE (decode z ~ N(0,I))", "the vanilla AE", "neither — only GANs generate", "only with a classifier attached"], a: 0, why: "The KL term made N(0,I) meaningful territory for the decoder." },
        { q: "Denoising autoencoders foreshadow which later family?", options: ["diffusion models — learned iterative denoising", "mixture of experts", "contrastive embeddings", "tree search"], a: 0, why: "Corrupt-then-reconstruct, scaled to a full noise schedule, is diffusion." },
      ] },
  }],
},
{
  id: "w-kl", title: "KL Divergence", emoji: "📐",
  links: [
    { label: "3b1b · Neural networks playlist", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi" },
  ],
  regions: [{
    id: "kl-r", name: "The Asymmetry Chasm", emoji: "📐",
    intro: "One formula, two personalities, depending on which side you stand.",
    npc: { name: "Twin Sigma", text: "KL(P‖Q) = Σ P log(P/Q) measures how badly Q models P — in extra nats of surprise. It is NOT symmetric: KL(P‖Q) ≠ KL(Q‖P). Which argument holds your data and which holds your model decides EVERYTHING about how your model fails." },
    concepts: [
      { id: "kldef", name: "The Definition", sprite: "📏",
        lore: "KL(P‖Q) = E_{x~P}[log P(x) − log Q(x)]: the expected extra code length when encoding samples from P using a code optimized for Q. Always ≥ 0, zero iff P = Q. The expectation is taken under the FIRST argument — that's the source of all asymmetry. Where P assigns mass but Q assigns ~zero, the ratio explodes: KL punishes Q's failure to cover P's support catastrophically, but ignores regions where P itself is zero.",
        questions: [
          { q: "KL(P‖Q) explodes when…", options: ["P has mass where Q has nearly none", "Q has mass where P has none", "both distributions are uniform", "P equals Q exactly"], a: 0, why: "log(P/Q) → ∞ under P's expectation when Q fails to cover P." },
          { q: "The expectation in KL(P‖Q) is taken under…", options: ["P, the first argument", "Q, the second argument", "the uniform distribution", "whichever has higher entropy"], a: 0, why: "Samples come from P; Q is the model being graded — hence the asymmetry." },
        ] },
      { id: "fwdkl", name: "Forward KL", sprite: "🫳",
        lore: "Forward KL = KL(data ‖ model): expectation under the DATA. The model must place mass everywhere the data does, or pay infinitely — so it becomes MEAN-SEEKING / mass-covering: faced with a multimodal target it can't fit, it spreads itself across all modes (even covering empty valleys between them). Maximum likelihood training IS forward KL minimization — which is why MLE-trained models (including LLMs under cross-entropy) over-cover: they'd rather hedge over everything plausible than miss a mode.",
        questions: [
          { q: "Minimizing forward KL against a two-peak target with a single Gaussian yields…", options: ["a wide Gaussian straddling both peaks", "a sharp fit to one peak only", "a uniform distribution", "a degenerate point mass"], a: 0, why: "Mass-covering: missing either peak costs infinitely; covering the valley is cheap." },
          { q: "Cross-entropy / MLE training corresponds to…", options: ["minimizing forward KL(data ‖ model)", "minimizing reverse KL(model ‖ data)", "maximizing both KLs jointly", "minimizing Jensen-Shannon only"], a: 0, why: "E_data[−log model] = forward KL + constant entropy term." },
        ] },
      { id: "revkl", name: "Reverse KL", sprite: "🫴",
        lore: "Reverse KL = KL(model ‖ target): expectation under the MODEL. The model only pays for mass IT places — so it's MODE-SEEKING: it locks onto one high-probability mode and confidently ignores the rest (zero-forcing). This is variational inference's choice (VAE's KL term), and crucially it's RLHF's anchor: the penalty KL(π ‖ π_ref) is reverse KL under the policy's own samples — the policy may sharpen within the reference's support but is punished for venturing where the reference assigns little mass. Mode-seeking is exactly the personality you want from an aligned policy.",
        questions: [
          { q: "Reverse KL against a two-peak target with a single Gaussian yields…", options: ["a sharp fit to one peak, ignoring the other", "a wide straddle across both", "an exact bimodal copy", "a uniform spread"], a: 0, why: "Mode-seeking: it only pays where IT puts mass — pick a peak, commit." },
          { q: "The RLHF penalty KL(π‖π_ref) is reverse KL, which means the policy…", options: ["may sharpen within reference support but not stray outside it", "must cover every reference behavior", "is pushed toward uniform outputs", "ignores the reference entirely"], a: 0, why: "Expectation under π: straying off π_ref's support is what gets punished." },
        ] },
    ],
    sides: [
      { id: "kl-s1", name: "Mode Mirage", sprite: "🏜️", anchor: 1, recLevel: 4, prereqs: ["kldef", "fwdkl", "revkl"],
        desc: "Shimmering distributions; choose your divergence or chase illusions.",
        code: `# forward vs reverse KL between Gaussians (numpy)
import numpy as np
x = np.linspace(-8, 8, 2001); dx = x[1]-x[0]
def g(mu, s): p = np.exp(-(x-mu)**2/(2*s*s)); return p/(p.sum()*dx)
P = 0.5*g(-3,.7) + 0.5*g(3,.7)   # bimodal data
Q = g(0, 3.2)                     # mean-seeking fit
kl_fwd = np.sum(P*np.log((P+1e-12)/(Q+1e-12)))*dx  # small-ish
Q2 = g(3, .7)                     # mode-seeking fit
kl_rev = np.sum(Q2*np.log((Q2+1e-12)/(P+1e-12)))*dx # also small!`,
        codeNote: "Both fits are 'good' — under DIFFERENT divergences. The choice of divergence chooses the failure mode.",
        questions: [
          { q: "SCENARIO: Distilling a big model into a small one and you want the student to commit to the teacher's best behaviors rather than blurrily average all of them. Direction?", options: ["reverse KL(student ‖ teacher)", "forward KL(teacher ‖ student)", "symmetrized JS divergence only", "either — they're equivalent here"], a: 0, why: "Mode-seeking distillation sharpens; forward KL would force covering everything including mediocrity." },
          { q: "SCENARIO: In RLHF, swap the anchor to FORWARD KL(π_ref ‖ π). The new failure you'd expect:", options: ["the policy forced to cover ALL reference behaviors, even unwanted ones", "the policy collapsing to a single token", "no change — KL is symmetric", "gradients ceasing to flow"], a: 0, why: "Forward KL is mass-covering: π must spread over everything π_ref does." },
          { q: "RETENTION: The VAE's KL(q(z|x) ‖ N(0,I)) is which direction, with which personality?", options: ["reverse-style: q is mode-seeking within the prior", "forward-style: the prior must cover q", "symmetric by construction", "not actually a KL divergence"], a: 0, why: "Expectation under q — the encoder posterior nestles inside the prior's support." },
        ] },
    ],
    gym: { leader: "Twin Sigma", badge: "Divergence Badge", sprite: "🏛️", taunt: "Stand on the correct side of the chasm!",
      questions: [
        { q: "KL(P‖Q) vs KL(Q‖P):", options: ["generally unequal — KL is asymmetric", "always equal by definition", "equal only for Gaussians", "negatives of each other"], a: 0, why: "Different expectations, different penalties, different personalities." },
        { q: "Mean-seeking : mode-seeking ::", options: ["forward KL : reverse KL", "reverse KL : forward KL", "MLE : cross-entropy", "prior : posterior"], a: 0, why: "Cover the mass vs commit to a peak." },
        { q: "One sentence that ties this world to the RL world:", options: ["the PPO/GRPO reference penalty is reverse KL under the policy's samples", "advantages are KL divergences", "rewards must be symmetric like KL", "GAE computes forward KL"], a: 0, why: "The anchor that keeps RLHF sane is exactly reverse KL's mode-seeking leash." },
      ] },
  }],
},
{
  id: "w-arch", title: "LLM Architectures", emoji: "🏛️",
  links: [
    { label: "Raschka · LLM Architecture Gallery", url: "https://sebastianraschka.com/llm-architecture-gallery/" },
    { label: "Raschka · Recent Developments (KV sharing, mHC)", url: "https://magazine.sebastianraschka.com/p/recent-developments-in-llm-architectures" },
    { label: "Transformer Explainer (interactive)", url: "https://poloclub.github.io/transformer-explainer/" },
  ],
  regions: [{
    id: "arch-r", name: "The Gallery of Blocks", emoji: "🏛️",
    intro: "Every modern LLM is the same skeleton wearing different efficiency jewelry.",
    npc: { name: "Curator Raschka's Echo", text: "Walk the gallery and you'll see one skeleton everywhere: decoder-only, pre-norm RMSNorm, RoPE, GQA-family attention, SwiGLU FFNs, often MoE. The differences that matter in 2025-26 are almost all about ONE thing: cutting long-context cost — KV sharing, latent compression, sliding windows, attention budgets." },
    concepts: [
      { id: "recipe", name: "The Modern Recipe", sprite: "📜",
        lore: "The post-Llama consensus block: decoder-only transformer; PRE-norm placement with RMSNorm (cheaper than LayerNorm, no mean-centering); RoPE for position; GQA attention; SwiGLU feed-forward (gated: (W₁x ⊙ swish(W_g x))W₂, outperforming plain ReLU/GELU MLPs); no biases; often QK-norm (normalizing queries/keys before attention) for training stability. Departures from GPT-2 — learned absolute positions, post-norm, GELU MLP, dropout — have each been replaced. Newer wrinkles: NoPE in some layers (Llama-4 lineage) and hybrid linear-attention layers (Qwen3-Next-style) for long context.",
        questions: [
          { q: "The modern consensus stack:", options: ["pre-norm RMSNorm + RoPE + GQA + SwiGLU", "post-norm LayerNorm + learned positions + MHA + GELU", "encoder-decoder + sinusoidal + MQA + ReLU", "pre-norm BatchNorm + ALiBi + MLA + GLU"], a: 0, why: "The Llama-era recipe nearly every 2024-26 open model shares." },
          { q: "SwiGLU differs from a plain MLP by…", options: ["a multiplicative learned gate on the hidden activation", "having no nonlinearity at all", "running in the attention module", "using convolution instead of matmul"], a: 0, why: "The gating (swish branch ⊙ value branch) is the expressivity win." },
        ] },
      { id: "deepseek", name: "The DeepSeek Lineage", sprite: "🐋",
        lore: "DeepSeek's contributions define the efficiency frontier: MLA (latent-compressed KV cache, often beating GQA in quality per ablations), fine-grained MoE with many small routed experts plus a shared expert and auxiliary-loss-free load balancing, and multi-token prediction (MTP) as auxiliary training signal. V3 set the 671B-total/37B-active template; R1 added GRPO-based reasoning RL on top. The 2026 V4 generation pushes further with mHC (manifold-constrained hyper-connections — multiple weighted residual streams replacing the single residual, constrained for stability) and compressed attention for long-context cost.",
        questions: [
          { q: "DeepSeek-V3's headline numbers, 671B total / 37B active, are possible because of…", options: ["fine-grained MoE — most parameters sleep per token", "extreme quantization to 2 bits", "weight sharing across all layers", "running on CPU memory"], a: 0, why: "Sparse routing: capacity scales while active compute stays small." },
          { q: "Hyper-connections (mHC) modify which classic component?", options: ["the single residual stream becomes multiple weighted streams", "the tokenizer's merge rules", "the attention softmax", "the optimizer's momentum"], a: 0, why: "Widening the residual highway, with manifold constraints keeping training stable." },
        ] },
      { id: "efficiency", name: "The 2026 Efficiency Wave", sprite: "🌊",
        lore: "As reasoning and agents keep more tokens alive longer, KV-cache cost became THE design driver. Gemma 4: cross-layer KV sharing (later layers reuse earlier layers' KV — E2B shares across ~20 of 35 layers, halving cache, saving ~2.7GB at 128k) plus per-layer embeddings (PLE: cheap per-layer token vectors gated into the residual, boosting capacity without widening the stack — 'effective' 2.3B vs 5.1B total). Laguna XS.2: layer-wise attention budgeting. ZAYA1: compressed convolutional attention. The pattern: spend architecture complexity to buy long-context memory.",
        questions: [
          { q: "Gemma 4's cross-layer KV sharing has later layers…", options: ["reuse KV tensors from earlier layers of the same attention type", "skip attention entirely", "share query projections only", "recompute KV from scratch each step"], a: 0, why: "Own queries, borrowed KV — sliding layers borrow from sliding, full from full." },
          { q: "Per-layer embeddings (PLE) add capacity via…", options: ["cheap layer-specific token vectors gated into the residual", "doubling every FFN's width", "extra attention heads per layer", "a second full transformer stack"], a: 0, why: "Lookup-style parameters instead of expensive stack widening — hence 'effective' size." },
        ] },
    ],
    sides: [
      { id: "arch-s1", name: "Gallery Phantom", sprite: "🖼️", anchor: 1, recLevel: 5, prereqs: ["recipe", "deepseek", "efficiency"],
        desc: "Quizzes you across the whole gallery — this world AND the Attention world.",
        questions: [
          { q: "SCENARIO: Designing a 4B on-device model for 128k-context agent traces. Which gallery tricks compose naturally?", options: ["GQA/MQA + sliding-window 4:1 + cross-layer KV sharing", "MHA + learned positions + post-norm", "dense FFN scaled 8× wider", "encoder-decoder with cross-attention"], a: 0, why: "Exactly the Gemma-4-E recipe: every choice attacks cache or parameter cost." },
          { q: "SCENARIO: An architecture review claims 'MoE saves memory at batch-1 on-device'. Your correction:", options: ["MoE saves FLOPs; ALL experts still occupy memory", "MoE saves both equally", "MoE increases FLOPs but saves memory", "the claim is fully correct"], a: 0, why: "MoE-world retention: memory scales with total params — batch-1 local is MoE's weak spot." },
          { q: "RETENTION: MLA, GQA, sliding window, cross-layer sharing, compressed attention — the single sentence uniting them:", options: ["different attacks on the same enemy: KV-cache bytes at long context", "ways to grow the vocabulary", "alternatives to backpropagation", "methods to remove the FFN"], a: 0, why: "The curator's thesis — the 2025-26 architecture story is long-context economics." },
        ] },
    ],
    gym: { leader: "The Curator", badge: "Architecture Badge", sprite: "🏛️", taunt: "Name every block in my gallery!",
      questions: [
        { q: "Why did RMSNorm displace LayerNorm?", options: ["cheaper (no mean-centering) with equal quality", "it adds trainable biases", "it normalizes across the batch", "it removes the need for residuals"], a: 0, why: "Scale-only normalization: fewer ops, same stability in practice." },
        { q: "QK-norm addresses…", options: ["attention-logit explosions for training stability", "the KV-cache size", "tokenizer fragmentation", "expert load balancing"], a: 0, why: "Normalizing q,k before the dot product tames logit growth in deep/long training." },
        { q: "The honest summary of 2024→2026 architecture change:", options: ["evolution of one skeleton, driven by long-context efficiency", "a revolution replacing attention entirely", "a return to recurrent networks", "convergence on encoder-decoder designs"], a: 0, why: "Same bones, relentless KV-cache and capacity-per-FLOP refinement." },
      ] },
  }],
},
];

/* All built-in learn worlds */
const BUILTIN_WORLDS = [
  { id: "w-rl", title: "Agentic RL", emoji: "🤖", regions: RL_REGIONS,
    links: [
      { label: "Source primer · aman.ai Agentic RL", url: "https://aman.ai/primers/ai/agentic-RL/" },
      { label: "3b1b · But what is a GPT?", url: "https://www.youtube.com/watch?v=wjZofJX0v4M" },
    ] },
  ...ATLAS,
];

/* ============================================================
   THE DOJO — implementation katas
   Each: guided MCQ steps over real code, reference solutions
   per framework, study links, and AI code review.
   ============================================================ */
const KATAS = [
{
  id: "k-selfattn", family: "ml", title: "Self-Attention from Scratch", emoji: "🔍",
  blurb: "The core computation of every transformer: scores, scale, softmax, weighted sum.",
  frameworks: ["pytorch", "numpy", "jax"],
  links: [
    { label: "Transformer Explainer", url: "https://poloclub.github.io/transformer-explainer/" },
    { label: "3b1b · Attention, visually", url: "https://www.youtube.com/watch?v=eMlx5fFNoYc" },
  ],
  steps: [
    { prompt: "We project input X [seq, d] into queries, keys, values. Fill the blank:", code: `Q = X @ W_q     # [seq, d_k]
K = X @ W_k     # [seq, d_k]
V = X @ W_v     # [seq, d_v]
scores = ____            # [seq, seq]`,
      options: ["Q @ K.T", "K @ Q", "Q @ V.T", "Q.T @ K"], a: 0, why: "Each query dots against every key: [seq,d_k] @ [d_k,seq] → [seq,seq]." },
    { prompt: "Why divide scores by √d_k before softmax?", code: `scores = Q @ K.T / math.sqrt(d_k)`,
      options: ["large dot products saturate softmax, killing gradients", "it normalizes rows to sum to one", "it prevents integer overflow", "it makes scores symmetric"], a: 0, why: "Dot-product variance grows with d_k; unscaled logits push softmax into near-one-hot, vanishing-gradient territory." },
    { prompt: "Finish the computation:", code: `attn = softmax(scores, axis=-1)   # rows sum to 1
out  = ____`,
      options: ["attn @ V", "V @ attn", "attn @ K", "attn.T @ Q"], a: 0, why: "Each output token is its attention-weighted mixture of value vectors." },
  ],
  solutions: {
    pytorch: `import torch, math
def self_attention(X, W_q, W_k, W_v):
    Q, K, V = X @ W_q, X @ W_k, X @ W_v
    scores = Q @ K.transpose(-2, -1) / math.sqrt(Q.shape[-1])
    attn = torch.softmax(scores, dim=-1)
    return attn @ V

# sanity check
X = torch.randn(5, 16)
W = [torch.randn(16, 16) for _ in range(3)]
print(self_attention(X, *W).shape)  # torch.Size([5, 16])`,
    numpy: `import numpy as np
def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))  # stability!
    return e / e.sum(axis=axis, keepdims=True)
def self_attention(X, W_q, W_k, W_v):
    Q, K, V = X @ W_q, X @ W_k, X @ W_v
    scores = Q @ K.T / np.sqrt(Q.shape[-1])
    return softmax(scores) @ V`,
    jax: `import jax.numpy as jnp
from jax.nn import softmax
def self_attention(X, W_q, W_k, W_v):
    Q, K, V = X @ W_q, X @ W_k, X @ W_v
    scores = Q @ K.T / jnp.sqrt(Q.shape[-1])
    return softmax(scores, axis=-1) @ V
# jax.jit(self_attention) compiles it for free`,
  },
},
{
  id: "k-causalcross", family: "ml", title: "Causal & Cross Attention", emoji: "🎭",
  blurb: "Masking the future for decoders; attending across sequences for encoder-decoder and VLMs.",
  frameworks: ["pytorch"],
  links: [{ label: "Transformer Explainer", url: "https://poloclub.github.io/transformer-explainer/" }],
  steps: [
    { prompt: "Causal masking: token i must not see tokens j > i. Which mask, applied where?", code: `scores = Q @ K.T / math.sqrt(d)
mask = torch.triu(torch.ones(T, T), diagonal=1).bool()
scores = scores.____`,
      options: ["masked_fill(mask, float('-inf'))", "masked_fill(mask, 0.0)", "mul(mask)", "masked_fill(~mask, float('-inf'))"], a: 0, why: "Future positions get −inf BEFORE softmax → exactly zero probability. Filling 0 would still leak attention." },
    { prompt: "Cross-attention (decoder attends to encoder / LLM attends to image tokens). Which projections come from which sequence?", code: `# dec: [T_d, d]   enc: [T_e, d]
Q = ____ @ W_q
K = ____ @ W_k
V = ____ @ W_v`,
      options: ["dec / enc / enc", "enc / dec / dec", "dec / dec / enc", "enc / enc / dec"], a: 0, why: "Queries ask from the decoder; keys/values answer from the encoder — output shape stays [T_d, d]." },
    { prompt: "In cross-attention, is a causal mask applied over the encoder sequence?", code: `attn = softmax(Q @ K.T / sqrt(d))  # [T_d, T_e]`,
      options: ["no — the encoder context is fully visible, not generated", "yes — always mask everything", "only during inference", "only if T_e > T_d"], a: 0, why: "Causality protects autoregressive GENERATION; conditioning context (image, source text) is given, so all of it is fair game." },
  ],
  solutions: {
    pytorch: `import torch, math
import torch.nn.functional as F

def causal_self_attention(x, W_q, W_k, W_v):
    T, d = x.shape
    Q, K, V = x @ W_q, x @ W_k, x @ W_v
    scores = Q @ K.T / math.sqrt(d)
    mask = torch.triu(torch.ones(T, T, dtype=torch.bool), 1)
    scores = scores.masked_fill(mask, float('-inf'))
    return F.softmax(scores, -1) @ V

def cross_attention(dec, enc, W_q, W_k, W_v):
    Q = dec @ W_q          # queries from decoder
    K, V = enc @ W_k, enc @ W_v   # keys/values from encoder
    scores = Q @ K.T / math.sqrt(Q.shape[-1])
    return F.softmax(scores, -1) @ V   # [T_dec, d] — no mask`,
  },
},
{
  id: "k-transformer", family: "ml", title: "Transformer Block from Scratch", emoji: "🏗️",
  blurb: "Assemble the modern block: pre-norm, multi-head attention, SwiGLU, residuals.",
  frameworks: ["pytorch"],
  links: [
    { label: "Raschka · Architecture Gallery", url: "https://sebastianraschka.com/llm-architecture-gallery/" },
    { label: "3b1b · But what is a GPT?", url: "https://www.youtube.com/watch?v=wjZofJX0v4M" },
  ],
  steps: [
    { prompt: "Multi-head = run h attentions in parallel on d/h-dim slices. The reshape:", code: `# x: [B, T, d]  →  heads: [B, h, T, d_h]
q = self.W_q(x).view(B, T, h, d_h).____`,
      options: ["transpose(1, 2)", "transpose(0, 1)", "reshape(B*h, T, d_h)", "permute(2, 0, 1, 3)"], a: 0, why: "[B,T,h,d_h] → [B,h,T,d_h]: heads become a batch dimension so attention runs per-head in parallel." },
    { prompt: "Modern block ordering (pre-norm). Fill the blanks:", code: `x = x + self.attn(____(x))
x = x + self.ffn(____(x))`,
      options: ["norm1 / norm2", "norm2 / norm1", "dropout / norm1", "identity / identity"], a: 0, why: "Pre-norm: normalize INPUT to each sublayer, add residual after — far more stable to train deep than post-norm." },
    { prompt: "SwiGLU feed-forward. Complete it:", code: `def ffn(x):
    return self.W_down( ____ )`,
      options: ["F.silu(self.W_gate(x)) * self.W_up(x)", "F.relu(self.W_up(x))", "self.W_gate(x) + self.W_up(x)", "torch.sigmoid(self.W_up(x))"], a: 0, why: "The gated form: swish(gate) elementwise-multiplies the up projection — the modern FFN." },
  ],
  solutions: {
    pytorch: `import torch, torch.nn as nn, torch.nn.functional as F, math

class Block(nn.Module):
    def __init__(self, d=256, h=8):
        super().__init__()
        self.h, self.d_h = h, d // h
        self.W_qkv = nn.Linear(d, 3*d, bias=False)
        self.W_o   = nn.Linear(d, d, bias=False)
        self.norm1 = nn.RMSNorm(d)
        self.norm2 = nn.RMSNorm(d)
        self.W_gate = nn.Linear(d, 4*d, bias=False)
        self.W_up   = nn.Linear(d, 4*d, bias=False)
        self.W_down = nn.Linear(4*d, d, bias=False)

    def attn(self, x):
        B, T, d = x.shape
        q, k, v = self.W_qkv(x).chunk(3, -1)
        shp = (B, T, self.h, self.d_h)
        q, k, v = (t.view(shp).transpose(1, 2) for t in (q, k, v))
        att = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_h)
        mask = torch.triu(torch.ones(T, T, dtype=torch.bool, device=x.device), 1)
        att = att.masked_fill(mask, float('-inf')).softmax(-1)
        y = (att @ v).transpose(1, 2).reshape(B, T, d)
        return self.W_o(y)

    def ffn(self, x):
        return self.W_down(F.silu(self.W_gate(x)) * self.W_up(x))

    def forward(self, x):
        x = x + self.attn(self.norm1(x))   # pre-norm + residual
        x = x + self.ffn(self.norm2(x))
        return x`,
  },
},
{
  id: "k-flash", family: "ml", title: "Flash Attention (Tiling)", emoji: "⚡",
  blurb: "Why exact attention can skip materializing the [T,T] matrix: tiles + online softmax.",
  frameworks: ["pytorch"],
  links: [{ label: "Original FlashAttention paper", url: "https://arxiv.org/abs/2205.14135" }],
  steps: [
    { prompt: "Standard attention's memory problem at T=32k:", code: `scores = Q @ K.T   # shape [T, T] = [32768, 32768]
# fp32: 32768² × 4 bytes ≈ ____`,
      options: ["≈ 4.3 GB for ONE head's score matrix", "≈ 4.3 MB, negligible", "≈ 43 KB, trivial", "zero — it's never materialized"], a: 0, why: "The quadratic score matrix is the memory (and HBM-bandwidth) villain Flash kills." },
    { prompt: "Flash processes K/V in tiles, never storing full scores. The trick that makes softmax tile-able:", code: `# online softmax: maintain running (m, l, acc)
m_new = max(m_old, tile_scores.max())
l_new = l_old * exp(m_old - m_new) + exp(tile_scores - m_new).sum()
acc   = acc * ____ + exp(tile_scores - m_new) @ V_tile`,
      options: ["exp(m_old - m_new)", "exp(m_new - m_old)", "l_old / l_new", "1.0 (no correction)"], a: 0, why: "When the running max rises, previously accumulated terms must be rescaled by exp(m_old − m_new)." },
    { prompt: "Flash attention's output vs standard attention's output:", code: `out_flash = flash_attn(Q, K, V)
out_std   = softmax(Q@K.T/√d) @ V`,
      options: ["numerically equivalent — it's exact, not approximate", "an approximation within 1% error", "exact only for short sequences", "different: Flash drops small scores"], a: 0, why: "Flash is an IO-aware exact algorithm — same math, radically less HBM traffic." },
  ],
  solutions: {
    pytorch: `import torch, math
# educational tiled attention (the algorithm, not the CUDA kernel)
def flash_attention(Q, K, V, tile=128):
    T, d = Q.shape
    O = torch.zeros_like(Q)
    m = torch.full((T, 1), float('-inf'))
    l = torch.zeros(T, 1)
    for j in range(0, T, tile):
        Kj, Vj = K[j:j+tile], V[j:j+tile]
        S = Q @ Kj.T / math.sqrt(d)            # [T, tile] only!
        m_new = torch.maximum(m, S.max(-1, keepdim=True).values)
        P = torch.exp(S - m_new)
        corr = torch.exp(m - m_new)            # rescale old mass
        l = l * corr + P.sum(-1, keepdim=True)
        O = O * corr + P @ Vj
        m = m_new
    return O / l
# verify: torch.allclose(flash_attention(Q,K,V),
#         (Q@K.T/math.sqrt(d)).softmax(-1)@V, atol=1e-5)`,
  },
},
{
  id: "k-paged", family: "ml", title: "PagedAttention (Block Tables)", emoji: "📑",
  blurb: "vLLM's OS-style virtual memory for the KV cache: blocks, tables, prefix sharing.",
  frameworks: ["pytorch"],
  links: [{ label: "vLLM PagedAttention paper", url: "https://arxiv.org/abs/2309.06180" }],
  steps: [
    { prompt: "Naive serving pre-allocates max_len cache per request. With max 4096, avg 350 tokens used, the waste is…", code: `util = 350 / 4096`,
      options: ["≈ 91% of cache memory wasted", "≈ 9% wasted", "zero — unused pages cost nothing", "exactly 50% by design"], a: 0, why: "Internal fragmentation: reserved-but-unused cache is the capacity killer PagedAttention fixes." },
    { prompt: "The block table maps logical token positions → physical blocks. Token 70 with block_size 16 lives at:", code: `block_size = 16
logical_block = 70 // 16   # = 4
offset        = 70 %  16   # = 6
phys = ____`,
      options: ["block_table[seq_id][4], slot 6", "block_table[4][seq_id], slot 6", "physical block 70 directly", "block_table[seq_id][6], slot 4"], a: 0, why: "Indirection per sequence: logical block index → physical block id, then the offset within it." },
    { prompt: "Two requests share a 3k-token system prompt. PagedAttention's copy-on-write means:", code: `# both block tables point at the same physical blocks`,
      options: ["shared prefix stored once; copy a block only when one request writes", "the prompt is recomputed per request", "blocks are duplicated immediately", "the second request waits for the first"], a: 0, why: "Reference-counted shared blocks — fork semantics for the KV cache." },
  ],
  solutions: {
    pytorch: `# minimal paged KV cache (logic-level, single head)
import torch

class PagedKVCache:
    def __init__(self, n_blocks=1024, block=16, d=128):
        self.K = torch.zeros(n_blocks, block, d)
        self.V = torch.zeros(n_blocks, block, d)
        self.free = list(range(n_blocks))
        self.tables = {}            # seq_id -> [phys_block,...]
        self.lens = {}              # seq_id -> n_tokens
        self.block = block

    def append(self, seq, k, v):
        tbl = self.tables.setdefault(seq, [])
        n = self.lens.get(seq, 0)
        if n % self.block == 0:               # need a new block
            tbl.append(self.free.pop())
        b, off = tbl[n // self.block], n % self.block
        self.K[b, off], self.V[b, off] = k, v
        self.lens[seq] = n + 1

    def gather(self, seq):                    # for attention
        n, tbl = self.lens[seq], self.tables[seq]
        ks = torch.cat([self.K[b] for b in tbl])[:n]
        vs = torch.cat([self.V[b] for b in tbl])[:n]
        return ks, vs

    def fork(self, src, dst):                 # prefix sharing
        self.tables[dst] = list(self.tables[src])  # share blocks
        self.lens[dst] = self.lens[src]            # (CoW on write
                                                   # left as exercise)`,
  },
},
{
  id: "k-attnback", family: "ml", title: "Attention Backward Pass", emoji: "↩️",
  blurb: "Derive and code the gradients through softmax(QKᵀ/√d)V by hand.",
  frameworks: ["numpy"],
  links: [{ label: "3b1b · Backpropagation", url: "https://www.youtube.com/watch?v=Ilg3gGewQ5U" }],
  steps: [
    { prompt: "Forward: O = P V where P = softmax(S). Given dO (= ∂L/∂O), the easy gradients first:", code: `dV = ____
dP = ____`,
      options: ["P.T @ dO  /  dO @ V.T", "dO @ P.T  /  V @ dO.T", "P @ dO  /  dO @ V", "dO.T @ P  /  V.T @ dO"], a: 0, why: "O = P V is a plain matmul: dV = Pᵀ dO and dP = dO Vᵀ — shapes [T,d] and [T,T]." },
    { prompt: "The softmax Jacobian, row-wise. The gradient through P = softmax(S):", code: `# per row i:  dS_i = P_i ⊙ (dP_i − (dP_i · P_i))
dS = P * (dP - ____)`,
      options: ["(dP * P).sum(-1, keepdims=True)", "dP.sum(-1, keepdims=True)", "P.sum(-1, keepdims=True)", "(dP - P).mean(-1, keepdims=True)"], a: 0, why: "softmax's Jacobian is diag(p) − ppᵀ; contracted with dP it gives p⊙(dP − ⟨dP,p⟩)." },
    { prompt: "Finish: S = QKᵀ/√d. The last gradients:", code: `dQ = ____ / sqrt(d)
dK = ____ / sqrt(d)`,
      options: ["dS @ K  /  dS.T @ Q", "dS @ Q  /  dS.T @ K", "K @ dS  /  Q @ dS.T", "dS.T @ K  /  dS @ Q"], a: 0, why: "S = QKᵀ ⇒ dQ = dS·K, dK = dSᵀ·Q — then the scalar 1/√d rides along." },
  ],
  solutions: {
    numpy: `import numpy as np
def softmax(x):
    e = np.exp(x - x.max(-1, keepdims=True))
    return e / e.sum(-1, keepdims=True)

def attn_forward(Q, K, V):
    d = Q.shape[-1]
    S = Q @ K.T / np.sqrt(d)
    P = softmax(S)
    return P @ V, (Q, K, V, P)

def attn_backward(dO, cache):
    Q, K, V, P = cache
    d = Q.shape[-1]
    dV = P.T @ dO
    dP = dO @ V.T
    dS = P * (dP - (dP * P).sum(-1, keepdims=True))  # softmax jac
    dQ = dS @ K / np.sqrt(d)
    dK = dS.T @ Q / np.sqrt(d)
    return dQ, dK, dV

# gradient-check against finite differences to trust it:
# f(Q) = attn_forward(Q,K,V)[0].sum(); compare numerical dQ.`,
  },
},
{
  id: "k-lora", family: "ml", title: "LoRA from Scratch", emoji: "🪡",
  blurb: "Low-rank adapters: freeze W, learn BA, merge at inference. ~0.5% of the parameters.",
  frameworks: ["pytorch"],
  links: [{ label: "LoRA paper", url: "https://arxiv.org/abs/2106.09685" }],
  steps: [
    { prompt: "LoRA replaces h = Wx with:", code: `h = W x + ____   # W frozen`,
      options: ["(alpha/r) · B A x", "B + A x", "W B A x", "alpha · (B + A) x"], a: 0, why: "A: d→r down-project, B: r→d up-project; α/r scales the update. Only A, B train." },
    { prompt: "Initialization that makes step 0 a no-op:", code: `A = ____
B = ____`,
      options: ["gaussian / zeros", "zeros / gaussian — either way", "zeros / zeros", "gaussian / gaussian"], a: 0, why: "B = 0 ⇒ BA = 0 at start: the model begins exactly at the pretrained function. (A=0,B=0 would kill A's gradient too.)" },
    { prompt: "Parameter math: d=4096, r=16 vs full fine-tuning of W (4096²):", code: `lora_params = 2 * 4096 * 16
ratio = lora_params / 4096**2`,
      options: ["≈ 0.8% of full fine-tuning", "≈ 8% of full fine-tuning", "≈ 50% of full fine-tuning", "more than full fine-tuning"], a: 0, why: "131k vs 16.8M per matrix — and the update merges into W at inference: zero added latency." },
  ],
  solutions: {
    pytorch: `import torch, torch.nn as nn

class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, r=16, alpha=32):
        super().__init__()
        self.base = base
        for p in self.base.parameters():
            p.requires_grad = False          # freeze W
        d_in, d_out = base.in_features, base.out_features
        self.A = nn.Parameter(torch.randn(r, d_in) * 0.01)
        self.B = nn.Parameter(torch.zeros(d_out, r))   # start = no-op
        self.scale = alpha / r

    def forward(self, x):
        return self.base(x) + self.scale * (x @ self.A.T @ self.B.T)

    @torch.no_grad()
    def merge(self):                         # fold into W for serving
        self.base.weight += self.scale * (self.B @ self.A)

# usage: wrap q_proj/v_proj of each attention layer,
# train only params where requires_grad=True (~0.5-1% of model).`,
  },
},
{
  id: "k-mlp", family: "ml", title: "MLP Forward & Backward", emoji: "🧮",
  blurb: "The fundamentals: two layers, ReLU, chain rule, gradient check.",
  frameworks: ["numpy"],
  links: [{ label: "3b1b · Backpropagation calculus", url: "https://www.youtube.com/watch?v=tIeHLnjs5U8" }],
  steps: [
    { prompt: "Forward: X→[W1,ReLU]→H→[W2]→logits. The hidden layer:", code: `Z1 = X @ W1 + b1
H  = ____`,
      options: ["np.maximum(0, Z1)", "np.exp(Z1)", "Z1 / np.abs(Z1)", "np.sign(Z1)"], a: 0, why: "ReLU: elementwise max(0, z). Remember Z1 — its sign gates the backward pass." },
    { prompt: "Backward through ReLU:", code: `dZ1 = dH * ____`,
      options: ["(Z1 > 0)", "(H > 1)", "Z1", "np.exp(-Z1)"], a: 0, why: "ReLU's derivative is the 0/1 mask of where the pre-activation was positive." },
    { prompt: "The weight gradient for W1 (X is [N, d_in], dZ1 is [N, d_h]):", code: `dW1 = ____ / N`,
      options: ["X.T @ dZ1", "dZ1 @ X.T", "X @ dZ1.T", "dZ1.T @ dZ1"], a: 0, why: "Shapes must yield [d_in, d_h]: input-transposed times upstream gradient, averaged over batch." },
  ],
  solutions: {
    numpy: `import numpy as np

def forward(X, p):
    Z1 = X @ p['W1'] + p['b1']
    H  = np.maximum(0, Z1)
    logits = H @ p['W2'] + p['b2']
    return logits, (X, Z1, H)

def backward(dlogits, cache, p):
    X, Z1, H = cache; N = X.shape[0]
    dW2 = H.T @ dlogits / N
    db2 = dlogits.mean(0)
    dH  = dlogits @ p['W2'].T
    dZ1 = dH * (Z1 > 0)               # ReLU gate
    dW1 = X.T @ dZ1 / N
    db1 = dZ1.mean(0)
    return {'W1': dW1, 'b1': db1, 'W2': dW2, 'b2': db2}

# gradient check (do this EVERY time you hand-write a backward):
# num = (loss(W+eps) - loss(W-eps)) / (2*eps)  vs analytic — agree to ~1e-6.`,
  },
},
{
  id: "k-trainloop", family: "ml", title: "Training Loop (PyTorch & JAX)", emoji: "🔁",
  blurb: "The five-step heartbeat — and the JAX way: pure functions, grad transforms, jit.",
  frameworks: ["pytorch", "jax"],
  links: [{ label: "3b1b · Gradient descent", url: "https://www.youtube.com/watch?v=IHZwWFHWa-w" }],
  steps: [
    { prompt: "PyTorch's canonical five-step loop. What's missing — and where?", code: `for x, y in loader:
    loss = criterion(model(x), y)
    loss.backward()
    optimizer.step()`,
      options: ["optimizer.zero_grad() before backward", "model.eval() before forward", "loss.detach() after backward", "torch.no_grad() around step"], a: 0, why: ".backward() ACCUMULATES into .grad — without zeroing, every step uses stale gradient sums. The classic bug." },
    { prompt: "JAX differs fundamentally: gradients come from…", code: `loss_fn = lambda params, x, y: ce(model_apply(params, x), y)
grads = ____(loss_fn)(params, x, y)`,
      options: ["jax.grad — transforming the pure function", "calling .backward() on the loss", "a tape recorded during forward", "params.grad attributes"], a: 0, why: "JAX is functional: grad() returns a NEW function computing ∂loss/∂params. No mutation, no tape objects." },
    { prompt: "Why must the JAX update be written like this rather than `params -= lr*grads` in place?", code: `params = jax.tree.map(
    lambda p, g: p - lr * g, params, grads)`,
      options: ["jit-compiled functions require pure, immutable updates", "JAX arrays don't support subtraction", "tree.map is faster than subtraction", "it prevents NaN gradients"], a: 0, why: "Purity is the contract that lets jit/vmap/pmap transform your code; in-place mutation breaks it." },
  ],
  solutions: {
    pytorch: `import torch
model, opt = MyModel(), None
opt = torch.optim.AdamW(model.parameters(), lr=3e-4)
crit = torch.nn.CrossEntropyLoss()

for epoch in range(epochs):
    model.train()
    for x, y in loader:
        opt.zero_grad()                  # 1 clear
        loss = crit(model(x), y)         # 2 forward
        loss.backward()                  # 3 backprop
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()                       # 4 update
    # 5 validate under no_grad + model.eval()`,
    jax: `import jax, jax.numpy as jnp, optax

opt = optax.adamw(3e-4)
opt_state = opt.init(params)

def loss_fn(params, x, y):
    logits = model_apply(params, x)
    return optax.softmax_cross_entropy_with_integer_labels(
        logits, y).mean()

@jax.jit                                  # compile the whole step
def train_step(params, opt_state, x, y):
    loss, grads = jax.value_and_grad(loss_fn)(params, x, y)
    updates, opt_state = opt.update(grads, opt_state, params)
    params = optax.apply_updates(params, updates)
    return params, opt_state, loss

for x, y in loader:
    params, opt_state, loss = train_step(params, opt_state, x, y)`,
  },
},
{
  id: "k-dspy", family: "ml", title: "RLM with DSPy", emoji: "🧠",
  blurb: "Program—don't prompt: signatures, modules, and compiling a reasoning LM pipeline.",
  frameworks: ["pytorch"],
  links: [{ label: "DSPy docs", url: "https://dspy.ai/" }],
  steps: [
    { prompt: "DSPy's core abstraction — a Signature — declares:", code: `class TriageNote(dspy.Signature):
    """Extract acuity from a clinical note."""
    note: str = dspy.InputField()
    acuity: str = dspy.OutputField(desc="ESI level 1-5")`,
      options: ["typed inputs/outputs — the WHAT, leaving the prompt HOW to the compiler", "the exact prompt template verbatim", "the model's weights to fine-tune", "a regex over model outputs"], a: 0, why: "Signatures are contracts; DSPy generates and optimizes the actual prompting strategy." },
    { prompt: "Turning that signature into a reasoning module:", code: `triage = ____(TriageNote)
result = triage(note="68M, chest pain radiating...")`,
      options: ["dspy.ChainOfThought", "dspy.compile", "dspy.Retrieve", "dspy.Assert"], a: 0, why: "ChainOfThought wraps the signature with a learned reasoning step before the output fields." },
    { prompt: "The 'RL' in modern DSPy pipelines: optimizers like MIPROv2 / GRPO-style teleprompters improve the program by…", code: `opt = dspy.MIPROv2(metric=acuity_match)
compiled = opt.compile(triage, trainset=examples)`,
      options: ["searching over instructions/demos scored by your metric", "backpropagating through the LLM weights", "increasing the temperature gradually", "caching previous responses"], a: 0, why: "Programmatic optimization: propose prompts/few-shots, evaluate with the metric, keep what scores — RL-flavored search over the program, not the weights." },
  ],
  solutions: {
    pytorch: `import dspy

lm = dspy.LM("openai/gpt-4o-mini")        # or ollama_chat/llama3
dspy.configure(lm=lm)

class TriageNote(dspy.Signature):
    """Extract ESI acuity (1-5) from a clinical note."""
    note: str = dspy.InputField()
    rationale: str = dspy.OutputField()
    acuity: int = dspy.OutputField()

class Triage(dspy.Module):
    def __init__(self):
        self.classify = dspy.ChainOfThought(TriageNote)
    def forward(self, note):
        return self.classify(note=note)

def metric(example, pred, trace=None):
    return int(example.acuity == pred.acuity)

opt = dspy.MIPROv2(metric=metric, auto="light")
compiled = opt.compile(Triage(), trainset=train_examples)
compiled.save("triage_v1.json")   # the optimized program`,
  },
},
{
  id: "k-twosum", family: "swe", title: "Two Sum (Blind 75 #1)", emoji: "🎯",
  blurb: "The hash-map pattern that opens half of Blind 75: trade memory for a single pass.",
  frameworks: ["pytorch"],
  links: [{ label: "NeetCode · Two Sum", url: "https://neetcode.io/problems/two-integer-sum" }],
  steps: [
    { prompt: "Brute force is O(n²). The one-pass insight: while scanning, ask…", code: `for i, x in enumerate(nums):
    need = target - x
    if ____: return [seen[need], i]
    seen[x] = i`,
      options: ["need in seen", "x in seen", "need == x", "i in seen"], a: 0, why: "Have I already SEEN my complement? Hash lookup O(1) makes the whole scan O(n)." },
    { prompt: "Why insert AFTER the check, not before?", code: `# check first, then seen[x] = i`,
      options: ["so an element can't match itself (e.g., target 6, x 3)", "to keep the map sorted", "insertion order matters for the answer", "it avoids hash collisions"], a: 0, why: "Insert-first would let need==x find its own index — a self-pairing bug." },
    { prompt: "Pattern transfer — this same complement-lookup shape powers which ML routine?", code: `seen = {}  # value -> index`,
      options: ["dedup/inverted-index lookups in retrieval pipelines", "matrix multiplication tiling", "the softmax Jacobian", "gradient clipping"], a: 0, why: "Hash-the-thing-you'll-need-later is the universal pattern: exact-match retrieval, caching, dedup." },
  ],
  solutions: {
    pytorch: `def two_sum(nums, target):
    seen = {}                      # value -> index
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], i]
        seen[x] = i
    return []
# O(n) time, O(n) space — vs O(n²)/O(1) brute force.`,
  },
},
{
  id: "k-slidewin", family: "swe", title: "Longest Substring (Sliding Window)", emoji: "🪟",
  blurb: "Blind 75's sliding window — the same window you met in sliding-window ATTENTION.",
  frameworks: ["pytorch"],
  links: [
    { label: "NeetCode · Longest Substring", url: "https://neetcode.io/problems/longest-substring-without-duplicates" },
  ],
  steps: [
    { prompt: "Longest substring without repeats. Window [left, right]; on a duplicate we…", code: `for right, c in enumerate(s):
    while c in window:
        ____
    window.add(c)`,
      options: ["window.remove(s[left]); left += 1", "right -= 1", "window.clear()", "left = right"], a: 0, why: "Shrink from the LEFT until the duplicate leaves — each pointer moves at most n times: O(n) total." },
    { prompt: "Why is this O(n), not O(n²), despite the nested while?", code: `# left and right each only move forward`,
      options: ["amortized: each index enters and leaves the window once", "the while loop runs at most twice", "sets make membership O(0)", "it isn't — it's O(n²)"], a: 0, why: "Two monotone pointers = 2n total moves. The amortized argument behind every sliding-window proof." },
    { prompt: "The ML rhyme: sliding-window ATTENTION (Attention world) uses the same shape because…", code: `# token t attends to [t-W, t]`,
      options: ["a bounded recent-context window caps cost at O(n·W) instead of O(n²)", "attention also forbids duplicate tokens", "both use hash sets internally", "coincidence — no shared idea"], a: 0, why: "Same trade in both worlds: bound the window, bound the cost, accept local context." },
  ],
  solutions: {
    pytorch: `def longest_substring(s):
    window, left, best = set(), 0, 0
    for right, c in enumerate(s):
        while c in window:           # shrink until valid
            window.remove(s[left])
            left += 1
        window.add(c)
        best = max(best, right - left + 1)
    return best
# O(n) time, O(min(n, alphabet)) space.`,
  },
},
{
  id: "k-sysdesign", family: "sys", title: "System Design: LLM Inference Server", emoji: "🏰",
  blurb: "A guided design interview: KV cache, paging, continuous batching, autoscaling — everything the Inference world taught, composed.",
  frameworks: ["pytorch"],
  links: [{ label: "vLLM paper", url: "https://arxiv.org/abs/2309.06180" }],
  steps: [
    { prompt: "Requirements: 70B model, p50 < 400ms first token, hundreds of concurrent chats. First architectural split:", code: `# phase 1: prompt processing   phase 2: token generation`,
      options: ["separate prefill and decode scheduling — different bottlenecks", "one queue, FIFO, identical handling", "decode first, prefill later", "one GPU per user"], a: 0, why: "Prefill is compute-bound and bursty; decode is memory-bound and steady. Mixing them naively lets long prefills stall everyone's decode." },
    { prompt: "Memory plan: cache capacity decides concurrency. Your levers, in architecture and in serving:", code: `cache_bytes = layers * kv_heads * head_dim * seq * 2 * 2`,
      options: ["GQA/MLA model choice + PagedAttention blocks + prefix sharing", "more CPU RAM only", "smaller batch sizes only", "longer max_seq to amortize"], a: 0, why: "Attack every factor: kv_heads (architecture), fragmentation (paging), duplicated prompts (sharing)." },
    { prompt: "Scheduling: a 30-token query is stuck behind a 4000-token generation. The fix and its granularity:", code: `# admission/eviction every ____`,
      options: ["iteration — continuous batching at token granularity", "batch — wait for all to finish", "minute — autoscaler handles it", "request — FIFO is fairest"], a: 0, why: "Iteration-level scheduling: finished sequences leave, waiting ones join, every step. The single biggest throughput win in modern serving." },
  ],
  solutions: {
    pytorch: `# Design sketch (interview whiteboard form)
#
#  client → [gateway: auth, rate-limit, streaming SSE]
#        → [router: session affinity, prefix-cache aware]
#        → [scheduler]
#             • two queues: prefill / decode
#             • continuous batching @ token granularity
#             • priority: SLO class, then fairness
#        → [workers: TP within node (NVLink), PP across]
#             • PagedAttention KV pool, block=16
#             • prefix sharing (system prompts, few-shots)
#             • speculative decoding (draft 1B model)
#        → [autoscaler]
#             • signal: KV-pool utilization, queue depth
#             • scale OUT replicas, never split TP groups
#  observability: tokens/s, TTFT p50/p99, cache hit %,
#                 preemption rate, per-request cost.
#
# Capacity math to memorize:
#   concurrency ≈ kv_pool_bytes / (avg_ctx * bytes_per_token)
#   bytes_per_token = layers*kv_heads*head_dim*2*2`,
  },
},
];

/* ============================================================
   BOARD LAYOUT
   ============================================================ */
function buildBoard(region) {
  const mains = ["start", ...region.concepts.map((c) => "c:" + c.id), "gym"];
  const M = mains.length;
  const nodes = []; const edges = [];
  mains.forEach((id, i) => {
    const t = i / (M - 1);
    nodes.push({ id, x: 9 + 82 * t, y: 50 + 27 * Math.sin(i * 1.85 + 0.7) });
    if (i > 0) edges.push([mains[i - 1], id]);
  });
  (region.sides || []).forEach((s) => {
    const a = nodes[Math.min(s.anchor ?? 1, M - 2)];
    const dir = a.y > 50 ? -1 : 1;
    nodes.push({ id: "s:" + s.id, x: Math.min(92, Math.max(8, a.x + 7)), y: Math.min(88, Math.max(12, a.y + dir * 30)) });
    edges.push([a.id, "s:" + s.id]);
  });
  return { nodes, edges };
}

/* ============================================================ */
export default function App() {
  const [save, setSave] = useState(null);
  const [worlds, setWorlds] = useState([]);      // user-generated learn worlds
  const [uKatas, setUKatas] = useState([]);      // user-generated katas
  const [cfg, setCfg] = useState({ provider: "builtin", baseUrl: "", apiKey: "", model: "" });
  const [screen, setScreen] = useState("title");
  const [activeWorld, setActiveWorld] = useState("w-rl");
  const [regionIdx, setRegionIdx] = useState(0);
  const [atNode, setAtNode] = useState("start");
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(null);
  const [battle, setBattle] = useState(null);
  const [musicOn, setMusicOn] = useState(false);
  // spawn state
  const [resTab, setResTab] = useState("url");
  const [url, setUrl] = useState(""); const [pasteText, setPasteText] = useState("");
  const [conceptQ, setConceptQ] = useState(""); const [pdfB64, setPdfB64] = useState(null);
  const [pdfName, setPdfName] = useState("");
  const [scan, setScan] = useState(null); const [goal, setGoal] = useState("learn");
  const [busy, setBusy] = useState("");
  // dojo state
  const [kataId, setKataId] = useState(null); const [stepIdx, setStepIdx] = useState(0);
  const [fw, setFw] = useState("pytorch"); const [kPhase, setKPhase] = useState("step");
  const [kFeedback, setKFeedback] = useState(null);
  const [myCode, setMyCode] = useState(""); const [review, setReview] = useState("");
  // papers
  const [paperQ, setPaperQ] = useState(""); const [papers, setPapers] = useState(null);

  useEffect(() => {
    (async () => {
      const s = await loadStore("ru-save", { xp: 0, hp: 100, badges: [], captured: [], sides: [], katas: {} });
      s.sides = s.sides || []; s.katas = s.katas || {};
      setSave(s);
      setWorlds(await loadStore("ru-worlds", []));
      setUKatas(await loadStore("ru-ukatas", []));
      setCfg(await loadStore("ru-cfg", { provider: "builtin", baseUrl: "", apiKey: "", model: "" }));
    })();
  }, []);
  const persist = (s) => { setSave(s); saveStore("ru-save", s); };
  const persistWorlds = (w) => { setWorlds(w); saveStore("ru-worlds", w); };
  const persistUKatas = (k) => { setUKatas(k); saveStore("ru-ukatas", k); };
  const persistCfg = (c) => { setCfg(c); saveStore("ru-cfg", c); };
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const toggleMusic = () => { if (musicOn) { music.stop(); setMusicOn(false); } else { music.start(); setMusicOn(true); } };

  const allWorlds = [...BUILTIN_WORLDS, ...worlds];
  const world = allWorlds.find((w) => w.id === activeWorld) || BUILTIN_WORLDS[0];
  const regions = world.regions;
  const region = regions[regionIdx];
  const level = save ? Math.floor(save.xp / 150) + 1 : 1;
  const maxHp = 100 + (level - 1) * 10;
  const capturedSet = new Set(save ? save.captured : []);
  const sidesSet = new Set(save ? save.sides : []);
  const allKatas = [...KATAS, ...uKatas];
  const conceptName = (id) => { for (const r of regions) { const c = r.concepts.find((x) => x.id === id); if (c) return c.name; } return id; };

  /* ---------- battle ---------- */
  const startBattle = (kind, payload) => {
    if (kind === "critical") setBattle({ kind, concept: payload, phase: "lore", enemyHp: 100, enemyMax: 100, qIdx: 0, streak: 0, showCode: false, log: `${payload.name} blocks the path!` });
    else if (kind === "side") setBattle({ kind, side: payload, phase: "briefing", enemyHp: 70, enemyMax: 70, qIdx: 0, streak: 0, showCode: true, log: payload.desc });
    else setBattle({ kind, gym: region.gym, phase: "lore", enemyHp: 100 + region.gym.questions.length * 12, enemyMax: 100 + region.gym.questions.length * 12, qIdx: 0, streak: 0, showCode: false, log: `${region.gym.leader}: "${region.gym.taunt}"` });
    setScreen("battle");
  };
  const bQuestions = battle ? (battle.kind === "critical" ? battle.concept.questions : battle.kind === "side" ? battle.side.questions : battle.gym.questions) : [];
  const answerBattle = (idx) => {
    if (!battle || battle.phase !== "question") return;
    const q = bQuestions[battle.qIdx % bQuestions.length];
    if (idx === q.a) {
      const crit = battle.streak >= 1;
      const dmg = Math.round((36 + level * 3) * (crit ? 1.5 : 1));
      const newHp = Math.max(0, battle.enemyHp - dmg);
      const won = newHp <= 0;
      setBattle({ ...battle, enemyHp: newHp, streak: battle.streak + 1, phase: won ? "victory" : "feedback", wrong: false, log: `${crit ? "CRITICAL HIT! " : ""}Strike for ${dmg}! ${q.why}` });
      if (won) {
        const s = { ...save };
        if (battle.kind === "critical") { s.xp += 50; if (!capturedSet.has(battle.concept.id)) s.captured = [...s.captured, battle.concept.id]; }
        else if (battle.kind === "side") { s.xp += 30; s.hp = Math.min(maxHp, s.hp + 25); if (!sidesSet.has(battle.side.id)) s.sides = [...s.sides, battle.side.id]; }
        else { s.xp += 150; if (!s.badges.includes(region.gym.badge)) s.badges = [...s.badges, region.gym.badge]; }
        persist(s);
      }
    } else {
      const dmg = battle.kind === "gym" ? 22 : 16;
      const newHp = Math.max(0, save.hp - dmg);
      const fainted = newHp <= 0;
      persist({ ...save, hp: fainted ? maxHp : newHp });
      setBattle({ ...battle, streak: 0, phase: fainted ? "defeat" : "feedback", wrong: true, log: fainted ? `You blacked out! ${q.why} — You wake at the region entrance, healed and wiser.` : `Counterattack for ${dmg}! ${q.why}` });
    }
  };
  const continueBattle = () => {
    if (!battle) return;
    if (battle.phase === "victory") {
      if (battle.kind === "critical") showToast(`${battle.concept.name} captured! +50 XP`);
      else if (battle.kind === "side") showToast(`Reinforced! +30 XP · +25 HP`);
      else showToast(`${region.gym.badge} earned! +150 XP`);
      setBattle(null); setScreen("region");
    } else if (battle.phase === "defeat") { setBattle(null); setAtNode("start"); setScreen("region"); }
    else if (battle.phase === "feedback") setBattle({ ...battle, phase: "question", qIdx: battle.wrong ? battle.qIdx : battle.qIdx + 1, wrong: false });
    else setBattle({ ...battle, phase: "question" });   // lore or briefing
  };

  /* ---------- board ---------- */
  const board = region ? buildBoard(region) : null;
  const nodeCleared = (id) => id === "start" ? true
    : id === "gym" ? (region && save.badges.includes(region.gym.badge))
    : id.startsWith("c:") ? capturedSet.has(id.slice(2))
    : id.startsWith("s:") ? sidesSet.has(id.slice(2)) : false;
  const nodeReachable = (id) => {
    if (!board) return false;
    if (id === "gym") return region.concepts.every((c) => capturedSet.has(c.id));
    return board.edges.some(([a, b]) => (b === id && nodeCleared(a)) || (a === id && nodeCleared(b)));
  };
  const tapNode = (id) => {
    if (!nodeReachable(id) && !nodeCleared(id)) { showToast("Path blocked — clear the connected encounter first."); return; }
    setAtNode(id);
    if (id === "start") { setDialog({ name: region.npc.name, text: region.npc.text }); return; }
    if (id === "gym") {
      if (save.badges.includes(region.gym.badge)) { setDialog({ name: region.gym.leader, text: `You already hold the ${region.gym.badge}. Drill the side encounters to stay sharp, or move on.` }); return; }
      startBattle("gym"); return;
    }
    if (id.startsWith("c:")) {
      const c = region.concepts.find((x) => x.id === id.slice(2));
      if (nodeCleared(id)) { setDialog({ name: c.name + " (captured)", text: c.lore }); return; }
      startBattle("critical", c);
    }
    if (id.startsWith("s:")) startBattle("side", region.sides.find((x) => x.id === id.slice(2)));
  };

  /* ---------- spawn ---------- */
  const onPdfPick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setPdfName(f.name);
    const r = new FileReader();
    r.onload = () => setPdfB64(r.result.split(",")[1]);
    r.readAsDataURL(f);
  };
  const doScan = async () => {
    setBusy("scan"); setScan(null);
    try {
      let r, src;
      if (resTab === "url") { if (!url.trim()) throw 0; r = await scanUrl(url.trim(), null); src = { type: "url", desc: url.trim() }; }
      else if (resTab === "pdf") { if (!pdfB64) throw 0; r = await scanPdf(pdfB64, null); src = { type: "pdf", desc: pdfName }; }
      else if (resTab === "text") { if (!pasteText.trim()) throw 0; r = await scanText(pasteText, cfg); src = { type: "text", desc: `this material: """${pasteText.slice(0, 4000)}"""` }; }
      else { if (!conceptQ.trim()) throw 0; const f = await findResource(conceptQ.trim(), null); r = { title: f.title, sections: f.sections }; src = { type: "url", desc: f.url, foundUrl: f.url }; }
      setScan({ title: r.title || "Untitled", sections: r.sections || [], picked: new Set((r.sections || []).slice(0, 3)), src });
    } catch (e) {
      setScan({ error: e && e.message === "WEB_NEEDED" ? "Your custom model can't browse — URL/concept scans use the built-in model. Try the Paste tab for fully-local generation." : "Couldn't read that resource. Check it and try again." });
    }
    setBusy("");
  };
  const doBuild = async () => {
    if (!scan) return;
    if (goal === "implement") {
      setBusy("Forging implementation kata…");
      try {
        const k = await buildKataFrom(scan.src.desc, scan.src.type === "text" ? cfg : null, scan.src.type === "pdf" ? pdfB64 : null);
        persistUKatas([...uKatas, k]);
        setScan(null); setBusy(""); setScreen("dojo");
        showToast(`Kata forged: ${k.title}`); return;
      } catch (e) { setBusy(""); setScan({ ...scan, error: "Kata generation failed — try again or use Paste." }); return; }
    }
    if (!scan.picked.size) return;
    const picked = [...scan.picked]; const out = [];
    for (let i = 0; i < picked.length; i++) {
      setBusy(`Forging region ${i + 1}/${picked.length}: "${picked[i]}"…`);
      try { out.push(await buildRegionFrom(scan.src.desc, picked[i], Date.now() + i, scan.src.type === "text" ? cfg : null, scan.src.type === "pdf" ? pdfB64 : null)); } catch (e) { console.error(e); }
    }
    setBusy("");
    if (!out.length) { setScan({ ...scan, error: "Generation failed — try fewer sections." }); return; }
    const w = { id: "w" + Date.now(), title: scan.title, emoji: "🌀", links: scan.src.foundUrl ? [{ label: "Source", url: scan.src.foundUrl }] : [], regions: out };
    persistWorlds([...worlds, w]);
    setScan(null); setUrl(""); setPasteText(""); setConceptQ(""); setPdfB64(null); setPdfName("");
    setActiveWorld(w.id); setRegionIdx(0); setAtNode("start"); setScreen("region");
    showToast(`New world spawned: ${w.title}`);
  };

  /* ---------- dojo ---------- */
  const kata = allKatas.find((k) => k.id === kataId);
  const kProgress = (id) => save && save.katas[id] ? save.katas[id] : 0;
  const openKata = (k) => {
    setKataId(k.id); setFw(k.frameworks[0] || "pytorch");
    const p = kProgress(k.id);
    setStepIdx(p >= k.steps.length ? 0 : p);
    setKPhase(p >= k.steps.length ? "done" : "step");
    setKFeedback(null); setMyCode(""); setReview(""); setScreen("kata");
  };
  const answerKata = (idx) => {
    if (!kata) return;
    const st = kata.steps[stepIdx];
    if (idx === st.a) {
      const s = { ...save, xp: save.xp + 15 };
      const next = stepIdx + 1;
      if (next >= kata.steps.length) {
        s.xp += 60; s.katas = { ...s.katas, [kata.id]: kata.steps.length };
        persist(s); setKFeedback({ ok: true, msg: st.why + " — KATA COMPLETE! +60 XP bonus." });
        setTimeout(() => { setKPhase("done"); setKFeedback(null); }, 1600);
      } else {
        s.katas = { ...s.katas, [kata.id]: Math.max(kProgress(kata.id), next) };
        persist(s); setKFeedback({ ok: true, msg: st.why });
        setTimeout(() => { setStepIdx(next); setKFeedback(null); }, 1500);
      }
    } else setKFeedback({ ok: false, msg: st.why });
  };
  const doReview = async () => {
    if (!myCode.trim() || !kata) return;
    setBusy("review"); setReview("");
    try { setReview(await reviewCode(kata.title, fw, myCode, cfg)); } catch (e) { setReview("Review failed — check your model settings (custom endpoints need CORS enabled)."); }
    setBusy("");
  };
  const doPapers = async () => {
    if (!paperQ.trim()) return;
    setBusy("papers"); setPapers(null);
    try { setPapers((await fetchPapers(paperQ.trim(), null)).papers || []); } catch (e) { setPapers({ error: true }); }
    setBusy("");
  };

  /* ---------- styles ---------- */
  const S = {
    app: { minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: "'Space Grotesk', system-ui, sans-serif" },
    wrap: { maxWidth: 620, margin: "0 auto", padding: "0 14px 60px" },
    card: { background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 16 },
    btn: (bg, c = "#fff") => ({ background: bg, color: c, border: "none", borderRadius: 10, padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }),
    chip: (on) => ({ border: `1.5px solid ${on ? T.explore : T.line}`, background: on ? T.exploreSoft : T.card, color: on ? T.explore : T.inkSoft, borderRadius: 999, padding: "7px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
    mono: (size = 10.5, color = T.inkSoft) => ({ fontFamily: "'JetBrains Mono', monospace", fontSize: size, letterSpacing: "0.06em", color, fontWeight: 700 }),
    pre: { background: T.code, color: T.codeText, borderRadius: 10, padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, lineHeight: 1.6, overflowX: "auto", whiteSpace: "pre", margin: 0 },
    input: { width: "100%", boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 10, padding: "11px 12px", fontSize: 13.5, fontFamily: "'JetBrains Mono', monospace", background: T.card, color: T.ink, outline: "none" },
  };

  if (!save) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={S.mono()}>loading save file…</span></div>;

  const HUD = ({ back }) => (
    <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(235,239,246,0.94)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${T.line}` }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        {back && <button onClick={back} aria-label="Back" style={{ background: "none", border: `1px solid ${T.line}`, borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: T.ink, flexShrink: 0 }}>←</button>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={S.mono(10, T.ink)}>LV.{level} · {save.xp} XP</span>
            <span style={S.mono(10, T.gold)}>🎖 {save.badges.length}</span>
          </div>
          <div style={{ height: 7, background: T.line, borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(save.hp / maxHp) * 100}%`, background: save.hp / maxHp > 0.4 ? T.reward : T.penalty, transition: "width .4s" }} />
          </div>
        </div>
        <button onClick={toggleMusic} title="Lore music" style={{ background: "none", border: `1px solid ${T.line}`, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14 }}>{musicOn ? "🎵" : "🔇"}</button>
        <button onClick={() => setScreen("dex")} style={{ ...S.btn(T.explore), padding: "7px 10px", fontSize: 12 }}>📖</button>
        <button onClick={() => setScreen("settings")} style={{ background: "none", border: `1px solid ${T.line}`, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14 }}>⚙️</button>
      </div>
    </div>
  );
  const Tabs = () => (
    <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
      {[["home", "🌍 Learn"], ["dojo", "⌨️ Dojo"], ["papers", "📡 Papers"]].map(([id, label]) => (
        <button key={id} onClick={() => setScreen(id)} style={{ ...S.btn(["home", "region"].includes(screen) && id === "home" ? T.ink : screen === id ? T.ink : T.card, (screen === id || (["home", "region"].includes(screen) && id === "home")) ? "#fff" : T.inkSoft), border: `1px solid ${T.line}`, padding: "8px 14px", fontSize: 13 }}>{label}</button>
      ))}
    </div>
  );
  const Toast = () => toast ? <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: T.ink, color: "#fff", padding: "10px 16px", borderRadius: 12, fontSize: 13.5, fontWeight: 700, animation: "slideUp .3s ease", maxWidth: "85%", textAlign: "center" }}>{toast}</div> : null;

  /* ============ TITLE ============ */
  if (screen === "title") return (
    <div style={{ ...S.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20 }}>
      <style>{CSS}</style>
      <div style={{ fontSize: 60, animation: "bob 2.5s ease-in-out infinite" }}>🧢</div>
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", margin: "8px 0 2px" }}>ROLLOUT WORLD</h1>
      <span style={S.mono(11, T.explore)}>ULTIMATE · 11 WORLDS · DOJO · BYO MODELS</span>
      <p style={{ color: T.inkSoft, maxWidth: 420, lineHeight: 1.6, fontSize: 14.5, marginTop: 14 }}>
        Board worlds for <b style={{ color: T.action }}>concepts</b> (Agentic RL, diffusion, MoE, attention, KL, architectures…) and a <b style={{ color: T.explore }}>Dojo</b> for implementation katas (attention from scratch, LoRA, flash attention, Blind-75 ties). Bring your own model, resource, or just a concept name.
      </p>
      <button onClick={() => setScreen("home")} style={{ ...S.btn(T.explore), fontSize: 16, padding: "13px 30px", marginTop: 18 }}>{save.xp > 0 ? "Continue journey →" : "Begin journey →"}</button>
    </div>
  );

  /* ============ HOME: WORLD LIBRARY ============ */
  if (screen === "home") return (
    <div style={S.app}><style>{CSS}</style><Toast /><HUD back={() => setScreen("title")} />
      <div style={{ ...S.wrap }}>
        <Tabs />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Concept Worlds</h2>
          <button onClick={() => { setScan(null); setScreen("spawn"); }} style={{ ...S.btn(T.action), padding: "7px 12px", fontSize: 12 }}>+ Bring your own</button>
        </div>
        {allWorlds.map((w) => {
          const total = w.regions.reduce((n, r) => n + r.concepts.length, 0);
          const got = w.regions.reduce((n, r) => n + r.concepts.filter((c) => capturedSet.has(c.id)).length, 0);
          const badges = w.regions.filter((r) => save.badges.includes(r.gym.badge)).length;
          return (
            <div key={w.id} onClick={() => { setActiveWorld(w.id); setRegionIdx(0); setAtNode("start"); setScreen(w.regions.length > 1 ? "regionlist" : "region"); }}
              style={{ ...S.card, marginTop: 10, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
              <div style={{ fontSize: 30 }}>{w.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15.5 }}>{w.title} {badges === w.regions.length && badges > 0 ? "🎖" : ""}</div>
                <span style={S.mono(9.5, got === total && total > 0 ? T.reward : T.inkSoft)}>{got}/{total} CONCEPTS · {w.regions.length} REGION{w.regions.length === 1 ? "" : "S"}{w.id.startsWith("w") && !BUILTIN_WORLDS.find(b => b.id === w.id) ? " · CUSTOM" : ""}</span>
              </div>
              {!BUILTIN_WORLDS.find((b) => b.id === w.id) && <button onClick={(e) => { e.stopPropagation(); persistWorlds(worlds.filter((x) => x.id !== w.id)); }} style={{ background: "none", border: "none", color: T.inkSoft, cursor: "pointer", fontSize: 15 }}>✕</button>}
              <span style={{ color: T.explore, fontWeight: 800, fontSize: 20 }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ============ REGION LIST (multi-region worlds) ============ */
  if (screen === "regionlist") return (
    <div style={S.app}><style>{CSS}</style><Toast /><HUD back={() => setScreen("home")} />
      <div style={{ ...S.wrap, paddingTop: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 2px" }}>{world.emoji} {world.title}</h2>
        {(world.links || []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
            {world.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ ...S.chip(false), textDecoration: "none" }}>🔗 {l.label}</a>)}
          </div>
        )}
        {regions.map((r, i) => {
          const locked = !(i === 0 || save.badges.includes(regions[i - 1].gym.badge));
          const got = r.concepts.filter((c) => capturedSet.has(c.id)).length;
          const sGot = (r.sides || []).filter((s) => sidesSet.has(s.id)).length;
          return (
            <div key={r.id} onClick={() => { if (!locked) { setRegionIdx(i); setAtNode("start"); setScreen("region"); } }}
              style={{ ...S.card, marginTop: 10, display: "flex", alignItems: "center", gap: 14, opacity: locked ? 0.5 : 1, cursor: locked ? "default" : "pointer" }}>
              <div style={{ fontSize: 32 }}>{locked ? "🔒" : r.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15.5 }}>{r.name} {save.badges.includes(r.gym.badge) && "🎖"}</div>
                <div style={{ fontSize: 12.5, color: T.inkSoft }}>{r.intro}</div>
                <span style={S.mono(9.5, got === r.concepts.length ? T.reward : T.inkSoft)}>{got}/{r.concepts.length} CRITICALS · {sGot}/{(r.sides || []).length} SIDES</span>
              </div>
              {!locked && <span style={{ color: T.explore, fontWeight: 800, fontSize: 20 }}>›</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ============ SPAWN ============ */
  if (screen === "spawn") return (
    <div style={S.app}><style>{CSS}</style><Toast /><HUD back={() => setScreen("home")} />
      <div style={{ ...S.wrap, paddingTop: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Bring your own resource</h2>
        <p style={{ color: T.inkSoft, fontSize: 13.5, lineHeight: 1.55 }}>Paste a link or text, upload a PDF, or just name a concept — the agent finds the best resource. Then choose: <b>learn</b> it as a board world, or <b>implement</b> it as a dojo kata.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {[["url", "🔗 URL"], ["pdf", "📄 PDF"], ["text", "📋 Paste"], ["concept", "💡 Concept"]].map(([id, label]) => (
            <button key={id} onClick={() => { setResTab(id); setScan(null); }} style={S.chip(resTab === id)}>{label}</button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          {resTab === "url" && <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://arxiv.org/abs/… or any blog/docs" style={S.input} />}
          {resTab === "pdf" && (
            <label style={{ ...S.card, display: "block", textAlign: "center", cursor: "pointer", borderStyle: "dashed" }}>
              <input type="file" accept="application/pdf" onChange={onPdfPick} style={{ display: "none" }} />
              <span style={{ fontSize: 26 }}>📄</span>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{pdfName || "Tap to choose a PDF"}</div>
              <span style={S.mono(9.5)}>read by the built-in model</span>
            </label>
          )}
          {resTab === "text" && <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste an article, paper section, or notes… (works with local models too)" rows={6} style={{ ...S.input, resize: "vertical", fontFamily: "'Space Grotesk', sans-serif" }} />}
          {resTab === "concept" && <input value={conceptQ} onChange={(e) => setConceptQ(e.target.value)} placeholder="e.g. speculative decoding, Mamba, FHIR resources" style={S.input} />}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <span style={S.mono(10)}>GOAL:</span>
          <button onClick={() => setGoal("learn")} style={S.chip(goal === "learn")}>🌍 Learn concepts</button>
          <button onClick={() => setGoal("implement")} style={S.chip(goal === "implement")}>⌨️ Implement solution</button>
        </div>
        <button onClick={doScan} disabled={busy === "scan"} style={{ ...S.btn(T.ink), width: "100%", marginTop: 12 }}>{busy === "scan" ? "Reading resource…" : "Scan resource"}</button>
        {scan && scan.error && <div style={{ marginTop: 12, color: T.penalty, fontSize: 13.5 }}>{scan.error}</div>}
        {scan && !scan.error && (
          <div style={{ ...S.card, marginTop: 14 }}>
            <div style={{ fontWeight: 800 }}>{scan.title}</div>
            {scan.src.foundUrl && <a href={scan.src.foundUrl} target="_blank" rel="noreferrer" style={{ ...S.mono(10, T.explore) }}>{scan.src.foundUrl}</a>}
            {goal === "learn" ? (
              <>
                <div style={{ marginTop: 4 }}><span style={S.mono(10)}>tap sections to become regions · {scan.picked.size} selected</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {scan.sections.map((s) => {
                    const on = scan.picked.has(s);
                    return <button key={s} onClick={() => { const n = new Set(scan.picked); on ? n.delete(s) : n.add(s); setScan({ ...scan, picked: n }); }} style={S.chip(on)}>{s}</button>;
                  })}
                </div>
              </>
            ) : <p style={{ fontSize: 13, color: T.inkSoft, margin: "8px 0 0" }}>An implementation kata will be forged: guided code steps + reference solution + AI review of your attempt.</p>}
            <button onClick={doBuild} disabled={!!busy} style={{ ...S.btn(T.explore), marginTop: 14, width: "100%" }}>
              {busy && busy !== "scan" ? busy : goal === "learn" ? `Forge ${scan.picked.size} region${scan.picked.size === 1 ? "" : "s"}` : "Forge the kata"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  /* ============ DEX ============ */
  if (screen === "dex") return (
    <div style={S.app}><style>{CSS}</style><Toast /><HUD back={() => setScreen("home")} />
      <div style={{ ...S.wrap, paddingTop: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 2px" }}>Conceptdex — {world.title}</h2>
        <span style={S.mono(10.5)}>{save.captured.length} CAPTURED TOTAL · lore unlocks on capture</span>
        {regions.map((r) => (
          <div key={r.id} style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{r.emoji} {r.name}</div>
            {r.concepts.map((c) => {
              const got = capturedSet.has(c.id);
              return (
                <div key={c.id} style={{ ...S.card, marginTop: 8, padding: 13, opacity: got ? 1 : 0.6 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 24, filter: got ? "none" : "grayscale(1) brightness(0.4)" }}>{c.sprite}</span>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{got ? c.name : "???"}</span>
                    {got && <span style={{ ...S.mono(9, T.reward), marginLeft: "auto" }}>CAPTURED</span>}
                  </div>
                  {got ? <p style={{ fontSize: 13, lineHeight: 1.6, margin: "8px 0 0" }}>{c.lore}</p>
                    : <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "6px 0 0" }}>A critical encounter in {r.name}. Defeat it to unlock its lore.</p>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  /* ============ SETTINGS ============ */
  if (screen === "settings") return (
    <div style={S.app}><style>{CSS}</style><Toast /><HUD back={() => setScreen("home")} />
      <div style={{ ...S.wrap, paddingTop: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Model settings</h2>
        <p style={{ color: T.inkSoft, fontSize: 13, lineHeight: 1.55 }}>World/kata generation can run on the built-in Claude or any OpenAI-compatible endpoint. Web browsing (URL scans, Concept finder, Paper Scout) and PDF reading always use the built-in model; Paste-text generation and code review honor your choice.</p>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button onClick={() => persistCfg({ ...cfg, provider: "builtin" })} style={S.chip(cfg.provider === "builtin")}>Built-in Claude</button>
          <button onClick={() => persistCfg({ ...cfg, provider: "custom" })} style={S.chip(cfg.provider === "custom")}>Custom endpoint</button>
        </div>
        {cfg.provider === "custom" && (
          <div style={{ ...S.card, marginTop: 12 }}>
            <span style={S.mono(10)}>PRESETS</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 12px" }}>
              <button onClick={() => persistCfg({ ...cfg, baseUrl: "http://localhost:11434/v1", model: "llama3.1" })} style={S.chip(false)}>Ollama</button>
              <button onClick={() => persistCfg({ ...cfg, baseUrl: "http://localhost:1234/v1", model: "local-model" })} style={S.chip(false)}>LM Studio</button>
              <button onClick={() => persistCfg({ ...cfg, baseUrl: "http://localhost:8080/v1", model: "default" })} style={S.chip(false)}>llama.cpp</button>
            </div>
            <span style={S.mono(10)}>BASE URL (…/v1)</span>
            <input value={cfg.baseUrl} onChange={(e) => persistCfg({ ...cfg, baseUrl: e.target.value })} placeholder="https://api.provider.com/v1 or http://localhost:11434/v1" style={{ ...S.input, margin: "4px 0 10px" }} />
            <span style={S.mono(10)}>MODEL</span>
            <input value={cfg.model} onChange={(e) => persistCfg({ ...cfg, model: e.target.value })} placeholder="llama3.1, qwen2.5-coder, gpt-4o-mini…" style={{ ...S.input, margin: "4px 0 10px" }} />
            <span style={S.mono(10)}>API KEY (blank for local)</span>
            <input value={cfg.apiKey} onChange={(e) => persistCfg({ ...cfg, apiKey: e.target.value })} type="password" placeholder="sk-…" style={{ ...S.input, margin: "4px 0 6px" }} />
            <p style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.5, margin: "8px 0 0" }}>⚠️ Local endpoints need CORS enabled (e.g. <code>OLLAMA_ORIGINS=*</code>; LM Studio → enable CORS in server settings). Some hosted sandboxes block non-Anthropic requests — if calls fail here, run this file in a local Vite app and everything works.</p>
          </div>
        )}
        <div style={{ ...S.card, marginTop: 12 }}>
          <span style={S.mono(10)}>SAVE DATA</span>
          <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "6px 0 10px" }}>XP {save.xp} · {save.captured.length} concepts · {save.badges.length} badges · {Object.keys(save.katas).length} katas touched</p>
          <button onClick={() => { persist({ xp: 0, hp: 100, badges: [], captured: [], sides: [], katas: {} }); showToast("Save reset."); }} style={{ ...S.btn(T.penalty), padding: "8px 14px", fontSize: 12.5 }}>Reset progress</button>
        </div>
      </div>
    </div>
  );

  /* ============ PAPER SCOUT ============ */
  if (screen === "papers") return (
    <div style={S.app}><style>{CSS}</style><Toast /><HUD back={() => setScreen("home")} />
      <div style={{ ...S.wrap }}>
        <Tabs />
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "14px 0 4px" }}>📡 Paper Scout</h2>
        <p style={{ color: T.inkSoft, fontSize: 13, lineHeight: 1.55 }}>Live search over arXiv / Hugging Face Papers via the built-in model. (Papers with Code was sunset in 2025 — this is its spiritual successor here.) Found something good? Bring it into a world via <b>+ Bring your own</b>.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={paperQ} onChange={(e) => setPaperQ(e.target.value)} placeholder="e.g. agentic RL, KV cache compression, medical VLM" style={{ ...S.input, flex: 1, minWidth: 0 }} />
          <button onClick={doPapers} disabled={busy === "papers"} style={S.btn(T.ink)}>{busy === "papers" ? "…" : "Scout"}</button>
        </div>
        {papers && papers.error && <div style={{ marginTop: 12, color: T.penalty, fontSize: 13.5 }}>Scout failed — try a broader topic.</div>}
        {Array.isArray(papers) && papers.map((p, i) => (
          <div key={i} style={{ ...S.card, marginTop: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.4 }}>{p.title}</div>
            <span style={S.mono(9.5, T.explore)}>{p.venue}</span>
            <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55, margin: "6px 0 8px" }}>{p.summary}</p>
            <div style={{ display: "flex", gap: 8 }}>
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ ...S.chip(false), textDecoration: "none" }}>Read →</a>}
              <button onClick={() => { setResTab("url"); setUrl(p.url || ""); setGoal("learn"); setScan(null); setScreen("spawn"); }} style={S.chip(true)}>⚒️ Make it a world</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ============ DOJO ============ */
  if (screen === "dojo") {
    const fams = [["ml", "🧠 ML Engineering"], ["swe", "🧩 SWE · Blind 75"], ["sys", "🏰 System Design"], ["custom", "🌀 Your forged katas"]];
    return (
      <div style={S.app}><style>{CSS}</style><Toast /><HUD back={() => setScreen("home")} />
        <div style={{ ...S.wrap }}>
          <Tabs />
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "14px 0 0" }}>⌨️ The Dojo</h2>
          <span style={S.mono(10)}>guided implementation katas · +15 XP/step · +60 XP/completion</span>
          {fams.map(([fam, label]) => {
            const ks = allKatas.filter((k) => k.family === fam);
            if (!ks.length) return null;
            return (
              <div key={fam} style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{label}</div>
                {ks.map((k) => {
                  const p = kProgress(k.id); const done = p >= k.steps.length;
                  return (
                    <div key={k.id} onClick={() => openKata(k)} style={{ ...S.card, marginTop: 8, padding: 13, display: "flex", gap: 12, alignItems: "center", cursor: "pointer", background: done ? T.rewardSoft : T.card }}>
                      <span style={{ fontSize: 22 }}>{k.emoji || "⌨️"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{k.title}</div>
                        <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45 }}>{k.blurb}</div>
                        <span style={S.mono(9, done ? T.reward : T.inkSoft)}>{done ? "COMPLETE ✓" : `${p}/${k.steps.length} steps`} · {k.frameworks.join(" / ")}</span>
                      </div>
                      <span style={{ color: T.explore, fontWeight: 800 }}>›</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ============ KATA PLAYER ============ */
  if (screen === "kata" && kata) {
    const st = kata.steps[stepIdx];
    return (
      <div style={S.app}><style>{CSS}</style><Toast /><HUD back={() => setScreen("dojo")} />
        <div style={{ ...S.wrap, paddingTop: 16 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{kata.emoji || "⌨️"} {kata.title}</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
            {kata.frameworks.map((f) => <button key={f} onClick={() => setFw(f)} style={S.chip(fw === f)}>{f}</button>)}
            {(kata.links || []).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ ...S.chip(false), textDecoration: "none" }}>🔗 {l.label}</a>)}
          </div>
          {kPhase === "step" && st && (
            <div style={{ ...S.card, animation: "slideUp .25s ease" }}>
              <span style={S.mono(10, T.explore)}>STEP {stepIdx + 1}/{kata.steps.length}</span>
              <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.5, margin: "8px 0 10px" }}>{st.prompt}</div>
              {st.code && <pre style={S.pre}>{st.code}</pre>}
              <div style={{ marginTop: 12 }}>
                {st.options.map((opt, i) => (
                  <button key={i} onClick={() => answerKata(i)} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8, background: T.card, border: `1.5px solid ${T.line}`, color: T.ink, borderRadius: 10, padding: "11px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
                    <span style={S.mono(10, T.explore)}>{String.fromCharCode(65 + i)}</span>&nbsp;&nbsp;{opt}
                  </button>
                ))}
              </div>
              {kFeedback && (
                <div style={{ background: kFeedback.ok ? T.rewardSoft : T.penaltySoft, borderRadius: 10, padding: "10px 13px", fontSize: 13, lineHeight: 1.5 }}>
                  <b style={{ color: kFeedback.ok ? T.reward : T.penalty }}>{kFeedback.ok ? "✓ +15 XP — " : "✗ Not quite — "}</b>{kFeedback.msg}
                </div>
              )}
            </div>
          )}
          {kPhase === "done" && (
            <>
              <div style={{ ...S.card, background: T.rewardSoft, border: `1px solid ${T.reward}` }}>
                <span style={S.mono(10, T.reward)}>KATA COMPLETE — REFERENCE SOLUTION ({fw.toUpperCase()})</span>
              </div>
              <pre style={{ ...S.pre, marginTop: 10 }}>{kata.solutions[fw] || kata.solutions[Object.keys(kata.solutions)[0]] || "// no reference for this framework"}</pre>
              <div style={{ ...S.card, marginTop: 12 }}>
                <span style={S.mono(10, T.explore)}>NOW WRITE YOUR OWN — AI REVIEW</span>
                <textarea value={myCode} onChange={(e) => setMyCode(e.target.value)} rows={8} placeholder={`Paste your ${fw} implementation here for a strict review (uses your model settings)…`} style={{ ...S.input, marginTop: 8, resize: "vertical" }} />
                <button onClick={doReview} disabled={busy === "review"} style={{ ...S.btn(T.explore), width: "100%", marginTop: 8 }}>{busy === "review" ? "Reviewing…" : "Review my code"}</button>
                {review && <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{review}</div>}
              </div>
              <button onClick={() => { setStepIdx(0); setKPhase("step"); setKFeedback(null); }} style={{ ...S.btn(T.ink), width: "100%", marginTop: 12 }}>Replay steps</button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ============ BATTLE ============ */
  if (screen === "battle" && battle) {
    const q = bQuestions[battle.qIdx % bQuestions.length];
    const enemy = battle.kind === "critical" ? battle.concept : battle.kind === "side" ? battle.side : battle.gym;
    const enemyName = battle.kind === "gym" ? battle.gym.leader : enemy.name;
    const enemyPct = (battle.enemyHp / battle.enemyMax) * 100;
    const kindLabel = battle.kind === "critical" ? "CRITICAL ENCOUNTER · NEW CONCEPT" : battle.kind === "side" ? "SIDE DUEL · REINFORCEMENT" : "GYM BATTLE";
    const kindColor = battle.kind === "critical" ? T.action : battle.kind === "side" ? T.explore : T.gold;
    const side = battle.kind === "side" ? battle.side : null;
    return (
      <div style={{ ...S.app, background: T.night }}><style>{CSS}</style><Toast />
        <div style={{ maxWidth: 620, margin: "0 auto", padding: "16px 14px 60px" }}>
          <span style={{ ...S.mono(10, "#9FA8CC") }}>{kindLabel}</span>
          <div style={{ background: "linear-gradient(180deg,#2E3A66 0%,#3D4E85 100%)", borderRadius: 16, padding: "18px 16px 14px", border: "1px solid #46548F", marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ background: "rgba(255,255,255,0.95)", borderRadius: 10, padding: "8px 12px", minWidth: 165 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{battle.kind === "gym" ? "👑 " : ""}{enemyName}</div>
                <div style={{ height: 7, background: T.line, borderRadius: 4, marginTop: 5 }}>
                  <div style={{ height: "100%", width: `${enemyPct}%`, background: enemyPct > 40 ? T.reward : T.penalty, borderRadius: 4, transition: "width .5s" }} />
                </div>
                <span style={S.mono(9, T.inkSoft)}>HP {battle.enemyHp}/{battle.enemyMax}</span>
              </div>
              <div style={{ fontSize: 56, animation: battle.phase === "feedback" && !battle.wrong ? "hit .4s" : "bob 2.4s ease-in-out infinite" }}>{enemy.sprite}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>
              <div style={{ fontSize: 44, animation: battle.wrong && battle.phase === "feedback" ? "hit .4s" : "none" }}>🧢</div>
              <div style={{ background: "rgba(255,255,255,0.95)", borderRadius: 10, padding: "8px 12px", minWidth: 165 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>YOU · LV.{level}</div>
                <div style={{ height: 7, background: T.line, borderRadius: 4, marginTop: 5 }}>
                  <div style={{ height: "100%", width: `${(save.hp / maxHp) * 100}%`, background: save.hp / maxHp > 0.4 ? T.reward : T.penalty, borderRadius: 4, transition: "width .5s" }} />
                </div>
                <span style={S.mono(9, T.inkSoft)}>HP {save.hp}/{maxHp} · STREAK ×{battle.streak}</span>
              </div>
            </div>
          </div>

          {battle.phase === "briefing" && side && (
            <div style={{ background: T.card, borderRadius: 14, padding: 16, marginTop: 12, animation: "slideUp .3s ease" }}>
              <span style={S.mono(10, kindColor)}>MISSION BRIEFING — RETENTION DUEL</span>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: "8px 0 10px" }}>{side.desc}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ ...S.mono(10, level >= (side.recLevel || 1) ? T.reward : T.penalty), background: level >= (side.recLevel || 1) ? T.rewardSoft : T.penaltySoft, padding: "5px 10px", borderRadius: 999 }}>
                  RECOMMENDED LV.{side.recLevel || 1} {level >= (side.recLevel || 1) ? "✓ you qualify" : `· you are LV.${level}`}
                </span>
              </div>
              {(side.prereqs || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <span style={S.mono(9.5)}>PREREQ LORE — capture these criticals first for optimal retention:</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {side.prereqs.map((pid) => {
                      const met = capturedSet.has(pid);
                      return <span key={pid} style={{ ...S.mono(10, met ? T.reward : T.penalty), background: met ? T.rewardSoft : T.penaltySoft, padding: "5px 10px", borderRadius: 999 }}>{met ? "✓" : "✗"} {conceptName(pid)}</span>;
                    })}
                  </div>
                </div>
              )}
              {side.code && (
                <div style={{ marginTop: 12 }}>
                  <span style={S.mono(9.5, T.explore)}>CODE WALKTHROUGH — the scenarios reference this:</span>
                  <pre style={{ ...S.pre, marginTop: 6 }}>{side.code}</pre>
                  {side.codeNote && <p style={{ fontSize: 12, color: T.inkSoft, margin: "6px 0 0", lineHeight: 1.5 }}>{side.codeNote}</p>}
                </div>
              )}
              <button onClick={continueBattle} style={{ ...S.btn(T.explore), width: "100%", marginTop: 14 }}>⚔️ Accept the duel</button>
            </div>
          )}

          {battle.phase === "lore" && (
            <div style={{ background: T.card, borderRadius: 14, padding: 16, marginTop: 12, animation: "slideUp .3s ease" }}>
              <span style={S.mono(10, kindColor)}>{battle.kind === "critical" ? "LORE — READ TO ARM YOURSELF" : "CHALLENGE"}</span>
              <p style={{ fontSize: 14, lineHeight: 1.65, margin: "8px 0 0" }}>{battle.kind === "critical" ? battle.concept.lore : battle.log}</p>
              <button onClick={continueBattle} style={{ ...S.btn(T.action), width: "100%", marginTop: 14 }}>⚔️ Engage</button>
            </div>
          )}

          {battle.phase === "question" && q && (
            <div style={{ background: T.card, borderRadius: 14, padding: 16, marginTop: 12, animation: "slideUp .3s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={S.mono(10, kindColor)}>{battle.kind === "side" ? "APPLIED SCENARIO" : "CHOOSE YOUR MOVE"} · wrong = −{battle.kind === "gym" ? 22 : 16} HP</span>
                {side && side.code && <button onClick={() => setBattle({ ...battle, showCode: !battle.showCode })} style={{ ...S.chip(battle.showCode), padding: "4px 10px", fontSize: 11 }}>{"</>"}</button>}
              </div>
              {side && side.code && battle.showCode && <pre style={{ ...S.pre, marginTop: 8, maxHeight: 180, overflowY: "auto" }}>{side.code}</pre>}
              <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.55, margin: "8px 0 12px" }}>{q.q}</div>
              {q.options.map((opt, i) => (
                <button key={i} onClick={() => answerBattle(i)} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8, background: T.card, border: `1.5px solid ${T.line}`, color: T.ink, borderRadius: 10, padding: "11px 13px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.45 }}>
                  <span style={S.mono(10, T.explore)}>{String.fromCharCode(65 + i)}</span>&nbsp;&nbsp;{opt}
                </button>
              ))}
            </div>
          )}

          {["feedback", "victory", "defeat"].includes(battle.phase) && (
            <div style={{ background: battle.phase === "victory" ? T.rewardSoft : battle.wrong || battle.phase === "defeat" ? T.penaltySoft : T.rewardSoft, borderRadius: 14, padding: 16, marginTop: 12, animation: "slideUp .3s ease" }}>
              <span style={S.mono(10, battle.phase === "victory" ? T.reward : battle.wrong || battle.phase === "defeat" ? T.penalty : T.reward)}>
                {battle.phase === "victory" ? (battle.kind === "critical" ? "CONCEPT CAPTURED!" : battle.kind === "side" ? "KNOWLEDGE REINFORCED!" : "BADGE EARNED!") : battle.phase === "defeat" ? "YOU BLACKED OUT" : battle.wrong ? "COUNTERATTACK!" : "DIRECT HIT!"}
              </span>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "8px 0 0" }}>{battle.log}</p>
              <button onClick={continueBattle} style={{ ...S.btn(battle.phase === "victory" ? T.reward : T.ink), width: "100%", marginTop: 12 }}>
                {battle.phase === "victory" ? "Return to the board →" : battle.phase === "defeat" ? "Wake up at entrance" : battle.wrong ? "Face the question again" : "Next question →"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ============ REGION BOARD ============ */
  if (screen === "region" && region && board) {
    const criticalsDone = region.concepts.filter((c) => capturedSet.has(c.id)).length;
    const gymUnlocked = criticalsDone === region.concepts.length;
    const at = board.nodes.find((n) => n.id === atNode) || board.nodes[0];
    return (
      <div style={S.app}><style>{CSS}</style><Toast /><HUD back={() => setScreen(regions.length > 1 ? "regionlist" : "home")} />
        <div style={{ maxWidth: 620, margin: "0 auto", padding: "12px 14px 50px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{region.emoji} {region.name}</div>
            <span style={S.mono(10, gymUnlocked ? T.reward : T.inkSoft)}>{criticalsDone}/{region.concepts.length} criticals{gymUnlocked ? " · GYM OPEN" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 12, margin: "4px 0 8px", flexWrap: "wrap" }}>
            <span style={S.mono(9.5, T.action)}>⬡ CRITICAL = new concept</span>
            <span style={S.mono(9.5, T.explore)}>◇ SIDE = retention duel (heals)</span>
            <span style={S.mono(9.5, T.gold)}>🏛 GYM = badge</span>
          </div>
          <div style={{ position: "relative", width: "100%", aspectRatio: "5/4", background: "linear-gradient(160deg,#A8D8A0 0%,#7BC47F 45%,#69B583 100%)", borderRadius: 16, border: `3px solid ${T.ink}`, overflow: "hidden", boxShadow: "0 8px 28px rgba(27,36,64,0.2)" }}>
            <div style={{ position: "absolute", inset: 0, opacity: 0.35, fontSize: 18, pointerEvents: "none" }}>
              <span style={{ position: "absolute", left: "4%", top: "8%" }}>🌲</span>
              <span style={{ position: "absolute", left: "88%", top: "12%" }}>🌲</span>
              <span style={{ position: "absolute", left: "14%", top: "78%" }}>🌳</span>
              <span style={{ position: "absolute", left: "78%", top: "82%" }}>🌳</span>
              <span style={{ position: "absolute", left: "46%", top: "6%" }}>⛰️</span>
              <span style={{ position: "absolute", left: "60%", top: "88%" }}>🌼</span>
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              {board.edges.map(([a, b], i) => {
                const na = board.nodes.find((n) => n.id === a), nb = board.nodes.find((n) => n.id === b);
                const open = nodeCleared(a) || nodeCleared(b);
                return <path key={i} d={`M ${na.x} ${na.y} Q ${(na.x + nb.x) / 2} ${(na.y + nb.y) / 2 - 6} ${nb.x} ${nb.y}`} stroke={open ? "#2F6E45" : "rgba(47,110,69,0.35)"} strokeDasharray={open ? "none" : "2.5 2.5"} fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" style={{ strokeWidth: open ? 3 : 2 }} />;
              })}
            </svg>
            {board.nodes.map((n) => {
              const cleared = nodeCleared(n.id);
              const reachable = nodeReachable(n.id) || cleared || n.id === "start";
              const isCrit = n.id.startsWith("c:"), isSide = n.id.startsWith("s:"), isGym = n.id === "gym";
              const sprite = n.id === "start" ? "🧙" : isGym ? (cleared ? "🎖" : "🏛") : isCrit ? (region.concepts.find((c) => c.id === n.id.slice(2)) || {}).sprite : (region.sides.find((s) => s.id === n.id.slice(2)) || {}).sprite;
              const ring = isGym ? T.gold : isCrit ? T.action : isSide ? T.explore : T.ink;
              return (
                <button key={n.id} onClick={() => tapNode(n.id)} aria-label={n.id} style={{
                  position: "absolute", left: `${n.x}%`, top: `${n.y}%`, transform: "translate(-50%,-50%)",
                  width: 46, height: 46, borderRadius: isSide ? 12 : "50%",
                  background: cleared ? "rgba(255,255,255,0.96)" : reachable ? "#FFFDF4" : "rgba(255,255,255,0.45)",
                  border: `3px solid ${reachable || cleared ? ring : "rgba(27,36,64,0.25)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, cursor: "pointer",
                  boxShadow: reachable && !cleared ? `0 0 0 5px ${ring}33, 0 3px 10px rgba(0,0,0,0.25)` : "0 2px 6px rgba(0,0,0,0.18)",
                  animation: reachable && !cleared ? "pulse 1.8s ease-in-out infinite" : "none",
                  filter: reachable || cleared ? "none" : "grayscale(0.8)", padding: 0,
                }}>
                  {sprite}
                  {cleared && <span style={{ position: "absolute", right: -5, top: -5, background: T.reward, color: "#fff", borderRadius: "50%", width: 17, height: 17, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>✓</span>}
                </button>
              );
            })}
            <div style={{ position: "absolute", left: `${at.x}%`, top: `${at.y}%`, fontSize: 22, transition: "left .5s ease, top .5s ease", pointerEvents: "none", animation: "tokenBob 1.6s ease-in-out infinite", textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>🧢</div>
          </div>

          {(world.links || []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
              <span style={S.mono(9.5)}>STUDY HALL:</span>
              {world.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ ...S.chip(false), textDecoration: "none", fontSize: 11.5, padding: "5px 10px" }}>🔗 {l.label}</a>)}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            {region.concepts.map((c) => (
              <div key={c.id} onClick={() => tapNode("c:" + c.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: capturedSet.has(c.id) ? T.rewardSoft : T.card, border: `1px solid ${T.line}`, marginBottom: 6, cursor: "pointer" }}>
                <span style={{ fontSize: 18 }}>{c.sprite}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>{c.name}</span>
                <span style={S.mono(9, capturedSet.has(c.id) ? T.reward : T.action)}>{capturedSet.has(c.id) ? "CAPTURED · re-read lore" : "CRITICAL"}</span>
              </div>
            ))}
            {(region.sides || []).map((s) => {
              const met = (s.prereqs || []).every((p) => capturedSet.has(p));
              return (
                <div key={s.id} onClick={() => tapNode("s:" + s.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: sidesSet.has(s.id) ? T.exploreSoft : T.card, border: `1px dashed ${T.explore}`, marginBottom: 6, cursor: "pointer" }}>
                  <span style={{ fontSize: 18 }}>{s.sprite}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</span>
                    <div style={{ fontSize: 11, color: T.inkSoft }}>
                      REC LV.{s.recLevel || 1} · prereqs {met ? "✓" : `${(s.prereqs || []).filter((p) => capturedSet.has(p)).length}/${(s.prereqs || []).length}`}{s.code ? " · </> code" : ""}
                    </div>
                  </div>
                  <span style={S.mono(9, T.explore)}>{sidesSet.has(s.id) ? "REPLAY" : "SIDE"}</span>
                </div>
              );
            })}
          </div>
        </div>
        {dialog && (
          <div onClick={() => setDialog(null)} style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, padding: 12 }}>
            <div style={{ maxWidth: 620, margin: "0 auto", background: T.card, border: `3px solid ${T.ink}`, borderRadius: 14, padding: "14px 16px", animation: "slideUp .25s ease", boxShadow: "0 -4px 24px rgba(27,36,64,0.25)" }}>
              <span style={S.mono(10.5, T.explore)}>{dialog.name.toUpperCase()}</span>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: "6px 0 8px" }}>{dialog.text}</p>
              <span style={S.mono(9.5)}>tap to close ▾</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600;800&display=swap');
@keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes tokenBob { 0%,100% { transform: translate(-50%,-130%) translateY(0); } 50% { transform: translate(-50%,-130%) translateY(-5px); } }
@keyframes hit { 0%,100% { transform: translateX(0); filter: none; } 30% { transform: translateX(-7px); filter: brightness(1.6); } 60% { transform: translateX(7px); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.08); } }
button:focus-visible { outline: 2px solid #5B4FD6; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
