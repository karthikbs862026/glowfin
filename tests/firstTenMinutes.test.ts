import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("Version 37 first-ten-minute player shell", () => {
  it("starts at a complete Moon Well with direct Dive and Daily Tide access", () => {
    expect(html).toContain('id="moonwell-hub" data-active="true"');
    expect(html).toContain('id="moonwell-dive"');
    expect(html).toContain('id="hud-daily-trial"');
    for (const panel of ["wardrobe", "objectives", "leaderboard", "settings"]) {
      expect(html).toContain(`id="moonwell-panel-${panel}"`);
    }
  });

  it("keeps post-run to one primary CTA and two secondary actions", () => {
    const actions = html.match(/<div id="hud-gameover-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(actions.match(/<button/g)).toHaveLength(3);
    expect(actions).toContain('id="hud-dive-again" class="hud-action primary"');
    expect(actions).toContain('id="hud-race-best" class="hud-action"');
    expect(actions).toContain('id="hud-open-hub" class="hud-action"');
    expect(actions).not.toMatch(/hud-(daily-trial|submit-score|share-clip|motor-assist|telemetry-choice)/);
    expect(html).not.toContain("Tap outside the buttons");
  });

  it("labels the two gameplay meters and moves release identity into Settings", () => {
    expect(html).toContain('<div class="hud-meter"><span>Light</span>');
    expect(html).toContain('<div class="hud-meter"><span>Flow</span>');
    const settingsIndex = html.indexOf('id="moonwell-panel-settings"');
    const badgeIndex = html.indexOf('id="hud-build"');
    expect(settingsIndex).toBeGreaterThan(0);
    expect(badgeIndex).toBeGreaterThan(settingsIndex);
    expect(html).toContain(".hud-objective, .hud-objective strong { font-size: 12px; }");
  });
});
