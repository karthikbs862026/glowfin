import { describe, expect, it } from "vitest";
import rootHtml from "../index.html?raw";
import tideSprintHtml from "../tide-sprint/index.html?raw";
import main from "../src/main.ts?raw";
import tideSprintMain from "../src/tideSprint/main.ts?raw";
import viteConfig from "../vite.config.ts?raw";

describe("Version 42 Tide Sprint integration seam", () => {
  it("enters from the Moon Well and builds as a mount-safe lazy page", () => {
    expect(rootHtml).toContain('id="moonwell-tide-sprint"');
    expect(rootHtml).toContain('id="moonwell-tide-sprint-detail"');
    expect(main).toContain('moonWell.onTideSprint(() =>');
    expect(main).toContain("setTideSprintState(progress.tideSprint");
    expect(main).toContain('new URL("tide-sprint/", document.baseURI)');
    expect(viteConfig).toContain('tideSprint: "tide-sprint/index.html"');
    expect(tideSprintHtml).toContain('src="../src/tideSprint/main.ts"');
    expect(tideSprintHtml).toContain('href="../"');
  });

  it("keeps Tide Sprint rendering out of Classic startup ownership", () => {
    expect(main).not.toContain("CleanTideSprintView");
    expect(main).not.toContain('from "./tideSprint/director"');
    expect(main).not.toContain('from "./tideSprint/view"');
    expect(tideSprintMain).toContain("new CleanTideSprintView(canvas)");
    expect(tideSprintMain).toContain("new ProgressRepository(deviceStorage)");
    expect(tideSprintMain).toContain("TideSprintGhostRecorder");
  });

  it("wires shared rewards, objectives, saves, telemetry and lifecycle recovery", () => {
    expect(tideSprintMain).toContain("recordTideSprintRace");
    expect(tideSprintMain).toContain("TIDE_SPRINT_OBJECTIVES");
    expect(tideSprintMain).toContain('telemetry.track("tide_sprint_complete"');
    expect(tideSprintMain).toContain('telemetry.track("reward_granted"');
    expect(tideSprintMain).toContain('"webglcontextlost"');
    expect(tideSprintMain).toContain('"webglcontextrestored"');
    expect(tideSprintMain).toContain('"pagehide"');
    expect(tideSprintMain).toContain('"pageshow"');
  });

  it("retains every existing main-game entry path", () => {
    expect(rootHtml).toContain('id="moonwell-dive"');
    expect(rootHtml).toContain('id="hud-daily-trial"');
    expect(rootHtml).toContain('id="tutorial-intro-start"');
    expect(rootHtml).toContain('id="expedition-mission-card"');
    expect(main).toContain('startRun("fresh")');
    expect(main).toContain('startRun("daily"');
    expect(main).toContain('startRun("ghost"');
    expect(main).toContain("function startExpedition(): void");
  });
});
