const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");


const CLAUDE_TIMEOUT_MS = 120000;

function runClaude(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: app.getPath("home"),
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "edokai-desktop" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Claude Code timed out. Try again, or run `claude auth login` once from Terminal."));
    }, CLAUDE_TIMEOUT_MS);
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(err.code === "ENOENT" ? "Claude Code CLI not found. Install Claude Code or add `claude` to PATH." : err.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `Claude Code exited with ${code}`).trim()));
    });
    child.stdin.end(input);
  });
}

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
  const args = ["-p", "--output-format", "text", "--no-session-persistence", "--model", "sonnet"];
  if (needsWeb) args.push("--tools", "WebSearch,WebFetch");
  else args.push("--tools", "");
  args.push(prompt);
  const out = await runClaude(args);
  if (!out.trim()) throw new Error("Claude Code returned an empty response");
  return out;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 760,
    height: 920,
    minWidth: 420,
    title: "Edokai",
    backgroundColor: "#EBEFF6",
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
