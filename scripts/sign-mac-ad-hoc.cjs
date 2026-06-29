const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: opts.quiet ? "pipe" : "inherit" });
}

function signPath(p) {
  try { run("codesign", ["--remove-signature", p], { quiet: true }); } catch {}
  run("codesign", ["--force", "--sign", "-", "--timestamp=none", p]);
}

exports.default = async function signMacAdHoc(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const contents = path.join(appPath, "Contents");
  const frameworks = path.join(contents, "Frameworks");
  const macos = path.join(contents, "MacOS");

  console.log(`[afterPack] fully ad-hoc signing ${appPath}`);

  // macOS 26 is stricter about Team ID consistency. Electron bundles may arrive
  // with upstream Electron signatures on nested frameworks while the main app is
  // ad-hoc signed, causing dyld to abort with “mapped file has different Team IDs”.
  // Strip/sign every executable payload from the inside out with the same ad-hoc
  // identity so the main executable and Electron Framework share TeamID=none.
  const files = walk(contents).filter((p) => {
    const base = path.basename(p);
    return base.endsWith(".dylib") || base === "Electron Framework" || base.endsWith(" Helper") || base === appName.replace(/\.app$/, "") || /crashpad|ShipIt|Squirrel/.test(base);
  });

  for (const f of files.sort((a, b) => b.length - a.length)) signPath(f);

  const nestedApps = [];
  const collectApps = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory() && ent.name.endsWith(".app")) nestedApps.push(p);
      else if (ent.isDirectory()) collectApps(p);
    }
  };
  collectApps(frameworks);
  for (const app of nestedApps.sort((a, b) => b.length - a.length)) signPath(app);

  const frameworkDirs = fs.existsSync(frameworks) ? fs.readdirSync(frameworks).filter((n) => n.endsWith(".framework")).map((n) => path.join(frameworks, n)) : [];
  for (const fw of frameworkDirs.sort((a, b) => b.length - a.length)) signPath(fw);

  for (const exe of walk(macos)) signPath(exe);
  signPath(appPath);

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
};
