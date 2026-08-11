# Version 43-R4 Realms Integration Certification

**Date:** 2026-08-11

**Status:** local automated candidate; pull-request and hosted evidence pending

**Source base:** promoted Version 42 main
`6228c7755f55c63b27ccf8e58fac56291c9beae3`

**Candidate branch:** `agent/version43-r4-realms-integration`

**Local sealed artifact:** digest
`b7051ad8c645027c5e223b5ac64f6d2d72e193b227ac5d0a0df10efcc35e7c4c`,
33 files. This is a pre-commit local seal and will be replaced by the immutable
CI/merged artifact identity.

## Integrated scope

- Accepted Kelp Cathedral R1, including the baby-manta rescue and Relic Page.
- Final Crystal Trench R3, not R2, including Prism Pulse, the repeating Trench
  Gate and plates, and the close-but-winnable Neri Mirror Current race.
- Moon Well progression from Realm 1 to the locked/unlocked Realm 2 entry.
- Shared schema-5 primary/backup/cloud progress, safe schema-4 migration and a
  non-rewarding import of valid realm-prototype history.
- Four idempotent realm objectives using existing Pearls and Tide XP.
- Consent-gated realm unlock, run, reward and objective telemetry.
- Unchanged authority and entry paths for Tide Sprint, Classic Dive, Daily
  Tide, the guided tutorial and Expedition.

## Evidence ledger

| Gate | Evidence | Status |
|---|---|---|
| Lint + strict TypeScript | zero warnings/errors | Passed locally |
| Repository suite | 451/451 tests across 60 files | Passed locally |
| Realm progression and migration | Realm 1→2 lock, schema 4→5, prototype import, reward idempotency and cloud merge | Passed locally |
| Deterministic fairness | four clean R3 seeds finish in 58–70 seconds with a positive sub-0.5-second margin | Passed locally |
| Repeat-until-clean | forced Trench Gate and plate misses reform with the authoritative sequence | Passed locally |
| 5,400 fixed frames | paired Kelp and Crystal snapshots/course/status remain deterministic | Passed locally |
| Lifecycle regression | eight lifecycle unit contracts plus production journey | Passed locally |
| Render budgets | Kelp 15 draws/8 materials; Crystal 22 draws/10 materials; both under the fixed realm budget | Passed locally |
| Production policy | 26/26 readiness tests and V43→V39 rollback rehearsal | Passed locally |
| Sealed build | 1.14 MiB JavaScript; 2.73 MiB sealed payload; 33 files | Passed locally |
| Structural art gate | 47/47 harness checks; zero blockers, one retained fairness-critical LOD warning | Passed locally |
| Android/iOS payload sync | identical sealed payload, portrait, safe-area, lifecycle, haptics and security contract | Passed locally |
| Browser render/lifecycle capture | local Chromium unavailable; mandatory CI jobs own this evidence | Pending CI |
| Main and Tide Sprint renderer soaks | mandatory CI renderer-soak job | Pending CI |
| Android debug/release compilation | native-wrapper CI job | Pending CI |
| iPhone simulator/release archive | native-wrapper macOS CI job | Pending CI |
| Physical Android/iPhone R4 playtest | no exact-candidate hardware result supplied | Pending owner/hardware execution |

The local Chromium install attempt failed at the browser CDN because its
certificate was not yet valid for this workspace clock. That infrastructure
failure is not recorded as a gameplay failure and does not waive the pull
request's browser-render gates.

## Promotion record

Pull-request number, candidate SHA, CI artifact identities, merge SHA, deployed
artifact digest and main playable deployment will be recorded here only after
they exist.
