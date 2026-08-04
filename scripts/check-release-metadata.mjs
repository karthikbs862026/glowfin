import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const config = JSON.parse(await readFile(new URL("config/release.json", root), "utf8"));
const release = JSON.parse(await readFile(new URL("dist/release.json", root), "utf8"));
const index = await readFile(new URL("dist/index.html", root), "utf8");

const expectedEnvironment =
  process.env.GLOWFIN_EXPECTED_ENVIRONMENT ??
  process.env.GLOWFIN_ENVIRONMENT ??
  "staging";
const expectedCommit =
  process.env.GLOWFIN_EXPECTED_COMMIT ??
  process.env.GLOWFIN_COMMIT_SHA ??
  "local";

for (const key of [
  "schemaVersion",
  "version",
  "phase",
  "certification",
  "baselineVersion",
  "baselineCommit",
  "artBuild"
]) {
  if (release[key] !== config[key]) {
    throw new Error(
      `dist/release.json ${key}=${JSON.stringify(release[key])}; expected ${JSON.stringify(config[key])}.`
    );
  }
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
  `Release metadata valid: V${release.version} ${release.environment} ${release.sourceCommit}.`
);
