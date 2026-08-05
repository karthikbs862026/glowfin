from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


runtime = Path("src/engagement/version41Micro.ts")
text = runtime.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  if (queryStart || rematch) {
  let attempts = 0;
  const autoStart = (): void => {
    const hub = element("moonwell-hub");
    if (
      document.documentElement.dataset["glowfinRuntime"] === "running" &&
      hub?.dataset["active"] === "true"
    ) {
      start();
      return;
    }
    attempts += 1;
    if (attempts < 200) setTimeout(autoStart, 50);
  };
  setTimeout(autoStart, 0);
}
''',
    '''  if (queryStart || rematch) {
  let attempts = 0;
  document.documentElement.dataset["glowfinV41AutoStart"] = "waiting";
  const autoStart = (): void => {
    const hub = element("moonwell-hub");
    if (
      document.documentElement.dataset["glowfinRuntime"] === "running" &&
      hub?.dataset["active"] === "true"
    ) {
      document.documentElement.dataset["glowfinV41AutoStart"] = "started";
      start();
      return;
    }
    attempts += 1;
    if (attempts < 600) {
      setTimeout(autoStart, 50);
    } else {
      document.documentElement.dataset["glowfinV41AutoStart"] = "timed-out";
    }
  };
  setTimeout(autoStart, 0);
}
''',
    "runtime bounded deep-link startup",
)
runtime.write_text(text, encoding="utf-8")


gate = Path("tools/version41-gate/capture.mjs")
text = gate.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''async function standardProgressSnapshot(page) {
  return page.evaluate(() => Object.fromEntries([
    "glowfin.progress.v3.primary",
    "glowfin.progress.v3.backup"
  ].map((key) => [key, localStorage.getItem(key)])));
}

''',
    '''async function standardProgressSnapshot(page) {
  return page.evaluate(() => Object.fromEntries([
    "glowfin.progress.v3.primary",
    "glowfin.progress.v3.backup"
  ].map((key) => [key, localStorage.getItem(key)])));
}

async function installEncounterCaptureHold(page) {
  await page.evaluate(() => {
    const hud = document.querySelector("#v41-hud");
    if (!hud) throw new Error("Version 41 HUD was unavailable before capture arming.");
    let previous = hud.getAttribute("data-segment");
    const observer = new MutationObserver(() => {
      const current = hud.getAttribute("data-segment");
      if (!current || current === previous) return;
      previous = current;
      document.documentElement.dataset.glowfinV41QaHold = "true";
    });
    observer.observe(hud, {
      attributes: true,
      attributeFilter: ["data-segment"]
    });
  });
}

async function releaseEncounterCaptureHold(page) {
  await page.evaluate(() => {
    delete document.documentElement.dataset.glowfinV41QaHold;
  });
}

''',
    "gate capture observer helpers",
)
text = replace_once(
    text,
    '''  const standardProgressBefore = await standardProgressSnapshot(page);
  await startFromExpeditionCard(page);
''',
    '''  const standardProgressBefore = await standardProgressSnapshot(page);
  await installEncounterCaptureHold(page);
  await startFromExpeditionCard(page);
''',
    "gate primary capture arming",
)
text = replace_once(
    text,
    '''    await page.waitForFunction(
      (expected) => {
        const reached = (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
          .split("|")
          .includes(expected);
        if (reached) document.documentElement.dataset.glowfinV41QaHold = "true";
        return reached;
      },
      segment,
      { timeout: 12_000 }
    );
''',
    '''    await page.waitForFunction(
      (expected) => document.querySelector("#v41-hud")?.getAttribute("data-segment") === expected,
      segment,
      { timeout: 20_000 }
    );
''',
    "gate exact active-segment wait",
)
text = replace_once(
    text,
    '''    await page.evaluate(() => {
      delete document.documentElement.dataset.glowfinV41QaHold;
    });
''',
    '''    await releaseEncounterCaptureHold(page);
''',
    "gate primary hold release",
)
text = replace_once(
    text,
    '''  await deepLinkPage.waitForFunction(
    () => (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
      .split("|")
      .includes("follow-light"),
    undefined,
    { timeout: 15_000 }
  );
''',
    '''  await deepLinkPage.waitForFunction(
    () => (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
      .split("|")
      .includes("follow-light"),
    undefined,
    { timeout: 45_000 }
  );
''',
    "gate deep-link startup allowance",
)
text = replace_once(
    text,
    '''  const deepLinkStart = await deepLinkPage.evaluate(() => ({
    hudActive: document.querySelector("#v41-hud")?.getAttribute("data-active") === "true",
    mode: document.documentElement.dataset.glowfinMode ?? null,
    firstSegmentObserved: (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
      .split("|")
      .includes("follow-light"),
    startupError: document.body.dataset.startupError === "true"
  }));
''',
    '''  const deepLinkStart = await deepLinkPage.evaluate(() => ({
    hudActive: document.querySelector("#v41-hud")?.getAttribute("data-active") === "true",
    mode: document.documentElement.dataset.glowfinMode ?? null,
    firstSegmentObserved: (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
      .split("|")
      .includes("follow-light"),
    startupError: document.body.dataset.startupError === "true",
    autoStart: document.documentElement.dataset.glowfinV41AutoStart ?? null
  }));
''',
    "gate deep-link startup diagnostics",
)
text = replace_once(
    text,
    '''  await accessPage.goto(expeditionUrl.toString(), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await startFromExpeditionCard(accessPage);
  await accessPage.waitForFunction(
    () => {
      const reached = (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
        .split("|")
        .includes("duskmaw-chase");
      if (reached) document.documentElement.dataset.glowfinV41QaHold = "true";
      return reached;
    },
    undefined,
    { timeout: 30_000 }
  );
''',
    '''  await accessPage.goto(expeditionUrl.toString(), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitForReadyHub(accessPage);
  await installEncounterCaptureHold(accessPage);
  await startFromExpeditionCard(accessPage);
  for (const segment of expectedSegments) {
    await accessPage.waitForFunction(
      (expected) => document.querySelector("#v41-hud")?.getAttribute("data-segment") === expected,
      segment,
      { timeout: 20_000 }
    );
    if (segment === "duskmaw-chase") break;
    await releaseEncounterCaptureHold(accessPage);
  }
''',
    "gate accessibility held progression",
)
text = replace_once(
    text,
    '''  await accessPage.evaluate(() => {
    delete document.documentElement.dataset.glowfinV41QaHold;
  });
''',
    '''  await releaseEncounterCaptureHold(accessPage);
''',
    "gate accessibility hold release helper",
)
text = replace_once(
    text,
    '''  if (!deepLinkStart.hudActive || deepLinkStart.mode !== "expedition-v41" || !deepLinkStart.firstSegmentObserved || deepLinkStart.startupError) {
''',
    '''  if (!deepLinkStart.hudActive || deepLinkStart.mode !== "expedition-v41" || !deepLinkStart.firstSegmentObserved || deepLinkStart.autoStart !== "started" || deepLinkStart.startupError) {
''',
    "gate deep-link started-state assertion",
)
gate.write_text(text, encoding="utf-8")

for name in [
    ".github/workflows/version41-capture-observer-fix.yml",
    "scripts/fix-v41-capture-observer.py",
]:
    path = Path(name)
    if path.exists():
        path.unlink()

print("Version 41 capture observer and deep-link correction applied.")
