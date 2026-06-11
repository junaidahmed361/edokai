import React from "react";
import { createRoot } from "react-dom/client";

// Desktop shim: the app was written against the claude.ai artifact
// storage API (window.storage). Map it onto localStorage here so
// App.jsx stays byte-identical to the artifact version.
if (!window.storage) {
  window.storage = {
    async get(key) {
      const v = localStorage.getItem("rw:" + key);
      if (v === null) throw new Error("not found");
      return { key, value: v };
    },
    async set(key, value) { localStorage.setItem("rw:" + key, value); return { key, value }; },
    async delete(key) { localStorage.removeItem("rw:" + key); return { key, deleted: true }; },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("rw:" + prefix)) keys.push(k.slice(3));
      }
      return { keys };
    },
  };
}

import App from "./App.jsx";
createRoot(document.getElementById("root")).render(<App />);
