# Version 41-R1 Clean Rebuild Certification

**Date:** 2026-08-07

**Status:** Android physical-device certified

**Source baseline:** Version 39 commit `266b7900294f81e174134337a9d14b5951efcf30`

## Certified scope

- `The Missing Moonseed` mission card.
- Same-document Chapter 1 briefing.
- Explicit fixed-seed Expedition start through the Version 39 renderer, loop
  and steering controller.
- Classic Current and guided-tutorial regression safety.
- Self-deactivating service worker while the staged Version 41 rebuild remains
  under certification.

The discarded Version 41 sidecar, prototype patches, synthetic clicks, startup
polling, release-metadata dynamic imports and gameplay-blocking network gates
are absent from the promoted tree.

## Physical-device evidence

The owner passed the complete eight-point checklist on both the Samsung S22
Ultra and Oppo Reno3 Pro:

1. Three fresh launches without a hang or error.
2. `The Missing Moonseed` mission card appears.
3. The briefing opens on the same page.
4. `Begin Chapter 1` starts gameplay promptly.
5. Forward movement and score advance on the repeatable fixed-seed route.
6. Left and right steering respond in the correct direction.
7. Background and resume do not freeze the run.
8. Classic Dive and the guided tutorial remain functional.

Recent matching production logs contained no Worker errors. Game document,
cloud-save `GET`/`PUT`, Daily Tide and leaderboard requests returned HTTP 200.

## Automated evidence

- ESLint: pass with zero warnings.
- TypeScript type-check and production build: pass.
- Repository tests: 392/392 pass across 52 files.
- Production-gate subset: 26/26 pass across seven files.
- Art-gate contract tests: 47/47 pass.
- Structural art gate: pass with zero blockers; the existing simplified-LOD
  decision-point warning remains documented and unchanged.
- Mounted-build paths, native Android/iOS wrapper contract and hosted verifier:
  pass.
- Bundle: 2.00 MB within the 2.00 MB release budget.
- Debug exclusion and sealed release metadata: pass.
- Rollback rehearsal: Version 41 to Version 39 passes with Version 40 explicitly
  recorded as deferred.
- Immutable release identity: `glowfin-v41-r1`; the old `glowfin-v41` tag remains
  untouched as forensic history.

## Remaining boundary

This certificate covers the defined R1 gate and the two target Android phones.
It is not evidence for the rebuilt Expedition on iPhone/Safari. R2 must branch
from this clean R1 tree and add only Lumen Motes plus the first objective.
