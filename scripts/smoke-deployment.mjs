import { readFile } from "node:fs/promises";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const baseValue = option("url");
if (!baseValue) {
  throw new Error("Usage: npm run smoke:deployment -- --url <staging-url> [--commit <sha>]");
}

const root = new URL("../", import.meta.url);
const config = JSON.parse(await readFile(new URL("config/release.json", root), "utf8"));
const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
const expectedCommit = option("commit");
const expectedEnvironment = option("environment") ?? "staging";
const requireHeaders = process.argv.includes("--require-headers");
const cacheBust = `glowfin-smoke=${Date.now()}`;

async function checkedFetch(path) {
  const target = new URL(path, base);
  target.searchParams.set("_", cacheBust);
  const response = await fetch(target, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    throw new Error(`${target.pathname} returned HTTP ${response.status}.`);
  }
  return response;
}

const documentResponse = await checkedFetch("");
const document = await documentResponse.text();
if (!document.includes('id="glowfin-canvas"')) {
  throw new Error("Deployed document omits #glowfin-canvas.");
}
if (!document.includes('id="hud-build"')) {
  throw new Error("Deployed document omits the visible release badge.");
}

const releaseResponse = await checkedFetch("release.json");
const release = await releaseResponse.json();
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
      `Deployed release ${key}=${JSON.stringify(release[key])}; expected ${JSON.stringify(config[key])}.`
    );
  }
}
if (release.environment !== expectedEnvironment) {
  throw new Error(
    `Deployed environment=${release.environment}; expected ${expectedEnvironment}.`
  );
}
if (expectedCommit && release.sourceCommit !== expectedCommit) {
  throw new Error(
    `Deployed source=${release.sourceCommit}; expected ${expectedCommit}.`
  );
}

if (requireHeaders) {
  const headerVersion = documentResponse.headers.get("x-glowfin-release-version");
  const headerSource = documentResponse.headers.get("x-glowfin-source-commit");
  if (headerVersion !== String(config.version)) {
    throw new Error(
      `x-glowfin-release-version=${headerVersion}; expected ${config.version}.`
    );
  }
  if (expectedCommit && headerSource !== expectedCommit) {
    throw new Error(
      `x-glowfin-source-commit=${headerSource}; expected ${expectedCommit}.`
    );
  }
  if (!/no-store/i.test(documentResponse.headers.get("cache-control") ?? "")) {
    throw new Error("Deployed game document is missing its no-store cache policy.");
  }
}

console.log(
  `Deployment smoke passed: V${release.version} ${release.environment} ${release.sourceCommit}.`
);
