import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Deterministic server-authority bundle consumed by the hosted leaderboard.
 * It contains the same tuning, course generation, collision and scoring code
 * as the browser build, with no DOM, renderer or advertising dependency.
 */
export default defineConfig({
  publicDir: false,
  build: {
    target: "es2022",
    outDir: "build/hosted",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, "src/competitive/hostedAuthority.ts"),
      formats: ["es"],
      fileName: () => "glowfin-verifier.js"
    },
    rollupOptions: {
      output: {
        exports: "named"
      }
    }
  }
});
