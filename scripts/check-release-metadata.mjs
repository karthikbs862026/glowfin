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
  throw new Error("Production HTML omits the visible Version 31 release badge.");
}
if (!index.includes("Glowfin — Version 31")) {
  throw new Error("Production HTML title does not identify Version 31.");
}

console.log(
  `Release metadata valid: V${release.version} ${release.environment} ${release.sourceCommit}.`
);
