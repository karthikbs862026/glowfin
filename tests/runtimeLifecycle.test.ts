import { describe, expect, it } from "vitest";
import { RuntimeLifecycle } from "../src/resilience/runtimeLifecycle";
import { detectRuntimeSupport } from "../src/resilience/runtimeSupport";

describe("Version 35 runtime lifecycle", () => {
  it("does not resume until overlapping interruption blockers clear", () => {
    const lifecycle = new RuntimeLifecycle();

    expect(lifecycle.canAdvance).toBe(true);
    lifecycle.pause("visibility");
    lifecycle.pause("page-cache");
    expect(lifecycle.snapshot()).toMatchObject({
      state: "interrupted",
      blockers: ["visibility", "page-cache"],
      interruptions: 2
    });

    lifecycle.resume("visibility");
    expect(lifecycle.canAdvance).toBe(false);
    lifecycle.resume("page-cache");
    expect(lifecycle.snapshot().state).toBe("running");
    expect(lifecycle.canAdvance).toBe(true);
  });

  it("tracks a complete WebGL loss and rebuild without clearing visibility", () => {
    const lifecycle = new RuntimeLifecycle();
    lifecycle.pause("visibility");
    lifecycle.contextLost();
    lifecycle.beginRecovery();
    expect(lifecycle.snapshot().state).toBe("recovering");

    lifecycle.recoverySucceeded();
    expect(lifecycle.snapshot()).toMatchObject({
      state: "interrupted",
      blockers: ["visibility"],
      contextLosses: 1,
      successfulRecoveries: 1
    });
    expect(lifecycle.canAdvance).toBe(false);

    lifecycle.resume("visibility");
    expect(lifecycle.canAdvance).toBe(true);
  });

  it("keeps the run paused until browser and native app blockers both clear", () => {
    const lifecycle = new RuntimeLifecycle();
    lifecycle.pause("visibility");
    lifecycle.pause("native-app");
    expect(lifecycle.snapshot()).toMatchObject({
      state: "interrupted",
      blockers: ["visibility", "native-app"],
      interruptions: 2
    });
    lifecycle.resume("visibility");
    expect(lifecycle.canAdvance).toBe(false);
    lifecycle.resume("native-app");
    expect(lifecycle.canAdvance).toBe(true);
  });

  it("fails closed when resource reconstruction fails", () => {
    const lifecycle = new RuntimeLifecycle();
    lifecycle.contextLost();
    lifecycle.beginRecovery();
    lifecycle.recoveryFailed();

    expect(lifecycle.snapshot()).toMatchObject({
      state: "failed",
      blockers: ["fatal"],
      contextLosses: 1,
      successfulRecoveries: 0
    });
    expect(lifecycle.canAdvance).toBe(false);
  });

  it("rejects recovery before a context-loss signal", () => {
    expect(() => new RuntimeLifecycle().beginRecovery()).toThrow(
      "Cannot rebuild WebGL resources before context loss."
    );
  });
});

describe("Version 35 runtime support probe", () => {
  it("accepts a working WebGL2 probe", () => {
    expect(detectRuntimeSupport(() => true)).toEqual({
      supported: true,
      reason: "supported",
      detail: "WebGL2 graphics support is available."
    });
  });

  it("returns a readable fallback for an unsupported device", () => {
    expect(detectRuntimeSupport(() => false)).toMatchObject({
      supported: false,
      reason: "webgl2-unavailable"
    });
  });

  it("contains capability-probe exceptions", () => {
    expect(detectRuntimeSupport(() => {
      throw new Error("blocked");
    })).toMatchObject({
      supported: false,
      reason: "webgl2-probe-failed"
    });
  });
});
