import { describe, expect, it } from "vitest";
import { deviceHealthPayload } from "../src/operations/deviceHealth";

describe("Version 39 consent-safe device health", () => {
  it("emits coarse operational buckets without fingerprint fields", () => {
    const payload = deviceHealthPayload({
      runtime: { isNative: true, platform: "android" },
      viewportWidth: 412,
      viewportHeight: 915,
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
      online: true,
      quality: "high",
      sample: {
        fps: 59.9,
        frameTimeMsMedian: 16.7,
        frameTimeMsWorst: 31.4,
        drawCalls: 48,
        triangles: 1030,
        heapMb: 87,
        gpu: "ANGLE / raw device renderer must not escape"
      }
    });
    expect(payload).toMatchObject({
      platform: "android",
      screenClass: "standard",
      memoryClass: "5-to-8gb",
      coreClass: "5-to-8",
      frameMedianMs: 16,
      drawCalls: 50
    });
    expect(JSON.stringify(payload)).not.toMatch(/ANGLE|gpu|userAgent|model|412|915/);
  });
});
