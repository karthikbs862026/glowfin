import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const current = JSON.parse(await readFile(new URL("config/release.json", root), "utf8"));
const baselineCommit = String(current.baselineCommit ?? "");
if (!/^[0-9a-f]{40}$/.test(baselineCommit)) {
  throw new Error("Rollback baseline must be a full immutable Git commit.");
}

execFileSync("git", ["merge-base", "--is-ancestor", baselineCommit, "HEAD"], {
  cwd: root,
  stdio: "ignore"
});
const sourceBaseCommit = String(current.sourceBaseCommit ?? "");
if (
  !Number.isInteger(current.sourceBaseVersion) ||
  current.sourceBaseVersion >= current.version ||
  !/^[0-9a-f]{40}$/.test(sourceBaseCommit)
) {
  throw new Error("Source base must name an earlier version and full immutable Git commit.");
}
execFileSync("git", ["merge-base", "--is-ancestor", sourceBaseCommit, "HEAD"], {
  cwd: root,
  stdio: "ignore"
});
const sourceBase = JSON.parse(execFileSync(
  "git",
  ["show", `${sourceBaseCommit}:config/release.json`],
  { cwd: root, encoding: "utf8" }
));
if (sourceBase.version !== current.sourceBaseVersion) {
  throw new Error("Source-base version does not match its immutable Git commit.");
}
const baselineText = execFileSync(
  "git",
  ["show", `${baselineCommit}:config/release.json`],
  { cwd: root, encoding: "utf8" }
);
const baseline = JSON.parse(baselineText);
const headCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8"
}).trim();
const releaseConfigDirty = execFileSync(
  "git",
  ["status", "--porcelain", "--", "config/release.json"],
  { cwd: root, encoding: "utf8" }
).trim().length > 0;

const deferredVersions = Array.isArray(current.deferredVersions)
  ? current.deferredVersions
  : [];
const expectedDeferredVersions = [];
for (let version = Number(baseline.version) + 1; version < Number(current.version); version++) {
  expectedDeferredVersions.push(version);
}
const validDeferredVersions =
  deferredVersions.every((version) => Number.isInteger(version)) &&
  new Set(deferredVersions).size === deferredVersions.length &&
  JSON.stringify([...deferredVersions].sort((a, b) => a - b)) ===
    JSON.stringify(expectedDeferredVersions);

if (
  baseline.version !== current.baselineVersion ||
  current.version <= baseline.version ||
  !validDeferredVersions ||
  (baselineCommit === headCommit && !releaseConfigDirty)
) {
  throw new Error("Rollback rehearsal rejected a mismatched, undeclared-gap, or self-referential baseline.");
}

const deferredSummary = deferredVersions.length > 0
  ? `; deferred V${deferredVersions.join(", V")}`
  : "";
console.log(
  `Rollback rehearsal passed: V${current.version} -> V${baseline.version} (${baselineCommit.slice(0, 7)})${deferredSummary}.`
);
