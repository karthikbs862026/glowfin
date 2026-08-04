export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface NetworkRequestPolicy {
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
}

export const READ_NETWORK_POLICY: Readonly<NetworkRequestPolicy> = Object.freeze({
  timeoutMs: 8_000,
  retries: 1,
  retryDelayMs: 125
});

export const WRITE_NETWORK_POLICY: Readonly<NetworkRequestPolicy> = Object.freeze({
  timeoutMs: 10_000,
  retries: 0,
  retryDelayMs: 0
});

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function safeMethod(init: RequestInit | undefined): boolean {
  const method = String(init?.method ?? "GET").toUpperCase();
  return method === "GET" || method === "HEAD";
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function requestSignal(
  external: AbortSignal | null | undefined,
  timeoutMs: number
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort(external?.reason);
  if (external?.aborted) onAbort();
  else external?.addEventListener("abort", onAbort, { once: true });
  const timeout = globalThis.setTimeout(
    () => controller.abort(new DOMException("Glowfin request timed out.", "TimeoutError")),
    Math.max(1, timeoutMs)
  );
  return {
    signal: controller.signal,
    dispose() {
      globalThis.clearTimeout(timeout);
      external?.removeEventListener("abort", onAbort);
    }
  };
}

/**
 * Bounded network policy for optional hosted services. Only idempotent reads
 * retry; score, save, share, telemetry and reward writes are never replayed by
 * the client, even when the connection fails after the server accepted them.
 */
export async function fetchWithPolicy(
  fetcher: FetchLike,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  policy: NetworkRequestPolicy
): Promise<Response> {
  const retries = safeMethod(init) ? Math.max(0, Math.floor(policy.retries)) : 0;
  let lastError: unknown = new Error("Glowfin request did not run.");
  for (let attempt = 0; attempt <= retries; attempt++) {
    const scoped = requestSignal(init?.signal, policy.timeoutMs);
    try {
      const response = await fetcher(input, { ...init, signal: scoped.signal });
      if (attempt < retries && RETRYABLE_STATUS.has(response.status)) {
        await delay(policy.retryDelayMs * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (init?.signal?.aborted || attempt >= retries) throw error;
      await delay(policy.retryDelayMs * (attempt + 1));
    } finally {
      scoped.dispose();
    }
  }
  throw lastError;
}
