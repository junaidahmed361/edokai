const { contextBridge } = require('electron');

// Optional launch-time auth for local desktop builds.
// Run with ANTHROPIC_API_KEY=... npm run dev/electron or package environment.
// Do not hard-code credentials in the repository.
contextBridge.exposeInMainWorld('edokaiAuth', {
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  codexAvailable: !!(process.env.CODEX_AUTH_TOKEN || process.env.OPENAI_API_KEY),
});
