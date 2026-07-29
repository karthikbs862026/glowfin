/**
 * Verify debug tooling is stripped from the production bundle (Part 6.10).
 *
 * A shipped debug overlay is a real incident, so this is a build gate rather
 * than a code-review convention. Scans the built assets for markers that should
 * only ever exist behind `import.meta.env.DEV`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST_DIR = "dist";
const FORBIDDEN = ["glowfin-debug-overlay", "OVER frameTimeMs"];

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.(js|mjs|html|css)$/.test(entry)) out.push(full);
  }
  return out;
}

try {
  const problems = [];
  for (const file of collect(DIST_DIR)) {
    const text = readFileSync(file, "utf8");
    for (const marker of FORBIDDEN) {
      if (text.includes(marker)) problems.push(`${file}: contains "${marker}"`);
    }
  }

  if (problems.length > 0) {
    console.error("Debug tooling leaked into the production build:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("No debug tooling in production build.");
} catch (err) {
  console.error(`Could not scan "${DIST_DIR}":`, err.message);
  process.exit(1);
}
