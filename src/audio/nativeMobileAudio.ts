const SAMPLE_RATE = 16_000;
export const GLOWFIN_SOUNDTRACK_BPM = 120;
export const GLOWFIN_SOUNDTRACK_BARS = 32;
export const GLOWFIN_SOUNDTRACK_SECTIONS = 4;
export const GLOWFIN_SOUNDTRACK_DURATION_SEC = 64;

const BEATS_PER_BAR = 4;
const BEAT_DURATION_SEC = 60 / GLOWFIN_SOUNDTRACK_BPM;
const BAR_DURATION_SEC = BEAT_DURATION_SEC * BEATS_PER_BAR;

type MusicalVoice = "kalimba" | "marimba" | "pearl" | "warm-pad";

interface ChordVoicing {
  readonly bass: number;
  readonly tones: readonly number[];
}

// D-major/pentatonic harmony keeps the kingdom luminous and adventurous rather
// than eerie. Every section cadences back toward D so the 64-second wrap feels
// like a new lap, not an abrupt restart.
const CHORDS: readonly ChordVoicing[] = [
  { bass: 50, tones: [62, 66, 69, 74] }, // D(add9)
  { bass: 55, tones: [59, 62, 67, 71] }, // G6
  { bass: 47, tones: [59, 62, 66, 69] }, // Bm7
  { bass: 45, tones: [57, 61, 64, 69] } // A
];

const SECTION_PROGRESSIONS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 0, 1, 2, 3],
  [0, 3, 1, 3, 2, 1, 0, 3],
  [1, 0, 3, 2, 1, 0, 2, 3],
  [0, 1, 2, 3, 1, 3, 0, 3]
];

// Four connected movements: Coral Morning, Current Run, Mermaid Market and
// Moonwell Sprint. The motifs deliberately change every eight bars so a player
// never hears the old four-second micro-loop disguised by volume automation.
const SECTION_MELODIES: readonly (readonly number[])[] = [
  [62, 66, 69, 71, 69, 66, 64, 66, 67, 69, 71, 74, 69, 66, 64, 62],
  [66, 69, 71, 74, 76, 74, 71, 69, 67, 69, 71, 74, 76, 78, 76, 74],
  [69, 74, 71, 69, 66, 69, 64, 66, 67, 71, 74, 71, 69, 66, 64, -1],
  [62, 66, 69, 74, 71, 74, 76, 78, 76, 74, 71, 69, 67, 69, 73, 74]
];

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

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function addSample(samples: Float32Array, index: number, value: number): void {
  if (index < 0 || index >= samples.length) return;
  samples[index] = (samples[index] ?? 0) + value;
}

function voiceSample(
  voice: MusicalVoice,
  phase: number,
  frequency: number,
  sampleRate: number
): number {
  const harmonic = (multiple: number, amount: number) =>
    frequency * multiple < sampleRate * 0.46
      ? Math.sin(phase * multiple) * amount
      : 0;

  switch (voice) {
    case "kalimba":
      return (
        Math.sin(phase) * 0.72 +
        harmonic(2, 0.2) +
        harmonic(3, 0.08)
      );
    case "marimba":
      return Math.sin(phase) * 0.84 + harmonic(2, 0.16);
    case "pearl":
      return (
        Math.sin(phase) * 0.62 +
        harmonic(2, 0.25) +
        harmonic(4, 0.13)
      );
    case "warm-pad":
      return Math.sin(phase) * 0.82 + harmonic(2, 0.12);
  }
}

function addNote(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  durationSec: number,
  note: number,
  gain: number,
  voice: MusicalVoice
): void {
  if (note < 0 || startSec >= samples.length / sampleRate) return;
  const startIndex = Math.max(0, Math.floor(startSec * sampleRate));
  const sampleCount = Math.max(1, Math.floor(durationSec * sampleRate));
  const frequency = midiToFrequency(note);
  const attackSec = Math.min(0.018, durationSec * 0.16);
  const decayPower =
    voice === "warm-pad" ? 1.45 : voice === "marimba" ? 2.8 : 3.8;

  for (let offset = 0; offset < sampleCount; offset++) {
    const index = startIndex + offset;
    if (index >= samples.length) break;
    const time = offset / sampleRate;
    const life = Math.min(1, time / durationSec);
    const attack = Math.min(1, time / Math.max(0.001, attackSec));
    const envelope = attack * (1 - life) ** decayPower;
    const phase = Math.PI * 2 * frequency * time;
    addSample(
      samples,
      index,
      voiceSample(voice, phase, frequency, sampleRate) * gain * envelope
    );
  }
}

function hashNoise(value: number): number {
  let hash = value | 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return ((hash >>> 0) / 0xffff_ffff) * 2 - 1;
}

function addShaker(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  gain: number,
  seed: number
): void {
  const durationSec = 0.085;
  const startIndex = Math.floor(startSec * sampleRate);
  const sampleCount = Math.floor(durationSec * sampleRate);
  let previous = 0;
  for (let offset = 0; offset < sampleCount; offset++) {
    const index = startIndex + offset;
    if (index >= samples.length) break;
    const life = offset / Math.max(1, sampleCount - 1);
    const noise = hashNoise(index + seed * 7_919);
    const bright = noise - previous * 0.72;
    previous = noise;
    const envelope = Math.min(1, life / 0.08) * (1 - life) ** 3.4;
    addSample(samples, index, bright * gain * envelope);
  }
}

function addHandDrum(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  gain: number
): void {
  const durationSec = 0.22;
  const startIndex = Math.floor(startSec * sampleRate);
  const sampleCount = Math.floor(durationSec * sampleRate);
  for (let offset = 0; offset < sampleCount; offset++) {
    const index = startIndex + offset;
    if (index >= samples.length) break;
    const time = offset / sampleRate;
    const life = time / durationSec;
    const phase = Math.PI * 2 * (118 * time - 143 * time * time);
    const body = Math.sin(phase) * Math.exp(-7.2 * life);
    const phoneClick = Math.sin(Math.PI * 2 * 620 * time) * Math.exp(-28 * life);
    addSample(samples, index, (body * 0.78 + phoneClick * 0.22) * gain);
  }
}

function masterSoundtrack(samples: Float32Array): void {
  let peak = 0;
  let sumSquares = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  if (peak <= 0) return;

  const rms = Math.sqrt(sumSquares / samples.length);
  const scale = Math.min(0.88 / peak, 0.19 / Math.max(0.0001, rms));
  // Gentle offline saturation lifts the quieter arpeggio/percussion detail on
  // phone speakers while the 0.88 ceiling leaves event cues clear headroom.
  const drive = 1.8;
  const curve = Math.tanh(drive);
  for (let index = 0; index < samples.length; index++) {
    const sample = (samples[index] ?? 0) * scale;
    samples[index] = clampSample((Math.tanh(sample * drive) / curve) * 0.88);
  }
}

export function createAmbientSamples(
  sampleRate = SAMPLE_RATE,
  durationSec = GLOWFIN_SOUNDTRACK_DURATION_SEC
): Float32Array {
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const samples = new Float32Array(length);

  for (let bar = 0; bar < GLOWFIN_SOUNDTRACK_BARS; bar++) {
    const barStart = bar * BAR_DURATION_SEC;
    if (barStart >= durationSec) break;
    const section = Math.min(
      GLOWFIN_SOUNDTRACK_SECTIONS - 1,
      Math.floor(bar / 8)
    );
    const sectionBar = bar % 8;
    const progression = SECTION_PROGRESSIONS[section] ?? SECTION_PROGRESSIONS[0];
    const chord = CHORDS[progression?.[sectionBar] ?? 0] ?? CHORDS[0];
    const melody = SECTION_MELODIES[section] ?? SECTION_MELODIES[0];
    if (!chord || !melody) continue;

    // Short root/fifth pulses give the score propulsion without a sustained
    // sub-bass drone that disappears on phone speakers.
    addNote(samples, sampleRate, barStart, 0.42, chord.bass, 0.105, "marimba");
    addNote(
      samples,
      sampleRate,
      barStart + BEAT_DURATION_SEC * 2,
      0.36,
      chord.bass + 7,
      0.078,
      "marimba"
    );

    const arpeggio = [0, 1, 2, 1, 0, 2, 3, 2] as const;
    for (let step = 0; step < arpeggio.length; step++) {
      const toneIndex = arpeggio[step] ?? 0;
      const note = chord.tones[toneIndex] ?? chord.tones[0] ?? 62;
      addNote(
        samples,
        sampleRate,
        barStart + step * (BEAT_DURATION_SEC / 2),
        section === 0 ? 0.24 : 0.2,
        note,
        0.026 + section * 0.003,
        "kalimba"
      );
    }

    // The lead motif is deliberately sparse enough to leave room for event
    // cues, but changes between all four movements and gains octave answers in
    // the second half of each movement.
    for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
      const motifIndex = (sectionBar % 4) * BEATS_PER_BAR + beat;
      let note = melody[motifIndex] ?? -1;
      if (sectionBar >= 4 && beat === 3 && section > 0 && note > 0) note += 12;
      addNote(
        samples,
        sampleRate,
        barStart + beat * BEAT_DURATION_SEC + 0.035,
        beat === 3 ? 0.38 : 0.31,
        note,
        0.068 + section * 0.006,
        "pearl"
      );
    }

    // Warm chord breaths are short and resolving; they supply depth without
    // becoming the continuous choir-like tone the owner rejected.
    if (bar % 2 === 0) {
      for (const note of chord.tones.slice(0, 3)) {
        addNote(samples, sampleRate, barStart + 0.04, 0.9, note - 12, 0.012, "warm-pad");
      }
    }

    addHandDrum(samples, sampleRate, barStart, 0.092 + section * 0.008);
    addHandDrum(
      samples,
      sampleRate,
      barStart + BEAT_DURATION_SEC * 2,
      0.074 + section * 0.007
    );

    const shakerSteps = section === 0 ? 4 : 8;
    for (let step = 0; step < shakerSteps; step++) {
      addShaker(
        samples,
        sampleRate,
        barStart + step * (BAR_DURATION_SEC / shakerSteps),
        section === 0 ? 0.01 : 0.014 + section * 0.0015,
        bar * 11 + step
      );
    }

    // Rising bubble answers make the denser movements playful rather than
    // ominous, while the opening eight bars stay clear and welcoming.
    if (section >= 1 && bar % 2 === 1) {
      const bubbleStart = barStart + BEAT_DURATION_SEC * 3.45;
      addNote(samples, sampleRate, bubbleStart, 0.16, 81 + section, 0.046, "pearl");
      addNote(samples, sampleRate, bubbleStart + 0.11, 0.18, 86 + section, 0.036, "pearl");
    }
  }

  masterSoundtrack(samples);
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
 * independent HTMLMediaElement path supplies the original musical score through
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
      "Glowfin Moon-Current adventure theme"
    );
    this.ambient.volume = 0.5;
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
    const target = 0.46 + momentum * 0.1 + light * 0.04;
    if (Math.abs(this.ambient.volume - target) >= 0.015) {
      this.ambient.volume = Math.max(0, Math.min(0.62, target));
    }
  }
}
