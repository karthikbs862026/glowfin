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

### Rerun policy

All core CI, production-readiness, native-wrapper and art/render jobs are rerun from the corrected head. Later findings are appended as separate iterations; no failed check is waived.
