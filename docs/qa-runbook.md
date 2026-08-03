# QA Runbook

## Per change

Run `npm run certify:phase3`. This covers lint, type checking, the complete
Vitest suite, production build, mounted-path safety, bundle budget, debug-strip,
release metadata, art-gate self-tests and structural asset validation.

The pull request additionally owns the full 390×844 render matrix, reduced
touch/audio capture and 5,400-frame lifecycle soak. Any red result blocks merge;
do not waive it as flaky without a tracking issue and replacement evidence.

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

Record device model, OS/browser version, GPU string, source SHA, start/end time,
battery change, thermal observation and pass/fail in `docs/device-matrix.md`.

## Release decision

Automated evidence may certify determinism, budgets and emulated rendering. It
cannot certify real iOS Safari, phone thermals, speaker balance or interruption
behavior. Keep the certificate conditional while any required device row is
missing.
