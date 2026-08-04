# Phase 5A Release Report — Version 35

## Candidate identity

| Field | Value |
|---|---|
| Release | Version 35 · Phase 5A |
| Baseline | Version 34 merge `76667c42e4a7a36d0b051a31b1bddb3caaacd9cb` |
| Certification | `runtime-resilience-candidate` |
| Frozen truth | Gameplay tuning, input commands, camera, collision, scoring, replay validation, art and audio |

## Code-owned acceptance

| Gate | Evidence contract |
|---|---|
| Unsupported startup | WebGL2 capability probe enters a readable fail-closed fallback before renderer construction |
| Interruption safety | Independent visibility/page-cache blockers reset steering and fixed-step time; all blockers must clear before resume |
| Context restoration | Old listeners detach, canvas generation increments, all `GameView` resources reconstruct and play resumes only after assets are ready |
| Reconstruction failure | Runtime stays paused with reload available; saved progress remains intact |
| Presentation access | Version 34 access settings migrate; reduced motion and high contrast persist and remain presentation-only |
| Runtime health | Consent-gated bounded events cover support, pause, resume, context restore/failure and access changes |
| Browser integration | PR art gate forces one context loss/restoration and one page-cache pause/resume in mobile Chromium |
| Regression | Complete Vitest, build, hosted verifier, bundle, release, art, phone-render, touch/audio and 5,400-frame soak gates remain mandatory |

## Local candidate evidence

- ESLint and TypeScript pass.
- 337 tests across 38 files pass, including seven lifecycle/support checks and
  Version 34-to-35 accessibility migration coverage.
- The staging production bundle builds successfully and remains under the
  existing 2 MB compressed package budget.
- The browser recovery script is wired into the GitHub art workflow that
  installs the pinned Chromium binary. The scratch environment cannot download
  that binary through its restricted CDN path, so the GitHub result is the
  authoritative forced-context evidence and must be green before merge.

## Conditional physical evidence

Version 35 is not an unconditional cross-platform certificate until the
Android reference phones and one real iPhone Safari device complete background,
lock/call, memory-pressure context recovery, unsupported-device fallback,
30-minute thermal/audio and accessibility review. Automation may not substitute
for those rows.
