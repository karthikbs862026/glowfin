import {
  fetchWithPolicy,
  WRITE_NETWORK_POLICY,
  type FetchLike
} from "../operations/networkPolicy";
import type { RewardedPlacement } from "./rewarded";

export const REWARDED_CLAIM_VERSION = 1 as const;

export interface RewardedClaimResult {
  schemaVersion: typeof REWARDED_CLAIM_VERSION;
  granted: boolean;
  duplicate: boolean;
  pearls: number;
}

function isClaimResult(value: unknown): value is RewardedClaimResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<RewardedClaimResult>;
  return (
    result.schemaVersion === REWARDED_CLAIM_VERSION &&
    typeof result.granted === "boolean" &&
    typeof result.duplicate === "boolean" &&
    Number.isInteger(result.pearls) && Number(result.pearls) >= 0 && Number(result.pearls) <= 220 &&
    (!result.granted || (!result.duplicate && Number(result.pearls) > 0))
  );
}

export class HostedRewardedAuthorityClient {
  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly endpoint = "/api/glowfin/rewarded"
  ) {}

  async claim(
    runId: string,
    placement: RewardedPlacement,
    basePearls: number,
    receipt: string,
    signal?: AbortSignal
  ): Promise<RewardedClaimResult> {
    if (!/^run_[a-zA-Z0-9-]{8,80}$/.test(runId)) {
      throw new Error("Rewarded claim requires a valid run identifier.");
    }
    if (placement !== "double-lumen-pearls") {
      throw new Error("Competitive recovery rewards are disabled.");
    }
    const pearls = Math.max(0, Math.min(220, Math.floor(basePearls)));
    if (pearls < 1 || !/^[a-zA-Z0-9._~-]{24,2048}$/.test(receipt)) {
      throw new Error("Rewarded claim receipt is invalid.");
    }
    const response = await fetchWithPolicy(this.fetcher, this.endpoint, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: REWARDED_CLAIM_VERSION,
        runId,
        placement,
        basePearls: pearls,
        receipt
      }),
      signal
    }, WRITE_NETWORK_POLICY);
    const text = await response.text();
    let value: unknown = null;
    if (text.length >= 2 && text.length <= 4096) {
      try { value = JSON.parse(text) as unknown; } catch { value = null; }
    }
    if (!response.ok) throw new Error(`Rewarded claim rejected (${response.status}).`);
    if (!isClaimResult(value)) throw new Error("Rewarded claim response is invalid.");
    return value;
  }
}
