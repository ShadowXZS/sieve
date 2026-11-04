import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), react()],
  publicDir: "Public",
  resolve: {
    alias: {
      "@duckdb/duckdb-wasm/blocking": path.resolve(
        __dirname,
        "node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-blocking.mjs"
      ),
    },
  },
  server: {
    port: 3000,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    exclude: ["sieve_core"],
  },
});
