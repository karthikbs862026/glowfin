import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildVerticalSliceEvidence } from "./verticalSliceEvidence.ts";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const output = resolve(option("output") ?? "build/art-gate-structural.json");
const revision = option("revision") ?? execFileSync(
  "git",
  ["rev-parse", "HEAD"],
  { encoding: "utf8" }
).trim();

mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `${JSON.stringify(buildVerticalSliceEvidence(revision), null, 2)}\n`,
  "utf8"
);
console.log(`wrote ${output}`);
