# QA Runbook

## Per change

Run `npm run certify:phase3`. This covers lint, type checking, the complete
Vitest suite, production build, mounted-path safety, bundle budget, debug-strip,
release metadata, art-gate self-tests and structural asset validation.

The pull request additionally owns the full 390×844 render matrix, reduced
touch/audio capture, forced WebGL context rebuild, page-cache recovery and
5,400-frame lifecycle soak. Any red result blocks merge; do not waive it as
flaky without a tracking issue and replacement evidence.

## Manual phone pass

Use the exact staging SHA shown in the bottom-left badge. Close older tabs and
clear any cached standalone/PWA copy before beginning.

1. Fresh-load portrait startup and first-touch sound unlock.
2. Steering at low, mid and maximum momentum, including rapid reversal.
3. At least three collisions and recoveries; confirm no repeated collision
   cascade and no hidden route.
4. Confirm Glowfin's two eye shells, single fin per side and centered tail at
   calm, maximum momentum, collision and recovery.
5. Confirm all five gates, their districts, reef identities and merfolk remain
   readable without entering the collision lane.
6. Toggle sound, reload, background/foreground, lock/unlock, interrupt with a
   notification/call, and change audio route where supported.
7. Run continuously for 30 real minutes with sound on; record frame behavior,
   battery change, temperature warning/throttling, blank canvas, audio doubling
   and any context loss.
8. For Version 33+, complete a fresh first run, claim the run/daily/objective
   rewards, equip one unlocked cosmetic, race the saved daily ghost, advance to
   a simulated next UTC day and confirm the consented return funnel exactly
   once. Repeat with consent denied and confirm zero telemetry is queued.
9. For Version 34+, submit one standard and one reduced-travel run. Confirm the
   server-derived score appears only in its matching division, a modified
   replay is rejected, and no identity beyond the Moonfin alias is exposed.
10. Publish a Moonflash only from its explicit button. Verify native sharing or
    the clipboard fallback, expiry metadata and the absence of pointer data.
    If an approved rewarded provider is injected, complete/cancel/fail it and
    confirm only one Lumen bonus can be granted.
11. For Version 35+, toggle reduced motion and high contrast, reload, and
    confirm both persist without changing the leaderboard division. Background
    and foreground mid-drag, then restore one lost WebGL context; confirm input
    resets, simulation time does not jump, the runtime overlay clears and the
    canvas renderer generation advances exactly once.
12. For Version 36+, disconnect the network during a board read and confirm one
    bounded recovery; repeat during save, score, Moonflash and rewarded writes
    and confirm none are silently replayed. Exercise the published route limits,
    expiry cleanup and operations dashboard using test-only records.
13. Confirm `release.json`, the visible badge and response headers identify the
    same source. Record the artifact digest, then rehearse selection of the saved
    Version 35 checkpoint without redeploying it.

Record device model, OS/browser version, GPU string, source SHA, start/end time,
battery change, thermal observation and pass/fail in `docs/device-matrix.md`.

## Release decision

Automated evidence may certify determinism, budgets and emulated rendering. It
cannot certify real iOS Safari, phone thermals, speaker balance or interruption
behavior. Keep the certificate conditional while any required device row is
missing.
