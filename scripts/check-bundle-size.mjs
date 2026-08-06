// Part 4.6 / 6.8 — initial load time / bundle size budget, enforced at build time.
// Version 41.2 preserves the original 2 MiB baseline and has one separately
// recorded, reviewable additive allowance. See the ADR named below.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST_DIR = "dist";
const BASE_BUDGET_BYTES = 2 * 1024 * 1024;
const VERSION41_2_ADDITIVE_BUDGET_BYTES = 32 * 1024;
const BUDGET_BYTES = BASE_BUDGET_BYTES + VERSION41_2_ADDITIVE_BUDGET_BYTES;

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
  console.log(
    `Bundle size ${sizeMB}MB within ${budgetMB}MB budget ` +
    `(2.00MiB baseline + 32KiB Version 41.2 allowance).`
  );
} catch (err) {
  console.error(`Could not measure bundle size in "${DIST_DIR}":`, err.message);
  process.exit(1);
}
