import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const config = JSON.parse(await readFile(new URL("config/release.json", root), "utf8"));
const release = JSON.parse(await readFile(new URL("dist/release.json", root), "utf8"));
const index = await readFile(new URL("dist/index.html", root), "utf8");

const expectedEnvironment =
  process.env.GLOWFIN_EXPECTED_ENVIRONMENT ??
  process.env.GLOWFIN_ENVIRONMENT ??
  (process.env.GLOWFIN_COMMIT_SHA ? "staging" : "local");
const expectedCommit =
  process.env.GLOWFIN_EXPECTED_COMMIT ??
  process.env.GLOWFIN_COMMIT_SHA ??
  "local";

for (const key of [
  "schemaVersion",
  "version",
  "phase",
  "releaseTag",
  "certification",
  "sourceBaseVersion",
  "sourceBaseCommit",
  "baselineVersion",
  "baselineCommit",
  "artBuild",
  "productionPolicyVersion"
]) {
  if (release[key] !== config[key]) {
    throw new Error(
      `dist/release.json ${key}=${JSON.stringify(release[key])}; expected ${JSON.stringify(config[key])}.`
    );
  }
}
if (
  release.sealSchemaVersion !== 1 ||
  !/^[0-9a-f]{64}$/.test(release.artifactDigest) ||
  !Number.isInteger(release.artifactFileCount) ||
  release.artifactFileCount < 1
) {
  throw new Error("dist/release.json is not sealed with a valid artifact digest.");
}

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await filesBelow(new URL(`${entry.name}/`, directory), `${path}/`));
    } else if (entry.isFile() && path !== "release.json") {
      files.push(path);
    }
  }
  return files;
}

const dist = new URL("dist/", root);
const files = await filesBelow(dist);
const hash = createHash("sha256");
for (const path of files) {
  hash.update(path, "utf8");
  hash.update("\0");
  hash.update(await readFile(new URL(path, dist)));
  hash.update("\0");
}
if (release.artifactFileCount !== files.length || release.artifactDigest !== hash.digest("hex")) {
  throw new Error("dist/release.json artifact seal does not match the built files.");
}

if (release.environment !== expectedEnvironment) {
  throw new Error(
    `dist/release.json environment=${release.environment}; expected ${expectedEnvironment}.`
  );
}
if (release.sourceCommit !== expectedCommit) {
  throw new Error(
    `dist/release.json sourceCommit=${release.sourceCommit}; expected ${expectedCommit}.`
  );
}
if (!index.includes('id="hud-build"')) {
  throw new Error(`Production HTML omits the visible Version ${release.version} release badge.`);
}
const shortCommit = expectedCommit === "local"
  ? "local"
  : expectedCommit.slice(0, 7);
const expectedLabel = `V${release.version} · ${expectedEnvironment.toUpperCase()} · ${shortCommit}`;
if (!index.includes(`id="hud-build" role="status">${expectedLabel}</div>`)) {
  throw new Error(
    `Production HTML initial release badge does not identify ${expectedLabel}.`
  );
}
if (!index.includes(`Glowfin — Version ${release.version}`)) {
  throw new Error(`Production HTML title does not identify Version ${release.version}.`);
}

console.log(
  `Release metadata valid: V${release.version} ${release.environment} ${release.sourceCommit} ${release.artifactDigest.slice(0, 12)}.`
);
