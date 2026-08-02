# ADR-0028: Make physical-phone audio a separate native output path

**Status:** Implemented for owner real-device revalidation on 2026-08-02.
This supersedes ADR-0027's generated-signal acceptance after version 16 also
remained silent on every physical phone tested.

## Context

ADR-0027 proved that the Web Audio graph produced non-zero samples immediately
before `AudioContext.destination`. That is not evidence that a phone's media
pipeline or speaker rendered those samples. The hosted build also ran the game
inside an iframe and reused a stable document URL, leaving both browsing-context
policy and stale-document caching as uncontrolled differences from CI.

The second failed phone checkpoint makes analyser RMS diagnostic evidence only.
It must never again be labelled “audible” or used as the user-facing success
condition.

## Decision

1. Serve the game document directly as the top-level page with an explicit
   same-origin autoplay policy and `no-store` document caching.
2. Add an independent `HTMLAudioElement` path that plays a clearly audible
   confirmation chime and calm underwater bed through the browser's native
   media pipeline. Its PCM WAV data is generated once at startup into bounded
   Blob URLs; no network fetch, binary repository asset, or LFS payload is
   introduced.
3. Invoke both native `play()` calls and `AudioContext.resume()` synchronously
   within the platform's activation-triggering turn: `pointerdown` for a mouse,
   `pointerup` for touch/pen, `touchend` for older WebViews, or the sound
   button's `click`. Web Audio remains responsible for momentum layers and
   semantic gameplay cues.
4. Treat native-media playback as the user-facing active-state authority.
   Web Audio RMS is renamed `generated`, while a blocked native play promise
   produces a visible “Sound blocked — tap again” state.
5. Make the first explicit sound-button tap confirm sound even if a preceding
   canvas gesture already activated it. Only a later explicit tap mutes.
6. Keep mute, visibility suspension, bounded sources, and the hard separation
   from simulation, input, collision, scoring, generation, and replay state.

## Consequences

- Physical phones have two independent output implementations: a native calm
  bed/confirmation and Web Audio momentum/event layers.
- The native fallback uses two hidden media elements and about 148 KB of
  generated PCM in memory. It adds no draw calls, textures, geometry, network
  requests, or production-bundle bytes beyond its encoder code.
- Browser CI must prove both advancing native-media playback time and generated
  Web Audio samples. Neither can prove hardware media volume or human-perceived
  loudness; owner Android/iOS speaker confirmation remains mandatory.
- The stable playtest URL loads a fresh top-level game document after each
  checkpoint instead of retaining an older iframe document.
