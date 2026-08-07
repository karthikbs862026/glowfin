# Version 41 Audit — Cycle 14

## Finding

The exact-beat primary Expedition completed successfully, the six named screenshots were correct, Moonseed restoration was visible, and the direct-link journey started. The subsequent normal-home isolation page then failed to create its WebGL-backed runtime while the already completed Expedition page remained open in the same software-rendered browser context.

## Root cause

The gate was combining independent user journeys as simultaneous WebGL pages. This manufactured GPU-context pressure that does not represent normal single-page mobile play and prevented the normal-home entry assertion from running.

## Correction

- Close the completed primary Expedition page after its completion screenshot and save-isolation snapshot.
- Open the direct-link journey only after that WebGL context has been released, then close it before the normal-home journey.
- Require the normal-home journey to reach the complete ready-hub contract rather than checking only for one DOM node.
- Increase the bounded ready-hub allowance to thirty seconds for the one-frame-per-second software renderer.
- Keep the reduced-motion/high-contrast journey in its own browser context as before.

## Production impact

This is QA isolation only. No production runtime, gameplay timing, collision, progression, reward, telemetry or accessibility behavior changes. The correction makes the browser matrix model independent real user visits instead of an artificial multi-tab GPU stress case.

## Definitive release requirement

No failure is waived. CI, production-readiness, Android/iOS wrappers, structural art, full render, exact-beat mobile journey and renderer soak must all pass on this owner-authored head before merge and deployment.
