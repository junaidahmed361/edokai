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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Edokai render error", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: "#0B1020", color: "#EDF2FF", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1>Edokai hit a render error</h1>
        <p>Please copy this message into an issue or reset local save data if it was caused by old browser state.</p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#141B31", padding: 16, borderRadius: 12 }}>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
      </div>
    );
  }
}

import App from "./App.jsx";
createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
