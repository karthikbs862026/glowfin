# ADR-0027: Prove mobile audio signal, not only context state

**Status:** Implemented for owner real-device revalidation on 2026-08-02.
This amends ADR-0026 after version 15 produced no audible output on multiple
physical phones despite a green Chromium interaction gate.

## Context

The previous gate proved that `AudioContext.state` changed to `running`, that
mute persisted, and that no browser error occurred. It did not prove that any
source emitted signal. The implementation also created and started all sources
after awaiting `resume()`, placed most calm-bed energy below the useful range of
small phone speakers, and let a locked sound-button press race into an immediate
mute. Those are independent ways to show an apparently healthy UI while the
player hears nothing.

## Decision

1. Create, connect, and start the lightweight oscillator graph synchronously in
   the real pointer/touch/click activation turn, before the first `await`.
2. Keep the expensive deterministic water-buffer fill outside pointer
   propagation. It joins the already-running graph on the next task, preserving
   the steering latency budget.
3. Make the first locked sound-button press activate sound. Only an already
   active button press mutes it. Retain a `touchstart` fallback for older iOS
   WebViews without Pointer Events.
4. Add a gentle activation cue and move the ambient/collision/run-end spectrum
   into the reliable phone-speaker band. Raise the validated master, ambient,
   and cue gains behind a dynamics limiter.
5. Place an analyser immediately before the audio destination. The browser gate
   must observe non-zero RMS from both explicit-button and canvas-touch startup;
   a `running` context by itself no longer passes.
6. Keep audio presentation-only. No signal, mute, or lifecycle state may feed
   simulation, input, collision, scoring, route generation, or replay state.

## Consequences

- First-touch steering still performs only bounded node construction; the
  four-second noise buffer remains deferred.
- The player hears immediate confirmation that activation succeeded, and the
  locked UI accurately says “Turn sound on” rather than claiming sound is on.
- CI can prove generated Web Audio signal but cannot detect device volume,
  hardware mute switches, speaker damage, or human-perceived mix quality.
  Physical Android/iOS review remains the final acceptance gate.
- No binary audio assets, network requests, or Git LFS payloads are introduced.
