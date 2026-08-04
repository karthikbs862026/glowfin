import { FIXED_DT_SEC } from "../core/timestep";
import { validateReplay, type GlowfinReplayV1 } from "../replay/replay";
import type { RunEncounter } from "../sim/run";
import {
  isRunAccessClassification,
  type RunAccessClassificationV1
} from "../competitive/assists";
import {
  fetchWithPolicy,
  READ_NETWORK_POLICY,
  WRITE_NETWORK_POLICY,
  type FetchLike
} from "../operations/networkPolicy";

export const MOONFLASH_CLIP_VERSION = 1 as const;
export const MAX_CAPTURED_NEAR_MISSES = 32;

export interface MoonflashMomentV1 {
  step: number;
  clearance: number;
  distance: number;
  score: number;
  multiplier: number;
  tier: number;
  templateId: string;
}

export interface MoonflashClipV1 {
  schemaVersion: typeof MOONFLASH_CLIP_VERSION;
  replay: GlowfinReplayV1;
  classification: RunAccessClassificationV1;
  startStep: number;
  momentStep: number;
  endStep: number;
  moment: MoonflashMomentV1;
  caption: string;
  checksum: string;
}

export interface PublishedMoonflashClipV1 {
  schemaVersion: typeof MOONFLASH_CLIP_VERSION;
  token: string;
  shareUrl: string;
  expiresAt: string;
}

export interface MoonflashChallengeV1 {
  schemaVersion: typeof MOONFLASH_CLIP_VERSION;
  token: string;
  clip: MoonflashClipV1;
  expiresAt: string;
}

const MOONFLASH_TOKEN_PATTERN = /^moonflash_[a-zA-Z0-9_-]{8,80}$/;

export function isMoonflashToken(value: unknown): value is string {
  return typeof value === "string" && MOONFLASH_TOKEN_PATTERN.test(value);
}

/**
 * Accept both the hosted `?challenge=` handoff and the native
 * `glowfin://challenge/<token>` scheme. No other query or path data enters the
 * game, so opening a challenge cannot become an arbitrary navigation surface.
 */
export function moonflashTokenFromUrl(value: string): string | null {
  try {
    const url = new URL(value, "https://glowfin.invalid/");
    const queryToken = url.searchParams.get("challenge");
    if (isMoonflashToken(queryToken)) return queryToken;
    if (url.protocol === "glowfin:" && url.hostname === "challenge") {
      const pathToken = url.pathname.split("/").filter(Boolean)[0];
      return isMoonflashToken(pathToken) ? pathToken : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function moonflashChallengeUrl(published: PublishedMoonflashClipV1): string {
  const url = new URL(published.shareUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("challenge", published.token);
  return url.toString();
}

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unsignedClip(clip: Omit<MoonflashClipV1, "checksum"> | MoonflashClipV1) {
  return {
    schemaVersion: clip.schemaVersion,
    replay: clip.replay,
    classification: clip.classification,
    startStep: clip.startStep,
    momentStep: clip.momentStep,
    endStep: clip.endStep,
    moment: clip.moment,
    caption: clip.caption
  };
}

export function moonflashChecksum(
  clip: Omit<MoonflashClipV1, "checksum"> | MoonflashClipV1
): string {
  return checksumText(JSON.stringify(unsignedClip(clip)));
}

function isMoment(value: unknown): value is MoonflashMomentV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MoonflashMomentV1>;
  return (
    Number.isInteger(candidate.step) && Number(candidate.step) >= 1 &&
    finiteNonNegative(candidate.clearance) &&
    finiteNonNegative(candidate.distance) &&
    finiteNonNegative(candidate.score) &&
    typeof candidate.multiplier === "number" && Number.isFinite(candidate.multiplier) &&
    candidate.multiplier >= 1 && candidate.multiplier <= 100 &&
    Number.isInteger(candidate.tier) && Number(candidate.tier) >= 0 && Number(candidate.tier) <= 100 &&
    typeof candidate.templateId === "string" && /^[a-z0-9-]{1,48}$/.test(candidate.templateId)
  );
}

export function validateMoonflashClip(value: unknown): value is MoonflashClipV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MoonflashClipV1>;
  if (
    candidate.schemaVersion !== MOONFLASH_CLIP_VERSION ||
    !validateReplay(candidate.replay).valid ||
    !isRunAccessClassification(candidate.classification) ||
    !Number.isInteger(candidate.startStep) || Number(candidate.startStep) < 0 ||
    !Number.isInteger(candidate.momentStep) || Number(candidate.momentStep) < 1 ||
    !Number.isInteger(candidate.endStep) || Number(candidate.endStep) < 1 ||
    !isMoment(candidate.moment) ||
    typeof candidate.caption !== "string" || candidate.caption.length < 1 || candidate.caption.length > 96 ||
    typeof candidate.checksum !== "string" || !/^[0-9a-f]{8}$/.test(candidate.checksum)
  ) {
    return false;
  }
  const replay = candidate.replay as GlowfinReplayV1;
  if (
    Number(candidate.startStep) >= Number(candidate.momentStep) ||
    Number(candidate.momentStep) >= Number(candidate.endStep) ||
    Number(candidate.endStep) > replay.totalSteps ||
    candidate.moment.step !== candidate.momentStep ||
    Number(candidate.endStep) - Number(candidate.startStep) > Math.ceil(10 / FIXED_DT_SEC)
  ) {
    return false;
  }
  return moonflashChecksum(candidate as MoonflashClipV1) === candidate.checksum;
}

/** Bounded recorder: only semantic near-miss moments, never pointer coordinates. */
export class MoonflashRecorder {
  private readonly moments: MoonflashMomentV1[] = [];

  record(
    step: number,
    score: number,
    multiplier: number,
    encounters: readonly RunEncounter[]
  ): void {
    for (const encounter of encounters) {
      if (encounter.kind !== "near-miss") continue;
      const moment: MoonflashMomentV1 = {
        step,
        clearance: Math.max(0, encounter.clearance),
        distance: Math.max(0, encounter.distance),
        score: Math.max(0, score),
        multiplier: Math.max(1, multiplier),
        tier: Math.max(0, Math.floor(encounter.tier)),
        templateId: encounter.templateId.replace(/[^a-z0-9-]/g, "").slice(0, 48) || "gate"
      };
      this.moments.push(moment);
      if (this.moments.length > MAX_CAPTURED_NEAR_MISSES) this.moments.shift();
    }
  }

  finish(
    replay: GlowfinReplayV1 | null,
    classification: RunAccessClassificationV1
  ): MoonflashClipV1 | null {
    if (!replay || !validateReplay(replay).valid || this.moments.length < 1) return null;
    const moment = [...this.moments].sort((a, b) => {
      const aImpact = a.multiplier * 4 + a.tier * 0.1 - a.clearance * 12;
      const bImpact = b.multiplier * 4 + b.tier * 0.1 - b.clearance * 12;
      return bImpact - aImpact || a.step - b.step;
    })[0];
    if (!moment) return null;
    const leadSteps = Math.ceil(3.5 / FIXED_DT_SEC);
    const tailSteps = Math.ceil(2.5 / FIXED_DT_SEC);
    const startStep = Math.max(0, moment.step - leadSteps);
    const endStep = Math.min(replay.totalSteps, moment.step + tailSteps);
    if (startStep >= moment.step || endStep <= moment.step) return null;
    const unsigned: Omit<MoonflashClipV1, "checksum"> = {
      schemaVersion: MOONFLASH_CLIP_VERSION,
      replay,
      classification,
      startStep,
      momentStep: moment.step,
      endStep,
      moment: { ...moment },
      caption: `Moonflash · x${moment.multiplier.toFixed(1)} · ${Math.floor(replay.summary.score).toLocaleString()} current`
    };
    return { ...unsigned, checksum: moonflashChecksum(unsigned) };
  }
}

function isPublishedClip(value: unknown): value is PublishedMoonflashClipV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublishedMoonflashClipV1>;
  if (
    candidate.schemaVersion !== MOONFLASH_CLIP_VERSION ||
    !isMoonflashToken(candidate.token) ||
    typeof candidate.shareUrl !== "string" || candidate.shareUrl.length > 512 ||
    typeof candidate.expiresAt !== "string" || !Number.isFinite(Date.parse(candidate.expiresAt))
  ) return false;
  try {
    const url = new URL(candidate.shareUrl);
    return url.protocol === "https:" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export class HostedMoonflashClient {
  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly endpoint = "/api/glowfin/share"
  ) {}

  async publish(
    clip: MoonflashClipV1,
    signal?: AbortSignal
  ): Promise<PublishedMoonflashClipV1> {
    if (!validateMoonflashClip(clip)) throw new Error("Refusing to publish an invalid Moonflash clip.");
    const body = JSON.stringify({ clip });
    if (body.length > 160 * 1024) throw new Error("Moonflash clip is too large.");
    const response = await fetchWithPolicy(this.fetcher, this.endpoint, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body,
      signal
    }, WRITE_NETWORK_POLICY);
    const text = await response.text();
    let value: unknown = null;
    if (text.length >= 2 && text.length <= 4096) {
      try { value = JSON.parse(text) as unknown; } catch { value = null; }
    }
    if (!response.ok) throw new Error(`Moonflash publish failed (${response.status}).`);
    if (!isPublishedClip(value)) throw new Error("Moonflash response is invalid.");
    return value;
  }

  async loadChallenge(
    token: string,
    signal?: AbortSignal
  ): Promise<MoonflashChallengeV1> {
    if (!isMoonflashToken(token)) throw new Error("Moonflash challenge token is invalid.");
    const response = await fetchWithPolicy(this.fetcher, `${this.endpoint}/${encodeURIComponent(token)}`, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal
    }, READ_NETWORK_POLICY);
    const text = await response.text();
    let value: unknown = null;
    if (text.length >= 2 && text.length <= 170 * 1024) {
      try { value = JSON.parse(text) as unknown; } catch { value = null; }
    }
    if (!response.ok || !value || typeof value !== "object") {
      throw new Error(`Moonflash challenge failed (${response.status}).`);
    }
    const challenge = value as Partial<MoonflashChallengeV1>;
    if (
      challenge.schemaVersion !== MOONFLASH_CLIP_VERSION ||
      challenge.token !== token ||
      !validateMoonflashClip(challenge.clip) ||
      typeof challenge.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(challenge.expiresAt))
    ) {
      throw new Error("Moonflash challenge response is invalid.");
    }
    return challenge as MoonflashChallengeV1;
  }
}
