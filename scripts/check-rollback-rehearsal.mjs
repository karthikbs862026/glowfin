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
if (
  baseline.version !== current.baselineVersion ||
  current.version !== baseline.version + 1 ||
  (baselineCommit === headCommit && !releaseConfigDirty)
) {
  throw new Error("Rollback rehearsal rejected a mismatched or self-referential baseline.");
}

console.log(
  `Rollback rehearsal passed: V${current.version} -> V${baseline.version} (${baselineCommit.slice(0, 7)}).`
);
