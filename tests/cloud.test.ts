import { describe, expect, it } from "vitest";
import {
  CloudProgressConflict,
  HostedProgressClient
} from "../src/persistence/cloud";
import type { FetchLike } from "../src/operations/networkPolicy";
import { createDefaultProgress } from "../src/persistence/progress";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("private cloud progress adapter", () => {
  it("loads a validated same-origin revision without caching", async () => {
    const progress = createDefaultProgress();
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher: FetchLike = async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ revision: 3, progress });
    };
    const loaded = await new HostedProgressClient(fetcher).load();
    expect(loaded).toEqual({ revision: 3, progress });
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "same-origin"
    });
  });

  it("surfaces revision conflicts with the current valid cloud copy", async () => {
    const progress = createDefaultProgress();
    const fetcher: FetchLike = async () => jsonResponse({ revision: 7, progress }, 409);
    const client = new HostedProgressClient(fetcher);
    await expect(client.save(progress, 4)).rejects.toBeInstanceOf(CloudProgressConflict);
    try {
      await client.save(progress, 4);
    } catch (error) {
      expect((error as CloudProgressConflict).current).toEqual({ revision: 7, progress });
    }
  });

  it("rejects invalid local uploads and malformed remote payloads", async () => {
    let calls = 0;
    const fetcher: FetchLike = async () => {
      calls += 1;
      return jsonResponse({ revision: -1, progress: {} });
    };
    const client = new HostedProgressClient(fetcher);
    await expect(client.save({} as never, 0)).rejects.toThrow("invalid Glowfin progress");
    expect(calls).toBe(0);
    await expect(client.load()).rejects.toThrow("response is invalid");
  });
});
