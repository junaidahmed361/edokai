const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 760,
    height: 920,
    minWidth: 420,
    title: "Edokai",
    backgroundColor: "#EBEFF6",
    webPreferences: { contextIsolation: true },
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
