import { describe, expect, it } from "vitest";
import rootHtml from "../index.html?raw";
import main from "../src/main.ts?raw";
import gameView from "../src/render/gameView.ts?raw";
import crystalField from "../src/render/crystalTrenchField.ts?raw";
import kelpField from "../src/render/kelpCathedralField.ts?raw";
import mechanics from "../src/realms/mechanics.ts?raw";
import moonWell from "../src/render/moonWell.ts?raw";
import run from "../src/sim/run.ts?raw";

describe("Version 43-R4 mainline realm integration seam", () => {
  it("connects Kelp Cathedral to the final Crystal Trench through the Moon Well", () => {
    expect(rootHtml).toContain('id="moonwell-kelp-cathedral"');
    expect(rootHtml).toContain('id="moonwell-kelp-cathedral-detail"');
    expect(rootHtml).toContain('id="moonwell-crystal-trench"');
    expect(moonWell).toContain("onKelpCathedral(listener");
    expect(moonWell).toContain("onCrystalTrench(listener");
    expect(moonWell).toContain("setKelpCathedralState(");
    expect(moonWell).toContain("setCrystalTrenchState(");
    expect(main).toContain("moonWell.onKelpCathedral(() =>");
    expect(main).toContain("moonWell.onCrystalTrench(() =>");
    expect(main).toContain('startRun("fresh", { realmId: "kelp-cathedral" })');
    expect(main).toContain('startRun("fresh", { realmId: "crystal-trench" })');
    expect(main).toContain("isCrystalTrenchUnlocked(progress.realms)");
    expect(main).toContain('source: "realm-one-complete"');
  });

  it("uses one realm identity across simulation, rendering and telemetry", () => {
    expect(main).toContain("new Run(seed, tuning, { realmId: activeRealmId })");
    expect(main).toContain("view?.setRealm(activeRealmId)");
    expect(gameView).toContain("setRealm(realmId: RealmId): void");
    expect(main).toContain('telemetry.track("realm_entry"');
    expect(main).toContain('telemetry.track("realm_unlock"');
    expect(main).toContain('realmStatus.rescuedManta ? "realm_complete" : "realm_abandon"');
    expect(main).toContain('realmStatus.raceWon ? "realm_complete" : "realm_abandon"');
  });

  it("renders Kelp Cathedral as its own living environment rather than rebadged Moon Garden art", () => {
    expect(kelpField).toContain("gateWallSegmentsAt");
    expect(kelpField).toContain("kelp-cathedral-collision-frond-curtains");
    expect(kelpField).toContain("kelp-cathedral-three-strand-braided-canopy");
    expect(kelpField).toContain("kelp-cathedral-scalloped-shell-bells");
    expect(kelpField).toContain("kelp-cathedral-recognisable-sea-dragons");
    expect(kelpField).toContain("kelp-cathedral-baby-manta-rescue-target");
    expect(kelpField).toContain("kelp-cathedral-readable-luminous-spores");
    expect(kelpField).toContain("new THREE.MeshStandardMaterial");
    expect(gameView).toContain(
      "for (const object of this.gates.objects) object.visible = moonGardenActive;",
    );
    expect(gameView).toContain("this.speedInlays.visible = moonGardenActive;");
    expect(gameView).toContain("this.moonGardenSeabed.visible = moonGardenActive;");
    expect(gameView).toContain("this.moonGardenFloor.visible = moonGardenActive;");
    expect(gameView).toContain("kelp-blade-albedo-v2.webp");
    expect(gameView).toContain("kelp-stipe-albedo-v2.webp");
    expect(gameView).toContain("kelp-seabed-albedo-v2.webp");
    expect(gameView).toContain('if (this.activeRealm === "moon-garden")');
    expect(gameView).toContain('this.floorMaterial.uniforms["uSurfaceWeight"]');
    expect(main).toContain('if (activeRealmId !== "moon-garden") return null;');
    expect(rootHtml).toContain(
      'html[data-glowfin-realm="kelp-cathedral"] #hud-signature-cue',
    );
  });

  it("owns the accepted R3 Crystal Trench environment and full mechanic chain", () => {
    expect(crystalField).toContain("gateWallSegmentsAt");
    expect(crystalField).toContain("crystal-trench-fractured-cavern-buttresses");
    expect(crystalField).toContain("crystal-trench-faceted-reflective-crystal-forest");
    expect(crystalField).toContain("crystal-trench-eroded-submerged-ruin-colonnade");
    expect(crystalField).toContain("crystal-trench-monumental-eroded-voussoir-trench-gate");
    expect(crystalField).toContain("crystal-trench-prism-pulse-cyan-seabed-route");
    expect(crystalField).toContain("crystal-trench-prism-pulse-collision-true-aperture");
    expect(crystalField).toContain("crystal-trench-prism-pulse-fractured-violet-reflections");
    expect(crystalField).toContain("crystal-trench-tapered-volumetric-refracted-moonbeams");
    expect(crystalField).toContain("crystal-trench-suspended-prismatic-mineral-dust");
    expect(crystalField).not.toContain("RingGeometry");
    expect(crystalField).not.toContain("ConeGeometry");
    expect(gameView).toContain("crystal-albedo-v2.webp");
    expect(gameView).toContain("ruin-stone-albedo-v2.webp");
    expect(gameView).toContain("seabed-albedo-v2.webp");
    expect(gameView).toContain('const crystalActive = realmId === "crystal-trench";');
    expect(rootHtml).toContain(
      'html[data-glowfin-realm="crystal-trench"] #hud-signature-cue',
    );
    expect(mechanics).toContain('verb: "prism-pulse"');
    expect(mechanics).toContain('verb: "trench-threshold"');
    expect(mechanics).toContain('verb: "sliding-crystal-plates"');
    expect(run).toContain('this.realmId === "crystal-trench"');
    expect(run).toContain("realmCrystalPlatesCleared");
    expect(run).toContain('verb: "mirror-current-race"');
    expect(main).toContain('slice: "mirror-current-r3"');
  });

  it("isolates cross-course competitive records while sharing Version 42 progression", () => {
    expect(main).toContain(
      'const progressionReplay = activeRealmId === "moon-garden" ? replay : null'
    );
    expect(main).toContain(
      'competitiveRecordsAllowed: activeRealmId === "moon-garden"'
    );
    expect(main).toContain(
      'const savedGhost = activeRealmId === "moon-garden"'
    );
    expect(main).toContain('if (activeRealmId === "moon-garden") {');
    expect(main).toContain('const realmStatus = run.crystalTrenchStatus;');
    expect(main).toContain("progressRepository.recordKelpCathedralRun");
    expect(main).toContain("progressRepository.recordCrystalTrenchRun");
    expect(main).not.toContain("new RealmProgressRepository");
  });

  it("retains every promoted Version 42 entry path", () => {
    expect(rootHtml).toContain('id="moonwell-dive"');
    expect(rootHtml).toContain('id="moonwell-tide-sprint"');
    expect(rootHtml).toContain('id="hud-daily-trial"');
    expect(rootHtml).toContain('id="tutorial-intro-start"');
    expect(rootHtml).toContain('id="expedition-mission-card"');
    expect(main).toContain('new URL("tide-sprint/", document.baseURI)');
    expect(main).toContain("function startExpedition(): void");
  });
});
