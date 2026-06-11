const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function signMacAdHoc(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`[afterPack] ad-hoc signing ${appPath}`);
  execFileSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", "--options", "runtime", appPath],
    { stdio: "inherit" }
  );

  execFileSync(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    { stdio: "inherit" }
  );
};
