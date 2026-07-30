# Device Support Matrix (Part 4.7)

**Android: validated. iOS: untested.** Recorded plainly rather than left blank,
per the project's standing honesty requirement.

## Reference devices

| Role | Device | GPU (read from the device, not assumed) | Status |
|---|---|---|---|
| High-end Android | Samsung Galaxy S22 Ultra | ANGLE / Qualcomm Adreno 730, GLES 3.2 | **Validated** |
| Mid-range Android | OPPO Reno3 Pro | ANGLE / PowerVR Rogue GM9446, GLES 3.2 | **Validated** |
| Mid-range iOS | — | — | **NOT AVAILABLE** |
| Low-end | — | — | Not defined |

The Reno3 Pro shipped in two SoC variants; the debug overlay reports
`WEBGL_debug_renderer_info` live, which identified this unit as the PowerVR
(Helio P95) variant rather than the Snapdragon one.

## Measured results

### Performance (Part 4.6)

| Device | frame time | worst | draws | tris | quality tier |
|---|---|---|---|---|---|
| S22 Ultra | 16.7ms | 16.8ms | 48 | ~1030 | high, never dropped |
| Reno3 Pro | 16.4ms | 16.5ms | 48 | ~958 | high, never dropped |

Mid-range floor is 33.3ms; the Reno runs at roughly half that. Both figures are
vsync-locked, so they establish that the frame **fits** in 16.7ms, not how much
headroom remains.

**Dynamic quality scaling has never fired on real hardware.** It has unit tests
(`tests/quality.test.ts`) but no field exercise, because neither device gets
close to the floor. That path is effectively untested in production conditions.

### Obstacle contrast (Part 3.4)

Both devices pass under the ADR-0012 p10 rule, measured with every effect
enabled at low, mid and maximum momentum.

| Device | low | mid | max |
|---|---|---|---|
| S22 Ultra (p10, bloom) | 12.85 | 6.45 | 6.54 |
| Reno3 Pro (p10, bloom) | 3.63 | 3.70 | 10.84 |

Floor is 3.0:1.

## Minimum supported (intended, partly unvalidated)

- **Android:** Chrome 90+, WebGL2 required — validated on two GPU vendors
- **iOS:** Safari 15+, WebGL2 required — **untested**
- Unsupported devices should get a graceful fallback message, never a broken
  canvas. *Not yet implemented — Phase 5.*

## Open risk: no iOS testing

Part 4.6 names iOS Safari as the binding constraint, and it is the limiting
factor in four separate places in the brief: tighter WebGL heap (3.3),
context-loss behaviour under memory pressure (4.3), the heap ceiling budgets are
sized against (4.6), and Metal-vs-GLES shader discrepancies desktop testing
never surfaces (6.5).

None of this can currently be validated, and Part 4.7 forbids substituting
desktop emulation.

**Consequence: Phase 2 is complete on Android and cannot be signed off overall.**
Its exit criterion names both platforms.

### Routes to closing it

- Used iPhone SE (2020) — cheapest hardware route, real Safari.
- BrowserStack / LambdaTest — real remote iOS devices, ~$30/mo. Reliable for
  heap, crash and shader-correctness testing; **not** for frame-rate
  measurement, since streaming latency corrupts timing.

Worth noting the contrast probe is the kind of test that would work well over
remote device services: it reports numbers, not frame timing.
