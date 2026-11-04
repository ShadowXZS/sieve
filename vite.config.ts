import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "Public",
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
