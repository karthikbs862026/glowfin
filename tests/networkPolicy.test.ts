import { describe, expect, it } from "vitest";
import {
  fetchWithPolicy,
  type FetchLike,
  type NetworkRequestPolicy
} from "../src/operations/networkPolicy";

const immediate: NetworkRequestPolicy = {
  timeoutMs: 1_000,
  retries: 2,
  retryDelayMs: 0
};

describe("Version 36 bounded network recovery", () => {
  it("retries an idempotent read after transient backend failures", async () => {
    const statuses = [503, 429, 200];
    const fetcher: FetchLike = async () => new Response("{}", {
      status: statuses.shift() ?? 500
    });
    const response = await fetchWithPolicy(fetcher, "/daily", {
      method: "GET"
    }, immediate);
    expect(response.status).toBe(200);
    expect(statuses).toEqual([]);
  });

  it("never replays a write after an ambiguous failure", async () => {
    let calls = 0;
    const fetcher: FetchLike = async () => {
      calls += 1;
      return new Response("{}", { status: 503 });
    };
    const response = await fetchWithPolicy(fetcher, "/save", {
      method: "PUT",
      body: "{}"
    }, immediate);
    expect(response.status).toBe(503);
    expect(calls).toBe(1);
  });

  it("retries one thrown read failure but preserves caller cancellation", async () => {
    let calls = 0;
    const fetcher: FetchLike = async (_input, init) => {
      calls += 1;
      if (init?.signal?.aborted) throw init.signal.reason;
      if (calls === 1) throw new TypeError("offline");
      return new Response("{}", { status: 200 });
    };
    await expect(fetchWithPolicy(fetcher, "/health", { method: "GET" }, immediate))
      .resolves.toMatchObject({ status: 200 });
    expect(calls).toBe(2);

    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(fetchWithPolicy(fetcher, "/health", {
      method: "GET",
      signal: controller.signal
    }, immediate)).rejects.toBeTruthy();
    expect(calls).toBe(3);
  });
});
