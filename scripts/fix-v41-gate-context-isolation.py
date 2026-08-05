from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


path = Path("tools/version41-gate/capture.mjs")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    '''async function waitForReadyHub(page) {
  await page.locator("#glowfin-canvas").waitFor({ state: "visible" });
  await page.locator("#v41-entry").waitFor({ state: "visible", timeout: 12_000 });
  await page.waitForFunction(() => (
    document.documentElement.dataset.glowfinRuntime === "running" &&
    document.querySelector("#moonwell-hub")?.getAttribute("data-active") === "true"
  ), undefined, { timeout: 12_000 });
}
''',
    '''async function waitForReadyHub(page) {
  await page.locator("#glowfin-canvas").waitFor({ state: "visible" });
  await page.locator("#v41-entry").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => (
    document.documentElement.dataset.glowfinRuntime === "running" &&
    document.querySelector("#moonwell-hub")?.getAttribute("data-active") === "true"
  ), undefined, { timeout: 30_000 });
}
''',
    "ready-hub mobile startup bound",
)

text = replace_once(
    text,
    '''  await page.screenshot({
    path: resolve(screenshotDir, "07-complete.png"),
    fullPage: true
  });

  const deepLinkPage = await context.newPage();
''',
    '''  await page.screenshot({
    path: resolve(screenshotDir, "07-complete.png"),
    fullPage: true
  });
  // The remaining checks represent independent user journeys. Release the
  // completed Expedition's WebGL context before opening another mobile page so
  // the gate never manufactures a multi-tab GPU-context exhaustion failure.
  await page.close();

  const deepLinkPage = await context.newPage();
''',
    "primary journey WebGL release",
)

text = replace_once(
    text,
    '''  await normalPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await normalPage.locator("#v41-entry").waitFor({ state: "visible" });
''',
    '''  await normalPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitForReadyHub(normalPage);
''',
    "normal-home isolated readiness",
)

path.write_text(text, encoding="utf-8")

for name in [
    ".github/workflows/version41-gate-context-isolation-fix.yml",
    "scripts/fix-v41-gate-context-isolation.py",
]:
    candidate = Path(name)
    if candidate.exists():
        candidate.unlink()

print("Version 41 browser-context isolation correction applied.")
