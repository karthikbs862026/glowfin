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
    '''function qaScale(): number {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return local && new URLSearchParams(location.search).get("v41qa") === "1" ? C.qaTimeScale : 1;
}
''',
    '''function qaScale(): number {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return local && new URLSearchParams(location.search).get("v41qa") === "1" ? C.qaTimeScale : 1;
}
function qaHeld(): boolean {
  return qaScale() !== 1 &&
    document.documentElement.dataset["glowfinV41QaHold"] === "true";
}
''',
    "runtime QA hold helper",
)
text = replace_once(
    text,
    '''  update(sim: SimState, frame: number): void {
    const previousElapsed = this.expeditionElapsed;
''',
    '''  update(sim: SimState, frame: number): void {
    // Loopback evidence may briefly hold the Adventure layer after an encounter
    // boundary so a slow software renderer captures that exact beat. This is
    // unreachable in production and never alters the underlying core lifecycle.
    if (qaHeld()) return;
    const previousElapsed = this.expeditionElapsed;
''',
    "runtime QA hold application",
)
runtime.write_text(text, encoding="utf-8")


gate = Path("tools/version41-gate/capture.mjs")
text = gate.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''    await page.waitForFunction(
      (expected) => (document.querySelector("#v41-hud")?.getAttribute("data-segment-history") ?? "")
        .split("|")
        .includes(expected),
      segment,
      { timeout: 8_000 }
    );
''',
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
    "gate exact-beat hold",
)
text = replace_once(
    text,
    '''    await page.screenshot({
      path: resolve(screenshotDir, `${String(snapshots.length).padStart(2, "0")}-${segment}.png`),
      fullPage: true
    });
''',
    '''    await page.screenshot({
      path: resolve(screenshotDir, `${String(snapshots.length).padStart(2, "0")}-${segment}.png`),
      fullPage: true
    });
    await page.evaluate(() => {
      delete document.documentElement.dataset.glowfinV41QaHold;
    });
''',
    "gate exact-beat release",
)
text = replace_once(
    text,
    '''  await accessPage.waitForFunction(
    () => document.querySelector("#v41-hud")?.getAttribute("data-segment") === "duskmaw-chase",
    undefined,
    { timeout: 15_000 }
  );
''',
    '''  await accessPage.waitForFunction(
    () => {
      const reached = document.querySelector("#v41-hud")?.getAttribute("data-segment") === "duskmaw-chase";
      if (reached) document.documentElement.dataset.glowfinV41QaHold = "true";
      return reached;
    },
    undefined,
    { timeout: 30_000 }
  );
''',
    "gate accessibility timeout and hold",
)
text = replace_once(
    text,
    '''  await accessPage.screenshot({
    path: resolve(screenshotDir, "08-reduced-motion-high-contrast-chase.png"),
    fullPage: true
  });
  await accessContext.close();
''',
    '''  await accessPage.screenshot({
    path: resolve(screenshotDir, "08-reduced-motion-high-contrast-chase.png"),
    fullPage: true
  });
  await accessPage.evaluate(() => {
    delete document.documentElement.dataset.glowfinV41QaHold;
  });
  await accessContext.close();
''',
    "gate accessibility hold release",
)
text = replace_once(
    text,
    '''  if (snapshots.map((entry) => entry.segmentHistory.split("|")).flat().filter((value, index, all) => all.indexOf(value) === index).join("|") !== expectedSegments.join("|")) {
    issues.push("encounter order was not deterministic");
  }
''',
    '''  if (snapshots.map((entry) => entry.segmentHistory.split("|")).flat().filter((value, index, all) => all.indexOf(value) === index).join("|") !== expectedSegments.join("|")) {
    issues.push("encounter order was not deterministic");
  }
  if (snapshots.some((entry, index) => entry.segment !== expectedSegments[index])) {
    issues.push("an encounter screenshot did not capture its named active beat");
  }
''',
    "gate exact screenshot assertion",
)
gate.write_text(text, encoding="utf-8")

for name in [
    ".github/workflows/version41-qa-capture-fix.yml",
    "scripts/fix-v41-qa-capture.py",
]:
    path = Path(name)
    if path.exists():
        path.unlink()

print("Version 41 QA capture hardening applied.")
