# ADR-0007: Phase 1.5 render binding

## Sight distance raised 40 -> 90 units

Found while working out the camera, not by any test. At 40 units the player
could see **1.2 gates** — effectively one at a time, with 0.89s of lookahead.
That clears the 700ms reaction-window floor, so both the config guardrail and
the solvability checker passed it happily.

But clearing the reaction window is not the same as being able to *plan*. Part
1.3 forbids a correct read being defeated by a camera that hid the obstacle; a
camera that shows only the next obstacle, with no view of the one after it,
fails the spirit of that while passing the letter. 90 units gives 2.7 gates and
2.0s of lookahead.

**Gap in our own checks worth noting:** the automated readability test asserts a
*minimum* reaction window and nothing about planning horizon. Consider adding a
"gates visible at max momentum" assertion in Phase 2 when the visual regression
harness lands.

Solvability re-proven after the change: 1,204,913 gates across 5,000 seeds, zero
unsolvable, 35.7% headroom.

## Gate pruning, and the cursor bug it nearly caused

`Run` now prunes gates more than 40 units behind (Part 4.3). Kept generous
because the camera sits *behind* the creature, so "passed" is not the same as
"off screen".

Pruning splices from the front of the array, which shifts every index — and
`Run` holds an index into that array as its collision scan cursor. Left
uncorrected, the cursor would drift past gates and the player would pass
through walls with no collision at all: a silent fairness failure, not a crash.
The cursor is decremented by the prune count, and there is now a test that
drives a greedy pilot for 90 seconds and asserts collisions are still detected.

The same shifting broke the integration test's pilot, which cached its own
index. It now scans from the front, which pruning makes cheap.

## HUD is DOM, not in-scene

Zero extra draw calls, crisp at any pixel ratio, and it leaves the WebGL budget
for things that need it (Part 4.6).

Part 3.1 hopes creature eye hue can replace a momentum meter. A primitive sphere
has no eyes, so momentum is currently implied by camera pull-back and hue shift
only. That claim gets tested properly in Phase 3 — it is explicitly not being
assumed here.

## Known gaps, carried forward honestly

- **WebGL context loss pauses rather than rebuilding.** `preventDefault` is
  called so the browser does not tear the canvas down permanently, but full
  resource rebuild is Phase 5 (Part 4.3).
- **No audio.** Phase 3, including the iOS gesture gating in Part 3.5.
- **Body glow vs momentum glow conflict from ADR-0006 is still unresolved.**
  Light drives body brightness, momentum drives hue. Legibility unvalidated.
- **No performance measurement on real hardware yet.** Pool sizes are capped
  (16 gates, 40 stripes) but the Part 4.6 budgets are still placeholders.
