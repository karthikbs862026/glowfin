import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import { PRODUCTION_ART } from "../src/art/productionManifest";
import {
  classifyMerfolkMaskPixel,
  MERFOLK_MASK_ENTRIES,
  merfolkMaskColourChannels
} from "../src/art/merfolkMask";
import {
  createGateFoundationGeometry
} from "../src/render/moonGardenGeometry";
import {
  createProductionAnemone,
  createProductionBrainCoral,
  createProductionBranchCoral,
  createProductionCollapsedArch,
  createProductionFanCoral,
  createProductionGateCanopyGeometry,
  createProductionKelp,
  createProductionMerfolkCitizen,
  createProductionMerfolkCitizenParts,
  createProductionMerfolkConchHerald,
  createProductionMerfolkConchHeraldParts,
  createProductionMerfolkGuardian,
  createProductionMerfolkMonument,
  createProductionMerfolkSwimmer,
  createProductionMerfolkSwimmerParts,
  createProductionObservatory,
  createProductionPalaceDistrict,
  createProductionSkyline,
  createProductionSpire,
  createProductionTableCoral,
  createProductionTideSpear,
  createProductionConchFountain,
  createProductionTower,
  createProductionWallGeometry,
  productionTriangles
} from "../src/render/productionGeometry";
import { createGlowfinRigGeometry } from "../src/render/glowfinGeometry";
import { contourWorldWidth, MoonGardenGates } from "../src/render/gateArt";

describe("Phase 3B art geometry inventory", () => {
  it("round-trips every merfolk feature through raw semantic mask bytes", () => {
    for (const entry of MERFOLK_MASK_ENTRIES) {
      const channels = merfolkMaskColourChannels(entry.colour).map((value) =>
        Math.round(value * 255)
      );
      expect(classifyMerfolkMaskPixel(
        channels[0] ?? 0,
        channels[1] ?? 0,
        channels[2] ?? 0
      )).toBe(entry.id);
    }
  });

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
        "palaceDistrict",
        (lod: 0 | 1 | 2) => createProductionPalaceDistrict(lod)
      ],
      [
        "observatory",
        (lod: 0 | 1 | 2) => createProductionObservatory(lod)
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
        "brainCoral",
        (lod: 0 | 1 | 2) => createProductionBrainCoral(lod)
      ],
      [
        "tableCoral",
        (lod: 0 | 1 | 2) => createProductionTableCoral(lod)
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
      for (const variant of [0, 1, 2, 3, 4] as const) {
        const left = createProductionWallGeometry(lod, 1, variant);
        const right = createProductionWallGeometry(lod, -1, variant);
        left.computeBoundingBox();
        right.computeBoundingBox();
        expect(left.boundingBox?.max.x).toBeCloseTo(0.5, 6);
        expect(right.boundingBox?.min.x).toBeCloseTo(-0.5, 6);
        signatures.add([
          productionTriangles(left),
          left.boundingBox?.max.y.toFixed(4)
        ].join(":"));
        left.dispose();
        right.dispose();
      }
      expect(signatures.size).toBe(5);
    }
  });

  it("gives the hero arch a continuous supported silhouette", () => {
    for (const lod of [0, 1, 2] as const) {
      for (const variant of [0, 1, 2, 3] as const) {
        const canopy = createProductionGateCanopyGeometry(lod, variant);
        canopy.computeBoundingBox();
        expect(canopy.boundingBox?.min.x).toBeLessThanOrEqual(-0.6);
        expect(canopy.boundingBox?.max.x).toBeGreaterThanOrEqual(0.6);
        expect(canopy.boundingBox?.min.y).toBeLessThan(0);
        expect(canopy.boundingBox?.max.y).toBeGreaterThan(0.4);
        canopy.dispose();
      }
      const observatory = createProductionGateCanopyGeometry(lod, 4);
      observatory.computeBoundingBox();
      expect(observatory.boundingBox?.max.x).toBeLessThan(0.01);
      observatory.dispose();
    }
  });

  it("keeps the Nacre Palace as a layered shell court, not a giant dome", () => {
    for (const lod of [0, 1, 2] as const) {
      const palace = createProductionGateCanopyGeometry(lod, 3);
      palace.computeBoundingBox();
      expect(palace.boundingBox?.max.y).toBeLessThan(0.7);
      expect(palace.boundingBox?.max.x).toBeGreaterThanOrEqual(0.6);
      expect(palace.boundingBox?.min.x).toBeLessThanOrEqual(-0.6);
      palace.dispose();
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
    expect(context).toHaveLength(46);
    expect(maskHidden).toHaveLength(0);
    gates.dispose();
  });

  it("budgets visible moonfolk and ceremonial props as volumetric production art", () => {
    const assets = [
      [createProductionMerfolkGuardian(), PRODUCTION_ART.moonfolkGuardian.lod0],
      [createProductionMerfolkCitizen(), PRODUCTION_ART.moonfolkCitizen.lod0],
      [createProductionMerfolkSwimmer(), PRODUCTION_ART.moonfolkSwimmer.lod0],
      [
        createProductionMerfolkConchHerald(),
        PRODUCTION_ART.merfolkConchHerald.lod0
      ],
      [createProductionMerfolkMonument(), PRODUCTION_ART.merfolkMonument.lod0],
      [createProductionTideSpear(), PRODUCTION_ART.tideSpear.lod0],
      [createProductionConchFountain(), PRODUCTION_ART.conchFountain.lod0]
    ] as const;
    for (const [geometry, triangles] of assets) {
      expect(productionTriangles(geometry)).toBe(triangles);
      expect(geometry.hasAttribute("materialRole")).toBe(true);
      geometry.dispose();
    }
  });

  it("keeps every live population role faced and semantically distinct", () => {
    const roles = [
      [createProductionMerfolkCitizen(), "reef-citizen"],
      [createProductionMerfolkSwimmer(), "current-swimmer"],
      [createProductionMerfolkConchHerald(), "conch-herald"]
    ] as const;
    for (const [geometry, role] of roles) {
      expect(geometry.userData["populationRole"]).toBe(role);
      expect(geometry.userData["facialFeatures"]).toBe(
        "warm-face-eye-white-pupil-highlight-smile-cheeks"
      );
      expect(geometry.userData["faceOrientation"]).toBe("screen-upright");
      if (role === "conch-herald") {
        expect(geometry.userData["ceremonialProp"]).toBe("spiral-conch");
      }
      geometry.dispose();
    }
  });

  it("keeps every population face and eye plane independently renderable", () => {
    const roles = [
      [createProductionMerfolkCitizenParts(), "reef-citizen"],
      [createProductionMerfolkSwimmerParts(), "current-swimmer"],
      [createProductionMerfolkConchHeraldParts(), "conch-herald"]
    ] as const;
    for (const [parts, role] of roles) {
      expect(parts.body.userData["populationRole"]).toBe(role);
      expect(parts.face.userData["populationFeature"]).toBe("friendly-face");
      expect(parts.eyes.userData["populationFeature"]).toBe("expressive-eyes");
      for (const geometry of [parts.body, parts.face, parts.eyes]) {
        expect(geometry.hasAttribute("materialRole")).toBe(true);
        expect(productionTriangles(geometry)).toBeGreaterThan(0);
        geometry.dispose();
      }
    }
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

  it("keeps the six clean reference gill leaves and centered rear tail", () => {
    const rig = createGlowfinRigGeometry(tuning, 0);
    const radius = tuning.lane.creatureRadius;
    expect(rig.pivots.gills).toHaveLength(6);
    for (const side of [-1, 1]) {
      const fan = rig.pivots.gills.filter((pivot) =>
        Math.sign(pivot.x) === side
      );
      expect(fan).toHaveLength(3);
      const heights = fan.map((pivot) => pivot.y).sort((a, b) => b - a);
      expect((heights[0] ?? 0) - (heights[1] ?? 0)).toBeGreaterThanOrEqual(
        radius * 0.18
      );
      expect((heights[1] ?? 0) - (heights[2] ?? 0)).toBeGreaterThanOrEqual(
        radius * 0.18
      );
      expect(Math.min(...heights)).toBeGreaterThan(radius * 0.2);
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
