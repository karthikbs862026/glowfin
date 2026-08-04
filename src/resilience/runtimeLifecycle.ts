/**
 * Browser lifecycle guard for Version 35 Phase 5A.
 *
 * More than one interruption can be active at once: a WebGL context may be
 * restored while the tab is still hidden, for example. A blocker set keeps the
 * simulation paused until every active reason has cleared instead of letting
 * the last event to arrive resume the run prematurely.
 */

export type RuntimePauseReason =
  | "visibility"
  | "page-cache"
  | "webgl"
  | "recovery"
  | "unsupported"
  | "fatal";

export type RuntimeLifecycleState =
  | "running"
  | "interrupted"
  | "context-lost"
  | "recovering"
  | "unsupported"
  | "failed";

export interface RuntimeLifecycleSnapshot {
  state: RuntimeLifecycleState;
  blockers: RuntimePauseReason[];
  contextLosses: number;
  successfulRecoveries: number;
  interruptions: number;
}

const BLOCKER_ORDER: RuntimePauseReason[] = [
  "visibility",
  "page-cache",
  "webgl",
  "recovery",
  "unsupported",
  "fatal"
];

export class RuntimeLifecycle {
  private readonly blockers = new Set<RuntimePauseReason>();
  private contextLosses = 0;
  private successfulRecoveries = 0;
  private interruptions = 0;

  pause(reason: "visibility" | "page-cache"): RuntimeLifecycleSnapshot {
    if (!this.blockers.has(reason)) this.interruptions += 1;
    this.blockers.add(reason);
    return this.snapshot();
  }

  resume(reason: "visibility" | "page-cache"): RuntimeLifecycleSnapshot {
    this.blockers.delete(reason);
    return this.snapshot();
  }

  contextLost(): RuntimeLifecycleSnapshot {
    if (!this.blockers.has("webgl")) this.contextLosses += 1;
    this.blockers.add("webgl");
    return this.snapshot();
  }

  beginRecovery(): RuntimeLifecycleSnapshot {
    if (!this.blockers.has("webgl")) {
      throw new Error("Cannot rebuild WebGL resources before context loss.");
    }
    this.blockers.add("recovery");
    return this.snapshot();
  }

  recoverySucceeded(): RuntimeLifecycleSnapshot {
    if (this.blockers.has("webgl") || this.blockers.has("recovery")) {
      this.successfulRecoveries += 1;
    }
    this.blockers.delete("recovery");
    this.blockers.delete("webgl");
    return this.snapshot();
  }

  recoveryFailed(): RuntimeLifecycleSnapshot {
    this.blockers.delete("recovery");
    this.blockers.delete("webgl");
    this.blockers.add("fatal");
    return this.snapshot();
  }

  markFailed(): RuntimeLifecycleSnapshot {
    this.blockers.add("fatal");
    return this.snapshot();
  }

  markUnsupported(): RuntimeLifecycleSnapshot {
    this.blockers.add("unsupported");
    return this.snapshot();
  }

  get canAdvance(): boolean {
    return this.blockers.size === 0;
  }

  snapshot(): RuntimeLifecycleSnapshot {
    const blockers = BLOCKER_ORDER.filter((reason) => this.blockers.has(reason));
    return {
      state: this.resolveState(),
      blockers,
      contextLosses: this.contextLosses,
      successfulRecoveries: this.successfulRecoveries,
      interruptions: this.interruptions
    };
  }

  private resolveState(): RuntimeLifecycleState {
    if (this.blockers.has("unsupported")) return "unsupported";
    if (this.blockers.has("fatal")) return "failed";
    if (this.blockers.has("recovery")) return "recovering";
    if (this.blockers.has("webgl")) return "context-lost";
    if (this.blockers.has("visibility") || this.blockers.has("page-cache")) {
      return "interrupted";
    }
    return "running";
  }
}
