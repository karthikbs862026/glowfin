// Part 4.6 / 6.8 — initial load time / bundle size budget, enforced at build time.
// This is a Phase 0 stub with a placeholder budget. Replace BUDGET_BYTES with the
// real number once Part 4.6 budgets are defined and recorded in the decision log,
// and expand this to break down per-chunk (vendor/three vs game code) as the
// bundle grows.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST_DIR = "dist";
const BUDGET_BYTES = 2 * 1024 * 1024; // 2MB placeholder — TUNE AND RECORD IN ADR

function totalSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      total += totalSize(full);
    } else if (!entry.endsWith(".map")) {
      // Sourcemaps aren't downloaded by the browser during normal play —
      // only when DevTools requests them. Counting them against the
      // player-facing load budget would be measuring the wrong thing.
      total += s.size;
    }
  }
  return total;
}

try {
  const size = totalSize(DIST_DIR);
  const sizeMB = (size / 1024 / 1024).toFixed(2);
  const budgetMB = (BUDGET_BYTES / 1024 / 1024).toFixed(2);

  if (size > BUDGET_BYTES) {
    console.error(`Bundle size ${sizeMB}MB exceeds budget ${budgetMB}MB.`);
    process.exit(1);
  }
  console.log(`Bundle size ${sizeMB}MB within budget ${budgetMB}MB.`);
} catch (err) {
  console.error(`Could not measure bundle size in "${DIST_DIR}":`, err.message);
  process.exit(1);
}
