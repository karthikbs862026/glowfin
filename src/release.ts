import releaseConfig from "../config/release.json";

export const GLOWFIN_ENVIRONMENTS = [
  "local",
  "staging",
  "production"
] as const;

export type GlowfinEnvironment = typeof GLOWFIN_ENVIRONMENTS[number];

export interface GlowfinReleaseMetadata {
  schemaVersion: number;
  version: number;
  phase: string;
  certification: string;
  environment: GlowfinEnvironment;
  sourceCommit: string;
  baselineVersion: number;
  baselineCommit: string;
  artBuild: string;
}

declare const __GLOWFIN_RELEASE__: GlowfinReleaseMetadata;

const localFallback: GlowfinReleaseMetadata = {
  ...releaseConfig,
  environment: "local",
  sourceCommit: "local"
};

export function isGlowfinReleaseMetadata(
  value: unknown
): value is GlowfinReleaseMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlowfinReleaseMetadata>;
  return (
    candidate.schemaVersion === releaseConfig.schemaVersion &&
    candidate.version === releaseConfig.version &&
    candidate.phase === releaseConfig.phase &&
    candidate.certification === releaseConfig.certification &&
    GLOWFIN_ENVIRONMENTS.some((entry) => entry === candidate.environment) &&
    typeof candidate.sourceCommit === "string" &&
    (candidate.sourceCommit === "local" || /^[0-9a-f]{7,40}$/.test(candidate.sourceCommit)) &&
    candidate.baselineVersion === releaseConfig.baselineVersion &&
    candidate.baselineCommit === releaseConfig.baselineCommit &&
    candidate.artBuild === releaseConfig.artBuild
  );
}

export function formatReleaseLabel(
  release: GlowfinReleaseMetadata
): string {
  const commit = release.sourceCommit === "local"
    ? "local"
    : release.sourceCommit.slice(0, 7);
  return `V${release.version} · ${release.environment.toUpperCase()} · ${commit}`;
}

export const GLOWFIN_RELEASE: GlowfinReleaseMetadata =
  typeof __GLOWFIN_RELEASE__ === "undefined"
    ? localFallback
    : __GLOWFIN_RELEASE__;

if (!isGlowfinReleaseMetadata(GLOWFIN_RELEASE)) {
  throw new Error("Glowfin release metadata is invalid.");
}

export function mountReleaseIdentity(root: Document = document): void {
  const badge = root.getElementById("hud-build");
  if (!badge) throw new Error("Release identity badge #hud-build is missing.");

  const label = formatReleaseLabel(GLOWFIN_RELEASE);
  badge.textContent = label;
  badge.setAttribute(
    "aria-label",
    `Glowfin Version ${GLOWFIN_RELEASE.version}, ${GLOWFIN_RELEASE.environment} build, source ${GLOWFIN_RELEASE.sourceCommit}`
  );
  root.documentElement.dataset.glowfinEnvironment = GLOWFIN_RELEASE.environment;
  root.documentElement.dataset.glowfinSource = GLOWFIN_RELEASE.sourceCommit;
  window.__GLOWFIN_RELEASE__ = GLOWFIN_RELEASE;
}

declare global {
  interface Window {
    __GLOWFIN_RELEASE__?: GlowfinReleaseMetadata;
  }
}
