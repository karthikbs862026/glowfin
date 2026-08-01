import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { buildVerticalSliceEvidence } from "./verticalSliceEvidence.ts";

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
const castReviewScreenshot = screenshot.replace(
  /\.png$/i,
  "-merfolk-cast.png"
);
const beautyReviewOutput = output.replace(/\.json$/i, "-beauty-review.json");
// The fast tier renders four states, while the full tier renders the complete
// 36-state matrix before it marks the page ready. Keep the quick failure bound
// for PR smoke captures without applying it to the substantially larger run.
const readyTimeoutMs = tier === "full" ? 180_000 : 60_000;
const revision = option("revision") ?? execFileSync(
  "git",
  ["rev-parse", "HEAD"],
  { encoding: "utf8" }
).trim();
const gateConfig = JSON.parse(readFileSync(
  resolve("tools/art-gate/config/art-budgets.json"),
  "utf8"
));
const beautyThresholds = gateConfig.beauty;

const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
const extraChromiumArgs = process.env["PLAYWRIGHT_CHROMIUM_ARGS_JSON"]
  ? JSON.parse(process.env["PLAYWRIGHT_CHROMIUM_ARGS_JSON"])
  : [];
if (!Array.isArray(extraChromiumArgs)) {
  throw new Error("PLAYWRIGHT_CHROMIUM_ARGS_JSON must contain a JSON array.");
}
const browser = await chromium.launch({
  headless: true,
  args: extraChromiumArgs,
  ...(executablePath ? { executablePath } : {})
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const renderErrors = [];
  page.on("pageerror", (error) => {
    renderErrors.push(`page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /(?:webgl|shader|gl_invalid|program)/i.test(message.text())
    ) {
      renderErrors.push(`console error: ${message.text()}`);
    }
  });
  const target = new URL("art-gate.html", baseUrl);
  target.searchParams.set("tier", tier);
  target.searchParams.set("device", device);
  await page.goto(target.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.body.dataset.artGateReady === "true",
    undefined,
    { timeout: readyTimeoutMs }
  );
  const bundle = await page.evaluate(() => window.__GLOWFIN_ART_GATE__);
  if (renderErrors.length > 0) {
    throw new Error(
      `Browser render reported shader/WebGL failures: ${renderErrors.join("; ")}`
    );
  }
  if (!bundle || !Array.isArray(bundle.captures)) {
    throw new Error("Browser did not expose structured art-gate evidence.");
  }

  mkdirSync(dirname(output), { recursive: true });
  const evidence = buildVerticalSliceEvidence(revision, bundle.captures);
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  writeFileSync(
    beautyReviewOutput,
    `${JSON.stringify(bundle.beautyReview, null, 2)}\n`,
    "utf8"
  );
  const castReviewDataUrl = bundle.castReviewAtlasDataUrl;
  if (
    typeof castReviewDataUrl !== "string" ||
    !castReviewDataUrl.startsWith("data:image/png;base64,")
  ) {
    throw new Error("Browser did not expose the three-role merfolk cast atlas.");
  }
  writeFileSync(
    castReviewScreenshot,
    Buffer.from(castReviewDataUrl.split(",", 2)[1], "base64")
  );
  // Capture the fixed gameplay canvas directly. `fullPage` can temporarily
  // resize a mobile viewport while calculating document bounds, producing a
  // misleading portrait where Glowfin appears to jump toward the lower crop.
  await page.locator("#glowfin-canvas").screenshot({ path: screenshot });
  console.log(`wrote ${output}`);
  console.log(`wrote ${beautyReviewOutput}`);
  console.log(`wrote ${screenshot}`);
  console.log(`wrote ${castReviewScreenshot}`);

  const review = bundle.beautyReview;
  const failures = [];
  if (!review || typeof review !== "object") {
    failures.push("beauty review metrics are missing");
  } else {
    if (review.meanLuminance < beautyThresholds.meanLuminanceMin) {
      failures.push(
        `mean luminance ${review.meanLuminance.toFixed(4)} < ` +
        beautyThresholds.meanLuminanceMin
      );
    }
    if (review.nearBlackFraction > beautyThresholds.nearBlackFractionMax) {
      failures.push(
        `near-black coverage ${(review.nearBlackFraction * 100).toFixed(1)}% > ` +
        `${(beautyThresholds.nearBlackFractionMax * 100).toFixed(0)}%`
      );
    }
    if (review.colourfulFraction < beautyThresholds.colourfulFractionMin) {
      failures.push(
        `colourful coverage ${(review.colourfulFraction * 100).toFixed(1)}% < ` +
        `${(beautyThresholds.colourfulFractionMin * 100).toFixed(0)}%`
      );
    }
    if (
      review.clippedHighlightFraction >
      beautyThresholds.clippedHighlightFractionMax
    ) {
      failures.push(
        `clipped highlights ${(review.clippedHighlightFraction * 100).toFixed(1)}% > ` +
        `${(beautyThresholds.clippedHighlightFractionMax * 100).toFixed(0)}%`
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Art-Bible beauty composition failed: ${failures.join("; ")}`
    );
  }
} finally {
  await browser.close();
}
