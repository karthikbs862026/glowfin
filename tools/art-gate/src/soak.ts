import type { Finding } from "./types.ts";

export interface RendererResourceEvidence {
  geometries: number;
  textures: number;
}

export interface RendererSoakEvidence {
  evidenceVersion: string;
  runtimeRevision: string;
  source: {
    kind: "ci-emulated";
    browser: string;
    platform: string;
  };
  simulatedMinutes: number;
  renderFps: number;
  renderedFrames: number;
  wallClockSeconds: number;
  simulation: {
    elapsedSeconds: number;
    forwardDistance: number;
    remainingGates: number;
  };
  memory: {
    baselineHeapMB: number;
    endHeapMB: number;
    peakHeapMB: number;
    growthHeapMB: number;
  };
  renderer: {
    gpu: string;
    contextLosses: number;
    maxDrawCalls: number;
    maxTriangles: number;
    baselineResources: RendererResourceEvidence;
    peakResources: RendererResourceEvidence;
    endResources: RendererResourceEvidence;
  };
  peakPools: {
    gates: number;
    stripes: number;
    trailSegments: number;
    particles: number;
  };
}

export interface RendererSoakLimits {
  minimumSimulatedMinutes: number;
  maxSteadyStateHeapMB: number;
  maxHeapGrowthMB: number;
  maxDrawCalls: number;
  maxTriangles: number;
  maxPools: RendererSoakEvidence["peakPools"];
}

function blocker(
  code: string,
  message: string,
  observed?: number,
  limit?: number
): Finding {
  return {
    code,
    severity: "blocker",
    message,
    rule: "Phase 3B deterministic CI renderer soak",
    observed,
    limit
  };
}

function finite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function checkRendererSoak(
  evidence: RendererSoakEvidence,
  limits: RendererSoakLimits
): Finding[] {
  const findings: Finding[] = [];
  const numeric = [
    evidence.simulatedMinutes,
    evidence.renderFps,
    evidence.renderedFrames,
    evidence.wallClockSeconds,
    evidence.simulation.elapsedSeconds,
    evidence.simulation.forwardDistance,
    evidence.simulation.remainingGates,
    evidence.memory.baselineHeapMB,
    evidence.memory.endHeapMB,
    evidence.memory.peakHeapMB,
    evidence.memory.growthHeapMB,
    evidence.renderer.contextLosses,
    evidence.renderer.maxDrawCalls,
    evidence.renderer.maxTriangles,
    evidence.renderer.baselineResources.geometries,
    evidence.renderer.baselineResources.textures,
    evidence.renderer.peakResources.geometries,
    evidence.renderer.peakResources.textures,
    evidence.renderer.endResources.geometries,
    evidence.renderer.endResources.textures,
    ...Object.values(evidence.peakPools)
  ];
  if (!numeric.every(finite)) {
    return [blocker("SOAK_EVIDENCE_MALFORMED", "Soak evidence contains a missing or invalid number.")];
  }

  if (evidence.source.kind !== "ci-emulated") {
    findings.push(blocker(
      "SOAK_SOURCE_MALFORMED",
      "The deterministic desktop soak must identify itself as CI-emulated evidence."
    ));
  }
  if (evidence.simulatedMinutes < limits.minimumSimulatedMinutes) {
    findings.push(blocker(
      "SOAK_DURATION_INSUFFICIENT",
      "The renderer did not cover the required simulated duration.",
      evidence.simulatedMinutes,
      limits.minimumSimulatedMinutes
    ));
  }
  const expectedFrames = Math.floor(
    evidence.simulatedMinutes * 60 * evidence.renderFps
  );
  if (evidence.renderedFrames < expectedFrames) {
    findings.push(blocker(
      "SOAK_RENDER_COVERAGE_INCOMPLETE",
      "Simulation time advanced without the required real WebGL render calls.",
      evidence.renderedFrames,
      expectedFrames
    ));
  }
  if (evidence.renderer.contextLosses > 0) {
    findings.push(blocker(
      "SOAK_WEBGL_CONTEXT_LOST",
      "The WebGL context was lost during the renderer soak.",
      evidence.renderer.contextLosses,
      0
    ));
  }
  if (evidence.memory.endHeapMB > limits.maxSteadyStateHeapMB) {
    findings.push(blocker(
      "SOAK_HEAP_OVER_BUDGET",
      "Garbage-collected end heap exceeds the steady-state ceiling.",
      evidence.memory.endHeapMB,
      limits.maxSteadyStateHeapMB
    ));
  }
  if (evidence.memory.growthHeapMB > limits.maxHeapGrowthMB) {
    findings.push(blocker(
      "SOAK_HEAP_GROWTH_OVER_BUDGET",
      "Garbage-collected heap growth exceeds the soak allowance.",
      evidence.memory.growthHeapMB,
      limits.maxHeapGrowthMB
    ));
  }
  if (evidence.renderer.maxDrawCalls > limits.maxDrawCalls) {
    findings.push(blocker(
      "SOAK_DRAW_CALLS_OVER_BUDGET",
      "Renderer soak exceeded the draw-call ceiling.",
      evidence.renderer.maxDrawCalls,
      limits.maxDrawCalls
    ));
  }
  if (evidence.renderer.maxTriangles > limits.maxTriangles) {
    findings.push(blocker(
      "SOAK_TRIANGLES_OVER_BUDGET",
      "Renderer soak exceeded the triangle ceiling.",
      evidence.renderer.maxTriangles,
      limits.maxTriangles
    ));
  }

  for (const resource of ["geometries", "textures"] as const) {
    const baseline = evidence.renderer.baselineResources[resource];
    const end = evidence.renderer.endResources[resource];
    const peak = evidence.renderer.peakResources[resource];
    if (end > baseline || peak > baseline) {
      findings.push(blocker(
        "SOAK_GPU_RESOURCE_GROWTH",
        `${resource} grew after the renderer reached steady state.`,
        Math.max(end, peak),
        baseline
      ));
    }
  }

  for (const [pool, limit] of Object.entries(limits.maxPools)) {
    const observed = evidence.peakPools[pool as keyof RendererSoakEvidence["peakPools"]];
    if (observed > limit) {
      findings.push(blocker(
        "SOAK_POOL_CAP_EXCEEDED",
        `${pool} exceeded its hard pool cap during the soak.`,
        observed,
        limit
      ));
    }
  }

  return findings;
}

export function formatRendererSoakReport(
  evidence: RendererSoakEvidence,
  findings: Finding[]
): string {
  const lines = [
    "Glowfin deterministic CI renderer soak",
    `${evidence.simulatedMinutes.toFixed(2)} simulated minutes · ` +
      `${evidence.renderedFrames.toLocaleString()} WebGL frames · ` +
      `${evidence.wallClockSeconds.toFixed(1)} wall-clock seconds`,
    `heap ${evidence.memory.baselineHeapMB.toFixed(1)} -> ` +
      `${evidence.memory.endHeapMB.toFixed(1)} MB ` +
      `(growth ${evidence.memory.growthHeapMB.toFixed(1)} MB, ` +
      `raw peak ${evidence.memory.peakHeapMB.toFixed(1)} MB)`,
    `GPU resources ${evidence.renderer.endResources.geometries} geometries / ` +
      `${evidence.renderer.endResources.textures} textures`,
    `peak scene ${evidence.renderer.maxDrawCalls} draws / ` +
      `${evidence.renderer.maxTriangles} triangles / ` +
      `${evidence.peakPools.gates} live gates`,
    `WebGL context losses ${evidence.renderer.contextLosses}`,
    "",
    findings.length === 0 ? "PASS — zero blockers" : `FAIL — ${findings.length} blocker(s)`
  ];
  for (const finding of findings) {
    lines.push(`[FAIL] ${finding.code}: ${finding.message}`);
  }
  lines.push(
    "",
    "Boundary: CI-emulated simulated-time evidence; not Android/iOS real-device sign-off."
  );
  return `${lines.join("\n")}\n`;
}
