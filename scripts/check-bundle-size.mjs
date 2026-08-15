// Initial load and bundle-size budgets, enforced against the sealed build.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DIST_DIR = "dist";
const budgets = JSON.parse(readFileSync("config/budgets.json", "utf8"));
const BUDGET_BYTES = budgets.load.maxBundleBytes;
const JAVASCRIPT_BUDGET_BYTES = budgets.load.maxJavaScriptBytes;
const TIDE_SPRINT_BOOT_BUDGET_BYTES = 180_000;

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

function javascriptSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) total += javascriptSize(full);
    else if (entry.endsWith(".js")) total += s.size;
  }
  return total;
}

function tideSprintBootSize() {
  const htmlPath = join(DIST_DIR, "tide-sprint", "index.html");
  const html = readFileSync(htmlPath, "utf8");
  const references = new Set();
  for (const match of html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/g)) {
    references.add(match[1]);
  }
  for (const match of html.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["']/g)) {
    references.add(match[1]);
  }

  let total = 0;
  const files = [];
  for (const reference of references) {
    const clean = reference.split(/[?#]/, 1)[0];
    const path = clean.startsWith("/")
      ? join(DIST_DIR, clean.slice(1))
      : resolve(dirname(htmlPath), clean);
    const size = statSync(path).size;
    total += size;
    files.push({ reference, size });
  }
  return { total, files };
}

try {
  const size = totalSize(DIST_DIR);
  const jsSize = javascriptSize(DIST_DIR);
  const sizeMB = (size / 1024 / 1024).toFixed(2);
  const budgetMB = (BUDGET_BYTES / 1024 / 1024).toFixed(2);
  const jsSizeMB = (jsSize / 1024 / 1024).toFixed(2);
  const jsBudgetMB = (JAVASCRIPT_BUDGET_BYTES / 1024 / 1024).toFixed(2);
  const tideSprintBoot = tideSprintBootSize();

  if (tideSprintBoot.total > TIDE_SPRINT_BOOT_BUDGET_BYTES) {
    throw new Error(
      `Tide Sprint eagerly requests ${tideSprintBoot.total} bytes of JavaScript; ` +
      `budget ${TIDE_SPRINT_BOOT_BUDGET_BYTES}. Files: ${JSON.stringify(tideSprintBoot.files)}`
    );
  }

  if (jsSize > JAVASCRIPT_BUDGET_BYTES) {
    console.error(`JavaScript ${jsSizeMB}MB exceeds budget ${jsBudgetMB}MB.`);
    process.exit(1);
  }

  if (size > BUDGET_BYTES) {
    console.error(`Bundle size ${sizeMB}MB exceeds budget ${budgetMB}MB.`);
    process.exit(1);
  }
  console.log(
    `JavaScript ${jsSizeMB}MB within ${jsBudgetMB}MB; ` +
    `sealed payload ${sizeMB}MB within ${budgetMB}MB; ` +
    `Tide Sprint boot ${tideSprintBoot.total}B within ${TIDE_SPRINT_BOOT_BUDGET_BYTES}B.`
  );
} catch (err) {
  console.error(`Could not measure bundle size in "${DIST_DIR}":`, err.message);
  process.exit(1);
}
