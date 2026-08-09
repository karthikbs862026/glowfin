# Version 41-R5 Clean Rebuild Certification

**Date:** 2026-08-09

**Status:** automated release candidate; certified R1 Android baseline retained

**Source base:** `90e27fc1c2d731376deb571735c9527c292f5b0b`

## Completed scope

- R2: a bounded 72-instance Lumen Mote route and real six-Mote chain objective.
- R3: optional Moonseed Fragment fork, three returning Rescue Lights for Miri
  and a three-gate non-colliding race against Neri.
- R4/R5: three returning Current Breaks, Duskmaw chase, ceremonial finish and
  Moon Well restoration.
- Checksummed primary/backup Expedition progress, six-slot Relic Atlas,
  monotonic merge and idempotent completion claims.
- Consent-gated semantic telemetry and an unranked Expedition completion path
  that cannot enter Classic/Daily rewards, boards, clips or rewarded video.
- Shared materials, bounded pools and exact fixed-step run completion.

Classic Dive, Daily Tide, the guided tutorial, saved replay ghosts, Moonflash,
progression and their existing reward rules retain their original code paths.
The discarded sidecar implementation remains absent.

## Automated evidence

- ESLint and strict TypeScript: pass with zero warnings.
- Repository tests: 398/398 pass across 53 files.
- Production gate: 26/26 pass, including cloud, authority, retention and
  rollback from Version 41 to the certified Version 39 baseline.
- Deterministic R5 plan, missed-target return, save recovery, merge and claim
  idempotency: pass.
- Deterministic 5,400-frame clean-current soak: pass with identical paired
  simulation, zero collisions, more than 3,800 distance and at most 16 gates.
- Production build and seal: pass.
- JavaScript: 1.00 MiB within the 2 MiB executable ceiling.
- Complete non-map payload: 2.06 MiB within the 3 MiB sealed-payload ceiling.
- Native Android/iOS wrapper sync and contract check: pass for lifecycle,
  haptics, portrait, safe areas and security configuration.
- Art-gate tests: 47/47 pass.
- Structural art gate: pass with zero blockers; the existing simplified-LOD
  decision-point warning remains unchanged.

## Hardware boundary

The R1 renderer, steering and lifecycle baseline remains physically certified
on Samsung S22 Ultra and Oppo Reno3 Pro. R5 reuses those systems, but this
automated certificate is not new physical-device evidence for its complete
Expedition route. iPhone/Safari remains an explicit Version 42 hardware gate and
must not be inferred from Android or wrapper-contract results.
