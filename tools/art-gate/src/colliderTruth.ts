/**
 * Collider-truth checks against independent runtime evidence.
 *
 * Art manifests describe only what the mesh looks like. Collider planes and
 * envelopes are supplied by the simulation path, so a copied or incorrect
 * manifest value cannot make an internally consistent lie pass.
 */

import type {
  AssetManifest,
  Finding,
  GateConfig,
  LodEntry,
  PlayableEdge,
  RangeBudget,
  RuntimeObstacle
} from "./types.ts";

function signedGapOffset(
  visualPlane: number,
  colliderPlane: number,
  gapDirection: 1 | -1
): number {
  return (visualPlane - colliderPlane) * gapDirection;
}
function sampleKey(height: number, depth: number): string {
  return `${height.toFixed(4)}|${depth.toFixed(4)}`;
}

function finding(
  code: string,
  message: string,
  asset: AssetManifest,
  rule: string,
  lod?: number,
  observed?: number | string,
  limit?: number | string
): Finding {
  return {
    code,
    severity: "blocker",
    asset: asset.name,
    lod,
    message,
    rule,
    observed,
    limit
  };
}

function checkContour(
  asset: AssetManifest,
  expectedCollidable: boolean,
  cfg: GateConfig["colliderTruth"]
): Finding[] {
  if (!cfg.contourReservedForCollidable) return [];

  if (expectedCollidable && asset.contour !== "collision-cyan") {
    return [finding(
      "CONTOUR_MISSING",
      "Runtime-collidable asset does not carry the straight pale-cyan gameplay contour.",
      asset,
      "Art Bible §6.5"
    )];
  }
  if (!expectedCollidable && asset.contour === "collision-cyan") {
    return [finding(
      "CONTOUR_ON_DECORATION",
      "Decorative asset uses the collision contour and teaches a false gameplay rule.",
      asset,
      "Art Bible §6.5 / §8"
    )];
  }
  return [];
}

function checkEdge(
  asset: AssetManifest,
  lod: LodEntry,
  edge: PlayableEdge,
  runtime: RuntimeObstacle,
  cfg: GateConfig["colliderTruth"]
): Finding[] {
  const findings: Finding[] = [];
  if (edge.axis !== runtime.axis) {
    findings.push(finding(
      "EDGE_AXIS_MISMATCH",
      `Visual edge uses ${edge.axis}; runtime collider uses ${runtime.axis}.`,
      asset,
      "Art Bible §6.5",
      lod.level
    ));
    return findings;
  }
  if (edge.gapDirection !== runtime.gapDirection) {
    findings.push(finding(
      "GAP_DIRECTION_MISMATCH",
      "Visual edge points toward the opposite safe side from the runtime collider.",
      asset,
      "Art Bible §6.5",
      lod.level
    ));
    return findings;
  }

  const tolerance = cfg.edgeAlignmentToleranceWorldUnits;
  let falseClearance = 0;
  let protrusion = 0;
  for (const sample of edge.samples) {
    const offset = signedGapOffset(
      sample.visualPlane,
      runtime.colliderPlane,
      runtime.gapDirection
    );
    falseClearance = Math.min(falseClearance, offset);
    protrusion = Math.max(protrusion, offset);
  }

  if (falseClearance < -tolerance && !cfg.allowFalseClearance) {
    findings.push(finding(
      "FALSE_CLEARANCE",
      `Visual edge recedes ${Math.abs(falseClearance).toFixed(3)} wu behind the authoritative runtime plane, showing clearance collision does not honour.`,
      asset,
      "Art Bible §6.5 — no implied extra clearance",
      lod.level,
      Number(Math.abs(falseClearance).toFixed(4)),
      tolerance
    ));
  }
  if (protrusion > tolerance && !cfg.allowGapProtrusion) {
    findings.push(finding(
      "GAP_PROTRUSION",
      `Visual edge extends ${protrusion.toFixed(3)} wu into the safe gap.`,
      asset,
      "Art Bible §6.5 — no decoration in playable gap",
      lod.level,
      Number(protrusion.toFixed(4)),
      tolerance
    ));
  }

  const planes = edge.samples.map((sample) => sample.visualPlane);
  const mean = planes.reduce((total, value) => total + value, 0) / planes.length;
  const deviation = Math.max(...planes.map((value) => Math.abs(value - mean)));
  if (deviation > cfg.straightnessToleranceWorldUnits) {
    findings.push(finding(
      "EDGE_NOT_STRAIGHT",
      `Gameplay-facing edge varies by ${deviation.toFixed(3)} wu; the runtime collider is one continuous plane.`,
      asset,
      "Art Bible §6.5 — one continuous straight contour",
      lod.level,
      Number(deviation.toFixed(4)),
      cfg.straightnessToleranceWorldUnits
    ));
  }
  return findings;
}

function checkLodSilhouettes(
  asset: AssetManifest,
  tolerance: number
): Finding[] {
  const findings: Finding[] = [];
  const ordered = [...asset.lods]
    .filter((lod): lod is LodEntry & { playableEdge: PlayableEdge } =>
      lod.playableEdge !== undefined
    )
    .sort((a, b) => a.level - b.level);
  const base = ordered[0];
  if (!base) return findings;

  const baseSamples = new Map(
    base.playableEdge.samples.map((sample) => [
      sampleKey(sample.height, sample.depth),
      sample.visualPlane
    ])
  );

  for (const lod of ordered.slice(1)) {
    const samples = new Map(
      lod.playableEdge.samples.map((sample) => [
        sampleKey(sample.height, sample.depth),
        sample.visualPlane
      ])
    );
    const missingFromLod = [...baseSamples.keys()].filter((key) => !samples.has(key));
    const extraInLod = [...samples.keys()].filter((key) => !baseSamples.has(key));
    if (missingFromLod.length > 0 || extraInLod.length > 0) {
      findings.push(finding(
        "LOD_SAMPLE_COVERAGE",
        `LOD${lod.level} sampling positions differ from LOD${base.level} (${missingFromLod.length} missing, ${extraInLod.length} extra). Silhouette invariance is unverified.`,
        asset,
        "Art Bible §6.5",
        lod.level
      ));
      continue;
    }

    let worst = 0;
    for (const [key, basePlane] of baseSamples) {
      worst = Math.max(worst, Math.abs((samples.get(key) ?? basePlane) - basePlane));
    }
    if (worst > tolerance) {
      findings.push(finding(
        "LOD_SILHOUETTE_DRIFT",
        `Playable edge shifts ${worst.toFixed(3)} wu at LOD${lod.level}.`,
        asset,
        "Art Bible §6.5 — LOD never changes playable silhouette",
        lod.level,
        Number(worst.toFixed(4)),
        tolerance
      ));
    }
  }
  return findings;
}

function checkRelief(
  asset: AssetManifest,
  runtime: RuntimeObstacle
): Finding[] {
  if (asset.maxReliefDepth === undefined) return [];
  const dimensions = runtime.colliderEnvelope.max.map(
    (value, index) => value - runtime.colliderEnvelope.min[index]!
  );
  if (dimensions.some((dimension) => dimension < 0)) {
    return [finding(
      "INVALID_RUNTIME_ENVELOPE",
      "Authoritative runtime collider envelope is inverted.",
      asset,
      "Runtime collision evidence"
    )];
  }
  const positive = dimensions.filter((dimension) => dimension > 0);
  const thickness = Math.min(...positive);
  if (!Number.isFinite(thickness) || asset.maxReliefDepth > thickness) {
    return [finding(
      "RELIEF_OUTSIDE_ENVELOPE",
      "Declared relief can cut through the authoritative runtime collision envelope.",
      asset,
      "Art Bible §6.5",
      undefined,
      asset.maxReliefDepth,
      Number.isFinite(thickness) ? thickness : 0
    )];
  }
  return [];
}

export function checkAssetColliderTruth(
  asset: AssetManifest,
  family: RangeBudget,
  runtimeById: ReadonlyMap<string, RuntimeObstacle>,
  cfg: GateConfig
): Finding[] {
  const findings: Finding[] = [];
  const expectedCollidable = family.collidable;

  if (asset.collidable !== expectedCollidable) {
    findings.push(finding(
      "COLLIDABLE_ROLE_MISMATCH",
      `Manifest declares collidable=${asset.collidable}, but family "${asset.family}" is configured collidable=${expectedCollidable}. Family policy is authoritative.`,
      asset,
      "Art Bible §10 asset-family policy"
    ));
  }
  findings.push(...checkContour(asset, expectedCollidable, cfg.colliderTruth));

  if (!expectedCollidable) {
    if (asset.runtimeObstacleId) {
      findings.push(finding(
        "DECORATION_LINKED_TO_COLLIDER",
        "Non-collidable family links itself to a runtime collider.",
        asset,
        "Art Bible §6.5"
      ));
    }
    return findings;
  }

  if (!asset.runtimeObstacleId) {
    findings.push(finding(
      "RUNTIME_COLLIDER_LINK_MISSING",
      "Collidable family has no runtimeObstacleId; visual truth cannot be compared with gameplay truth.",
      asset,
      "Art Bible §11 step 8"
    ));
    return findings;
  }
  const runtime = runtimeById.get(asset.runtimeObstacleId);
  if (!runtime) {
    findings.push(finding(
      "RUNTIME_COLLIDER_NOT_FOUND",
      `No authoritative runtime obstacle named "${asset.runtimeObstacleId}" was supplied.`,
      asset,
      "Art Bible §11 step 8"
    ));
    return findings;
  }
  if (runtime.family !== asset.family) {
    findings.push(finding(
      "RUNTIME_COLLIDER_FAMILY_MISMATCH",
      `Runtime obstacle belongs to "${runtime.family}", not "${asset.family}".`,
      asset,
      "Art Bible §11 step 8"
    ));
  }

  for (const lod of asset.lods) {
    if (!lod.playableEdge) {
      findings.push(finding(
        "EDGE_MISSING",
        "Collidable LOD has no playable-edge samples.",
        asset,
        "Art Bible §6.5",
        lod.level
      ));
      continue;
    }
    findings.push(...checkEdge(asset, lod, lod.playableEdge, runtime, cfg.colliderTruth));
  }
  findings.push(...checkLodSilhouettes(
    asset,
    cfg.lod.silhouetteToleranceWorldUnits
  ));
  findings.push(...checkRelief(asset, runtime));
  return findings;
}
