const { contextBridge, ipcRenderer } = require('electron');

// Local desktop auth bridge.
// Priority order in the renderer:
// 1) user-entered Anthropic key
// 2) ANTHROPIC_API_KEY from launch env, if present
// 3) Claude Code's browser/OAuth login (`claude auth login`), no key required
contextBridge.exposeInMainWorld('edokaiAuth', {
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  codexAvailable: !!(process.env.CODEX_AUTH_TOKEN || process.env.OPENAI_API_KEY),
  claudeCodeStatus: () => ipcRenderer.invoke('claude-code-status'),
  completeWithClaudeCode: (prompt, opts = {}) => ipcRenderer.invoke('claude-code-complete', { prompt, needsWeb: !!opts.needsWeb }),
  completeWithDefaultProvider: (prompt, opts = {}) => ipcRenderer.invoke('default-model-complete', { prompt, needsWeb: !!opts.needsWeb, preferred: opts.preferred || 'codex' }),
  desktopModelStatus: () => ipcRenderer.invoke('desktop-model-status'),
  startDesktopModelLogin: (provider) => ipcRenderer.invoke('desktop-model-login', provider),
});

contextBridge.exposeInMainWorld('edokaiDb', {
  auth: (name) => ipcRenderer.invoke('edokai-auth', name),
  saveSession: (payload) => ipcRenderer.invoke('edokai-save-session', payload),
});
contextBridge.exposeInMainWorld('storage', {
  get: (key) => ipcRenderer.invoke('storage-get', key),
  set: (key, value) => ipcRenderer.invoke('storage-set', key, value),
  delete: (key) => ipcRenderer.invoke('storage-delete', key),
});
contextBridge.exposeInMainWorld('edokaiDkg', {
  fetchSnapshot: () => ipcRenderer.invoke('dkg-snapshot'),
});
