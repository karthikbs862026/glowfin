import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const baseUrl = option("url") ?? "http://127.0.0.1:4173/";
const output = resolve(option("output") ?? "build/tide-sprint-browser.json");
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
const extraChromiumArgs = process.env["PLAYWRIGHT_CHROMIUM_ARGS_JSON"]
  ? JSON.parse(process.env["PLAYWRIGHT_CHROMIUM_ARGS_JSON"])
  : [];
if (!Array.isArray(extraChromiumArgs)) {
  throw new Error("PLAYWRIGHT_CHROMIUM_ARGS_JSON must contain a JSON array.");
}

const devices = [
  {
    name: "iphone-portrait-contract",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  },
  {
    name: "android-portrait-contract",
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
  },
];

const browser = await chromium.launch({
  headless: true,
  args: extraChromiumArgs,
  ...(executablePath ? { executablePath } : {}),
});

const evidence = [];
mkdirSync(dirname(output), { recursive: true });
try {
  for (const device of devices) {
    const context = await browser.newContext({
      viewport: device.viewport,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      localStorage.setItem("glowfin.tide-sprint.controls.r8", "complete");
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !/context lost|context restored/i.test(message.text())
      ) errors.push(`console error: ${message.text()}`);
    });

    const target = new URL("tide-sprint/", baseUrl);
    const navigationStartedAt = Date.now();
    await page.goto(target.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (
      document.documentElement.dataset.raceLobby === "ready"
    ), undefined, { timeout: 4_000 });
    const navigationToLobbyMs = Date.now() - navigationStartedAt;
    await page.waitForSelector('#race-lobby[data-active="true"]');
    const lobby = await page.evaluate(() => {
      const card = document.querySelector(".lobby-card")?.getBoundingClientRect();
      const start = document.querySelector("#race-start")?.getBoundingClientRect();
      const runtime = window.__GLOWFIN_TIDE_SPRINT_RUNTIME__?.snapshot();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        scrollWidth: document.documentElement.scrollWidth,
        card: card ? { left: card.left, right: card.right, width: card.width } : null,
        startHeight: start?.height ?? 0,
        planHash: document.documentElement.dataset.racePlan ?? null,
        owner: document.documentElement.dataset.raceStartupOwner ?? null,
        portraitCount: document.querySelectorAll(".crew-mark svg").length,
        portraitDetailCount: document.querySelectorAll(".crew-mark svg path, .crew-mark svg ellipse, .crew-mark svg circle").length,
        visibleCopy: document.querySelector(".lobby-card")?.innerText ?? "",
        backHref: document.querySelector(".back-link")?.href ?? null,
        runtime,
      };
    });
    if (
      !lobby.card ||
      lobby.scrollWidth > lobby.viewport.width ||
      lobby.card.left < 0 ||
      lobby.card.right > lobby.viewport.width + 0.5 ||
      lobby.startHeight < 44 ||
      !/^[0-9a-f]{8}$/.test(lobby.planHash ?? "") ||
      lobby.owner !== "integrated-tide-sprint" ||
      lobby.portraitCount !== 3 ||
      lobby.portraitDetailCount < 24 ||
      /\b(?:test|trial|practice|version|separate|stable)\b/i.test(lobby.visibleCopy) ||
      lobby.runtime?.timing?.lobbyReadyMs > 1_500 ||
      navigationToLobbyMs > 4_000
    ) {
      throw new Error(`${device.name} lobby contract failed: ${JSON.stringify({
        navigationToLobbyMs,
        lobby,
      })}`);
    }

    const lobbyScreenshot = resolve(
      dirname(output),
      `tide-sprint-lobby-${device.name}.png`,
    );
    await page.screenshot({ path: lobbyScreenshot, fullPage: true });
    await page.locator('[data-character="neri"]').click();
    await page.waitForFunction(() => (
      document.querySelector('[data-character="neri"]')?.getAttribute("data-selected") === "true" &&
      document.querySelector("#race-start")?.textContent?.includes("Race as Neri")
    ));
    await page.locator("#race-start").click();
    await page.waitForFunction(() => (
      document.querySelector("#race-canvas")?.getAttribute("data-active") === "true" &&
      document.documentElement.dataset.tideSprintRuntime === "running"
    ), undefined, { timeout: 12_000 });
    await page.waitForTimeout(4_200);

    const raceScreenshot = resolve(
      dirname(output),
      `tide-sprint-race-${device.name}.png`,
    );
    await page.screenshot({ path: raceScreenshot, fullPage: true });

    const before = await page.evaluate(() => (
      window.__GLOWFIN_TIDE_SPRINT_RUNTIME__?.snapshot()
    ));
    const canForceLoss = await page.evaluate(() => {
      const canvas = document.querySelector("#race-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      const extension = gl?.getExtension("WEBGL_lose_context");
      if (!extension) return false;
      extension.loseContext();
      window.setTimeout(() => extension.restoreContext(), 250);
      return true;
    });
    if (!canForceLoss) {
      throw new Error(`${device.name} did not expose WEBGL_lose_context.`);
    }
    await page.waitForFunction(() => (
      document.documentElement.dataset.tideSprintRuntime === "context-lost"
    ), undefined, { timeout: 4_000 });
    await page.waitForFunction(() => {
      const snapshot = window.__GLOWFIN_TIDE_SPRINT_RUNTIME__?.snapshot();
      return snapshot?.state === "running" && snapshot?.successfulRecoveries === 1;
    }, undefined, { timeout: 12_000 });
    const restored = await page.evaluate(() => (
      window.__GLOWFIN_TIDE_SPRINT_RUNTIME__?.snapshot()
    ));

    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    });
    await page.waitForFunction(() => (
      document.documentElement.dataset.tideSprintRuntime === "paused"
    ));
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await page.waitForFunction(() => (
      document.documentElement.dataset.tideSprintRuntime === "running"
    ));
    await page.waitForTimeout(500);
    const resumed = await page.evaluate(() => (
      window.__GLOWFIN_TIDE_SPRINT_RUNTIME__?.snapshot()
    ));

    const renderer = resumed?.renderer;
    if (
      before?.state !== "running" ||
      restored?.contextLosses !== 1 ||
      restored?.successfulRecoveries !== 1 ||
      resumed?.state !== "running" ||
      resumed?.lifecycleInterruptions < 2 ||
      !renderer ||
      renderer.drawCalls > 90 ||
      renderer.triangles > 150_000 ||
      renderer.materials >= 12 ||
      errors.length > 0
    ) {
      throw new Error(`${device.name} runtime contract failed: ${JSON.stringify({
        before,
        restored,
        resumed,
        errors,
      })}`);
    }
    evidence.push({
      device: device.name,
      emulated: true,
      engine: `Chromium ${browser.version()}`,
      navigationToLobbyMs,
      lobby,
      screenshots: { lobby: lobbyScreenshot, race: raceScreenshot },
      before,
      restored,
      resumed,
      errors,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(output, `${JSON.stringify({
  evidenceVersion: "2.0.0",
  source: "ci-emulated-mobile-browser",
  devices: evidence,
}, null, 2)}\n`, "utf8");
console.log(`wrote ${output}`);
