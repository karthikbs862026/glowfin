# Version 41 Audit — Cycle 12

## Evidence result before this correction

The active-clock build completed the primary three-minute Expedition and produced all six encounter-history entries plus the `Moonseed restored` completion state. The remaining failure occurred only in the reduced-motion/high-contrast evidence context because the software renderer was operating near one frame per second and could move beyond a named encounter while a full-page screenshot was being encoded.

## Correction

- Add a loopback-only QA hold that is available only on `localhost` or `127.0.0.1` with `v41qa=1`.
- Hold the Adventure presentation immediately after the expected encounter boundary is observed.
- Capture the named encounter, then remove the hold and resume the same deterministic plan.
- Require every screenshot to show the exact expected active encounter, not merely historical evidence that it occurred.
- Give the reduced-motion/high-contrast Duskmaw capture a bounded 30-second allowance at the software-rendered 1 fps floor.
- Remove the hold immediately after each capture.

## Production isolation

The hold is unreachable on the hosted build, native wrappers and ordinary local play without the explicit loopback QA parameter. Production duration remains exactly 180 seconds. Collision truth, scoring, standard progress, Pearl rewards, Daily Tide, ghosts, leaderboard authority and accessibility classification are unchanged.

## Release condition

No check is waived. The complete CI, production-readiness, Android/iOS wrapper, structural art, full render, fast mobile Expedition journey and renderer-soak suite must all pass on this owner-authored head before merge and deployment.
