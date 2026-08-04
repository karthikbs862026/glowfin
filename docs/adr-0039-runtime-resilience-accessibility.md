# ADR-0039 — Runtime resilience and presentation accessibility

**Status:** Accepted for Version 35 Phase 5A
**Date:** 2026-08-04

## Context

Version 34 can prevent permanent canvas teardown after WebGL context loss, but
it cannot rebuild the renderer. Backgrounding resets the fixed timestep only
after return, unsupported WebGL2 devices fall into the generic startup error,
and the saved reduced-motion preference has no player-facing control or visual
effect. Phase 5A must harden those runtime boundaries without changing the
frozen gameplay, competitive replay, camera, art, collision or audio truth.

## Decision

- Probe WebGL2 before constructing Three.js. Unsupported or blocked devices
  receive an accessible, reloadable fallback and never enter the frame loop.
- Represent visibility, page-cache and graphics interruptions as independent
  blockers. Simulation and rendering resume only after every blocker clears.
- On interruption, reset pointer state and the fixed-step accumulator. Never
  simulate background wall-clock time or reuse a stale touch anchor.
- On context restoration, detach the old input/context listeners, replace the
  canvas, dispose the old view where the lost context permits it, and construct
  a complete new `GameView`. Reapply quality, cosmetics and presentation
  preferences; resume only after required assets are ready.
- If reconstruction fails, remain fail-closed behind a reload action. Saved
  progress is not deleted or rewritten.
- Migrate Version 34 access preferences to schema version 2 and expose
  persistent reduced-motion and high-contrast controls. These affect CSS,
  bloom and filmic exposure only; they do not alter input commands, collision,
  scoring, replay validation or leaderboard division.
- Add consent-gated support, pause/resume, recovery and accessibility events.
  Do not collect GPU fingerprints, pointer paths or new identity fields.
- Require Chromium to force `WEBGL_lose_context`, observe a new renderer
  generation and verify page-cache pause/resume before merge.

## Consequences

The current run can continue after a recoverable graphics interruption, but its
presentation trail restarts because the GPU resource is deliberately rebuilt
from authoritative simulation state. Browser automation proves integration,
not mobile memory pressure, Safari behavior, thermal stability or interruption
through a real call/lock-screen flow; those device rows remain conditional.

This is Phase 5A, not full Phase 5 completion. Production alert thresholds,
long-horizon telemetry review, provider rollout and cross-platform physical
sign-off remain operational work.
