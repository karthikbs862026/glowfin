import { defineConfig } from "vite";

// Part 4.4 — asset pipeline hooks (Draco/KTX2, atlasing, Brotli) get added
// here as plugins in Phase 0/1. Kept minimal until there's real content to
// pipe through it — an empty pipeline config would just be decoration.
export default defineConfig({
  build: {
    target: "es2020",
    sourcemap: true
  },
});
