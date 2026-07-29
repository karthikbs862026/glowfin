# Device Support Matrix (Part 4.7)

**Status: incomplete. iOS is untested.** Recorded plainly rather than left blank,
per the project's standing honesty requirement.

## Reference devices

| Role | Device | GPU | Status |
|---|---|---|---|
| High-end Android | Samsung Galaxy S22 Ultra | Adreno 730 / Xclipse | **Testing** |
| Mid-range Android | OPPO Reno3 Pro | Adreno 618 / PowerVR GM9446 (variant-dependent) | **Testing** |
| Mid-range iOS | — | — | **NOT AVAILABLE** |
| Low-end | — | — | Not defined |

The Reno3 Pro shipped in two variants with different SoCs. The in-game debug
overlay reports the live `WEBGL_debug_renderer_info` string, so the actual GPU
is read off the device rather than assumed.

## Minimum supported (intended, unvalidated)

- **Android:** Chrome 90+, WebGL2 required
- **iOS:** Safari 15+, WebGL2 required — **untested, see risk below**
- Unsupported devices get a graceful fallback message, never a broken canvas.
  *(Not yet implemented — Phase 5.)*

## Open risk: no iOS testing

Part 4.6 names iOS Safari as the binding constraint, and it appears as the
limiting factor in four separate places in the brief:

- tighter WebGL heap than desktop (Part 3.3)
- context-loss behaviour under memory pressure (Part 4.3)
- the heap ceiling budgets are sized against (Part 4.6)
- Metal-vs-GLES shader discrepancies desktop testing never surfaces (Part 6.5)

None of these can currently be validated. Part 4.7 is explicit that desktop
browser emulation does not substitute for real device testing and must not be
used to sign off a phase.

**Consequence: Phase 2 cannot be signed off as complete.** Its exit criterion is
"budgets green on mid-range Android and iOS Safari". Android can be met; iOS
cannot. This is carried as a standing open item, not a footnote.

### Routes to closing it

- Used iPhone SE (2020) — cheapest hardware route, real Safari
- BrowserStack / LambdaTest — real remote iOS devices, ~$30/mo. Reliable for
  heap, crash and shader-correctness testing; **not** reliable for frame-rate
  measurement, since streaming latency corrupts timing.

## What the current hardware does cover

Genuinely testable now: correctness, visual output, shader compilation, touch
behaviour, heap and frame profiling via Chrome remote debugging over USB, and
the mid-range frame-rate floor on the Reno3 Pro.

Not covered: everything iOS-specific above, and any low-end tier.
