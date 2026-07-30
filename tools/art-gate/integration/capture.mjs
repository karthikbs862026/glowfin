import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { buildProceduralEvidence } from "./proceduralEvidence.ts";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const tier = option("tier") ?? "fast";
if (tier !== "fast" && tier !== "full") {
  throw new Error(`Unsupported browser capture tier "${tier}".`);
}
const device = option("device") ?? "ci-chromium";
const baseUrl = option("url") ?? "http://127.0.0.1:4173/";
const output = resolve(option("output") ?? `build/art-gate-${tier}.json`);
const screenshot = resolve(
  option("screenshot") ?? `build/art-gate-${tier}.png`
);
const revision = option("revision") ?? execFileSync(
  "git",
  ["rev-parse", "HEAD"],
  { encoding: "utf8" }
).trim();

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const target = new URL("art-gate.html", baseUrl);
  target.searchParams.set("tier", tier);
  target.searchParams.set("device", device);
  await page.goto(target.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.body.dataset.artGateReady === "true",
    undefined,
    { timeout: 60_000 }
  );
  const bundle = await page.evaluate(() => window.__GLOWFIN_ART_GATE__);
  if (!bundle || !Array.isArray(bundle.captures)) {
    throw new Error("Browser did not expose structured art-gate evidence.");
  }

  mkdirSync(dirname(output), { recursive: true });
  const evidence = buildProceduralEvidence(revision, bundle.captures);
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(`wrote ${output}`);
  console.log(`wrote ${screenshot}`);
} finally {
  await browser.close();
}
