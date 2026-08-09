# Version 42-R1 Tide Sprint Integration Certification

**Date:** 2026-08-09

**Status:** integration candidate; automated and physical gates not yet final

**Source base:** merged Version 41-R5
`c67c4a6350f3f432c72e5d01fe92df69c557f2f0`

**Rollback target:** physically certified Version 39
`266b7900294f81e174134337a9d14b5951efcf30`; Versions 40 and 41 are declared
intervening releases, not omitted ancestry.

## Frozen gameplay reference

Version 42-R1 preserves the accepted Tide Sprint R10 control and race plan.
Steering, one-finger slow/cruise/sprint control, Current Ring boosts, current
cues, four-racer presentation, character-neutral physics and photo-finish
tuning are not redesigned. The deterministic revision remains
`v42-r10-photo-finish-current-bursts` with a 2,700-unit finish.

## Integrated scope

- A Moon Well Tide Sprint entry and mount-safe lazy `tide-sprint/` page.
- Shared Version 4 primary/backup save with full Version 3 migration.
- Existing Lumen Pearl and Tide XP rewards, cosmetic-only Character Bonds and
  three idempotent race objectives.
- One bounded checksummed personal Best Echo, with deterministic preset echoes
  when no compatible personal replay exists.
- Consent-gated race, reward, objective and lifecycle telemetry.
- Visibility, page-cache and WebGL context-loss pause/recovery behavior.
- Android/iOS wrapper payload and Version 42 native metadata.

Classic Dive, Daily Tide, the guided tutorial and `The Missing Moonseed`
Expedition retain their existing entry and authority paths. Tide Sprint cannot
write Classic score/replay, Daily calendar claims, tutorial completion or
Expedition state.

## Evidence ledger

| Gate | Current evidence | Status |
|---|---|---|
| Lint + strict TypeScript | zero warnings/errors | Passed locally |
| Repository regression suite | 421/421 tests across 56 files | Passed locally |
| Deterministic race + photo-finish fairness | all three selectable crew; clean win and tiny-loss runner-up bounds | Passed locally |
| Shared save/rewards/objectives/ghost | migration, recovery, idempotency, merge and replay tests | Passed locally |
| 5,400 fixed simulation frames | paired race snapshots remain identical and finite | Passed locally |
| Production build and mounted route | 108 modules; multi-page artifact with lazy Tide Sprint entry | Passed locally |
| Package budgets | 1.06 MiB JavaScript; 2.14 MiB sealed payload | Passed locally |
| Fault/privacy/rollback gate | 26/26 tests; V39 rollback with V40/V41 gap declared | Passed locally |
| Art-gate self-tests + structure | 47/47; zero blockers, one retained LOD warning | Passed locally |
| Native payload sync + policy | identical Android/iOS payload, lifecycle, safe-area and security contract | Passed locally |
| Browser mobile/lifecycle gate | iPhone/Android contract sizes, context and page-cache recovery | Awaiting CI browser |
| Tide Sprint 5,400-render WebGL soak | exact frames, heap/resource and binding render budgets | Awaiting CI browser |
| Main-game 5,400-render soak | existing full renderer gate | Awaiting candidate CI |
| Android/iOS wrapper compilation | native workflow | Awaiting candidate CI |
| Real Android/iPhone playtest | touch, safe areas, thermal, interruption and close-win feel | Blocking final promotion |

This ledger must be updated from the exact candidate SHA. Emulated iPhone
dimensions and an iOS compile are not real iPhone hardware evidence.

## Merge boundary

Version 42 may be published as an owner-review checkpoint after all automated
gates pass. It must not be described as unconditionally device-certified, and
the final merge/exposure decision remains open until the Version 42 physical
rows in `device-matrix.md` are signed.
