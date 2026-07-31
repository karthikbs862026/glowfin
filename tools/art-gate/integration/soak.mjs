import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import {
  checkRendererSoak,
  formatRendererSoakReport
} from "../src/soak.ts";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

function positiveNumber(name, fallback) {
  const parsed = Number(option(name) ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive number.`);
  }
  return parsed;
}

const minutes = positiveNumber("minutes", 30);
const renderFps = positiveNumber("render-fps", 10);
const output = resolve(option("output") ?? "build/art-gate-soak.json");
const reportOutput = resolve(
  option("report") ?? "build/art-gate-soak-report.txt"
);
const baseUrl = option("url") ?? "http://127.0.0.1:4173/";
const revision = option("revision") ?? execFileSync(
  "git",
  ["rev-parse", "HEAD"],
  { encoding: "utf8" }
).trim();
const config = JSON.parse(readFileSync(
  resolve("tools/art-gate/config/art-budgets.json"),
  "utf8"
));
const totalFrames = Math.ceil(minutes * 60 * renderFps);
const warmupFrames = Math.min(totalFrames, Math.ceil(60 * renderFps));
const batchFrames = Math.max(1, Math.ceil(10 * renderFps));
const progressIntervalFrames = Math.ceil(5 * 60 * renderFps);

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
  ...(executablePath ? { executablePath } : {})
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const browserVersion = browser.version();
  const renderErrors = [];
  page.on("pageerror", (error) => {
    renderErrors.push(`page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /(?:webgl|shader|gl_invalid|program|out of memory)/i.test(message.text())
    ) {
      renderErrors.push(`console error: ${message.text()}`);
    }
  });

  const target = new URL("art-gate.html", baseUrl);
  target.searchParams.set("tier", "soak");
  target.searchParams.set("minutes", String(minutes));
  target.searchParams.set("renderFps", String(renderFps));
  await page.goto(target.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.body.dataset.artGateReady === "true",
    undefined,
    { timeout: 60_000 }
  );

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
  const collectGarbage = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
  };
  const advance = async (frames) => page.evaluate(
    (count) => {
      const harness = window.__GLOWFIN_SOAK__;
      if (!harness) throw new Error("Glowfin soak harness is not ready.");
      return harness.advance(count);
    },
    frames
  );

  const wallStart = performance.now();
  let completedFrames = 0;
  let nextProgressFrame = progressIntervalFrames;
  let snapshot = await advance(warmupFrames);
  completedFrames += warmupFrames;
  await collectGarbage();
  const baselineHeapMB = await heapMB();
  const baselineResources = { ...snapshot.resources };
  let peakHeapMB = baselineHeapMB;

  while (completedFrames < totalFrames) {
    const frames = Math.min(batchFrames, totalFrames - completedFrames);
    snapshot = await advance(frames);
    completedFrames += frames;
    peakHeapMB = Math.max(peakHeapMB, await heapMB());
    if (completedFrames >= nextProgressFrame) {
      const completedMinutes = completedFrames / renderFps / 60;
      console.log(
        `soak progress ${completedMinutes.toFixed(1)}/${minutes.toFixed(1)} simulated minutes`
      );
      nextProgressFrame += progressIntervalFrames;
    }
  }

  await collectGarbage();
  const endHeapMB = await heapMB();
  peakHeapMB = Math.max(peakHeapMB, endHeapMB);
  const wallClockSeconds = (performance.now() - wallStart) / 1000;

  if (renderErrors.length > 0) {
    throw new Error(
      `Renderer soak reported browser failures: ${renderErrors.join("; ")}`
    );
  }

  const evidence = {
    evidenceVersion: "1.0.0",
    runtimeRevision: revision,
    source: {
      kind: "ci-emulated",
      browser: `Chromium ${browserVersion}`,
      platform: await page.evaluate(() => navigator.platform)
    },
    // Derive the contractual duration from completed render calls so binary
    // floating-point accumulation in the fixed-step clock cannot turn an exact
    // 30-minute run into 29.999999 minutes at the final comparison.
    simulatedMinutes: snapshot.renderedFrames / renderFps / 60,
    renderFps,
    renderedFrames: snapshot.renderedFrames,
    wallClockSeconds,
    simulation: {
      elapsedSeconds: snapshot.simulatedSeconds,
      forwardDistance: snapshot.forwardDistance,
      remainingGates: snapshot.remainingGates
    },
    memory: {
      baselineHeapMB,
      endHeapMB,
      peakHeapMB,
      growthHeapMB: Math.max(0, endHeapMB - baselineHeapMB)
    },
    renderer: {
      gpu: snapshot.gpu,
      contextLosses: snapshot.contextLosses,
      maxDrawCalls: snapshot.maxDrawCalls,
      maxTriangles: snapshot.maxTriangles,
      baselineResources,
      peakResources: snapshot.peakResources,
      endResources: snapshot.resources
    },
    peakPools: {
      gates: snapshot.peakGates,
      stripes: config.performance.maxPools.stripes,
      trailSegments: config.performance.maxPools.trailSegments,
      particles: 0
    }
  };

  const findings = checkRendererSoak(evidence, {
    minimumSimulatedMinutes: minutes,
    maxSteadyStateHeapMB: config.performance.maxSteadyStateHeapMB,
    maxHeapGrowthMB: config.performance.maxSoakHeapGrowthMB,
    maxDrawCalls: config.scene.drawCalls.hard,
    maxTriangles: config.scene.triangles.hard,
    maxPools: config.performance.maxPools
  });
  const report = formatRendererSoakReport(evidence, findings);

  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(dirname(reportOutput), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  writeFileSync(reportOutput, report, "utf8");
  process.stdout.write(report);

  if (findings.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
