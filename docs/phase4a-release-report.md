# Version 33 / Phase 4A Release Report

**Build:** Moonwake Progression and Daily Tide Trial

**Status:** Merge candidate; physical return-journey acceptance remains open
**Baseline:** Version 32 at `df94525fe91062e7a0511ff78100510ac458c483`

## Included scope

- Lumen Pearls and persistent Tide Levels
- twelve shared-material cosmetic unlocks across glow, fin, trail and aura
- hosted-UTC deterministic Daily Tide Trial and same-seed daily ghost
- two daily objectives, one weekly objective and one grace day per streak
- reward/unlock-focused post-run presentation
- schema-v2 save migration, corruption recovery and conflict-safe merging
- consent-gated retention telemetry and next-day-return observation
- disabled rewarded-video provider and recovery-placement hooks

## Automated evidence

| Gate | Evidence |
|---|---|
| Runtime provenance | Staging build reproduced byte-for-byte from the deployed Version 33 document, manifest, bundles and source maps |
| Unit/integration/determinism | 311 tests across 32 files |
| Type and lint | TypeScript and zero-warning ESLint gates |
| Production bundle | Vite staging build with deterministic runtime GLBs |
| Release integrity | Mounted-path, bundle-size, debug-strip and release-metadata checks |
| Art/performance structure | Art-gate self-tests and structural budget gate |
| Pull-request evidence | Required full render matrix, touch/audio capture and 5,400-frame simulated-time soak |

The pull-request rows are authoritative only when the exact PR head is green in
GitHub Actions.

## Conditional acceptance items

- Complete and record a physical first-run-to-simulated-next-day-return flow,
  including reward, unlock, equip, daily trial, objective, streak and ghost
  rematch telemetry after explicit consent.
- Complete the Android real-time 30-minute thermal/audio/interruption pass.
- Complete one real iPhone Safari performance, contrast, audio and soak pass.

Merging Version 33 publishes the verified release candidate; it does not mark
these physical-device rows complete.
