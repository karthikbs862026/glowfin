/**
 * Zero-dependency Phase 3A gate entry point.
 *
 * node --experimental-strip-types src/cli.ts
 *   --config config/art-budgets.json
 *   --input build/art-gate-input.json
 *   --tier structural|fast|full|signoff
 */

import { readFileSync } from "node:fs";
import { formatReport, runGate } from "./gate.ts";
import type { GateConfig } from "./types.ts";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    console.error(`Cannot read ${label} at ${path}: ${(error as Error).message}`);
    process.exitCode = 2;
    return null;
  }
}

const configPath = option("config") ?? "config/art-budgets.json";
const inputPath = option("input");
const tier = option("tier") ?? "structural";

if (!inputPath) {
  console.error("Missing --input <gate-input.json>");
  process.exit(2);
}

const rawConfig = readJson(configPath, "config");
const rawInput = readJson(inputPath, "input");
if (process.exitCode === 2) process.exit(2);

const result = runGate(rawInput, rawConfig, tier);
if (flag("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatReport(result, rawConfig as GateConfig));
}
process.exit(result.passed ? 0 : 1);
