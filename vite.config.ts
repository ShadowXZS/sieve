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
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('dejavuFontData')) {
            return 'pdf-fonts';
          }
          if (id.includes('@duckdb/duckdb-wasm')) {
            return 'duckdb-wasm';
          }
          if (id.includes('apache-arrow')) {
            return 'apache-arrow';
          }
          if (id.includes('@react-pdf/renderer')) {
            return 'react-pdf';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/zustand') || id.includes('node_modules/dexie')) {
            return 'framework-vendor';
          }
        },
      },
    },
  },
  esbuild: {
    drop: ["debugger"],
    pure: ["console.debug"],
  },
  optimizeDeps: {
    exclude: ["sieve_core"],
  },
});
