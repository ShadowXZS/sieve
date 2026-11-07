import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  worker: {
    format: "es",
  },
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
  preview: {
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
      onwarn(warning, warn) {
        if (warning.code === "EVAL" && warning.id?.includes("@duckdb/duckdb-wasm")) {
          return;
        }
        warn(warning);
      },
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        manualChunks(id) {
          if (id.includes("dejavuFontData")) {
            return "pdf-fonts";
          }
          if (id.includes("@react-pdf/renderer")) {
            return "react-pdf";
          }
          if (id.includes("src/reports") || id.includes("src/components/pdf")) {
            return "pdf-reports";
          }
          if (id.includes("@duckdb/duckdb-wasm")) {
            return "duckdb-wasm";
          }
          if (id.includes("apache-arrow")) {
            return "apache-arrow";
          }
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/zustand/") ||
            id.includes("node_modules/dexie/")
          ) {
            return "framework-vendor";
          }
          if (
            id.includes("node_modules/lucide-react/") ||
            id.includes("node_modules/@tanstack/react-virtual/") ||
            id.includes("node_modules/clsx/") ||
            id.includes("node_modules/tailwind-merge/")
          ) {
            return "ui-vendor";
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
