# ADR-0004: Relative-drag steering, with smoothing inside the sim step

**Context:** Part 2.1 specifies single-axis swipe/drag steering exposing a
normalized -1..1 value, with configurable sensitivity and smoothing, defaulting
toward precision over "floaty" feel. Two sub-decisions were left open.

## Decision 1 — relative drag from an anchor, not absolute finger position

Phase 0's throwaway prototype used absolute position (finger X maps directly to
lane position). Rejected for the real implementation:

- The player's thumb has to sit where the creature is, occluding the obstacle
  they are reading. That is a Core Design Principle problem (Part 1.3: a camera
  that hid the obstacle — a thumb that hides it is the same failure).
- Lane edges require reaching the screen edge, awkward one-handed.
- Precision is capped by physical screen width.

Relative drag anchors wherever the finger lands; `input.dragRangeFraction`
(0.25) sets how far to drag for full deflection. The creature stays visible and
the gesture works anywhere on screen.

## Decision 2 — smoothing is applied in the sim step, not on the event stream

This one is load-bearing for fairness. Pointer events arrive at device- and
browser-dependent rates. Smoothing the event stream would make steering feel —
and therefore the outcome of a tight gap — depend on pointer event frequency,
which differs across hardware. That is exactly the "works on my phone, unfair on
theirs" class of bug Part 6.4 exists to catch.

So the input module emits an **unsmoothed target**, and smoothing runs inside
the fixed-timestep step. Smoothing uses a half-life form
(`1 - 2^(-dt/halfLife)`) rather than a fixed lerp alpha, because a fixed alpha
would silently retune feel if the step rate ever changed.

## Consequences

- Input logic is fully testable headlessly with synthetic events; no DOM needed
  for the Part 6.4 edge-case suite.
- Frame-rate independence is verified bit-exact at 30/60/120fps.
- Measured latency to 50% deflection is 50ms; with one 60fps render frame that
  is 66.7ms against an 80ms budget (`readability.inputLatencyBudgetMs`).
- Sim runs at 120Hz (`FIXED_DT_SEC`), which gives collision headroom at max
  momentum rather than the 60Hz the prototype used.
