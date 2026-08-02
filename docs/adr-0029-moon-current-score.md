# ADR-0029: Replace the ghostly micro-loop with the Moon-Current score

**Status:** Implemented for owner real-device review on 2026-08-02.
This supersedes the musical content and mix of ADR-0028 while preserving its
single-stream native playback, touch activation, mute and lifecycle contract.

## Context

Version 21 finally produced sound on the owner's physical phones, but the sound
was rejected as ghostly, unsuitable for Glowfin and too short to sustain an
engaging run. That result is authoritative. The live native track was a
four-second loop built mostly from sustained 220/330/440 Hz sine tones, while
the Web Audio graph added three more continuous tones whose pitches moved with
momentum. Successful playback and analyser evidence did not make that material
good game music.

Glowfin needs a luminous underwater-adventure identity: warm, playful and
forward-moving, with enough variation to support a 45–90 second run. It must
still fit the one-stream phone-media architecture that solved the earlier
Android playback failures.

## Decision

1. Preserve the proven top-level `HTMLAudioElement`, `pointerup`/`touchend`
   activation, one-stream mobile playback, visible blocked state, persistent
   mute and background suspension. Sound redesign must not reopen audibility.
2. Replace the four-second tone loop with **Moon-Current**, an original
   64-second, 32-bar composition at 120 BPM in D major/pentatonic harmony.
3. Give the score four connected eight-bar movements: **Coral Morning**,
   **Current Run**, **Mermaid Market** and **Moonwell Sprint**. Each movement
   changes progression, lead motif, density and register before the final A-to-D
   cadence returns naturally to the opening.
4. Use short pearl-marimba leads, kalimba arpeggios, phone-readable root/fifth
   pulses, soft hand drums, bright shakers and rising bubble answers. Avoid
   choir/organ timbres, long unresolved drones, chromatic horror intervals and
   continuously gliding melodic pitches.
5. Move the native score to the front of the mix. Reduce the persistent Web
   Audio tones to quiet D/A support, pulse the current and shimmer layers at
   beat-related 2 Hz and 4 Hz rates, and let momentum change texture and level
   rather than sliding pitch between notes.
6. Retune activation, near-miss, multiplier, recovery and run-end cues into the
   same D-major sound family. Collision remains a short low impact plus filtered
   noise so its warning meaning stays unmistakable.
7. Keep synthesis deterministic and offline at document startup. The 16 kHz
   mono score encodes to about 2.05 MB of native PCM and requires no network
   request, repository audio binary or Git LFS object. Peak synthesis memory is
   bounded and released after the Blob URL is created.
8. Add regression gates for at least 60 seconds of music, four declared
   movements, at least 32 bars, high rhythmic-onset density, bounded peaks and a
   material waveform difference at the rejected four-second lag.

## Consequences

- The soundtrack is sixteen times longer and musically evolving rather than a
  four-second ambient tone repeated throughout the run.
- The stable phone activation/output path remains unchanged. Movement,
  collision, route generation, scoring, replay, camera, world art and merfolk
  choreography remain untouched.
- The generated WAV is larger in memory than the earlier 128 KB tone loop, but
  it adds no production-bundle asset and stays modest for the supported phone
  class. Browser and long-session gates still check startup and resource health.
- Automated tests can prove duration, structure, dynamics and playback. They
  cannot approve musical taste or phone-speaker balance; the owner's real-device
  judgment remains the final score-acceptance gate.
