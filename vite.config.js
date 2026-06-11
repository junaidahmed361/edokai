import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",            // relative paths so Electron can load dist/index.html from file://
  plugins: [react()],
});
