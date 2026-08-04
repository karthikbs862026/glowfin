import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const baseUrl = option("url") ?? "http://127.0.0.1:4173/";
const output = resolve(option("output") ?? "build/runtime-recovery-browser.json");
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
  const errors = [];
  page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console error: ${message.text()}`);
  });

  const snapshot = () => page.evaluate(() => {
    const canvas = document.querySelector("#glowfin-canvas");
    const runtime = window.__GLOWFIN_RUNTIME__;
    return {
      state: document.documentElement.dataset.glowfinRuntime ?? null,
      blockers: runtime?.blockers ?? [],
      contextLosses: runtime?.contextLosses ?? -1,
      successfulRecoveries: runtime?.successfulRecoveries ?? -1,
      interruptions: runtime?.interruptions ?? -1,
      rendererGeneration: Number(canvas?.getAttribute("data-renderer-generation") ?? 0),
      runtimeOverlayActive: document.querySelector("#runtime-status")?.getAttribute("data-active"),
      reducedMotion: document.documentElement.dataset.glowfinReducedMotion ?? null,
      highContrast: document.documentElement.dataset.glowfinHighContrast ?? null,
      startupError: document.body.dataset.startupError === "true"
    };
  });

  await page.goto(baseUrl, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.documentElement.dataset.glowfinRuntime === "running" &&
      document.querySelector("#glowfin-canvas")?.getAttribute("data-renderer-generation") === "1",
    undefined,
    { timeout: 12_000 }
  );
  const before = await snapshot();

  await page.evaluate(() => {
    localStorage.setItem("glowfin.access.v2", JSON.stringify({
      schemaVersion: 2,
      motorAssist: "standard",
      reducedMotion: true,
      highContrast: true
    }));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(
    () => document.documentElement.dataset.glowfinRuntime === "running" &&
      document.documentElement.dataset.glowfinReducedMotion === "true" &&
      document.documentElement.dataset.glowfinHighContrast === "true",
    undefined,
    { timeout: 12_000 }
  );
  const accessible = await snapshot();

  const canForceLoss = await page.evaluate(() => {
    const canvas = document.querySelector("#glowfin-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const gl = canvas.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    window.setTimeout(() => extension.restoreContext(), 300);
    return true;
  });
  if (!canForceLoss) {
    throw new Error("Chromium did not expose WEBGL_lose_context for the runtime recovery gate.");
  }

  await page.waitForFunction(
    () => document.documentElement.dataset.glowfinRuntime === "context-lost",
    undefined,
    { timeout: 4_000 }
  );
  const contextLost = await snapshot();
  await page.waitForFunction(
    () => document.documentElement.dataset.glowfinRuntime === "running" &&
      document.querySelector("#glowfin-canvas")?.getAttribute("data-renderer-generation") === "2" &&
      window.__GLOWFIN_RUNTIME__?.successfulRecoveries === 1,
    undefined,
    { timeout: 15_000 }
  );
  const contextRestored = await snapshot();

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.glowfinRuntime === "interrupted"
  );
  const pageCached = await snapshot();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.glowfinRuntime === "running"
  );
  const resumed = await snapshot();

  if (
    before.state !== "running" ||
    before.rendererGeneration !== 1 ||
    before.startupError ||
    accessible.reducedMotion !== "true" ||
    accessible.highContrast !== "true" ||
    contextLost.state !== "context-lost" ||
    contextLost.runtimeOverlayActive !== "true" ||
    contextRestored.state !== "running" ||
    contextRestored.rendererGeneration !== 2 ||
    contextRestored.contextLosses !== 1 ||
    contextRestored.successfulRecoveries !== 1 ||
    contextRestored.runtimeOverlayActive !== "false" ||
    pageCached.state !== "interrupted" ||
    pageCached.interruptions < 1 ||
    resumed.state !== "running" ||
    resumed.rendererGeneration !== 2 ||
    resumed.startupError ||
    errors.length > 0
  ) {
    throw new Error(`Runtime recovery contract failed: ${JSON.stringify({
      before,
      accessible,
      contextLost,
      contextRestored,
      pageCached,
      resumed,
      errors
    })}`);
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({
    source: "ci-chromium-forced-context-loss-and-page-cache",
    before,
    accessible,
    contextLost,
    contextRestored,
    pageCached,
    resumed,
    errors
  }, null, 2)}\n`, "utf8");
  console.log(`wrote ${output}`);
} finally {
  await browser.close();
}
