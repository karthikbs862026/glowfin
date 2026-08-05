import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const baseUrl = option("url") ?? "http://127.0.0.1:4173/";
const output = resolve(option("output") ?? "build/version41-browser.json");
const screenshotDir = resolve(option("screenshots") ?? "build/version41-browser");
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
const extraChromiumArgs = process.env["PLAYWRIGHT_CHROMIUM_ARGS_JSON"]
  ? JSON.parse(process.env["PLAYWRIGHT_CHROMIUM_ARGS_JSON"])
  : [];
if (!Array.isArray(extraChromiumArgs)) {
  throw new Error("PLAYWRIGHT_CHROMIUM_ARGS_JSON must contain a JSON array.");
}

mkdirSync(dirname(output), { recursive: true });
mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: extraChromiumArgs,
  ...(executablePath ? { executablePath } : {})
});

const expectedSegments = [
  "follow-light",
  "relic-fork",
  "rescue-miri",
  "race-neri",
  "duskmaw-chase",
  "return-moonwell"
];

async function waitForReadyHub(page) {
  await page.locator("#glowfin-canvas").waitFor({ state: "visible" });
  await page.locator("#v41-entry").waitFor({ state: "visible", timeout: 12_000 });
  await page.waitForFunction(() => (
    document.documentElement.dataset.glowfinRuntime === "running" &&
    document.querySelector("#moonwell-hub")?.getAttribute("data-active") === "true"
  ), undefined, { timeout: 12_000 });
}

async function startFromExpeditionCard(page) {
  await waitForReadyHub(page);
  await page.locator("#v41-entry").click();
  await page.waitForFunction(
    () => document.querySelector("#v41-hud")?.getAttribute("data-active") === "true",
    undefined,
    { timeout: 5_000 }
  );
}

function installPreferences(context) {
  return context.addInitScript(() => {
    localStorage.setItem("glowfin.guided-tutorial.version", "39");
    localStorage.setItem("glowfin.access.v2", JSON.stringify({
      schemaVersion: 2,
      motorAssist: "standard",
      reducedMotion: false,
      highContrast: false
    }));
  });
}

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await installPreferences(context);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console error: ${message.text()}`);
  });

  const expeditionUrl = new URL(baseUrl);
  expeditionUrl.searchParams.set("v41qa", "1");
  await page.goto(expeditionUrl.toString(), { waitUntil: "load" });
  await startFromExpeditionCard(page);

  const snapshots = [];
  for (const segment of expectedSegments) {
    await page.waitForFunction(
      (expected) => (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
        .split("|")
        .includes(expected),
      segment,
      { timeout: 8_000 }
    );
    const snapshot = await page.evaluate(() => {
      const hud = document.querySelector("#v41-hud");
      const title = document.querySelector("#v41-segment-title");
      const objective = document.querySelector("#v41-objective");
      const titleStyle = title ? getComputedStyle(title) : null;
      const objectiveStyle = objective ? getComputedStyle(objective) : null;
      return {
        segment: hud?.getAttribute("data-segment") ?? null,
        segmentHistory: hud?.getAttribute("data-segment-history") ?? "",
        state: hud?.getAttribute("data-state") ?? null,
        title: title?.textContent ?? null,
        objective: objective?.textContent ?? null,
        titleFontPx: Number.parseFloat(titleStyle?.fontSize ?? "0"),
        objectiveFontPx: Number.parseFloat(objectiveStyle?.fontSize ?? "0"),
        planHash: hud?.getAttribute("data-plan-hash") ?? null,
        additionalDrawCalls: Number(hud?.getAttribute("data-additional-draw-calls") ?? "999"),
        additionalTriangles: Number(hud?.getAttribute("data-additional-triangles") ?? "999999"),
        additionalMaterials: Number(hud?.getAttribute("data-additional-materials") ?? "999"),
        runtime: document.documentElement.dataset.glowfinRuntime ?? null,
        startupError: document.body.dataset.startupError === "true",
        canvasVisible: getComputedStyle(document.querySelector("#glowfin-canvas")).display !== "none"
      };
    });
    snapshots.push(snapshot);
    await page.screenshot({
      path: resolve(screenshotDir, `${String(snapshots.length).padStart(2, "0")}-${segment}.png`),
      fullPage: true
    });
  }

  await page.waitForFunction(
    () => document.querySelector("#v41-complete")?.getAttribute("data-active") === "true",
    undefined,
    { timeout: 12_000 }
  );
  const completion = await page.evaluate(() => ({
    active: document.querySelector("#v41-complete")?.getAttribute("data-active") === "true",
    heading: document.querySelector("#v41-complete h2")?.textContent ?? null,
    resultCards: document.querySelectorAll("#v41-result-grid > div").length,
    restored: document.querySelector("#moonwell-hub")?.getAttribute("data-v41-restored") === "true",
    storedPrimary: localStorage.getItem("glowfin.version41.v1.primary") !== null,
    startupError: document.body.dataset.startupError === "true",
    segmentHistory: document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? ""
  }));
  await page.screenshot({
    path: resolve(screenshotDir, "07-complete.png"),
    fullPage: true
  });

  const deepLinkPage = await context.newPage();
  const deepLinkUrl = new URL(baseUrl);
  deepLinkUrl.searchParams.set("expedition", "missing-moonseed");
  deepLinkUrl.searchParams.set("v41qa", "1");
  await deepLinkPage.goto(deepLinkUrl.toString(), { waitUntil: "load" });
  await deepLinkPage.waitForFunction(
    () => (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
      .split("|")
      .includes("follow-light"),
    undefined,
    { timeout: 15_000 }
  );
  const deepLinkStart = await deepLinkPage.evaluate(() => ({
    hudActive: document.querySelector("#v41-hud")?.getAttribute("data-active") === "true",
    mode: document.documentElement.dataset.glowfinMode ?? null,
    firstSegmentObserved: (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
      .split("|")
      .includes("follow-light"),
    startupError: document.body.dataset.startupError === "true"
  }));
  await deepLinkPage.close();

  const normalPage = await context.newPage();
  await normalPage.goto(baseUrl, { waitUntil: "load" });
  await normalPage.locator("#v41-entry").waitFor({ state: "visible" });
  const normalIsolation = await normalPage.evaluate(() => ({
    mode: document.documentElement.dataset.glowfinMode ?? null,
    hudActive: document.querySelector("#v41-hud")?.getAttribute("data-active") === "true",
    expeditionEntryVisible: getComputedStyle(document.querySelector("#v41-entry")).display !== "none",
    dailyStillPresent: document.querySelector("#hud-daily-trial") instanceof HTMLButtonElement,
    wardrobeStillPresent: document.querySelector("[data-moonwell-panel='wardrobe']") instanceof HTMLButtonElement,
    leaderboardStillPresent: document.querySelector("[data-moonwell-panel='leaderboard']") instanceof HTMLButtonElement,
    rewardedStillDisabled: document.querySelector("#hud-rewarded-pearls")?.hasAttribute("disabled") ?? false,
    startupError: document.body.dataset.startupError === "true"
  }));

  const accessContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce"
  });
  await accessContext.addInitScript(() => {
    localStorage.setItem("glowfin.guided-tutorial.version", "39");
    localStorage.setItem("glowfin.access.v2", JSON.stringify({
      schemaVersion: 2,
      motorAssist: "standard",
      reducedMotion: true,
      highContrast: true
    }));
  });
  const accessPage = await accessContext.newPage();
  const accessErrors = [];
  accessPage.on("pageerror", (error) => accessErrors.push(`page error: ${error.message}`));
  accessPage.on("console", (message) => {
    if (message.type() === "error") accessErrors.push(`console error: ${message.text()}`);
  });
  await accessPage.goto(expeditionUrl.toString(), { waitUntil: "load" });
  await startFromExpeditionCard(accessPage);
  await accessPage.waitForFunction(
    () => (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
      .split("|")
      .includes("duskmaw-chase"),
    undefined,
    { timeout: 25_000 }
  );
  const accessSnapshot = await accessPage.evaluate(() => ({
    reducedMotion: document.documentElement.dataset.glowfinReducedMotion === "true",
    highContrast: document.documentElement.dataset.glowfinHighContrast === "true",
    chaseObserved: (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
      .split("|")
      .includes("duskmaw-chase"),
    objectiveReadable: Number.parseFloat(getComputedStyle(document.querySelector("#v41-objective")).fontSize) >= 12,
    startupError: document.body.dataset.startupError === "true"
  }));
  await accessPage.screenshot({
    path: resolve(screenshotDir, "08-reduced-motion-high-contrast-chase.png"),
    fullPage: true
  });
  await accessContext.close();

  const issues = [];
  const observedHistory = completion.segmentHistory.split("|").filter(Boolean);
  if (observedHistory.join("|") !== expectedSegments.join("|")) {
    issues.push("encounter order was not deterministic");
  }
  if (snapshots.some((entry) => !entry.title || !entry.objective)) {
    issues.push("an encounter lacked explicit phone-readable purpose");
  }
  if (snapshots.some((entry) => entry.titleFontPx < 12 || entry.objectiveFontPx < 12)) {
    issues.push("an encounter instruction fell below the 12px phone floor");
  }
  if (snapshots.some((entry) => entry.planHash === null || !/^[0-9a-f]{8}$/.test(entry.planHash))) {
    issues.push("the deterministic plan hash was not exposed to the QA surface");
  }
  if (snapshots.some((entry) => entry.additionalDrawCalls > 10)) {
    issues.push("the additive draw-call budget was exceeded");
  }
  if (snapshots.some((entry) => entry.additionalTriangles > 8000)) {
    issues.push("the additive triangle budget was exceeded");
  }
  if (snapshots.some((entry) => entry.additionalMaterials > 2)) {
    issues.push("the additive material budget was exceeded");
  }
  if (snapshots.some((entry) => entry.runtime !== "running" || entry.startupError || !entry.canvasVisible)) {
    issues.push("the runtime or canvas failed during an encounter");
  }
  if (!completion.active || completion.heading !== "Moonseed restored" || completion.resultCards !== 6 || !completion.restored || !completion.storedPrimary || completion.startupError) {
    issues.push("the finite Expedition did not finish, persist and visibly restore the Moon Well");
  }
  if (!deepLinkStart.hudActive || deepLinkStart.mode !== "expedition-v41" || !deepLinkStart.firstSegmentObserved || deepLinkStart.startupError) {
    issues.push("the playable Expedition deep link did not enter the first encounter safely");
  }
  if (
    normalIsolation.mode !== null ||
    normalIsolation.hudActive ||
    !normalIsolation.expeditionEntryVisible ||
    !normalIsolation.dailyStillPresent ||
    !normalIsolation.wardrobeStillPresent ||
    !normalIsolation.leaderboardStillPresent ||
    !normalIsolation.rewardedStillDisabled ||
    normalIsolation.startupError
  ) {
    issues.push("Version 41 regressed or contaminated the Version 40 baseline surfaces");
  }
  if (
    !accessSnapshot.reducedMotion ||
    !accessSnapshot.highContrast ||
    !accessSnapshot.chaseObserved ||
    !accessSnapshot.objectiveReadable ||
    accessSnapshot.startupError
  ) {
    issues.push("reduced-motion/high-contrast chase presentation failed");
  }
  if (errors.length > 0) issues.push(...errors);
  if (accessErrors.length > 0) issues.push(...accessErrors);

  const report = {
    source: "ci-chromium-version41-living-current",
    expectedSegments,
    observedHistory,
    snapshots,
    completion,
    deepLinkStart,
    normalIsolation,
    accessSnapshot,
    errors,
    accessErrors,
    issues
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (issues.length > 0) {
    throw new Error(`Version 41 browser gate failed: ${issues.join("; ")}`);
  }
  console.log(`wrote ${output}`);
} finally {
  await browser.close();
}
