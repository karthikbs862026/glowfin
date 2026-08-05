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

## Iteration 3 — 2026-08-05

### Finding: two release assertions still described the superseded Version 39 certificate

- Source: complete unit-test matrix, `tests/release.test.ts`
- Severity: release-blocking stale contract test
- Evidence: 394 tests passed; two assertions expected Version 39, `physical-certified`, and the Version 39 phone label
- Resolution: update the release contract test to require Version 41, the Living Current phase, automated-candidate status, Version 39 baseline, and exact `[40]` deferral
- Guardrail strengthened: malformed, missing, duplicate or expanded deferred-version declarations are explicitly rejected
- Waiver: none

## Iteration 4 — 2026-08-05

### Finding: the first complete Version 41 runtime exceeded the unchanged 2.00 MB shipped-bundle cap

- Source: core CI bundle-size gate
- Severity: release-blocking mobile-load regression
- Evidence: all 396 tests, build, hosted authority and mount checks passed, but the non-map production payload measured 2.03 MB
- Resolution: replace the oversized prototype runtime with a lean, data-driven implementation that retains all six encounters, collectibles, Neri, Miri, Duskmaw, restoration, Atlas, persistence, telemetry and accessibility surfaces
- Guardrail preserved: the 2.00 MB budget is unchanged; no file class is excluded and no threshold is raised
- Rendering improvement: the lean layer uses eight additional draws, two materials and substantially fewer than the 8,000 allowed additional triangles
- Waiver: none

## Iteration 5 — 2026-08-05

### Finding: strict TypeScript rejected one unused type carried into the lean runtime

- Source: production-readiness candidate build
- Severity: release-blocking code hygiene defect
- Resolution: remove the exact unused import; no compiler option, lint rule or build step was relaxed
- Preserved evidence: all Version 40 production-policy tests and the explicit Version 39 rollback with deferred Version 40 passed before this build-only finding
- Waiver: none

## Iteration 6 — 2026-08-05

### Finding: the first lean rewrite remained 0.02 MB above the unchanged shipped-bundle cap

- Source: core CI bundle-size gate
- Severity: release-blocking mobile-load regression
- Evidence: lint, strict TypeScript, all 396 tests, production build, hosted anti-cheat authority and mount safety passed; total non-map payload measured 2.02 MB
- Resolution: consolidate the Expedition runtime a second time, remove the superseded runtime chunk, reduce object families from eight to seven additive draws, and compress the UI/event layer while retaining every browser-gated encounter, persistence, restoration, Atlas, telemetry and accessibility contract
- Guardrail preserved: the 2.00 MB threshold, source maps accounting rule and file classes remain unchanged
- Waiver: none

### Rerun policy

All core CI, production-readiness, native-wrapper and art/render jobs are rerun from each corrected head. Later findings are appended as separate iterations; no failed check is waived.
