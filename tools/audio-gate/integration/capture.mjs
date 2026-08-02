import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const baseUrl = option("url") ?? "http://127.0.0.1:4173/";
const output = resolve(option("output") ?? "build/audio-gate-browser.json");
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
    const button = document.querySelector("#hud-audio-toggle");
    return {
      state: button?.getAttribute("data-audio-state") ?? null,
      pressed: button?.getAttribute("aria-pressed") ?? null,
      label: button?.getAttribute("aria-label") ?? null,
      startupError: document.body.dataset.startupError === "true"
    };
  });

  await page.goto(baseUrl, { waitUntil: "load" });
  await page.locator("#glowfin-canvas").waitFor({ state: "visible" });
  await page.locator("#hud-audio-toggle").waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  const beforeGesture = await snapshot();
  if (beforeGesture.state !== "locked" || beforeGesture.pressed !== "true") {
    throw new Error(
      `Audio must remain enabled-but-locked before gesture; got ${JSON.stringify(beforeGesture)}`
    );
  }

  await page.locator("#glowfin-canvas").tap({ position: { x: 195, y: 640 } });
  await page.waitForFunction(
    () => document.querySelector("#hud-audio-toggle")?.getAttribute("data-audio-state") === "active",
    undefined,
    { timeout: 8_000 }
  );
  const afterGesture = await snapshot();

  await page.locator("#hud-audio-toggle").tap();
  await page.waitForFunction(
    () => document.querySelector("#hud-audio-toggle")?.getAttribute("data-audio-state") === "muted"
  );
  const afterMute = await snapshot();

  await page.reload({ waitUntil: "load" });
  await page.locator("#hud-audio-toggle").waitFor({ state: "visible" });
  const afterReload = await snapshot();
  if (afterReload.state !== "muted" || afterReload.pressed !== "false") {
    throw new Error(
      `Muted preference did not survive reload; got ${JSON.stringify(afterReload)}`
    );
  }

  await page.locator("#hud-audio-toggle").tap();
  await page.waitForFunction(
    () => document.querySelector("#hud-audio-toggle")?.getAttribute("data-audio-state") === "active",
    undefined,
    { timeout: 8_000 }
  );
  const afterUnmute = await snapshot();

  if (
    afterGesture.pressed !== "true" ||
    afterMute.pressed !== "false" ||
    afterUnmute.pressed !== "true" ||
    [beforeGesture, afterGesture, afterMute, afterReload, afterUnmute]
      .some((state) => state.startupError)
  ) {
    throw new Error("Audio accessibility state or startup-failure contract was violated.");
  }
  if (errors.length > 0) {
    throw new Error(`Browser audio smoke reported failures: ${errors.join("; ")}`);
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({
    source: "ci-chromium-real-gesture",
    beforeGesture,
    afterGesture,
    afterMute,
    afterReload,
    afterUnmute,
    errors
  }, null, 2)}\n`, "utf8");
  console.log(`wrote ${output}`);
} finally {
  await browser.close();
}
