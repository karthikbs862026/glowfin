# Version 41 Audit — Cycle 11

## Finding: low frame rate stretched the finite Expedition

The strengthened mobile browser journey loaded The Missing Moonseed correctly, entered `Follow the Light`, and exposed the Version 41 HUD. However, a software-rendered 1 fps frame rate left the timer at approximately 2:59 and prevented the second encounter from arriving inside the bounded gate.

## Root cause

The independent Expedition clock was intentionally separated from the underlying Endless Dive simulation, but each render contribution was capped at 100 ms. That converted elapsed time into effective rendered-frame count. A slow but actively rendering device therefore progressed the Expedition much more slowly than real time.

## Correction

- Advance the Expedition from the core's active frame delta, not frame count.
- Allow up to 1.25 seconds per active update so a slow frame still represents real play time.
- Preserve the core lifecycle's background, page-cache, native-app and WebGL recovery resets, preventing interruption time from being counted.
- Record every encounter boundary crossed by a long active frame so deterministic history remains complete.
- Keep production duration at exactly 180 seconds and loopback QA acceleration at its existing bounded value.

## Acceptance requirement

The final mobile journey must now prove all six encounters, guardian recovery, completion, direct deep-link entry, reduced motion, high contrast, zero standard post-run leakage and byte-identical Version 40 standard progress before merge.
