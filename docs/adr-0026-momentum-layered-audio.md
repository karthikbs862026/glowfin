# ADR-0026: Momentum-layered, gesture-gated underwater audio

**Status:** Accepted for the next Phase 3 review checkpoint on 2026-08-02.
This implements the audio architecture required by Master Prompt Parts 2.2 and
3.5. It does not sign off the mix on real Android/iOS hardware and does not
approve Phase 3 for merge or release.

## Context

The owner accepted the corrected upright-resident and asynchronous-swimmer
presentation as materially better. Facial refinement for the horizontal
swimmers is deferred to the authored DCC/PBR character pass; the accepted
choreography and gameplay-lane clearance must not be reopened by this build.

The remaining self-contained Phase 3 feature is sound. The master prompt
requires momentum-layered ambience plus distinct near-miss, collision,
multiplier-milestone and recovery cues. It also identifies iOS Safari audio
autoplay as a startup risk: audio initialization must follow a real gesture and
failure must degrade silently rather than making the game appear frozen.

## Decision

1. Add a presentation-only Web Audio module under `src/audio/`. It consumes the
   same normalized momentum/light values as speed, glow and trail, but has no
   route back into simulation, steering, scoring, collision or fixed-timestep
   state.
2. Use one allocation-bounded ambient graph: triangle bed, sine current,
   harmonic shimmer and deterministic filtered water noise. The current layer
   enters before shimmer as momentum rises. Collision light loss audibly dims
   the mix without silencing the world.
3. Derive near-miss, integer multiplier-band, collision, stun-recovery and
   run-end cues from deterministic `StepEvents` plus the existing simulation
   state. Cue variation uses only a resettable sequence number and cannot alter
   a replay outcome.
4. Keep every mix threshold and budget in versioned `config/tuning.json`.
   Validate ranges, layer order and integer voice count at startup. Cap
   transient sources at 18 and continuous automation at 15 Hz.
5. Create/resume `AudioContext` only from a real pointer gesture (including
   explicit activation of the sound control). Retry the no-argument constructor
   for older Safari inside the same gesture.
   Catch resume/constructor failures and keep gameplay running.
6. Add a 44 px safe-area-aware sound control with keyboard focus, accessible
   state/labels, device-local mute persistence and context suspension while
   muted or backgrounded.
7. Explicitly disconnect every transient source, envelope, filter and panner
   when its cue ends. Persistent ambient nodes remain fixed for the page
   lifetime; no per-frame node allocation is permitted.
8. Add pure unit coverage for mix and event semantics plus a real mobile-sized
   Chromium gate that proves: no pre-gesture unlock, successful touch unlock,
   mute, reload persistence, unmute, correct accessible state and no startup
   error.

## Consequences

- Simulation determinism, input latency, collision geometry, camera, visuals,
  merfolk staging and the 0.55-world-unit population clearance are unchanged.
- No binary audio asset or Git LFS payload is added; the production bundle
  increases only by code and remains subject to the existing 2 MB cap.
- Audio uses a fixed graph and hard voice cap, protecting mobile CPU, battery
  and long-session memory. Browser CI checks integration; real phone-speaker,
  headphone, interruption, thermal and iOS Safari review remain mandatory.
- Horizontal-swimmer facial quality remains an explicit future enhancement in
  the authored character-art pass, not a reason to regress the approved pose
  and choreography now.
