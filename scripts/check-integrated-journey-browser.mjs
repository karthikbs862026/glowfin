import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const baseUrl = option("url") ?? "http://127.0.0.1:4173/";
const output = resolve(option("output") ?? "build/integrated-journey-browser.json");
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
  ...(executablePath ? { executablePath } : {}),
});
mkdirSync(dirname(output), { recursive: true });

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console error: ${message.text()}`);
});

async function openHub() {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (
    document.querySelector("#startup-progress")?.getAttribute("data-ready") === "true" &&
    document.querySelector("#moonwell-hub")?.getAttribute("data-active") === "true"
  ), undefined, { timeout: 15_000 });
}

async function grantChapterOne() {
  await page.evaluate(async () => {
    const [{ ProgressRepository }, { ExpeditionProgressRepository }] = await Promise.all([
      import("/src/persistence/progress.ts"),
      import("/src/expedition/progress.ts"),
    ]);
    const progress = new ProgressRepository(localStorage);
    progress.load();
    progress.grantKelpCathedralStoryAccess();
    const expedition = new ExpeditionProgressRepository(localStorage);
    expedition.load();
    expedition.recordCompletion({
      claimId: "qa-chapter-one",
      planHash: "47a11e55",
      primaryObjective: true,
      relicFound: true,
      bestLumenChain: 6,
      miriRescued: true,
      neriFinishGap: 1,
      currentBreaks: 3,
      cleanChase: true,
      moonWellRestored: true,
    });
  });
}

async function recordKelp() {
  await page.evaluate(async () => {
    const { ProgressRepository } = await import("/src/persistence/progress.ts");
    const progress = new ProgressRepository(localStorage);
    progress.load();
    progress.recordKelpCathedralRun({
      runId: "qa-kelp",
      elapsedSec: 90,
      rescuedManta: true,
      relicPageFound: true,
      masteredVerbs: [],
    });
  });
}

async function recordCrystal() {
  await page.evaluate(async () => {
    const { ProgressRepository } = await import("/src/persistence/progress.ts");
    const progress = new ProgressRepository(localStorage);
    progress.load();
    progress.recordCrystalTrenchRun({
      runId: "qa-crystal",
      elapsedSec: 100,
      completed: true,
      cleanPerformance: true,
      masteredVerbs: [],
    });
  });
}

async function recordLeviathan() {
  await page.evaluate(async () => {
    const { ProgressRepository } = await import("/src/persistence/progress.ts");
    const progress = new ProgressRepository(localStorage);
    progress.load();
    progress.recordLeviathanGraveyardRun({
      runId: "qa-leviathan",
      elapsedSec: 120,
      completed: true,
      cleanPerformance: true,
      masteredVerbs: [],
    });
  });
}

try {
  await openHub();
  const hubScreenshot = resolve(dirname(output), "integrated-journey-hub.png");
  await page.screenshot({ path: hubScreenshot, fullPage: true });

  const visibleCopy = await page.locator("#moonwell-hub").innerText();
  if (/\b(?:test|trial|practice|version|separate|stable)\b/i.test(visibleCopy)) {
    throw new Error(`Player-facing hub exposes development copy: ${visibleCopy}`);
  }

  for (const panel of ["wardrobe", "objectives", "leaderboard", "settings"]) {
    await page.locator(`[data-moonwell-panel="${panel}"]`).click();
    await page.waitForSelector(`#moonwell-panel-${panel}:not([hidden])`);
    await page.locator(`#moonwell-panel-${panel} [data-moonwell-back]`).click();
    await page.waitForSelector("#moonwell-home:not([hidden])");
  }

  await page.locator("#moonwell-tide-sprint").click();
  await page.waitForURL(/\/tide-sprint\/$/, { timeout: 5_000 });
  await page.waitForFunction(() => document.documentElement.dataset.raceLobby === "ready");
  await page.locator(".back-link").click();
  await page.waitForURL((url) => !url.pathname.endsWith("/tide-sprint/"));
  await page.waitForFunction(() => (
    document.querySelector("#startup-progress")?.getAttribute("data-ready") === "true"
  ), undefined, { timeout: 15_000 });

  await grantChapterOne();
  await openHub();
  if (await page.locator("#moonwell-kelp-cathedral").isDisabled()) {
    throw new Error("Kelp Cathedral remained locked after Moon Well restoration.");
  }
  await page.locator("#moonwell-kelp-cathedral").click();
  await page.waitForFunction(() => document.documentElement.dataset.glowfinRealm === "kelp-cathedral");

  await openHub();
  await recordKelp();
  await openHub();
  if (await page.locator("#moonwell-crystal-trench").isDisabled()) {
    throw new Error("Crystal Trench remained locked after Kelp Cathedral restoration.");
  }
  await page.locator("#moonwell-crystal-trench").click();
  await page.waitForFunction(() => document.documentElement.dataset.glowfinRealm === "crystal-trench");

  await openHub();
  await recordCrystal();
  await openHub();
  if (await page.locator("#moonwell-duskmaw").isDisabled()) {
    throw new Error("Leviathan Graveyard remained locked after Crystal Trench completion.");
  }
  await page.locator("#moonwell-duskmaw").click();
  await page.waitForFunction(() => document.documentElement.dataset.glowfinRealm === "leviathan-graveyard");

  await openHub();
  await recordLeviathan();
  await openHub();
  await page.locator('[data-moonwell-panel="vault"]').click();
  await page.waitForSelector("#moonwell-panel-vault:not([hidden])");
  if (await page.locator("#eclipse-court-start").isDisabled()) {
    throw new Error("Eclipse Court remained locked after the full Living Atlas journey.");
  }
  const realmsScreenshot = resolve(dirname(output), "integrated-journey-realms.png");
  await page.screenshot({ path: realmsScreenshot, fullPage: true });

  if (errors.length > 0) throw new Error(errors.join("\n"));
  writeFileSync(output, `${JSON.stringify({
    evidenceVersion: "1.0.0",
    source: "ci-emulated-mobile-browser",
    viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
    navigation: {
      moonWellPanels: ["wardrobe", "objectives", "leaderboard", "settings"],
      tideSprintRoundTrip: true,
      realmsEntered: ["kelp-cathedral", "crystal-trench", "leviathan-graveyard"],
      eclipseCourtUnlocked: true,
    },
    screenshots: { hub: hubScreenshot, realms: realmsScreenshot },
    errors,
  }, null, 2)}\n`, "utf8");
  console.log(`wrote ${output}`);
} finally {
  await context.close();
  await browser.close();
}
