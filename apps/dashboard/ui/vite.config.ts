import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  root,
  build: { outDir: "../web-dist", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://localhost:8788" } },
});
