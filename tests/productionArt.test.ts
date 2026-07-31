import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import { PRODUCTION_ART } from "../src/art/productionManifest";
import {
  createGateFoundationGeometry
} from "../src/render/moonGardenGeometry";
import {
  createProductionAnemone,
  createProductionBranchCoral,
  createProductionCollapsedArch,
  createProductionFanCoral,
  createProductionGateCanopyGeometry,
  createProductionKelp,
  createProductionSkyline,
  createProductionSpire,
  createProductionTower,
  createProductionWallGeometry,
  productionTriangles
} from "../src/render/productionGeometry";
import { createGlowfinRigGeometry } from "../src/render/glowfinGeometry";
import { contourWorldWidth, MoonGardenGates } from "../src/render/gateArt";

describe("Phase 3B art geometry inventory", () => {
  it("records every generated prototype and production LOD exactly", () => {
    const families = [
      [
        "wallFragment",
        (lod: 0 | 1 | 2) => createProductionWallGeometry(lod, 1, 0)
      ],
      [
        "brokenTower",
        (lod: 0 | 1 | 2) => createProductionTower(lod)
      ],
      [
        "collapsedArch",
        (lod: 0 | 1 | 2) => createProductionCollapsedArch(lod)
      ],
      [
        "spire",
        (lod: 0 | 1 | 2) => createProductionSpire(lod)
      ],
      [
        "mediumCoral",
        (lod: 0 | 1 | 2) => createProductionBranchCoral(lod)
      ],
      [
        "heroCoral",
        (lod: 0 | 1 | 2) => createProductionAnemone(lod)
      ],
      [
        "shellGarden",
        (lod: 0 | 1 | 2) => createProductionFanCoral(lod)
      ],
      [
        "gateFoundation",
        (lod: 0 | 1 | 2) => createGateFoundationGeometry(lod)
      ]
    ] as const;

    for (const [family, create] of families) {
      for (const lod of [0, 1, 2] as const) {
        const geometry = create(lod);
        expect(productionTriangles(geometry)).toBe(
          PRODUCTION_ART[family][`lod${lod}`]
        );
        geometry.dispose();
      }
    }
  });

  it("keeps every wall LOD on the exact straight playable plane", () => {
    for (const lod of [0, 1, 2] as const) {
      const signatures = new Set<string>();
      for (const variant of [0, 1, 2] as const) {
        const left = createProductionWallGeometry(lod, 1, variant);
        const right = createProductionWallGeometry(lod, -1, variant);
        left.computeBoundingBox();
        right.computeBoundingBox();
        expect(left.boundingBox?.max.x).toBeCloseTo(0.5, 6);
        expect(right.boundingBox?.min.x).toBeCloseTo(-0.5, 6);
        const positions = left.getAttribute("position");
        signatures.add(Array.from({ length: Math.min(24, positions.count) }, (_, index) =>
          positions.getY(index).toFixed(4)
        ).join(","));
        left.dispose();
        right.dispose();
      }
      expect(signatures.size).toBe(3);
    }
  });

  it("gives the hero arch a continuous supported silhouette", () => {
    for (const lod of [0, 1, 2] as const) {
      const canopy = createProductionGateCanopyGeometry(lod);
      canopy.computeBoundingBox();
      expect(canopy.boundingBox?.min.x).toBeLessThanOrEqual(-0.7);
      expect(canopy.boundingBox?.max.x).toBeGreaterThanOrEqual(0.7);
      expect(canopy.boundingBox?.min.y).toBeLessThan(0);
      expect(canopy.boundingBox?.max.y).toBeGreaterThan(0.4);
      canopy.dispose();
    }
  });

  it("records the three-blade kelp cluster LODs exactly", () => {
    for (const lod of [0, 1] as const) {
      const geometry = createProductionKelp(lod);
      expect(productionTriangles(geometry)).toBe(
        PRODUCTION_ART.ribbonKelp[`lod${lod}`]
      );
      geometry.dispose();
    }
  });

  it("records the volumetric skyline cluster exactly", () => {
    const geometry = createProductionSkyline();
    expect(productionTriangles(geometry)).toBe(
      PRODUCTION_ART.skylineCluster.lod2
    );
    geometry.dispose();
  });

  it("measures the straight lane contour and classifies broken wall art as context", () => {
    const gates = new MoonGardenGates(tuning);
    const contours = gates.objects.filter((object) => object.userData["isObstacle"]);
    const context = gates.objects.filter((object) => object.userData["isObstacleContext"]);
    const maskHidden = gates.objects.filter((object) => object.userData["hideInArtMask"]);
    expect(contours).toHaveLength(1);
    expect(context).toHaveLength(22);
    expect(maskHidden).toHaveLength(0);
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

  it("keeps six separated external gills and a buried rear tail root", () => {
    const rig = createGlowfinRigGeometry(tuning, 0);
    const radius = tuning.lane.creatureRadius;
    expect(rig.pivots.gills).toHaveLength(6);
    for (const side of [-1, 1]) {
      const fan = rig.pivots.gills.filter((pivot) =>
        Math.sign(pivot.x) === side
      );
      expect(fan).toHaveLength(3);
      const heights = fan.map((pivot) => pivot.y).sort((a, b) => b - a);
      expect((heights[0] ?? 0) - (heights[1] ?? 0)).toBeGreaterThan(
        radius * 0.2
      );
      expect((heights[1] ?? 0) - (heights[2] ?? 0)).toBeGreaterThan(
        radius * 0.2
      );
    }
    expect(rig.pivots.tail.y).toBeLessThan(-radius * 0.5);
    expect(rig.pivots.tail.z).toBeGreaterThan(radius * 0.55);
    rig.body.dispose();
    rig.eyes.dispose();
  });

  it("keeps ribbon kelp inside its two approved budgets", () => {
    for (const lod of [0, 1] as const) {
      const geometry = createProductionKelp(lod);
      expect(productionTriangles(geometry)).toBe(
        PRODUCTION_ART.ribbonKelp[`lod${lod}`]
      );
      geometry.dispose();
    }
  });
});
