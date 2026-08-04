import { describe, expect, it } from "vitest";
import {
  TelemetryClient,
  type GlowfinTelemetryEvent,
  type TelemetryTransport
} from "../src/telemetry/telemetry";

class RecordingTransport implements TelemetryTransport {
  readonly batches: GlowfinTelemetryEvent[][] = [];
  fail = false;

  async send(events: readonly GlowfinTelemetryEvent[]): Promise<void> {
    if (this.fail) throw new Error("offline");
    this.batches.push(events.map((event) => ({ ...event, payload: { ...event.payload } })));
  }
}

describe("consent-gated privacy-safe telemetry", () => {
  it("collects nothing before explicit consent", async () => {
    const transport = new RecordingTransport();
    const client = new TelemetryClient("unset", transport, () => 1234);
    expect(client.track("session_start", { release: 32 })).toBeNull();
    expect(client.pendingCount).toBe(0);
    await client.flush();
    expect(transport.batches).toEqual([]);
  });

  it("sanitizes bounded payloads and flushes only allow-listed events", async () => {
    const transport = new RecordingTransport();
    const client = new TelemetryClient("granted", transport, () => 5678);
    const event = client.track("run_end", {
      "score!": 42,
      note: "x".repeat(140),
      invalid: Number.NaN,
      completed: true
    });
    expect(event?.payload).toEqual({
      score: 42,
      note: "x".repeat(96),
      completed: true
    });
    await client.flush();
    expect(transport.batches).toHaveLength(1);
    expect(transport.batches[0]?.[0]?.occurredAtMs).toBe(5678);
  });

  it("restores a failed batch and clears it when consent is revoked", async () => {
    const transport = new RecordingTransport();
    transport.fail = true;
    const client = new TelemetryClient("granted", transport);
    expect(client.track("collision", { clearance: 0.2 })).not.toBeNull();
    await client.flush();
    expect(client.pendingCount).toBe(1);
    client.setConsent("denied");
    expect(client.pendingCount).toBe(0);
    expect(client.track("collision")).toBeNull();
  });
});
