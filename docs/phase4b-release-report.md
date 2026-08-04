# Version 34 / Phase 4B Release Report

**Build:** Verified Currents and Moonflash Sharing

**Status:** Merge candidate; physical-device and external-provider rows remain open
**Baseline:** Version 33 at `3f7ef32c7429d6f28ef772bcfe7f3af08dd323ff`

## Included scope

- immutable standard/assisted run classification
- reduced-travel motor option with no added smoothing or latency
- opt-in global and Daily Tide leaderboards
- fixed-step server re-simulation and anti-cheat rejection reasons
- privacy-safe Moonfin aliases and best-entry upserts
- deterministic best-near-miss Moonflash clip descriptors
- explicit, expiring controlled-share publication
- host-injected rewarded-video bridge and idempotent Lumen-only bonus
- expanded consent-gated competitive/share/reward telemetry

## Automated evidence

| Gate | Evidence |
|---|---|
| Unit/integration/determinism | Classification, clients, clip bounds, provider adapter and full replay re-simulation |
| Hosted authority | Strict route validation, D1 best-entry persistence and exact shared verifier bundle |
| Type and lint | TypeScript and zero-warning ESLint gates |
| Production bundle | Mounted-path, bundle budget, debug strip and release identity |
| Art/performance | Unchanged gameplay/art tuning; structural, render, audio and soak workflows required on the exact PR head |

## Conditional acceptance items

- Complete one real Android and one real iPhone submission/share journey on the
  deployed checkpoint, including standard and assisted division separation.
- Validate the native share sheet and copied fallback link on both platforms.
- Inject and certify an approved rewarded-video provider, consent disclosure
  and vendor privacy behavior before enabling the live placement.
- Complete the existing Android thermal/audio and iOS Safari real-time rows.

Merging publishes a verified Phase 4B code candidate; it does not represent an
external ad-provider or physical-device sign-off.
