from __future__ import annotations

from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count == 0 and new in text:
        return text
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_main() -> None:
    path = Path("src/main.ts")
    text = path.read_text(encoding="utf-8")

    helper = '''function version41ExpeditionActive(): boolean {
  return document.documentElement.dataset["glowfinMode"] === "expedition-v41";
}

'''
    if helper not in text:
        text = replace_once(
            text,
            "\nfunction startRun(\n",
            f"\n{helper}function startRun(\n",
            "main expedition helper",
        )

    text = replace_once(
        text,
        '''  replayOverride: GlowfinReplayV1 | null = null,
  forceGhost = false
): void {
''',
        '''  replayOverride: GlowfinReplayV1 | null = null,
  forceGhost = false,
  suppressRunStart = false
): void {
''',
        "main startRun signature",
    )

    listener = '''window.addEventListener("glowfin:v41-complete", () => {
  if (!version41ExpeditionActive()) return;
  gameplayActive = false;
  awaitingRestart = false;
  steering.reset();
  timestep.reset();
  view?.setHeroMoment("celebration");
});

'''
    text = replace_once(
        text,
        '''  reportRunStart();
}

moonWell.onDive(() => {
''',
        f'''  if (!suppressRunStart) reportRunStart();
}}

{listener}moonWell.onDive(() => {{
''',
        "main run-start telemetry tail",
    )

    text = replace_once(
        text,
        '''moonWell.onDive(() => {
  telemetry.track("tap_to_dive", {
    firstRun: !progress.onboarding.firstRunCompleted,
    tutorialRequired: !guidedTutorialComplete
  });
  startRun("fresh");
});
''',
        '''moonWell.onDive(() => {
  const expedition = version41ExpeditionActive();
  if (!expedition) {
    telemetry.track("tap_to_dive", {
      firstRun: !progress.onboarding.firstRunCompleted,
      tutorialRequired: !guidedTutorialComplete
    });
  }
  startRun("fresh", null, null, false, expedition);
});
''',
        "main Moon Well dive handler",
    )

    text = replace_once(
        text,
        '''    if (events.justEnded) {
      awaitingRestart = true;
      gameplayActive = false;
''',
        '''    if (events.justEnded) {
      if (version41ExpeditionActive()) {
        awaitingRestart = true;
        gameplayActive = false;
        steering.reset();
        hud.hideGameOver();
        const recoveries = Number(
          document.documentElement.dataset["glowfinExpeditionRecoveries"] ?? "0"
        ) + 1;
        document.documentElement.dataset["glowfinExpeditionRecoveries"] = String(recoveries);
        queueMicrotask(() => {
          if (!version41ExpeditionActive()) return;
          startRun("fresh", null, null, false, true);
          window.dispatchEvent(new Event("glowfin:v41-current-recovered"));
        });
        return;
      }
      awaitingRestart = true;
      gameplayActive = false;
''',
        "main Expedition run-end quarantine",
    )

    path.write_text(text, encoding="utf-8")


def patch_runtime() -> None:
    path = Path("src/engagement/version41Micro.ts")
    text = path.read_text(encoding="utf-8")

    text = replace_once(
        text,
        '''function finish(result: Result, elapsed: number): void {
  if (finished) return;
  finished = true;
  progress = save(result);
''',
        '''function finish(result: Result, elapsed: number): void {
  if (finished) return;
  finished = true;
  playing = false;
  window.dispatchEvent(new Event("glowfin:v41-complete"));
  progress = save(result);
''',
        "runtime finish authority",
    )

    text = replace_once(
        text,
        '''  private kind: Kind | null = null;
  private previous = -1;
  private moteOrigin = 16;
''',
        '''  private kind: Kind | null = null;
  private expeditionElapsed = 0;
  private lastDistance = 0;
  private moteOrigin = 16;
''',
        "runtime independent clock fields",
    )

    text = replace_once(
        text,
        '''  update(sim: SimState, frame: number): void {
    const elapsed = sim.elapsedSec * qaScale();
    if (this.previous > 1 && (elapsed + .1 < this.previous || sim.forwardDistance < 1)) this.reset(sim);
    this.previous = elapsed;
    const segment = segmentAt(elapsed);
    if (segment.kind !== this.kind) {
''',
        '''  update(sim: SimState, frame: number): void {
    this.expeditionElapsed += Math.max(0, Math.min(frame, .1)) * qaScale();
    const elapsed = this.expeditionElapsed;
    const segment = segmentAt(elapsed);
    if (sim.forwardDistance + 1 < this.lastDistance) {
      this.origins.set(segment.kind, sim.forwardDistance);
      this.moteOrigin = sim.forwardDistance + 16;
      this.nextMiss = 0;
      this.resolved.clear();
      this.chain = 0;
      this.portalDistance = null;
      text("v41-chain", `Chain 0 · Best ${this.bestChain}`);
    }
    this.lastDistance = sim.forwardDistance;
    if (segment.kind !== this.kind) {
''',
        "runtime independent clock update",
    )

    reset_pattern = re.compile(
        r'''\n  private reset\(sim: SimState\): void \{.*?\n  \}\n\n  private updateMotes''',
        re.S,
    )
    text, count = reset_pattern.subn("\n\n  private updateMotes", text, count=1)
    if count != 1 and "private reset(sim: SimState)" in text:
        raise SystemExit(f"runtime obsolete reset removal: expected one match, found {count}")

    text = replace_once(
        text,
        '''    element("v41-complete")?.setAttribute("data-active", "false");
    track("tap_to_dive", {
      mode: "expedition",
      expedition: C.expeditionId,
      contentVersion: 41,
      planHash: PLAN_HASH
    });
    (element("moonwell-dive") as HTMLButtonElement | null)?.click();
''',
        '''    element("v41-complete")?.setAttribute("data-active", "false");
    document.documentElement.dataset["glowfinExpeditionRecoveries"] = "0";
    element("v41-hud")?.setAttribute("data-segment-history", "");
    track("tap_to_dive", {
      mode: "expedition",
      expedition: C.expeditionId,
      contentVersion: 41,
      planHash: PLAN_HASH
    });
    track("run_start", {
      mode: "expedition",
      expedition: C.expeditionId,
      contentVersion: 41,
      planHash: PLAN_HASH
    });
    (element("moonwell-dive") as HTMLButtonElement | null)?.click();
''',
        "runtime Expedition start",
    )

    text = replace_once(
        text,
        '''  entry.addEventListener("click", (event) => {
    event.stopPropagation();
    start();
  });
''',
        '''  entry.addEventListener("click", (event) => {
    event.stopPropagation();
    start();
  });
  addEventListener("glowfin:v41-current-recovered", () => {
    toast("Moon guardian restores your Light");
  });
''',
        "runtime guardian recovery feedback",
    )

    path.write_text(text, encoding="utf-8")


def patch_browser_gate() -> None:
    path = Path("tools/version41-gate/capture.mjs")
    text = path.read_text(encoding="utf-8")

    helper = '''async function standardProgressSnapshot(page) {
  return page.evaluate(() => Object.fromEntries([
    "glowfin.progress.v3.primary",
    "glowfin.progress.v3.backup"
  ].map((key) => [key, localStorage.getItem(key)])));
}

'''
    if helper not in text:
        text = replace_once(
            text,
            "async function startFromExpeditionCard(page) {\n",
            f"{helper}async function startFromExpeditionCard(page) {{\n",
            "browser standard-progress helper",
        )

    navigation_old = '{ waitUntil: "load" }'
    navigation_count = text.count(navigation_old)
    if navigation_count < 3:
        raise SystemExit(
            f"browser navigation hardening: expected at least three load waits, found {navigation_count}"
        )
    text = text.replace(
        navigation_old,
        '{ waitUntil: "domcontentloaded", timeout: 90_000 }',
    )

    text = replace_once(
        text,
        '''  await page.goto(expeditionUrl.toString(), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await startFromExpeditionCard(page);

  const snapshots = [];
''',
        '''  await page.goto(expeditionUrl.toString(), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitForReadyHub(page);
  const standardProgressBefore = await standardProgressSnapshot(page);
  await startFromExpeditionCard(page);

  const snapshots = [];
''',
        "browser primary journey start",
    )

    text = replace_once(
        text,
        '''        runtime: document.documentElement.dataset.glowfinRuntime ?? null,
        startupError: document.body.dataset.startupError === "true",
        canvasVisible: getComputedStyle(document.querySelector("#glowfin-canvas")).display !== "none"
''',
        '''        runtime: document.documentElement.dataset.glowfinRuntime ?? null,
        startupError: document.body.dataset.startupError === "true",
        canvasVisible: getComputedStyle(document.querySelector("#glowfin-canvas")).display !== "none",
        corePostRunVisible: getComputedStyle(document.querySelector("#hud-gameover")).display !== "none",
        recoveries: Number(document.documentElement.dataset.glowfinExpeditionRecoveries ?? "0")
''',
        "browser encounter snapshot authority",
    )

    text = replace_once(
        text,
        '''    startupError: document.body.dataset.startupError === "true",
    segmentHistory: document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? ""
  }));
  await page.screenshot({
''',
        '''    startupError: document.body.dataset.startupError === "true",
    segmentHistory: document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "",
    corePostRunVisible: getComputedStyle(document.querySelector("#hud-gameover")).display !== "none",
    recoveries: Number(document.documentElement.dataset.glowfinExpeditionRecoveries ?? "0")
  }));
  const standardProgressAfter = await standardProgressSnapshot(page);
  await page.screenshot({
''',
        "browser completion authority snapshot",
    )

    text = replace_once(
        text,
        '''  const accessContext = await browser.newContext({
''',
        '''  await context.close();

  const accessContext = await browser.newContext({
''',
        "browser context cleanup",
    )

    text = replace_once(
        text,
        '''  if (snapshots.some((entry) => entry.runtime !== "running" || entry.startupError || !entry.canvasVisible)) {
    issues.push("the runtime or canvas failed during an encounter");
  }
''',
        '''  if (snapshots.some((entry) => entry.runtime !== "running" || entry.startupError || !entry.canvasVisible)) {
    issues.push("the runtime or canvas failed during an encounter");
  }
  if (snapshots.some((entry) => entry.corePostRunVisible) || completion.corePostRunVisible) {
    issues.push("the standard post-run reward screen leaked into the Expedition");
  }
  if (completion.recoveries < 1) {
    issues.push("the unattended phone journey did not exercise guardian recovery");
  }
  if (JSON.stringify(standardProgressBefore) !== JSON.stringify(standardProgressAfter)) {
    issues.push("the Expedition mutated standard progress, rewards, or run counters");
  }
''',
        "browser Version 40 isolation checks",
    )

    text = replace_once(
        text,
        '''    snapshots,
    completion,
    deepLinkStart,
''',
        '''    snapshots,
    completion,
    standardProgressBefore,
    standardProgressAfter,
    deepLinkStart,
''',
        "browser report authority fields",
    )

    path.write_text(text, encoding="utf-8")


def cleanup_one_shot_files() -> None:
    for name in [
        ".github/workflows/version41-authority-pr-runner.yml",
        ".github/workflows/version41-expedition-authority-fix.yml",
        ".github/workflows/version41-finalize-release.yml",
        "scripts/finalize-v41-release.py",
    ]:
        path = Path(name)
        if path.exists():
            path.unlink()


patch_main()
patch_runtime()
patch_browser_gate()
cleanup_one_shot_files()
print("Version 41 release finalization patch applied.")
