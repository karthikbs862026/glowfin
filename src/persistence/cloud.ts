import {
  MAX_PROGRESS_BYTES,
  type GlowfinProgressV1,
  validateProgress
} from "./progress";

export interface CloudProgressRecord {
  revision: number;
  progress: GlowfinProgressV1;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export class CloudProgressConflict extends Error {
  constructor(readonly current: CloudProgressRecord | null) {
    super("Cloud progress revision conflict");
  }
}

function parseRecord(value: unknown): CloudProgressRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CloudProgressRecord>;
  if (
    !Number.isInteger(candidate.revision) ||
    Number(candidate.revision) < 0 ||
    !validateProgress(candidate.progress)
  ) {
    return null;
  }
  return candidate as CloudProgressRecord;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length < 1 || text.length > MAX_PROGRESS_BYTES * 2) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Optional same-origin cloud adapter. A standalone Vite build remains fully
 * playable when the host does not expose these routes; failures are surfaced
 * to the caller and never block the deterministic loop.
 */
export class HostedProgressClient {
  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly endpoint = "/api/glowfin/save"
  ) {}

  async load(signal?: AbortSignal): Promise<CloudProgressRecord | null> {
    const response = await this.fetcher(this.endpoint, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Cloud progress load failed (${response.status}).`);
    const record = parseRecord(await readJson(response));
    if (!record) throw new Error("Cloud progress response is invalid.");
    return record;
  }

  async save(
    progress: GlowfinProgressV1,
    expectedRevision: number,
    signal?: AbortSignal
  ): Promise<CloudProgressRecord> {
    if (!validateProgress(progress)) {
      throw new Error("Refusing to upload invalid Glowfin progress.");
    }
    const body = JSON.stringify({ expectedRevision, progress });
    if (body.length > MAX_PROGRESS_BYTES) {
      throw new Error("Glowfin progress is too large for cloud storage.");
    }
    const response = await this.fetcher(this.endpoint, {
      method: "PUT",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body,
      signal
    });
    const parsed = parseRecord(await readJson(response));
    if (response.status === 409) throw new CloudProgressConflict(parsed);
    if (!response.ok) throw new Error(`Cloud progress save failed (${response.status}).`);
    if (!parsed) throw new Error("Cloud progress save response is invalid.");
    return parsed;
  }
}
