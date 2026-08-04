import { describe, expect, it } from "vitest";
import { FUNNEL_STEPS } from "../src/operations/productionReadiness";
import {
  TelemetryClient,
  type GlowfinTelemetryEvent,
  type TelemetryTransport
} from "../src/telemetry/telemetry";

class JourneyTransport implements TelemetryTransport {
  readonly events: GlowfinTelemetryEvent[] = [];
  async send(events: readonly GlowfinTelemetryEvent[]): Promise<void> {
    this.events.push(...events);
  }
}

describe("Version 36 consent-safe first-run-to-next-day funnel", () => {
  it("emits the ordered aggregate funnel once when consent is granted", async () => {
    const transport = new JourneyTransport();
    let nowMs = Date.parse("2026-08-04T08:00:00.000Z");
    const client = new TelemetryClient("granted", transport, () => nowMs++);
    for (const step of FUNNEL_STEPS) {
      client.track(step, step === "retention_return"
        ? { nextDayReturn: true, daysSincePrevious: 1 }
        : { journey: "first-run" });
    }
    await client.flush();
    expect(transport.events.map((event) => event.name)).toEqual(FUNNEL_STEPS);
    expect(transport.events.at(-1)?.payload).toMatchObject({
      nextDayReturn: true,
      daysSincePrevious: 1
    });
    expect(new Set(transport.events.map((event) => event.eventId)).size)
      .toBe(FUNNEL_STEPS.length);
  });

  it("queues and sends nothing for the same journey when consent is denied", async () => {
    const transport = new JourneyTransport();
    const client = new TelemetryClient("denied", transport);
    for (const step of FUNNEL_STEPS) client.track(step, { journey: "first-run" });
    await client.flush();
    expect(client.pendingCount).toBe(0);
    expect(transport.events).toEqual([]);
  });
});
