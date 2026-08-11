# Version 42-R1 Tide Sprint Integration Certification

**Date:** 2026-08-09

**Status:** merged and promoted to the main playable link

**Tested candidate:**
`9ccce3d38a524be6c12ba3bb63a42bbd2066a332`, artifact
`fe24b6feac43b08782f41d2210c344279e4a2d699198138febce4e77e42a509a`

**Merged main:**
`6228c7755f55c63b27ccf8e58fac56291c9beae3`. The squash merge and tested PR
head resolve to the identical Git tree
`7215afa3db21fa62eb379bcdf283b6880f33d30a`.

**Promoted artifact:** digest
`419f2292cc409ba12b5448534b97d25af1cda52181471f39e81d04db1e48dce6`,
24 sealed files, served at the main Glowfin playable URL.

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
| Browser mobile/lifecycle gate | iPhone/Android contract sizes, context and page-cache recovery | Passed in candidate CI |
| Tide Sprint 5,400-render WebGL soak | exact frames, heap/resource and binding render budgets | Passed in candidate CI |
| Main-game 5,400-render soak | existing full renderer gate | Passed in candidate CI |
| Android/iOS wrapper compilation | native workflow | Passed in candidate CI |
| Real Android/iPhone playtest | owner confirmed race/close-win feel, safe areas/touch, interruption and thermal behavior on the exact candidate | Passed by owner 2026-08-09 |

The owner supplied the Android/iPhone result but not device model, OS, browser,
battery delta or thermal measurements. Those details are therefore not
inferred. Emulated dimensions and iOS compilation remain classified only as
automated evidence.

## Merge boundary

PR #33 was made ready and squash-merged after the owner closed the physical
device gate. The exact merged artifact then passed 421 repository tests and the
hosting build/save/reward/route gates before Version 94 was promoted to the
main playable URL. Version 43-R1 branches from the merge SHA above.
