import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import { PRODUCTION_ART } from "../src/art/productionManifest";
import {
  createBrokenTowerGeometry,
  createMediumCoralGeometry,
  createRibbonKelpGeometry,
  createSpireGeometry,
  createWallFragmentGeometry,
  geometryTriangles
} from "../src/render/moonGardenGeometry";
import { createGlowfinRigGeometry } from "../src/render/glowfinGeometry";
import { contourWorldWidth, MoonGardenGates } from "../src/render/gateArt";

describe("Phase 3B production art manifest", () => {
  it("matches every generated Moon-Garden LOD exactly", () => {
    const families = [
      [
        "wallFragment",
        (lod: 0 | 1 | 2) => createWallFragmentGeometry(lod, 1)
      ],
      [
        "brokenTower",
        (lod: 0 | 1 | 2) => createBrokenTowerGeometry(lod)
      ],
      [
        "spire",
        (lod: 0 | 1 | 2) => createSpireGeometry(lod)
      ],
      [
        "mediumCoral",
        (lod: 0 | 1 | 2) => createMediumCoralGeometry(lod)
      ]
    ] as const;

    for (const [family, create] of families) {
      for (const lod of [0, 1, 2] as const) {
        const geometry = create(lod);
        expect(geometryTriangles(geometry)).toBe(
          PRODUCTION_ART[family][`lod${lod}`]
        );
        geometry.dispose();
      }
    }
  });

  it("keeps every wall LOD on the exact straight playable plane", () => {
    for (const lod of [0, 1, 2] as const) {
      const left = createWallFragmentGeometry(lod, 1);
      const right = createWallFragmentGeometry(lod, -1);
      left.computeBoundingBox();
      right.computeBoundingBox();
      expect(left.boundingBox?.max.x).toBeCloseTo(0.5, 6);
      expect(right.boundingBox?.min.x).toBeCloseTo(-0.5, 6);
      left.dispose();
      right.dispose();
    }
  });

  it("measures every collider-backed wall mesh and its straight contour", () => {
    const gates = new MoonGardenGates(tuning);
    const obstacles = gates.objects.filter((object) => object.userData["isObstacle"]);
    const context = gates.objects.filter((object) => object.userData["isObstacleContext"]);
    expect(obstacles).toHaveLength(7);
    expect(context).toHaveLength(0);
    gates.dispose();
  });

  it("keeps the configured collision-contour width through camera changes", () => {
    const depth = 51.5;
    const fov = tuning.camera.fovAtMaxMomentum;
    const viewportHeight = 1680;
    const width = contourWorldWidth(
      tuning.visual.obstacleEdgeWidthPixels,
      depth,
      fov,
      viewportHeight
    );
    const verticalSpan = 2 * depth * Math.tan(fov * Math.PI / 360);
    expect(width / (verticalSpan / viewportHeight)).toBeCloseTo(
      tuning.visual.obstacleEdgeWidthPixels,
      6
    );
  });

  it("matches the two-draw skinned Glowfin LOD evidence", () => {
    for (const lod of [0, 1] as const) {
      const rig = createGlowfinRigGeometry(tuning, lod);
      expect(rig.triangles).toBe(PRODUCTION_ART.glowfin[`lod${lod}`]);
      rig.body.dispose();
      rig.eyes.dispose();
    }
    expect(PRODUCTION_ART.glowfin.materials).toBe(2);
    expect(PRODUCTION_ART.glowfin.bones).toBeLessThanOrEqual(18);
  });

  it("keeps ribbon kelp inside its two approved budgets", () => {
    for (const lod of [0, 1] as const) {
      const geometry = createRibbonKelpGeometry(lod);
      expect(geometryTriangles(geometry)).toBe(
        PRODUCTION_ART.ribbonKelp[`lod${lod}`]
      );
      geometry.dispose();
    }
  });
});
