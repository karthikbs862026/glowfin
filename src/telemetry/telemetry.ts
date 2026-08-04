import type { TelemetryConsent } from "../persistence/progress";
import {
  fetchWithPolicy,
  WRITE_NETWORK_POLICY,
  type FetchLike
} from "../operations/networkPolicy";

export const TELEMETRY_SCHEMA_VERSION = 1 as const;
export const MAX_TELEMETRY_BATCH = 32;
export const MAX_TELEMETRY_QUEUE = 64;

export const TELEMETRY_EVENT_NAMES = [
  "session_start",
  "load_complete",
  "hub_view",
  "tap_to_dive",
  "tutorial_start",
  "tutorial_step",
  "tutorial_complete",
  "tutorial_skip",
  "run_start",
  "momentum_sample",
  "near_miss",
  "collision",
  "signature_obstacle",
  "living_world_event",
  "run_end",
  "reward_granted",
  "first_reward",
  "tide_level_up",
  "cosmetic_unlock",
  "cosmetic_preview",
  "cosmetic_purchase",
  "cosmetic_equip",
  "daily_entry",
  "daily_trial_start",
  "daily_trial_complete",
  "objective_progress",
  "objective_complete",
  "streak_update",
  "retention_return",
  "replay_start",
  "replay_complete",
  "leaderboard_view",
  "leaderboard_submit",
  "leaderboard_result",
  "assist_change",
  "accessibility_change",
  "share_clip_create",
  "share_clip_result",
  "share_challenge_open",
  "share_challenge_start",
  "device_health",
  "save_recovered",
  "webgl_context_lost",
  "webgl_context_restored",
  "webgl_context_recovery_failed",
  "runtime_support",
  "runtime_pause",
  "runtime_resume",
  "startup_failure",
  "cloud_sync_result",
  "service_result",
  "release_manifest_check",
  "error",
  "rewarded_offer",
  "rewarded_start",
  "rewarded_complete",
  "rewarded_reward"
] as const;

export type TelemetryEventName = typeof TELEMETRY_EVENT_NAMES[number];
export type TelemetryValue = string | number | boolean | null;
export type TelemetryPayload = Record<string, TelemetryValue>;

export interface GlowfinTelemetryEvent {
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  eventId: string;
  sessionId: string;
  runId: string | null;
  name: TelemetryEventName;
  occurredAtMs: number;
  payload: TelemetryPayload;
}

export interface TelemetryTransport {
  send(events: readonly GlowfinTelemetryEvent[]): Promise<void>;
}

function randomId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  const bytes = new Uint32Array(4);
  globalThis.crypto?.getRandomValues?.(bytes);
  const entropy = Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("");
  return `${prefix}_${entropy || `${Date.now().toString(36)}00000000`}`;
}

function cleanPayload(payload: TelemetryPayload): TelemetryPayload {
  const clean: TelemetryPayload = {};
  for (const [rawKey, rawValue] of Object.entries(payload).slice(0, 16)) {
    const key = rawKey.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40);
    if (!key) continue;
    if (typeof rawValue === "number") {
      if (Number.isFinite(rawValue)) clean[key] = rawValue;
    } else if (typeof rawValue === "string") {
      clean[key] = rawValue.slice(0, 96);
    } else if (typeof rawValue === "boolean" || rawValue === null) {
      clean[key] = rawValue;
    }
  }
  return clean;
}

export function isTelemetryEvent(value: unknown): value is GlowfinTelemetryEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<GlowfinTelemetryEvent>;
  return (
    event.schemaVersion === TELEMETRY_SCHEMA_VERSION &&
    typeof event.eventId === "string" && /^evt_[a-zA-Z0-9-]{8,80}$/.test(event.eventId) &&
    typeof event.sessionId === "string" && /^ses_[a-zA-Z0-9-]{8,80}$/.test(event.sessionId) &&
    (event.runId === null || (
      typeof event.runId === "string" && /^run_[a-zA-Z0-9-]{8,80}$/.test(event.runId)
    )) &&
    TELEMETRY_EVENT_NAMES.some((name) => name === event.name) &&
    typeof event.occurredAtMs === "number" &&
    Number.isFinite(event.occurredAtMs) &&
    event.occurredAtMs >= 0 &&
    Boolean(event.payload) &&
    typeof event.payload === "object" &&
    !Array.isArray(event.payload) &&
    JSON.stringify(event.payload).length <= 2048
  );
}

export class HostedTelemetryTransport implements TelemetryTransport {
  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly endpoint = "/api/glowfin/telemetry"
  ) {}

  async send(events: readonly GlowfinTelemetryEvent[]): Promise<void> {
    if (events.length < 1) return;
    const response = await fetchWithPolicy(this.fetcher, this.endpoint, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: events.slice(0, MAX_TELEMETRY_BATCH) })
    }, WRITE_NETWORK_POLICY);
    if (!response.ok) {
      throw new Error(`Telemetry delivery failed (${response.status}).`);
    }
  }
}

export class TelemetryClient {
  readonly sessionId = randomId("ses");
  private consent: TelemetryConsent;
  private readonly queue: GlowfinTelemetryEvent[] = [];
  private flushing: Promise<void> | null = null;

  constructor(
    consent: TelemetryConsent,
    private readonly transport: TelemetryTransport,
    private readonly now: () => number = () => Date.now()
  ) {
    this.consent = consent;
  }

  setConsent(consent: TelemetryConsent): void {
    this.consent = consent;
    if (consent !== "granted") this.queue.length = 0;
  }

  track(
    name: TelemetryEventName,
    payload: TelemetryPayload = {},
    runId: string | null = null
  ): GlowfinTelemetryEvent | null {
    if (this.consent !== "granted") return null;
    const event: GlowfinTelemetryEvent = {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      eventId: randomId("evt"),
      sessionId: this.sessionId,
      runId,
      name,
      occurredAtMs: this.now(),
      payload: cleanPayload(payload)
    };
    if (!isTelemetryEvent(event)) return null;
    if (this.queue.length >= MAX_TELEMETRY_QUEUE) this.queue.shift();
    this.queue.push(event);
    if (this.queue.length >= 8) void this.flush();
    return event;
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.consent !== "granted" || this.queue.length < 1) {
      return Promise.resolve();
    }
    this.flushing = (async () => {
      while (this.consent === "granted" && this.queue.length > 0) {
        const batch = this.queue.splice(0, MAX_TELEMETRY_BATCH);
        try {
          await this.transport.send(batch);
        } catch {
          if (this.consent === "granted") {
            this.queue.unshift(...batch.slice(-MAX_TELEMETRY_QUEUE));
            if (this.queue.length > MAX_TELEMETRY_QUEUE) {
              this.queue.length = MAX_TELEMETRY_QUEUE;
            }
          }
          break;
        }
      }
    })()
      .finally(() => {
        this.flushing = null;
      });
    return this.flushing;
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

export function createRunId(): string {
  return randomId("run");
}
