# Device Support Matrix (Part 4.7)

**Version 30 visual/gameplay baseline: owner-approved on both Android reference
phones. Current-scene real-time thermal, interruption and complete sound-mix
sign-off remain outstanding. iOS Safari: untested.** Recorded plainly rather
than allowing emulated evidence or earlier primitive-scene measurements to
masquerade as cross-platform release approval.

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
  canvas. **Implemented in Version 35; physical unsupported-device review is
  still required.**

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

## Version 31 release-device checklist — NOT YET COMPLETE

The owner has approved current-scene gameplay and visuals on the S22 Ultra and
OPPO Reno3 Pro. The clean-room Chromium audio gate validates integration and
gesture policy; neither result certifies phone-speaker quality, Safari
interruption behavior, battery or thermals. Run this checklist on both Android
phones and a future reference iPhone before unconditional Phase 3 sign-off:

1. Fresh load remains silent; the first canvas touch both steers immediately
   and starts sound without a freeze, startup-error panel or delayed input.
2. Calm, cruise and maximum momentum clearly add current/shimmer intensity
   without masking visual or tactile gameplay cues.
3. Near-miss, multiplier milestone, collision and recovery are distinguishable
   on the built-in speaker at ordinary volume and through headphones.
4. Sound button is reachable one-handed, does not steer Glowfin, and retains
   mute state after reload.
5. Background for 30 seconds, return, then continue the same run. Audio must
   resume once, with no doubled ambience, burst, desynchronization or crash.
6. Repeat interruption through lock/unlock, notification/call interruption and
   wired/Bluetooth route change where the device supports them.
7. Compare frame time, battery and temperature with sound on versus muted over
   a real-time 30-minute run. Any monotonic memory growth or meaningful breach
   of the 30 fps floor blocks sign-off.
8. Force or observe one graphics-context interruption. Confirm the run pauses,
   the canvas generation increments exactly once after restoration, the scene
   is rebuilt without duplicate audio/input, and play resumes without a time
   jump. Confirm a permanently unsupported WebGL2 device shows the fallback.

## Version 36 production-device rows — AWAITING PHYSICAL EXECUTION

| Device | 30-minute thermal/battery/audio | interruption + context recovery | consent on/off next-day journey | Result |
|---|---|---|---|---|
| Samsung Galaxy S22 Ultra | Not rerun for V36 | Not rerun for V36 | Not run | Conditional |
| OPPO Reno3 Pro | Not rerun for V36 | Not rerun for V36 | Not run | Conditional |
| Real iPhone Safari | Not available | Not available | Not run | Blocking public promotion |

Do not replace these rows with desktop emulation or the simulated renderer
soak. Record OS/browser, GPU string, start/end battery, thermal warnings, audio
route, interruption sequence, source SHA and artifact digest when executed.

## Version 38 signature-obstacle device rows — AWAITING PHYSICAL EXECUTION

| Device | route/shutter/current readability | living-event distraction | 30-minute thermal/audio | Result |
|---|---|---|---|---|
| Samsung Galaxy S22 Ultra | Not rerun for V38 | Not rerun for V38 | Not rerun for V38 | Conditional |
| OPPO Reno3 Pro | Not rerun for V38 | Not rerun for V38 | Not rerun for V38 | Conditional |
| Real iPhone Safari | Not available | Not available | Not run | Blocking public promotion |

On each device, verify the safe and Moonflash routes are distinguishable before
commitment, the shutter cadence is predictable, current direction is readable,
and ray/guardian/Moon-Bloom events never obscure the cyan collision edge.

## Version 39 native-wrapper rows — OWNER CERTIFIED 2026-08-04

Automated Android and iPhone-simulator compilation proves project structure,
not touch feel, motor strength, speaker behavior, thermals or interruption
recovery on hardware.

| Device | install + safe areas | haptic mapping + opt-out | background/audio/recovery | Result |
|---|---|---|---|---|
| Samsung Galaxy S22 Ultra | Passed | Passed | Passed | **Certified** |
| OPPO Reno3 Pro | Passed | Passed | Passed | **Certified** |
| iPhone reference 1 | Passed | Passed | Passed | **Certified** |
| iPhone reference 2 | Passed | Passed | Passed | **Certified** |

For haptics, verify a restrained light pulse for tutorial steps and near-miss,
a clearly stronger collision impact, one success pattern for a completed
purchase/milestone, no burst from repeated events, immediate Settings opt-out,
and no feedback while the app is backgrounded.

The owner explicitly confirmed the complete physical-device certification on
2026-08-04. Device-specific screenshots, OS/build identifiers, battery deltas
and signing material are not invented or checked into the repository; this row
records the release decision and the full acceptance checklist above that was
certified.

## Version 42 Tide Sprint rows — OWNER CERTIFIED 2026-08-09

Automated 390×844 and 412×915 Chromium contracts may prove layout, touch-event
wiring, WebGL context rebuild, page-cache recovery and renderer budgets. They
do not prove Safari/Metal behavior, physical touch feel, thermals, interruption
handling or device speaker quality.

| Device | race + close-win feel | safe areas + touch | interruption + thermal behavior | Result |
|---|---|---|---|---|
| Real Android (model/OS not supplied) | Owner confirmed passed | Owner confirmed passed | Owner confirmed passed | **Certified** |
| Real iPhone (model/OS not supplied) | Owner confirmed passed | Owner confirmed passed | Owner confirmed passed | **Certified** |

The owner confirmed the full Version 42 hardware boundary on the exact PR #33
candidate on 2026-08-09. The source candidate, artifact digest, identical merge
tree and promoted artifact are recorded in `version42-r1-certification.md`.
Specific device models and OS/browser versions were not supplied, so the four
named Version 39 devices above are not silently relabelled as Version 42
evidence.

The certified procedure was: enter Tide Sprint from the Moon Well, complete the one-finger
practice, run at least one clean-current win and one tiny-execution-loss race,
verify that character choice changes no speed or handling, save and race a Best
Echo, confirm shared Pearls/XP/objectives after returning to the hub, then test
background/resume and one interruption. Finish with the existing real-time
thermal/battery procedure. Record the exact source SHA and artifact digest.

## Version 43-R4 integrated realms rows — AWAITING EXACT-CANDIDATE HARDWARE

Automated Android compilation and iPhone-simulator/archive jobs validate the
native projects and sealed payload. They do not prove real touch feel,
Safari/Metal rendering, thermals, battery, speaker behavior or interruptions.

| Device | Realm 1→2 progression + saves | Kelp/Crystal readability + close win | lifecycle + 30-minute thermal | Result |
|---|---|---|---|---|
| Real Android | Not run on R4 candidate | Not run on R4 candidate | Not run on R4 candidate | Pending |
| Real iPhone | Not run on R4 candidate | Not run on R4 candidate | Not run on R4 candidate | Pending |

Use the exact R4 candidate SHA and sealed artifact. Complete Kelp Cathedral,
confirm the Realm 2 unlock survives reload, finish a clean Crystal run, verify
shared Pearls/XP/objectives, and confirm Classic, Daily, tutorial, Expedition
and Tide Sprint state remains intact. Then run background/lock/call recovery,
safe-area/touch checks and the existing real-time thermal/battery procedure.
