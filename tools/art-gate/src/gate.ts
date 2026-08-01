/**
 * Phase 3A gate orchestrator.
 */

import { checkAssetColliderTruth } from "./colliderTruth.ts";
import {
  analyseReaction,
  checkAssetBudget,
  checkCapture,
  checkCaptureCoverage,
  checkCreature,
  checkMerfolk,
  checkPayload,
  checkReaction,
  checkTierSignoff,
  checkTrail,
  checkWorldQuality
} from "./checks.ts";
import type {
  Finding,
  GateConfig,
  RuntimeObstacle
} from "./types.ts";
import {
  validateGateConfig,
  validateGateInput
} from "./validation.ts";

export interface GateResult {
  passed: boolean;
  tier: string;
  findings: Finding[];
  counts: { blocker: number; warning: number; info: number };
  reaction: ReturnType<typeof analyseReaction>;
}

function finish(
  findings: Finding[],
  cfg: GateConfig,
  tier: string
): GateResult {
  const counts = {
    blocker: findings.filter((finding) => finding.severity === "blocker").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length
  };
  return {
    passed: counts.blocker === 0,
    tier,
    findings,
    counts,
    reaction: analyseReaction(cfg)
  };
}

export function runGate(
  rawInput: unknown,
  rawConfig: unknown,
  tierName: string
): GateResult {
  const configFindings = validateGateConfig(rawConfig);
  if (configFindings.length > 0) {
    return {
      passed: false,
      tier: tierName,
      findings: configFindings,
      counts: {
        blocker: configFindings.length,
        warning: 0,
        info: 0
      },
      reaction: {
        reactionDistanceWorldUnits: 0,
        totalLeadTimeMs: 0,
        decisionLod: null
      }
    };
  }

  const cfg = rawConfig as GateConfig;
  const tier = cfg.captureTiers[tierName];
  if (!tier) {
    return finish([{
      code: "UNKNOWN_CAPTURE_TIER",
      severity: "blocker",
      message: `Capture tier "${tierName}" is not configured.`,
      rule: "Phase 3A CI tiering"
    }], cfg, tierName);
  }

  const validation = validateGateInput(rawInput, cfg);
  const findings = [...validation.findings];
  if (!validation.input || findings.some((finding) => finding.severity === "blocker")) {
    return finish(findings, cfg, tierName);
  }
  const input = validation.input;

  if (input.assets.length === 0) {
    findings.push({
      code: "NO_ASSET_MANIFESTS",
      severity: "blocker",
      message: "No asset manifests were supplied.",
      rule: "Art Bible §11 step 8"
    });
  }

  const runtimeById = new Map<string, RuntimeObstacle>();
  for (const runtime of input.runtimeObstacles) {
    if (runtimeById.has(runtime.id)) {
      findings.push({
        code: "DUPLICATE_RUNTIME_COLLIDER",
        severity: "blocker",
        message: `Runtime collider id "${runtime.id}" appears more than once.`,
        rule: "Authoritative runtime collision evidence"
      });
      continue;
    }
    runtimeById.set(runtime.id, runtime);
    if (runtime.source.runtimeRevision !== input.runtimeRevision) {
      findings.push({
        code: "RUNTIME_REVISION_MISMATCH",
        severity: "blocker",
        message:
          `${runtime.id} was measured at ${runtime.source.runtimeRevision}, ` +
          `but input declares ${input.runtimeRevision}.`,
        rule: "Phase 3A runtime integration"
      });
    }
  }

  for (const asset of input.assets) {
    const family = cfg.assetFamilies[asset.family];
    if (!family) {
      findings.push({
        code: "UNKNOWN_FAMILY",
        severity: "blocker",
        asset: asset.name,
        message: `No approved budget exists for family "${asset.family}".`,
        rule: "Art Bible §10"
      });
      continue;
    }
    if (
      asset.baselineProcedural &&
      tierName === "signoff"
    ) {
      findings.push({
        code: "PROCEDURAL_BASELINE_NOT_RELEASEABLE",
        severity: "blocker",
        asset: asset.name,
        message:
          "Primitive Phase 3A baseline evidence cannot satisfy full or release art validation.",
        rule: "Phase 3A scope boundary"
      });
    }
    findings.push(...checkAssetBudget(asset, family));
    findings.push(...checkCreature(asset, cfg.creature));
    findings.push(...checkMerfolk(asset, cfg.merfolk));
    findings.push(...checkAssetColliderTruth(
      asset,
      family,
      runtimeById,
      cfg
    ));
  }

  findings.push(...checkTrail(input, cfg.trail));
  findings.push(...checkWorldQuality(input, cfg.worldQuality));
  findings.push(...checkCaptureCoverage(input.captures, tierName, tier));
  for (const capture of input.captures) {
    findings.push(...checkCapture(capture, cfg));
  }
  findings.push(...checkPayload(input, tier, cfg));
  findings.push(...checkReaction(cfg));
  findings.push(...checkTierSignoff(input, tierName, tier, cfg));

  return finish(findings, cfg, tierName);
}

const LABEL: Record<Finding["severity"], string> = {
  blocker: "FAIL",
  warning: "WARN",
  info: "INFO"
};

export function formatReport(result: GateResult, cfg: GateConfig): string {
  const lines = [
    "Glowfin production art gate",
    `tier ${result.tier} · config ${cfg.configVersion}`,
    "",
    "Reaction window at maximum momentum",
    `  lead time       ${result.reaction.totalLeadTimeMs.toFixed(0)} ms`,
    `  decision point  ${result.reaction.reactionDistanceWorldUnits.toFixed(1)} wu ` +
      `(LOD${result.reaction.decisionLod ?? "?"})`,
    ""
  ];

  for (const severity of ["blocker", "warning", "info"] as const) {
    const group = result.findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    lines.push(`${severity.toUpperCase()} (${group.length})`);
    for (const finding of group) {
      const target = [
        finding.asset,
        finding.lod === undefined ? undefined : `LOD${finding.lod}`
      ].filter(Boolean).join(" ");
      lines.push(
        `  [${LABEL[severity]}] ${finding.code}${target ? ` — ${target}` : ""}`
      );
      lines.push(`        ${finding.message}`);
      if (finding.observed !== undefined) {
        lines.push(
          `        observed ${finding.observed}` +
          (finding.limit !== undefined ? `, limit ${finding.limit}` : "")
        );
      }
      lines.push(`        rule: ${finding.rule}`);
    }
    lines.push("");
  }
  lines.push(
    result.passed
      ? `PASS — ${result.counts.warning} warning(s), 0 blockers.`
      : `FAIL — ${result.counts.blocker} blocker(s), ` +
        `${result.counts.warning} warning(s).`
  );
  return lines.join("\n");
}
