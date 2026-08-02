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
      signal: button?.getAttribute("data-audio-signal") ?? null,
      rms: button?.getAttribute("data-audio-rms") ?? null,
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
  if (
    beforeGesture.state !== "locked" ||
    beforeGesture.signal !== "idle" ||
    beforeGesture.pressed !== "false" ||
    beforeGesture.label !== "Turn sound on"
  ) {
    throw new Error(
      `Audio must remain explicitly inactive before gesture; got ${JSON.stringify(beforeGesture)}`
    );
  }

  // Regression for the real-device failure: pressing the visible sound button
  // while locked must activate audio, not race the capture-phase unlock and
  // immediately mute it again.
  await page.locator("#hud-audio-toggle").tap();
  await page.waitForFunction(
    () => document.querySelector("#hud-audio-toggle")?.getAttribute("data-audio-state") === "active",
    undefined,
    { timeout: 8_000 }
  );
  await page.waitForFunction(
    () => document.querySelector("#hud-audio-toggle")?.getAttribute("data-audio-signal") === "audible",
    undefined,
    { timeout: 8_000 }
  );
  const afterButtonActivation = await snapshot();

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
  await page.waitForFunction(
    () => document.querySelector("#hud-audio-toggle")?.getAttribute("data-audio-signal") === "audible",
    undefined,
    { timeout: 8_000 }
  );
  const afterUnmute = await snapshot();

  // Also retain the original game-surface gesture path. Start from a clean,
  // unlocked preference so a canvas touch must create/resume sources and emit
  // measurable signal without delaying the steering listener.
  await page.locator("#hud-audio-toggle").tap();
  await page.evaluate(() => localStorage.removeItem("glowfin-audio-muted-v1"));
  await page.reload({ waitUntil: "load" });
  await page.locator("#glowfin-canvas").waitFor({ state: "visible" });
  const beforeCanvasGesture = await snapshot();
  await page.locator("#glowfin-canvas").tap({ position: { x: 195, y: 640 } });
  await page.waitForFunction(
    () => document.querySelector("#hud-audio-toggle")?.getAttribute("data-audio-state") === "active",
    undefined,
    { timeout: 8_000 }
  );
  await page.waitForFunction(
    () => document.querySelector("#hud-audio-toggle")?.getAttribute("data-audio-signal") === "audible",
    undefined,
    { timeout: 8_000 }
  );
  const afterCanvasGesture = await snapshot();

  if (
    afterButtonActivation.pressed !== "true" ||
    afterButtonActivation.label !== "Mute sound" ||
    afterMute.pressed !== "false" ||
    afterUnmute.pressed !== "true" ||
    beforeCanvasGesture.state !== "locked" ||
    beforeCanvasGesture.pressed !== "false" ||
    afterCanvasGesture.pressed !== "true" ||
    [afterButtonActivation, afterUnmute, afterCanvasGesture]
      .some((state) => state.signal !== "audible" || Number(state.rms) <= 0) ||
    [beforeGesture, afterButtonActivation, afterMute, afterReload, afterUnmute, beforeCanvasGesture, afterCanvasGesture]
      .some((state) => state.startupError)
  ) {
    throw new Error("Audio signal, accessibility state, or startup-failure contract was violated.");
  }
  if (errors.length > 0) {
    throw new Error(`Browser audio smoke reported failures: ${errors.join("; ")}`);
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({
    source: "ci-chromium-real-gesture-and-signal",
    beforeGesture,
    afterButtonActivation,
    afterMute,
    afterReload,
    afterUnmute,
    beforeCanvasGesture,
    afterCanvasGesture,
    errors
  }, null, 2)}\n`, "utf8");
  console.log(`wrote ${output}`);
} finally {
  await browser.close();
}
