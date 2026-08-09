import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const totalFrames = 5_400;
const warmupFrames = 180;
const batchFrames = 90;
const baseUrl = option("url") ?? "http://127.0.0.1:4173/";
const output = resolve(option("output") ?? "build/tide-sprint-renderer-soak.json");
const revision = option("revision") ?? execFileSync(
  "git",
  ["rev-parse", "HEAD"],
  { encoding: "utf8" },
).trim();
const budgets = JSON.parse(readFileSync(
  resolve("tools/art-gate/config/art-budgets.json"),
  "utf8",
));
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
const extraChromiumArgs = process.env["PLAYWRIGHT_CHROMIUM_ARGS_JSON"]
  ? JSON.parse(process.env["PLAYWRIGHT_CHROMIUM_ARGS_JSON"])
  : [];
if (!Array.isArray(extraChromiumArgs)) {
  throw new Error("PLAYWRIGHT_CHROMIUM_ARGS_JSON must contain a JSON array.");
}

const browser = await chromium.launch({
  headless: true,
  args: [...extraChromiumArgs, "--enable-precise-memory-info"],
  ...(executablePath ? { executablePath } : {}),
});

try {
  const context = await browser.newContext({
    // Mobile aspect ratio with a bounded raster: this gate owns renderer
    // lifecycle/resource stability, while the 390x844 and 412x915 gate owns
    // phone-scale layout and input contracts.
    viewport: { width: 128, height: 277 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const renderErrors = [];
  page.on("pageerror", (error) => renderErrors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /(?:webgl|shader|gl_invalid|program|out of memory)/i.test(message.text())
    ) renderErrors.push(`console error: ${message.text()}`);
  });

  await page.goto(new URL("tide-sprint/", baseUrl).toString(), {
    waitUntil: "networkidle",
  });
  await page.waitForSelector('#race-lobby[data-active="true"]');
  await page.evaluate(async () => {
    const directorModule = await import("/src/tideSprint/director.ts");
    const viewModule = await import("/src/tideSprint/view.ts");
    const canvas = document.createElement("canvas");
    canvas.id = "tide-sprint-soak-canvas";
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.zIndex = "-1";
    document.body.append(canvas);

    const director = new directorModule.CleanTideSprintDirector();
    director.start("glowfin");
    const view = new viewModule.CleanTideSprintView(canvas);
    view.setRoster(director.snapshot());
    let renderedFrames = 0;
    window.__GLOWFIN_TIDE_SPRINT_SOAK__ = {
      advance(count) {
        for (let frame = 0; frame < count; frame += 1) {
          const control = directorModule.tideSprintIdealControl(
            director.snapshot().player.distance,
          );
          director.step(1 / 120, control);
          const snapshot = director.snapshot();
          view.update(snapshot, 1 / 60);
          view.render();
          renderedFrames += 1;
        }
        const snapshot = director.snapshot();
        return {
          renderedFrames,
          planHash: snapshot.planHash,
          elapsedSec: snapshot.elapsedSec,
          playerDistance: snapshot.player.distance,
          renderer: view.stats(),
        };
      },
      dispose() {
        view.dispose();
        canvas.remove();
      },
    };
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const heapMB = async () => {
    const response = await cdp.send("Performance.getMetrics");
    const metric = response.metrics.find((entry) => entry.name === "JSHeapUsedSize");
    if (!metric || !Number.isFinite(metric.value)) {
      throw new Error("Chromium did not expose JSHeapUsedSize.");
    }
    return metric.value / (1024 * 1024);
  };
  const collectGarbage = async () => cdp.send("HeapProfiler.collectGarbage");
  const advance = async (frames) => page.evaluate(
    (count) => window.__GLOWFIN_TIDE_SPRINT_SOAK__.advance(count),
    frames,
  );

  let snapshot = await advance(warmupFrames);
  await collectGarbage();
  const baselineHeapMB = await heapMB();
  const baselineResources = { ...snapshot.renderer };
  let peakHeapMB = baselineHeapMB;
  let completedFrames = warmupFrames;
  while (completedFrames < totalFrames) {
    const frames = Math.min(batchFrames, totalFrames - completedFrames);
    snapshot = await advance(frames);
    completedFrames += frames;
    peakHeapMB = Math.max(peakHeapMB, await heapMB());
  }
  await collectGarbage();
  const endHeapMB = await heapMB();
  peakHeapMB = Math.max(peakHeapMB, endHeapMB);
  const growthHeapMB = Math.max(0, endHeapMB - baselineHeapMB);
  const renderer = snapshot.renderer;

  const failures = [];
  if (snapshot.renderedFrames !== totalFrames) {
    failures.push(`rendered ${snapshot.renderedFrames}/${totalFrames} frames`);
  }
  if (!/^[0-9a-f]{8}$/.test(snapshot.planHash)) {
    failures.push(`invalid plan hash ${String(snapshot.planHash)}`);
  }
  if (renderer.drawCalls > budgets.scene.drawCalls.hard) {
    failures.push(`draw calls ${renderer.drawCalls} > ${budgets.scene.drawCalls.hard}`);
  }
  if (renderer.triangles > budgets.scene.triangles.hard) {
    failures.push(`triangles ${renderer.triangles} > ${budgets.scene.triangles.hard}`);
  }
  if (renderer.materials >= budgets.scene.activeArtMaterials.hardMaxExclusive) {
    failures.push(
      `materials ${renderer.materials} >= ` +
      budgets.scene.activeArtMaterials.hardMaxExclusive,
    );
  }
  if (endHeapMB > budgets.performance.maxSteadyStateHeapMB) {
    failures.push(
      `end heap ${endHeapMB.toFixed(2)} MiB > ` +
      budgets.performance.maxSteadyStateHeapMB,
    );
  }
  if (growthHeapMB > budgets.performance.maxSoakHeapGrowthMB) {
    failures.push(
      `heap growth ${growthHeapMB.toFixed(2)} MiB > ` +
      budgets.performance.maxSoakHeapGrowthMB,
    );
  }
  failures.push(...renderErrors);

  const evidence = {
    evidenceVersion: "1.0.0",
    runtimeRevision: revision,
    source: {
      kind: "ci-emulated-mobile-renderer",
      browser: `Chromium ${browser.version()}`,
      viewport: { widthPixels: 128, heightPixels: 277, deviceScaleFactor: 1 },
    },
    renderedFrames: snapshot.renderedFrames,
    race: {
      planHash: snapshot.planHash,
      elapsedSec: snapshot.elapsedSec,
      playerDistance: snapshot.playerDistance,
    },
    memory: {
      baselineHeapMB,
      endHeapMB,
      peakHeapMB,
      growthHeapMB,
    },
    renderer: {
      baselineResources,
      endResources: renderer,
    },
    failures,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(
    `Tide Sprint renderer soak: ${snapshot.renderedFrames} frames, ` +
    `${renderer.drawCalls} draws, ${renderer.triangles} triangles, ` +
    `${growthHeapMB.toFixed(2)} MiB heap growth.`,
  );
  await page.evaluate(() => window.__GLOWFIN_TIDE_SPRINT_SOAK__.dispose());
  if (failures.length > 0) {
    throw new Error(`Tide Sprint renderer soak failed: ${failures.join("; ")}`);
  }
} finally {
  await browser.close();
}
