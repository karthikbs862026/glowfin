import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ECLIPSE_COURT_ALIGNMENT_TARGETS,
  ECLIPSE_COURT_ACT_THRESHOLDS,
  eclipseCourtActIndex,
} from "../src/realms/mechanics";
import { REALM_BUDGET } from "../src/realms/definition";
import {
  EclipseCourtField,
  ECLIPSE_COURT_DRAW_CALLS,
  ECLIPSE_COURT_MATERIALS,
  ECLIPSE_COURT_TRIANGLES,
} from "../src/render/eclipseCourtField";
import {
  ECLIPSE_COURT_PLAYTEST_STORAGE_PREFIX,
  eclipseCourtPlaytestStorage,
  isEclipseCourtPlaytestMode,
} from "../src/content/eclipseCourtPlaytest";
import type { ProgressStorage } from "../src/persistence/progress";

class MemoryStorage implements ProgressStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("Version 48-R2 full Eclipse Court campaign", () => {
  it("ships 136 objectives across three full-length chapters and four acts", () => {
    expect(ECLIPSE_COURT_ALIGNMENT_TARGETS).toEqual([64, 56, 16]);
    expect(ECLIPSE_COURT_ALIGNMENT_TARGETS.reduce((sum, value) => sum + value, 0))
      .toBe(136);
    expect(ECLIPSE_COURT_ACT_THRESHOLDS).toEqual([0, 0.25, 0.5, 0.75]);
    expect([
      eclipseCourtActIndex(0),
      eclipseCourtActIndex(0.249),
      eclipseCourtActIndex(0.25),
      eclipseCourtActIndex(0.5),
      eclipseCourtActIndex(0.75),
      eclipseCourtActIndex(1),
    ]).toEqual([0, 0, 1, 2, 3, 3]);
  });

  it("keeps its richer world inside the fixed mobile realm budget", () => {
    expect(ECLIPSE_COURT_DRAW_CALLS).toBeLessThanOrEqual(REALM_BUDGET.maxDrawCalls);
    expect(ECLIPSE_COURT_MATERIALS).toBeLessThanOrEqual(
      REALM_BUDGET.maxActiveMaterials,
    );
    expect(ECLIPSE_COURT_TRIANGLES).toBeLessThanOrEqual(REALM_BUDGET.maxTriangles);
  });

  it("builds three distinct silhouettes with side-mounted Halo ribs", () => {
    const field = new EclipseCourtField();
    expect(field.group.userData["environmentRevision"]).toBe("full-realm-campaign-r6");
    expect(field.group.userData["stageSilhouettes"]).toEqual([
      "halo-lunar-rib-procession",
      "open-constellation-atolls",
      "rising-crown-amphitheatre",
    ]);

    const names = new Set<string>();
    field.group.traverse((object) => names.add(object.name));
    for (const name of [
      "halo-procession-side-lunar-ribs",
      "weave-floating-reef-atolls",
      "verdict-rising-amphitheatre",
      "six-star-manta-witnesses",
      "free-swimming-manta-wakes",
    ]) expect(names.has(name)).toBe(true);
    expect(field.additionalDrawCalls()).toBe(ECLIPSE_COURT_DRAW_CALLS);
    expect(field.additionalMaterials()).toBe(ECLIPSE_COURT_MATERIALS);
    expect(field.triangleBudget()).toBe(ECLIPSE_COURT_TRIANGLES);
    field.dispose();
  });

  it("limits the bypass to explicit V48 review routes", () => {
    const enabled = {
      releaseVersion: 48,
      pathname: "/game-v48-r2/",
      search: "?playtest=eclipse-court&trial=weave",
    };
    expect(isEclipseCourtPlaytestMode(enabled)).toBe(true);
    expect(isEclipseCourtPlaytestMode({ ...enabled, releaseVersion: 47 })).toBe(false);
    expect(isEclipseCourtPlaytestMode({ ...enabled, pathname: "/game/" })).toBe(false);
    expect(isEclipseCourtPlaytestMode({ ...enabled, search: "" })).toBe(false);
  });

  it("isolates every campaign-review save from normal game progress", () => {
    const storage = new MemoryStorage();
    const playtest = eclipseCourtPlaytestStorage(storage, "v48-r2.weave");
    storage.setItem("glowfin.progress", "main-save");
    playtest.setItem("glowfin.progress", "review-save");
    expect(storage.getItem("glowfin.progress")).toBe("main-save");
    expect(playtest.getItem("glowfin.progress")).toBe("review-save");
    expect(storage.getItem(
      `${ECLIPSE_COURT_PLAYTEST_STORAGE_PREFIX}v48-r2.weave.glowfin.progress`,
    )).toBe("review-save");
  });

  it("presents the promoted campaign and direct chapter entries", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toContain("Glowfin — Version 48-R2 · Full Eclipse Court Campaign");
    expect(html).toContain("Four-act petal campaign");
    expect(html).toContain("Race six living witnesses");
    expect(html).toContain("Break sixteen Crown seals");
    expect(html).toContain("V48 · LOCAL · local");
  });
});
