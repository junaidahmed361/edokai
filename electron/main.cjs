const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const Database = require("better-sqlite3");


const CLAUDE_TIMEOUT_MS = 120000;
const CODEX_TIMEOUT_MS = 120000;
let db;
function edokaiDb() {
  if (db) return db;
  const dbPath = path.join(app.getPath("userData"), "edokai.sqlite");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`);
  return db;
}
function uuid() { return crypto.randomUUID(); }

function commandPath(command) {
  const home = app.getPath("home");
  const candidates = command === "claude"
    ? [path.join(home, ".hermes/node/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude", "claude"]
    : ["/opt/homebrew/bin/codex", "/usr/local/bin/codex", path.join(home, ".hermes/node/bin/codex"), "codex"];
  return candidates.find((c) => c === command || require("fs").existsSync(c)) || command;
}
function runProcess(command, args, input = "", timeoutMs = CLAUDE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandPath(command), args, {
      cwd: app.getPath("home"),
      env: { ...process.env, PATH: `${app.getPath("home")}/.hermes/node/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`, CLAUDE_CODE_ENTRYPOINT: "edokai-desktop", CODEX_ENTRYPOINT: "edokai-desktop" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out. Check local auth and try again.`));
    }, timeoutMs);
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(err.code === "ENOENT" ? `${command} CLI not found on PATH.` : err.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `${command} exited with ${code}`).trim()));
    });
    child.stdin.end(input);
  });
}
function runClaude(args, input = "") {
  return runProcess("claude", args, input, CLAUDE_TIMEOUT_MS);
}
function runCodex(prompt) {
  const sys = "You are Edokai's in-app model backend. Return only the requested content, with no tool use, no code edits, and no markdown fences unless explicitly asked.";
  return runProcess("codex", ["exec", "--skip-git-repo-check", "--ephemeral", "-m", "gpt-5.5", `${sys}

${prompt}`], "", CODEX_TIMEOUT_MS);
}
async function providerStatus() {
  const codex = { command: commandPath("codex"), ok: false };
  const claude = { command: commandPath("claude"), ok: false };
  try {
    const out = await runProcess("codex", ["login", "status"], "", 15000);
    codex.ok = /logged in/i.test(out) && !/not logged in/i.test(out);
    codex.detail = out;
    if (!codex.ok) codex.error = out || "not logged in";
  } catch (e) { codex.error = e.message || String(e); }
  try {
    const out = await runClaude(["auth", "status"]);
    const parsed = JSON.parse(out);
    claude.ok = !!parsed.loggedIn;
    claude.detail = parsed;
    if (!claude.ok) claude.error = parsed.error || parsed.authMethod === "none" ? "not logged in" : JSON.stringify(parsed);
  } catch (e) { claude.error = e.message || String(e); }
  return { codex, claude };
}

function runLoginInTerminal(provider) {
  const cmd = provider === "claude" ? `${commandPath("claude")} auth login` : `${commandPath("codex")} login`;
  if (process.platform === "darwin") {
    const script = `tell application "Terminal"\n  activate\n  do script ${JSON.stringify(cmd)}\nend tell`;
    const r = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout || `Could not open Terminal for ${provider} login`);
    return { ok: true, message: `Opened Terminal to run: ${cmd}` };
  }
  const child = spawn(commandPath(provider === "claude" ? "claude" : "codex"), provider === "claude" ? ["auth", "login"] : ["login"], { detached: true, stdio: "ignore" });
  child.unref();
  return { ok: true, message: `Started ${provider} login in a detached process.` };
}

ipcMain.handle("desktop-model-status", async () => providerStatus());
ipcMain.handle("desktop-model-login", async (_event, provider) => runLoginInTerminal(provider === "claude" ? "claude" : "codex"));

ipcMain.handle("claude-code-status", async () => {
  try {
    const out = await runClaude(["auth", "status"]);
    return JSON.parse(out);
  } catch (e) {
    return { loggedIn: false, error: e.message || String(e) };
  }
});

ipcMain.handle("claude-code-complete", async (_event, { prompt, needsWeb }) => {
  if (!prompt || typeof prompt !== "string") throw new Error("Missing prompt");
  const args = ["-p", "--output-format", "text", "--no-session-persistence", "--model", "opus"];
  if (needsWeb) args.push("--tools", "WebSearch,WebFetch");
  args.push(prompt);
  const out = await runClaude(args);
  if (!out.trim()) throw new Error("Claude Code returned an empty response");
  return out;
});
ipcMain.handle("default-model-complete", async (_event, { prompt, needsWeb, preferred }) => {
  if (!prompt || typeof prompt !== "string") throw new Error("Missing prompt");
  const errors = [];
  const tryClaude = async () => {
    const args = ["-p", "--output-format", "text", "--no-session-persistence", "--model", "opus"];
    if (needsWeb) args.push("--tools", "WebSearch,WebFetch");
    args.push(prompt);
    return runClaude(args);
  };
  const tryCodex = async () => runCodex(prompt);
  for (const runner of (preferred === "claude" ? [tryClaude, tryCodex] : [tryCodex, tryClaude])) {
    try {
      const out = await runner();
      if (out.trim()) return out;
      errors.push("empty response");
    } catch (e) { errors.push(e.message || String(e)); }
  }
  throw new Error(`Default model auth failed. Tried ${preferred === "claude" ? "Claude Opus then Codex GPT-5.5" : "Codex GPT-5.5 then Claude Opus"}: ${errors.join(" | ")}`);
});
ipcMain.handle("edokai-auth", async (_event, name = "local-player") => {
  const d = edokaiDb();
  const playerName = String(name || "local-player").slice(0, 80);
  let player = d.prepare("SELECT * FROM players WHERE name=?").get(playerName);
  if (!player) {
    player = { id: uuid(), name: playerName, created_at: Date.now() };
    d.prepare("INSERT INTO players (id,name,created_at) VALUES (@id,@name,@created_at)").run(player);
  }
  const sessionId = uuid();
  d.prepare("INSERT INTO sessions (id,player_id,started_at,updated_at,data) VALUES (?,?,?,?,?)").run(sessionId, player.id, Date.now(), Date.now(), "{}");
  return { id: player.id, name: player.name, sessionId };
});
ipcMain.handle("edokai-save-session", async (_event, payload) => {
  const d = edokaiDb();
  const player = payload && payload.player;
  if (!player || !player.sessionId) return { ok: false };
  d.prepare("UPDATE sessions SET updated_at=?, data=? WHERE id=?").run(Date.now(), JSON.stringify(payload.save || {}), player.sessionId);
  return { ok: true };
});
ipcMain.handle("storage-get", async (_event, key) => {
  const row = edokaiDb().prepare("SELECT value FROM kv WHERE key=?").get(key);
  // Missing keys are normal on first launch; return null instead of logging
  // noisy IPC handler errors during app boot.
  if (!row) return null;
  return { key, value: row.value };
});
ipcMain.handle("storage-set", async (_event, key, value) => {
  edokaiDb().prepare("INSERT INTO kv(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(key, value, Date.now());
  return { key, value };
});
ipcMain.handle("storage-delete", async (_event, key) => {
  edokaiDb().prepare("DELETE FROM kv WHERE key=?").run(key);
  return { key, deleted: true };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 420,
    minHeight: 600,
    title: "Edokai",
    backgroundColor: "#080B1A",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  // open external links (study hall, papers) in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
