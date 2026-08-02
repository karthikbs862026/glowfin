const SAMPLE_RATE = 16_000;
const AMBIENT_DURATION_SEC = 4;

export type NativeMediaState =
  | "idle"
  | "starting"
  | "playing"
  | "paused"
  | "blocked";

function clampSample(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/** Encode a browser-native mono PCM WAV without adding a binary asset. */
export function encodeMonoPcm16Wav(
  samples: Float32Array,
  sampleRate = SAMPLE_RATE
): ArrayBuffer {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < samples.length; index++) {
    const sample = clampSample(samples[index] ?? 0);
    view.setInt16(
      44 + index * bytesPerSample,
      Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)),
      true
    );
  }
  return buffer;
}

export function createAmbientSamples(
  sampleRate = SAMPLE_RATE,
  durationSec = AMBIENT_DURATION_SEC
): Float32Array {
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const time = index / sampleRate;
    // These frequencies complete a whole number of cycles over the default
    // four-second clip, so the native fallback loops without a seam.
    const tide = 0.72 + 0.16 * Math.sin(Math.PI * 2 * 0.25 * time);
    const bed =
      0.34 * Math.sin(Math.PI * 2 * 220 * time) +
      0.17 * Math.sin(Math.PI * 2 * 330 * time + 0.42) +
      0.08 * Math.sin(Math.PI * 2 * 440 * time + 1.1);
    const bubbles =
      0.04 *
      Math.sin(Math.PI * 2 * 720 * time + 0.8) *
      (0.5 + 0.5 * Math.sin(Math.PI * 2 * 0.5 * time));
    samples[index] = clampSample(tide * bed + bubbles);
  }
  return samples;
}

function createAudioElement(
  root: Document,
  url: string,
  loop: boolean,
  label: string
): HTMLAudioElement {
  const audio = root.createElement("audio");
  audio.src = url;
  audio.preload = "auto";
  audio.loop = loop;
  audio.controls = false;
  audio.autoplay = false;
  audio.muted = false;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  audio.setAttribute("aria-label", label);
  audio.setAttribute("aria-hidden", "true");
  audio.style.cssText = [
    "position:fixed",
    "width:1px",
    "height:1px",
    "left:-2px",
    "bottom:-2px",
    "opacity:0",
    "pointer-events:none"
  ].join(";");
  root.body.appendChild(audio);
  audio.load();
  return audio;
}

function playImmediately(audio: HTMLAudioElement, restart: boolean): Promise<boolean> {
  try {
    if (restart) audio.currentTime = 0;
    const result = audio.play();
    if (!result || typeof result.then !== "function") {
      return Promise.resolve(!audio.paused);
    }
    return result.then(
      () => true,
      () => false
    );
  } catch {
    return Promise.resolve(false);
  }
}

function settleWithin(result: Promise<boolean>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    timer = window.setTimeout(() => finish(false), timeoutMs);
    void result.then(finish, () => finish(false));
  });
}

/**
 * Native-media base layer for physical phones.
 *
 * Web Audio remains responsible for momentum layers and gameplay cues. This
 * independent HTMLMediaElement path supplies a clearly audible calm bed through
 * the mobile media pipeline, which is meaningfully different from measuring
 * samples upstream of AudioContext.destination. One native stream avoids
 * mobile engines serializing or indefinitely pending concurrent play() calls.
 */
export class NativeMobileAudio {
  private readonly ambient: HTMLAudioElement;
  private readonly url: string;
  private state: NativeMediaState = "idle";

  constructor(root: Document = document) {
    this.url = URL.createObjectURL(
      new Blob([encodeMonoPcm16Wav(createAmbientSamples())], { type: "audio/wav" })
    );
    this.ambient = createAudioElement(
      root,
      this.url,
      true,
      "Glowfin underwater ambience"
    );
    this.ambient.volume = 0.48;
    window.addEventListener(
      "pagehide",
      (event) => {
        if (event.persisted) return;
        URL.revokeObjectURL(this.url);
      },
      { once: true }
    );
  }

  get currentState(): NativeMediaState {
    return this.state;
  }

  get playbackTime(): number {
    return this.ambient.currentTime;
  }

  /** The one authoritative play() call happens inside the trusted gesture. */
  activate(): Promise<boolean> {
    this.state = "starting";
    const ambientStarted = playImmediately(this.ambient, false);
    return settleWithin(
      ambientStarted.then((started) => started && !this.ambient.paused),
      2_000
    ).then((started) => {
      this.state = started ? "playing" : "blocked";
      return started;
    });
  }

  resumeAmbient(): Promise<boolean> {
    this.state = "starting";
    return settleWithin(playImmediately(this.ambient, false), 2_000).then((started) => {
      this.state = started && !this.ambient.paused ? "playing" : "blocked";
      return this.state === "playing";
    });
  }

  pause(): void {
    this.ambient.pause();
    this.state = "paused";
  }

  update(momentumFraction: number, lightFraction: number): void {
    const momentum = Math.max(0, Math.min(1, momentumFraction));
    const light = Math.max(0, Math.min(1, lightFraction));
    const target = 0.42 + momentum * 0.1 + light * 0.04;
    if (Math.abs(this.ambient.volume - target) >= 0.015) {
      this.ambient.volume = Math.max(0, Math.min(0.62, target));
    }
  }
}
