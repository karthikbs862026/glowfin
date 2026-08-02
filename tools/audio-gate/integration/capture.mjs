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
      native: button?.getAttribute("data-audio-native") ?? null,
      gesture: button?.getAttribute("data-audio-gesture") ?? null,
      context: button?.getAttribute("data-audio-context") ?? null,
      rms: button?.getAttribute("data-audio-rms") ?? null,
      nativeMedia: Array.from(document.querySelectorAll("audio")).map((audio) => ({
        label: audio.getAttribute("aria-label"),
        currentTime: audio.currentTime,
        paused: audio.paused,
        ended: audio.ended,
        readyState: audio.readyState,
        errorCode: audio.error?.code ?? null
      })),
      nativeMediaTime: Array.from(document.querySelectorAll("audio"))
        .map((audio) => audio.currentTime)
        .sort((a, b) => b - a)[0] ?? 0,
      pressed: button?.getAttribute("aria-pressed") ?? null,
      label: button?.getAttribute("aria-label") ?? null,
      startupError: document.body.dataset.startupError === "true"
    };
  });

  const readinessProofs = {};
  const waitForAudioReady = async (stage) => {
    try {
      const proof = await page.waitForFunction(
        () => {
          const button = document.querySelector("#hud-audio-toggle");
          const nativeMedia = document.querySelector("audio");
          const ready =
            button?.getAttribute("data-audio-state") === "active" &&
            button.getAttribute("data-audio-native") === "playing" &&
            button.getAttribute("data-audio-signal") === "generated" &&
            nativeMedia instanceof HTMLMediaElement &&
            !nativeMedia.paused &&
            nativeMedia.currentTime > 0;
          if (!ready) return null;
          return {
            nativeMediaTime: nativeMedia.currentTime,
            nativeReadyState: nativeMedia.readyState,
            nativePaused: nativeMedia.paused,
            signalRms: Number(button.getAttribute("data-audio-rms") ?? 0),
            gesture: button.getAttribute("data-audio-gesture")
          };
        },
        undefined,
        { timeout: 8_000 }
      );
      readinessProofs[stage] = await proof.jsonValue();
    } catch (error) {
      const state = await snapshot();
      throw new Error(
        `${stage} did not reach dual-path playback; state=${JSON.stringify(state)}; cause=${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  await page.goto(baseUrl, { waitUntil: "load" });
  await page.locator("#glowfin-canvas").waitFor({ state: "visible" });
  await page.locator("#hud-audio-toggle").waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  const beforeGesture = await snapshot();
  if (
    beforeGesture.state !== "locked" ||
    beforeGesture.signal !== "idle" ||
    beforeGesture.native !== "idle" ||
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
  await waitForAudioReady("sound-button activation");
  await page.waitForTimeout(280);
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
  await waitForAudioReady("unmute activation");
  await page.waitForTimeout(280);
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
  await waitForAudioReady("touch-canvas activation");
  await page.waitForTimeout(280);
  const afterCanvasGesture = await snapshot();

  // A common phone flow is canvas first, sound button second. The first
  // explicit sound-button tap must confirm/replay sound, not mute the audio that
  // the canvas gesture just started.
  await page.locator("#hud-audio-toggle").tap();
  await waitForAudioReady("canvas-then-button confirmation");
  const afterCanvasThenButton = await snapshot();
  await page.locator("#hud-audio-toggle").tap();
  await page.waitForFunction(
    () => document.querySelector("#hud-audio-toggle")?.getAttribute("data-audio-state") === "muted",
    undefined,
    { timeout: 8_000 }
  );

  if (
    afterButtonActivation.pressed !== "true" ||
    afterButtonActivation.label !== "Mute sound" ||
    afterMute.pressed !== "false" ||
    afterUnmute.pressed !== "true" ||
    beforeCanvasGesture.state !== "locked" ||
    beforeCanvasGesture.pressed !== "false" ||
    afterCanvasGesture.pressed !== "true" ||
    afterCanvasThenButton.state !== "active" ||
    afterCanvasThenButton.pressed !== "true" ||
    [afterButtonActivation, afterUnmute, afterCanvasGesture, afterCanvasThenButton]
      .some((state) =>
        state.native !== "playing" ||
        state.signal !== "generated" ||
        Number(state.rms) <= 0
      ) ||
    Object.keys(readinessProofs).length !== 4 ||
    Object.values(readinessProofs).some((proof) =>
      !proof ||
      proof.nativeMediaTime <= 0 ||
      proof.nativePaused ||
      proof.signalRms <= 0
    ) ||
    [beforeGesture, afterButtonActivation, afterMute, afterReload, afterUnmute, beforeCanvasGesture, afterCanvasGesture, afterCanvasThenButton]
      .some((state) => state.startupError)
  ) {
    throw new Error(
      `Audio signal, accessibility state, or startup-failure contract was violated: ${JSON.stringify({
        beforeGesture,
        afterButtonActivation,
        afterMute,
        afterReload,
        afterUnmute,
        beforeCanvasGesture,
        afterCanvasGesture,
        afterCanvasThenButton,
        readinessProofs
      })}`
    );
  }
  if (errors.length > 0) {
    throw new Error(`Browser audio smoke reported failures: ${errors.join("; ")}`);
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({
    source: "ci-chromium-native-media-plus-web-audio-signal",
    beforeGesture,
    afterButtonActivation,
    afterMute,
    afterReload,
    afterUnmute,
    beforeCanvasGesture,
    afterCanvasGesture,
    afterCanvasThenButton,
    readinessProofs,
    errors
  }, null, 2)}\n`, "utf8");
  console.log(`wrote ${output}`);
} finally {
  await browser.close();
}
