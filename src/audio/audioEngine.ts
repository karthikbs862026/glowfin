import type { TuningConfig } from "../core/config";
import type { StepEvents } from "../sim/run";
import {
  GameplayAudioDirector,
  ambientMixForState,
  type GameplayAudioCue
} from "./audioDirector";

const AUDIO_PREFERENCE_KEY = "glowfin-audio-muted-v1";

export type AudioUiState = "locked" | "active" | "muted" | "unavailable";
export type AudioSignalState = "idle" | "pending" | "audible" | "silent";

const SIGNAL_PROBE_INTERVAL_MS = 80;
const SIGNAL_PROBE_MAX_ATTEMPTS = 12;
const SIGNAL_RMS_FLOOR = 0.003;

interface WebkitAudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function safeReadMuted(storage: Storage | null): boolean {
  try {
    return storage?.getItem(AUDIO_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

function safeWriteMuted(storage: Storage | null, muted: boolean): void {
  try {
    storage?.setItem(AUDIO_PREFERENCE_KEY, String(muted));
  } catch {
    // Device-local preference persistence is optional. Audio still works when
    // Safari private mode or a storage policy blocks localStorage.
  }
}

function seededNoiseBuffer(context: AudioContext, seconds = 4): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x6d2b79f5;
  let previous = 0;
  for (let index = 0; index < data.length; index++) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const white = (seed / 0xffff_ffff) * 2 - 1;
    previous = previous * 0.82 + white * 0.18;
    data[index] = previous;
  }
  return buffer;
}

/**
 * Mobile-safe procedural soundscape. It allocates one fixed ambient graph,
 * caps transient sources, and never starts an AudioContext before a genuine
 * user gesture (Part 3.5 / iOS Safari autoplay policy).
 */
export class GlowfinAudio {
  private readonly director: GameplayAudioDirector;
  private readonly button: HTMLButtonElement;
  private readonly statusText: HTMLElement;
  private readonly storage: Storage | null;
  private muted: boolean;
  private uiState: AudioUiState;
  private context: AudioContext | null = null;
  private unlockPromise: Promise<void> | null = null;
  private masterGain: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private currentGain: GainNode | null = null;
  private shimmerGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private bedFilter: BiquadFilterNode | null = null;
  private currentOscillator: OscillatorNode | null = null;
  private shimmerOscillator: OscillatorNode | null = null;
  private cueBus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private waterLayerScheduled = false;
  private signalProbeTimer: number | null = null;
  private signalProbeAttempts = 0;
  private signalSamples: Uint8Array<ArrayBuffer> | null = null;
  private activationCueScheduled = false;
  private readonly ambientSources: AudioScheduledSourceNode[] = [];
  private readonly activeCueSources = new Set<AudioScheduledSourceNode>();
  private momentumFraction = 0;
  private lightFraction = 1;
  private lastMixTime = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly cfg: TuningConfig,
    root: Document = document
  ) {
    this.director = new GameplayAudioDirector(cfg);
    this.button = GlowfinAudio.requireButton(root, "hud-audio-toggle");
    this.statusText = GlowfinAudio.requireElement(root, "hud-audio-status");
    this.storage = GlowfinAudio.localStorageOrNull();
    this.muted = safeReadMuted(this.storage);
    this.uiState = this.muted ? "muted" : "locked";
    this.renderUiState();

    this.button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.handleAudioButton();
    });

    const unlockFromGesture = (event: Event) => {
      // The sound button owns its click semantics. Letting the document-level
      // capture handler unlock first made the subsequent click immediately
      // toggle the freshly started graph back to muted on fast phones.
      const target = event.target;
      if (target instanceof Node && this.button.contains(target)) return;
      if (!this.muted && this.uiState !== "active") void this.unlock();
    };
    if ("PointerEvent" in window) {
      document.addEventListener("pointerdown", unlockFromGesture, {
        capture: true,
        passive: true
      });
    } else {
      // Older iOS WebViews did not expose PointerEvent. Keep the unlock inside
      // their genuine touch gesture rather than falling through to a timer.
      document.addEventListener("touchstart", unlockFromGesture, {
        capture: true,
        passive: true
      });
    }
    document.addEventListener("visibilitychange", () => {
      void this.handleVisibilityChange(document.hidden);
    });
  }

  resetRun(multiplier = this.cfg.scoring.multiplierStart): void {
    this.director.reset(multiplier);
  }

  consumeStep(
    events: StepEvents,
    stunRemainingSec: number,
    multiplier: number
  ): void {
    const cues = this.director.consume(events, stunRemainingSec, multiplier);
    if (this.uiState !== "active") return;
    for (const cue of cues) this.playCue(cue);
  }

  update(momentumFraction: number, lightFraction: number): void {
    this.momentumFraction = Math.max(0, Math.min(1, momentumFraction));
    this.lightFraction = Math.max(0, Math.min(1, lightFraction));
    this.applyAmbientMix(false);
  }

  private static requireElement(root: Document, id: string): HTMLElement {
    const element = root.getElementById(id);
    if (!element) throw new Error(`GlowfinAudio: missing required element #${id}`);
    return element;
  }

  private static requireButton(root: Document, id: string): HTMLButtonElement {
    const element = GlowfinAudio.requireElement(root, id);
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`GlowfinAudio: #${id} must be a button`);
    }
    return element;
  }

  private static localStorageOrNull(): Storage | null {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private audioContextConstructor(): typeof AudioContext | null {
    const webkitWindow = window as WebkitAudioWindow;
    return window.AudioContext ?? webkitWindow.webkitAudioContext ?? null;
  }

  private async unlock(): Promise<void> {
    if (this.muted || this.uiState === "unavailable") return;
    if (this.unlockPromise) return this.unlockPromise;

    this.unlockPromise = this.unlockInternal().finally(() => {
      this.unlockPromise = null;
    });
    return this.unlockPromise;
  }

  private async unlockInternal(): Promise<void> {
    const AudioContextClass = this.audioContextConstructor();
    if (!AudioContextClass) {
      this.setUiState("unavailable");
      return;
    }

    try {
      if (!this.context) {
        try {
          this.context = new AudioContextClass({ latencyHint: "interactive" });
        } catch {
          // Older Safari builds accept only the no-argument constructor. The
          // fallback happens inside the same real gesture, preserving the
          // autoplay contract rather than deferring creation to a timer.
          this.context = new AudioContextClass();
        }
        this.context.addEventListener("statechange", () => {
          if (this.muted) return;
          if (this.context?.state === "running") {
            this.setUiState("active");
            this.beginSignalVerification();
          } else {
            this.setUiState("locked");
          }
        });
      }

      // Build and START the lightweight oscillator graph synchronously before
      // the first await. Mobile autoplay policies key off this genuine gesture
      // turn; the former post-resume graph creation could report "running"
      // without ever producing an audible source in mobile WebViews.
      if (!this.masterGain) {
        this.createCoreGraph(this.context);
        this.setMasterGain(this.cfg.audio.masterGain);
        this.playActivationCue();
      } else if (
        !this.activationCueScheduled &&
        this.button.dataset.audioSignal !== "audible"
      ) {
        this.playActivationCue();
      }

      // resume() is also invoked from the same gesture. The expensive four-
      // second deterministic water buffer remains deferred until after pointer
      // propagation, preserving first-touch steering responsiveness.
      if (this.context.state !== "running") await this.context.resume();
      if (this.muted) {
        this.setMasterGain(0);
        this.setUiState("muted");
        if (this.context.state === "running") await this.context.suspend();
        return;
      }
      if (this.context.state === "running") {
        this.setMasterGain(this.cfg.audio.masterGain);
        this.applyAmbientMix(true);
        this.deferWaterLayer(this.context);
        this.setUiState("active");
        this.beginSignalVerification();
      } else {
        this.setUiState("locked");
      }
    } catch {
      // A rejected resume is not a game startup failure. Keep the audio locked
      // so the next real gesture can retry; the simulation/render loop remains
      // fully playable without sound.
      this.setUiState("locked");
    }
  }

  private createCoreGraph(context: AudioContext): void {
    const master = context.createGain();
    master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 18;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.2;
    master.connect(limiter).connect(analyser).connect(context.destination);
    this.masterGain = master;
    this.analyser = analyser;
    this.signalSamples = new Uint8Array(analyser.fftSize);
    this.setSignalState("idle");

    const ambientBus = context.createGain();
    ambientBus.gain.value = 1;
    ambientBus.connect(master);
    this.ambientBus = ambientBus;

    const cueBus = context.createGain();
    cueBus.gain.value = this.cfg.audio.cueGain;
    cueBus.connect(master);
    this.cueBus = cueBus;

    const bed = context.createOscillator();
    bed.type = "triangle";
    bed.frequency.value = 164.81;
    const bedFilter = context.createBiquadFilter();
    bedFilter.type = "lowpass";
    bedFilter.frequency.value = 1_100;
    bedFilter.Q.value = 0.72;
    const bedGain = context.createGain();
    bedGain.gain.value = 0;
    bed.connect(bedFilter).connect(bedGain).connect(ambientBus);
    this.bedFilter = bedFilter;
    this.bedGain = bedGain;

    const current = context.createOscillator();
    current.type = "sine";
    current.frequency.value = 220;
    const currentFilter = context.createBiquadFilter();
    currentFilter.type = "bandpass";
    currentFilter.frequency.value = 650;
    currentFilter.Q.value = 0.4;
    const currentGain = context.createGain();
    currentGain.gain.value = 0;
    current.connect(currentFilter).connect(currentGain).connect(ambientBus);
    this.currentOscillator = current;
    this.currentGain = currentGain;

    const shimmer = context.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = 329.63;
    const shimmerFilter = context.createBiquadFilter();
    shimmerFilter.type = "highpass";
    shimmerFilter.frequency.value = 250;
    const shimmerGain = context.createGain();
    shimmerGain.gain.value = 0;
    shimmer.connect(shimmerFilter).connect(shimmerGain).connect(ambientBus);
    this.shimmerOscillator = shimmer;
    this.shimmerGain = shimmerGain;

    const initialMix = ambientMixForState(
      this.momentumFraction,
      this.lightFraction,
      this.cfg
    );
    bedGain.gain.value = initialMix.bedGain;
    currentGain.gain.value = initialMix.currentGain;
    shimmerGain.gain.value = initialMix.shimmerGain;
    bedFilter.frequency.value = initialMix.filterFrequencyHz;
    current.frequency.value = initialMix.currentFrequencyHz;
    shimmer.frequency.value = initialMix.shimmerFrequencyHz;

    this.ambientSources.push(bed, current, shimmer);
    for (const source of this.ambientSources) source.start(context.currentTime);
  }

  private deferWaterLayer(context: AudioContext): void {
    if (this.noiseBuffer || this.waterLayerScheduled) return;
    this.waterLayerScheduled = true;
    window.setTimeout(() => {
      this.waterLayerScheduled = false;
      if (this.context !== context || context.state === "closed" || this.noiseBuffer) {
        return;
      }
      this.createWaterLayer(context);
      this.applyAmbientMix(true);
    }, 0);
  }

  private createWaterLayer(context: AudioContext): void {
    const ambientBus = this.ambientBus;
    if (!ambientBus) return;
    this.noiseBuffer = seededNoiseBuffer(context);
    const water = context.createBufferSource();
    water.buffer = this.noiseBuffer;
    water.loop = true;
    const waterFilter = context.createBiquadFilter();
    waterFilter.type = "lowpass";
    waterFilter.frequency.value = 1_800;
    waterFilter.Q.value = 0.32;
    const waterGain = context.createGain();
    waterGain.gain.value = ambientMixForState(
      this.momentumFraction,
      this.lightFraction,
      this.cfg
    ).waterGain;
    water.connect(waterFilter).connect(waterGain).connect(ambientBus);
    this.waterGain = waterGain;

    this.ambientSources.push(water);
    water.start(context.currentTime);
  }

  private applyAmbientMix(force: boolean): void {
    const context = this.context;
    if (!context || context.state !== "running" || this.muted) return;
    const now = context.currentTime;
    if (
      !force &&
      now - this.lastMixTime < 1 / this.cfg.audio.updateRateHz
    ) return;
    this.lastMixTime = now;

    const mix = ambientMixForState(
      this.momentumFraction,
      this.lightFraction,
      this.cfg
    );
    const response = this.cfg.audio.momentumResponseSec;
    this.target(this.bedGain?.gain, mix.bedGain, now, response);
    this.target(this.currentGain?.gain, mix.currentGain, now, response);
    this.target(this.shimmerGain?.gain, mix.shimmerGain, now, response);
    this.target(this.waterGain?.gain, mix.waterGain, now, response);
    this.target(this.bedFilter?.frequency, mix.filterFrequencyHz, now, response);
    this.target(
      this.currentOscillator?.frequency,
      mix.currentFrequencyHz,
      now,
      response
    );
    this.target(
      this.shimmerOscillator?.frequency,
      mix.shimmerFrequencyHz,
      now,
      response
    );
  }

  private target(
    parameter: AudioParam | undefined,
    value: number,
    now: number,
    responseSec: number
  ): void {
    if (!parameter) return;
    parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(value, now, Math.max(0.01, responseSec));
  }

  private playCue(cue: GameplayAudioCue): void {
    const context = this.context;
    if (!context || context.state !== "running" || !this.cueBus || this.muted) return;
    const pan = ((cue.sequence % 5) - 2) * 0.18;
    switch (cue.type) {
      case "near-miss":
        if (!this.hasCueCapacity(2)) return;
        this.tone(330, 740, 0.24, 0.18 * cue.intensity, "sine", pan);
        this.tone(495, 990, 0.29, 0.09 * cue.intensity, "triangle", -pan, 0.025);
        return;
      case "multiplier":
        if (!this.hasCueCapacity(3)) return;
        this.tone(440, 440, 0.38, 0.12 * cue.intensity, "sine", -0.18);
        this.tone(554.37, 554.37, 0.42, 0.1 * cue.intensity, "sine", 0, 0.055);
        this.tone(659.25, 659.25, 0.48, 0.09 * cue.intensity, "sine", 0.18, 0.11);
        return;
      case "collision":
        if (!this.hasCueCapacity(2)) return;
        this.tone(196, 110, 0.48, 0.26, "triangle", pan);
        this.noiseBurst(0.38, 0.2, 520, -pan);
        return;
      case "recovery":
        if (!this.hasCueCapacity(2)) return;
        this.tone(196, 293.66, 0.54, 0.12, "sine", -0.14);
        this.tone(246.94, 369.99, 0.58, 0.09, "sine", 0.14, 0.05);
        return;
      case "run-end":
        if (!this.hasCueCapacity(2)) return;
        this.tone(330, 165, 0.72, 0.16, "sine", -0.12);
        this.tone(246.94, 123.47, 0.82, 0.12, "triangle", 0.12, 0.08);
        return;
    }
  }

  private playActivationCue(): void {
    if (this.activationCueScheduled || !this.hasCueCapacity(2)) return;
    this.activationCueScheduled = true;
    // A short, gentle rising pair gives the player immediate confirmation that
    // sound really started. Both notes sit in the reliable band of phone
    // speakers and are scheduled while the user-activation turn is still live.
    this.tone(523.25, 659.25, 0.2, 0.16, "sine", -0.08, 0.025);
    this.tone(659.25, 783.99, 0.24, 0.1, "triangle", 0.08, 0.075);
  }

  private hasCueCapacity(requiredSources: number): boolean {
    return this.activeCueSources.size + requiredSources <= this.cfg.audio.maxVoices;
  }

  private tone(
    startHz: number,
    endHz: number,
    durationSec: number,
    gain: number,
    wave: OscillatorType,
    pan: number,
    delaySec = 0
  ): void {
    const context = this.context;
    const cueBus = this.cueBus;
    if (!context || !cueBus) return;
    const start = context.currentTime + delaySec;
    const end = start + durationSec;
    const oscillator = context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(20, startHz), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), end);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope);
    const panNodes = this.connectWithPan(envelope, cueBus, pan);
    this.trackCueSource(oscillator, [envelope, ...panNodes]);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  private noiseBurst(
    durationSec: number,
    gain: number,
    frequencyHz: number,
    pan: number
  ): void {
    const context = this.context;
    const cueBus = this.cueBus;
    if (!context || !cueBus || !this.noiseBuffer) return;
    const start = context.currentTime;
    const end = start + durationSec;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequencyHz;
    filter.Q.value = 0.55;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(filter).connect(envelope);
    const panNodes = this.connectWithPan(envelope, cueBus, pan);
    this.trackCueSource(source, [filter, envelope, ...panNodes]);
    source.start(start, (this.activeCueSources.size * 0.37) % this.noiseBuffer.duration);
    source.stop(end + 0.02);
  }

  private connectWithPan(
    source: AudioNode,
    destination: AudioNode,
    pan: number
  ): AudioNode[] {
    const context = this.context;
    if (context && typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-0.7, Math.min(0.7, pan));
      source.connect(panner).connect(destination);
      return [panner];
    }
    source.connect(destination);
    return [];
  }

  private trackCueSource(
    source: AudioScheduledSourceNode,
    cleanupNodes: readonly AudioNode[]
  ): void {
    this.activeCueSources.add(source);
    source.addEventListener("ended", () => {
      this.activeCueSources.delete(source);
      source.disconnect();
      for (const node of cleanupNodes) node.disconnect();
    }, { once: true });
  }

  private async handleAudioButton(): Promise<void> {
    // Locked means "not sounding yet", not "already on". The first button
    // press must activate audio; it must never invert into mute.
    if (!this.muted && this.uiState === "locked") {
      await this.unlock();
      return;
    }
    await this.toggleMuted();
  }

  private async toggleMuted(): Promise<void> {
    this.muted = !this.muted;
    safeWriteMuted(this.storage, this.muted);
    if (this.muted) {
      this.clearSignalProbe();
      this.setSignalState("idle");
      this.setMasterGain(0);
      this.setUiState("muted");
      const context = this.context;
      if (context?.state === "running") {
        window.setTimeout(() => {
          if (this.muted && context.state === "running") void context.suspend();
        }, 90);
      }
      return;
    }
    this.setUiState("locked");
    await this.unlock();
  }

  private async handleVisibilityChange(hidden: boolean): Promise<void> {
    const context = this.context;
    if (!context) return;
    if (hidden) {
      if (context.state === "running") await context.suspend();
      return;
    }
    if (!this.muted) {
      try {
        await context.resume();
        if (context.state === "running") {
          this.setMasterGain(this.cfg.audio.masterGain);
          this.applyAmbientMix(true);
          this.deferWaterLayer(context);
          this.setUiState("active");
          this.beginSignalVerification();
        }
      } catch {
        this.setUiState("locked");
      }
    }
  }

  private setMasterGain(value: number): void {
    const context = this.context;
    const gain = this.masterGain?.gain;
    if (!context || !gain) return;
    const now = context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(value, now, 0.035);
  }

  private beginSignalVerification(): void {
    const context = this.context;
    const analyser = this.analyser;
    const samples = this.signalSamples;
    if (
      this.muted ||
      !context ||
      context.state !== "running" ||
      !analyser ||
      !samples
    ) {
      return;
    }

    this.clearSignalProbe();
    this.signalProbeAttempts = 0;
    this.setSignalState("pending");

    const probe = () => {
      this.signalProbeTimer = null;
      if (
        this.muted ||
        this.context !== context ||
        context.state !== "running"
      ) {
        return;
      }

      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      this.button.dataset.audioRms = rms.toFixed(4);
      if (rms >= SIGNAL_RMS_FLOOR) {
        this.setSignalState("audible");
        return;
      }

      this.signalProbeAttempts += 1;
      if (this.signalProbeAttempts < SIGNAL_PROBE_MAX_ATTEMPTS) {
        this.signalProbeTimer = window.setTimeout(
          probe,
          SIGNAL_PROBE_INTERVAL_MS
        );
        return;
      }

      // A running context is insufficient proof. If the graph has emitted no
      // measurable signal for almost a second, expose a retryable locked state
      // so the next genuine gesture can attempt activation again.
      this.setSignalState("silent");
      this.activationCueScheduled = false;
      this.setUiState("locked");
    };

    this.signalProbeTimer = window.setTimeout(
      probe,
      SIGNAL_PROBE_INTERVAL_MS
    );
  }

  private clearSignalProbe(): void {
    if (this.signalProbeTimer !== null) {
      window.clearTimeout(this.signalProbeTimer);
      this.signalProbeTimer = null;
    }
  }

  private setSignalState(state: AudioSignalState): void {
    this.button.dataset.audioSignal = state;
  }

  private setUiState(state: AudioUiState): void {
    this.uiState = state;
    this.renderUiState();
  }

  private renderUiState(): void {
    this.button.dataset.audioState = this.uiState;
    this.button.disabled = this.uiState === "unavailable";
    const enabled = !this.muted && this.uiState === "active";
    this.button.setAttribute("aria-pressed", String(enabled));

    const messages: Record<AudioUiState, string> = {
      locked: "Tap once for sound",
      active: "Sound on",
      muted: "Sound off",
      unavailable: "Sound is unavailable on this browser"
    };
    this.statusText.textContent = messages[this.uiState];
    this.button.title = messages[this.uiState];
    const labels: Record<AudioUiState, string> = {
      locked: "Turn sound on",
      active: "Mute sound",
      muted: "Turn sound on",
      unavailable: "Sound unavailable"
    };
    this.button.setAttribute("aria-label", labels[this.uiState]);
  }
}
