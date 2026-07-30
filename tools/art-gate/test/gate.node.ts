import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import {
  checkCapture,
  checkCreature,
  checkTrail,
  percentile
} from "../src/checks.ts";
import { checkAssetColliderTruth } from "../src/colliderTruth.ts";
import { runGate } from "../src/gate.ts";
import type {
  AssetManifest,
  GateConfig,
  GateInput,
  RuntimeObstacle,
  SceneCapture
} from "../src/types.ts";
import {
  validateAssetManifest,
  validateGateConfig
} from "../src/validation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(
  join(here, "../config/art-budgets.json"),
  "utf8"
)) as GateConfig;
const load = (name: string): GateInput => JSON.parse(readFileSync(
  join(here, `../fixtures/${name}`),
  "utf8"
)) as GateInput;
const codes = (items: { code: string }[]) => items.map((item) => item.code);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("integrated gate fixtures", () => {
  test("current procedural baseline passes the structural tier", () => {
    const result = runGate(load("gate-input.pass.json"), config, "structural");
    assert.equal(result.passed, true);
    assert.equal(result.counts.blocker, 0);
  });

  test("fast fixture passes with the exact reduced matrix", () => {
    const result = runGate(load("gate-input.pass.json"), config, "fast");
    assert.equal(result.passed, true);
  });

  test("known crescent and bypass fixture is rejected", () => {
    const result = runGate(load("gate-input.reject.json"), config, "fast");
    const found = new Set(codes(result.findings));
    assert.equal(result.passed, false);
    for (const expected of [
      "COLLIDABLE_ROLE_MISMATCH",
      "FALSE_CLEARANCE",
      "EDGE_NOT_STRAIGHT",
      "OBSTACLE_CONTRAST_BELOW_FLOOR"
    ]) assert.ok(found.has(expected), `missing ${expected}`);
  });

  test("procedural baseline cannot masquerade as release art", () => {
    const result = runGate(load("gate-input.pass.json"), config, "signoff");
    assert.ok(codes(result.findings).includes("PROCEDURAL_BASELINE_NOT_RELEASEABLE"));
  });
});

describe("collider authority hardening", () => {
  test("family policy defeats collidable:false bypass", () => {
    const input = load("gate-input.pass.json");
    input.assets[0]!.collidable = false;
    const result = runGate(input, config, "structural");
    assert.ok(codes(result.findings).includes("COLLIDABLE_ROLE_MISMATCH"));
  });

  test("manifest cannot supply its own collider plane", () => {
    const asset = clone(load("gate-input.pass.json").assets[0]!);
    const edge = asset.lods[0]!.playableEdge as unknown as Record<string, unknown>;
    edge.colliderPlane = -2;
    assert.ok(codes(validateAssetManifest(
      asset,
      config.colliderTruth.minimumSamplesPerEdge
    )).includes("MANIFEST_EMBEDS_COLLIDER_TRUTH"));
  });

  test("wrong independent runtime plane produces false clearance", () => {
    const input = load("gate-input.pass.json");
    input.runtimeObstacles[0]!.colliderPlane = -1.5;
    const result = runGate(input, config, "structural");
    assert.ok(codes(result.findings).includes("FALSE_CLEARANCE"));
  });

  test("missing runtime link blocks", () => {
    const input = load("gate-input.pass.json");
    delete input.assets[0]!.runtimeObstacleId;
    const result = runGate(input, config, "structural");
    assert.ok(codes(result.findings).includes("RUNTIME_COLLIDER_LINK_MISSING"));
  });

  test("unknown runtime id blocks", () => {
    const input = load("gate-input.pass.json");
    input.assets[0]!.runtimeObstacleId = "invented";
    const result = runGate(input, config, "structural");
    assert.ok(codes(result.findings).includes("RUNTIME_COLLIDER_NOT_FOUND"));
  });

  test("runtime revision mismatch blocks stale evidence", () => {
    const input = load("gate-input.pass.json");
    input.runtimeObstacles[0]!.source.runtimeRevision = "old";
    const result = runGate(input, config, "structural");
    assert.ok(codes(result.findings).includes("RUNTIME_REVISION_MISMATCH"));
  });

  test("invalid edge axis is rejected structurally", () => {
    const asset = clone(load("gate-input.pass.json").assets[0]!);
    (asset.lods[0]!.playableEdge as unknown as { axis: string }).axis = "sideways";
    assert.ok(validateAssetManifest(
      asset,
      config.colliderTruth.minimumSamplesPerEdge
    ).length > 0);
  });

  test("too few edge samples block", () => {
    const asset = clone(load("gate-input.pass.json").assets[0]!);
    asset.lods[0]!.playableEdge!.samples =
      asset.lods[0]!.playableEdge!.samples.slice(0, 1);
    assert.ok(codes(validateAssetManifest(
      asset,
      config.colliderTruth.minimumSamplesPerEdge
    )).includes("EDGE_SAMPLE_COVERAGE"));
  });

  test("LOD sample positions must match in both directions", () => {
    const asset = clone(load("gate-input.pass.json").assets[0]!);
    asset.baselineProcedural = false;
    const lod0 = asset.lods[0]!;
    asset.lods = [
      lod0,
      {
        level: 1,
        triangles: 600,
        playableEdge: {
          ...clone(lod0.playableEdge!),
          samples: clone(lod0.playableEdge!.samples).slice(0, 4)
        }
      },
      {
        level: 2,
        triangles: 200,
        playableEdge: clone(lod0.playableEdge!)
      }
    ];
    const runtime = load("gate-input.pass.json").runtimeObstacles[0]!;
    const found = checkAssetColliderTruth(
      asset,
      config.assetFamilies.wallFragment!,
      new Map([[runtime.id, runtime]]),
      config
    );
    assert.ok(codes(found).includes("LOD_SAMPLE_COVERAGE"));
  });
});

describe("manifest completeness", () => {
  const completeCreature = (): AssetManifest => ({
    name: "glowfin-production",
    family: "glowfin",
    collidable: false,
    materials: 2,
    textureMemoryMB: 2,
    bones: 16,
    maxTextureSizePx: 1024,
    clips: ["breathe", "propulsion", "bank", "collisionSquash", "recovery"],
    observedStates: ["calm", "mid", "max", "collision", "recovery"],
    animationDriver: "simulation",
    viewportWidthFraction: 0.09,
    eyeGlowPixels: 5,
    lods: [
      { level: 0, triangles: 7000 },
      { level: 1, triangles: 3500 }
    ]
  });

  test("complete creature evidence passes", () => {
    assert.deepEqual(checkCreature(completeCreature(), config.creature), []);
  });

  for (const [field, expected] of [
    ["bones", "BONE_COUNT_NOT_MEASURED"],
    ["maxTextureSizePx", "TEXTURE_SIZE_NOT_MEASURED"],
    ["viewportWidthFraction", "CREATURE_SCREEN_SIZE_NOT_MEASURED"],
    ["eyeGlowPixels", "EYE_GLOW_SIZE_NOT_MEASURED"],
    ["animationDriver", "ANIMATION_DRIVER_NOT_DECLARED"]
  ] as const) {
    test(`missing ${field} blocks`, () => {
      const asset = completeCreature() as unknown as Record<string, unknown>;
      delete asset[field];
      assert.ok(codes(checkCreature(
        asset as unknown as AssetManifest,
        config.creature
      )).includes(expected));
    });
  }

  test("missing observed state blocks", () => {
    const asset = completeCreature();
    asset.observedStates = ["calm"];
    assert.ok(codes(checkCreature(asset, config.creature))
      .includes("CREATURE_STATES_MISSING"));
  });

  test("production family must include every budgeted LOD", () => {
    const input = load("gate-input.pass.json");
    input.assets[0]!.baselineProcedural = false;
    const result = runGate(input, config, "structural");
    assert.ok(codes(result.findings).includes("LOD_REQUIRED_MISSING"));
  });
});

describe("capture evidence cannot pass by omission", () => {
  const baseCapture = (): SceneCapture =>
    clone(load("gate-input.pass.json").captures[0]!);

  test("no captures block fast tier", () => {
    const input = load("gate-input.pass.json");
    input.captures = [];
    assert.ok(codes(runGate(input, config, "fast").findings).includes("NO_CAPTURES"));
  });

  test("partial fast matrix blocks", () => {
    const input = load("gate-input.pass.json");
    input.captures = input.captures.slice(0, 1);
    assert.ok(codes(runGate(input, config, "fast").findings)
      .includes("MATRIX_COVERAGE_INCOMPLETE"));
  });

  test("duplicate state blocks", () => {
    const input = load("gate-input.pass.json");
    input.captures.push(clone(input.captures[0]!));
    assert.ok(codes(runGate(input, config, "fast").findings)
      .includes("DUPLICATE_CAPTURE_STATE"));
  });

  test("no obstacle samples are a blocker", () => {
    const capture = baseCapture();
    capture.obstacles = [];
    assert.ok(codes(checkCapture(capture, config)).includes("NO_OBSTACLES_SAMPLED"));
  });

  test("invalid contrast number blocks", () => {
    const capture = baseCapture();
    capture.frameContrastRatios = [Number.NaN];
    assert.ok(codes(checkCapture(capture, config)).includes("CONTRAST_NOT_SAMPLED"));
  });

  test("one low-contrast obstacle fails inside passing frame", () => {
    const capture = baseCapture();
    capture.frameContrastRatios = Array.from({ length: 20 }, () => 5);
    capture.obstacles[0]!.ratios = Array.from({ length: 20 }, () => 1.7);
    const found = codes(checkCapture(capture, config));
    assert.ok(!found.includes("FRAME_CONTRAST_BELOW_FLOOR"));
    assert.ok(found.includes("OBSTACLE_CONTRAST_BELOW_FLOOR"));
  });

  test("CI emulation cannot satisfy sign-off source policy", () => {
    const input = load("gate-input.pass.json");
    const result = runGate(input, config, "signoff");
    assert.ok(codes(result.findings).includes("CAPTURE_SOURCE_NOT_ACCEPTED"));
    assert.ok(codes(result.findings).includes("REAL_DEVICE_EVIDENCE_REQUIRED"));
  });

  test("missing performance evidence blocks sign-off", () => {
    const input = load("gate-input.pass.json");
    const result = runGate(input, config, "signoff");
    assert.ok(codes(result.findings).includes("PERFORMANCE_EVIDENCE_MISSING"));
  });
});

describe("trail and numeric helpers", () => {
  test("trail width and implementation are enforced", () => {
    const input = load("gate-input.pass.json");
    input.renderEvidence.trail.laneWidthFractionAtMaxMomentum = 0.4;
    input.renderEvidence.trail.implementation = "particles";
    const found = codes(checkTrail(input, config.trail));
    assert.ok(found.includes("TRAIL_TOO_WIDE"));
    assert.ok(found.includes("TRAIL_IMPLEMENTATION_MISMATCH"));
  });

  test("percentile is deterministic", () => {
    assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  });
});

describe("config validation", () => {
  test("shipped config is structurally complete", () => {
    assert.deepEqual(validateGateConfig(config), []);
  });

  test("missing threshold blocks instead of disabling a check", () => {
    const bad = clone(config) as unknown as Record<string, unknown>;
    const scene = bad.scene as Record<string, unknown>;
    const drawCalls = scene.drawCalls as Record<string, unknown>;
    delete drawCalls.hard;
    assert.ok(codes(validateGateConfig(bad)).includes("CONFIG_MALFORMED"));
  });
});

describe("direct collider API", () => {
  test("decoration cannot claim runtime obstacle id", () => {
    const asset: AssetManifest = {
      name: "spire",
      family: "spire",
      collidable: false,
      runtimeObstacleId: "procedural-gate-left",
      materials: 1,
      textureMemoryMB: 0,
      lods: [{ level: 0, triangles: 1700 }]
    };
    const runtime = load("gate-input.pass.json").runtimeObstacles[0] as RuntimeObstacle;
    const findings = checkAssetColliderTruth(
      asset,
      config.assetFamilies.spire!,
      new Map([[runtime.id, runtime]]),
      config
    );
    assert.ok(codes(findings).includes("DECORATION_LINKED_TO_COLLIDER"));
  });
});
