# Version 41 Audit Log

## Iteration 1 — 2026-08-05

### Finding: strict TypeScript rejected dead Expedition timing state

- Source: core CI typecheck
- Severity: release-blocking code hygiene defect
- Resolution: remove the unused timing field and its writes; retain the already-authoritative effective elapsed value as a local variable
- Additional correction: restart detection now requires a previously advanced Expedition before treating a near-zero forward distance as a reset
- Waiver: none

### Finding: rollback rehearsal rejected the Version 39 to Version 41 release jump

- Source: production-readiness gate
- Severity: release-blocking certification mismatch
- Resolution: declare Version 40 as an explicit deferred version in sealed release metadata
- Guardrail strengthened: the rollback rehearsal now computes every integer version between baseline and candidate and requires an exact, unique, sorted declaration of the gap; an arbitrary older baseline remains invalid
- Release fingerprint: deferred versions are now included in runtime metadata validation and sealed-manifest comparison
- Waiver: none

## Iteration 2 — 2026-08-05

### Finding: the release metadata module imported browser-only Expedition bootstrap code during Node tests

- Source: complete unit-test matrix, `tests/release.test.ts`
- Severity: release-blocking environment-boundary defect
- Evidence: 393 tests passed, but the release suite failed during module collection with `ReferenceError: document is not defined`
- Resolution: keep release metadata universally importable and load the Version 41 runtime module only when both `window` and `document` exist
- Guardrail preserved: the existing release suite remains enabled; no browser globals were mocked and no test was excluded
- Browser assurance: the phone-viewport Version 41 gate must still prove that the dynamically isolated module loads before the Expedition starts and reaches all six beats
- Waiver: none

### Rerun policy

All core CI, production-readiness, native-wrapper and art/render jobs are rerun from each corrected head. Later findings are appended as separate iterations; no failed check is waived.
