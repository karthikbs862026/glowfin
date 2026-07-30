# ADR-0011: On-device contrast probe

## Why not headless Playwright

Part 6.5 requires the contrast check be automated, and the obvious route is
Playwright driving headless desktop Chrome. Chose an in-app probe run on real
phones instead, for two reasons.

**Part 6.5 asks for cross-device capture specifically because desktop never
surfaces driver differences.** The two available phones have different GPU
vendors — Adreno on the S22 Ultra, PowerVR on the Reno3 Pro — which is exactly
the Metal-vs-GLES class of discrepancy the brief warns about. A headless desktop
run would report a number from hardware nobody plays on.

**The measurement has to exist and be trustworthy before automating it.** CI can
drive this same probe later; wrapping an unverified measurement in automation
first would just produce confident wrong answers faster.

## What it measures

Renders a fixed-seed scene at low, mid and maximum momentum with every effect
enabled, then renders a silhouette mask (obstacles white, everything else
black), reads both framebuffers, and computes WCAG contrast a few pixels either
side of every mask transition.

Maximum momentum matters most and is the case casual testing never reaches —
Part 6.5 notes trail and bloom at full intensity is where readability breaks.

Two details that would otherwise produce flattering nonsense:

- **Sampling steps 3px away from the edge.** The boundary pixel is antialiased
  and blends both sides, reporting contrast no player ever sees.
- **Zero samples is a failure, not a pass.** "No failures" and "no measurements"
  are indistinguishable in a naive pass/fail, and the second is much worse.
  Reported explicitly as a broken probe.

The analysis is a pure module with no WebGL or DOM, so the maths is unit-tested
against known WCAG values (white/black is exactly 21:1, a colour against itself
exactly 1:1).

## Expected result: the current scene probably fails

Hand arithmetic on the shipped colours suggests obstacles do not currently clear
a 3:1 floor:

| pairing | ratio |
|---|---|
| wall base vs void background | 2.04:1 |
| wall base vs lit floor | 1.34:1 |
| wall base vs caustic peak behind it | 6.42:1 |

Those are base colours rather than rendered pixels, so the probe may disagree —
but if it confirms them, obstacle contrast needs raising before Phase 2 closes.
That is a Part 3.4 hard requirement, not an art preference.

Chose 3.0:1 as the floor: WCAG AA for large text, and obstacles at speed on a
phone at reduced brightness are a comparable legibility problem. It is defensible
rather than derived, and should be revisited against real play.

## Still outstanding

- **Screenshot regression** (Part 6.5's other half) is not built. Contrast was
  the fairness-critical half; the aesthetic-diff half can follow.
- **CI automation** of the probe.
- **Colourblind-safe validation** (Part 6.11) — a bioluminescent palette on dark
  water is a real risk and is not covered by luminance contrast alone.
