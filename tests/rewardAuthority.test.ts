import { describe, expect, it } from "vitest";
import { HostedRewardedAuthorityClient } from "../src/monetization/rewardAuthority";
import type { FetchLike } from "../src/operations/networkPolicy";

describe("Version 36 rewarded receipt authority", () => {
  it("sends one bounded, same-origin claim and accepts an idempotent grant", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher: FetchLike = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({
        schemaVersion: 1,
        granted: true,
        duplicate: false,
        pearls: 30
      }), { status: 200 });
    };
    const client = new HostedRewardedAuthorityClient(fetcher);
    await expect(client.claim(
      "run_12345678",
      "double-lumen-pearls",
      30,
      "receipt_abcdefghijklmnopqrstuvwxyz"
    )).resolves.toMatchObject({ granted: true, pearls: 30 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "same-origin"
    });
  });

  it("fails closed before the network for recovery, invalid receipts and oversized grants", async () => {
    let calls = 0;
    const fetcher: FetchLike = async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    };
    const client = new HostedRewardedAuthorityClient(fetcher);
    await expect(client.claim(
      "run_12345678",
      "run-recovery",
      30,
      "receipt_abcdefghijklmnopqrstuvwxyz"
    )).rejects.toThrow("recovery");
    await expect(client.claim(
      "run_12345678",
      "double-lumen-pearls",
      500,
      "short"
    )).rejects.toThrow("receipt");
    expect(calls).toBe(0);
  });

  it("does not retry an ambiguous claim failure", async () => {
    let calls = 0;
    const fetcher: FetchLike = async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
    };
    const client = new HostedRewardedAuthorityClient(fetcher);
    await expect(client.claim(
      "run_12345678",
      "double-lumen-pearls",
      30,
      "receipt_abcdefghijklmnopqrstuvwxyz"
    )).rejects.toThrow("503");
    expect(calls).toBe(1);
  });
});
