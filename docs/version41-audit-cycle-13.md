# Version 41 Audit — Cycle 13

## Final evidence findings

The previous mobile journey completed the primary Expedition and produced all six encounter screenshots plus the Moonseed-restored result. The strengthened assertions then identified two evidence and startup defects:

1. The polling-based QA hold was applied after encounter history changed, allowing a slow renderer to advance into the next active beat before the screenshot was encoded.
2. The direct playable-link auto-start was bounded to ten seconds, which was insufficient on the software-rendered mobile startup path even though manual entry was already operational.

## Corrections

- Install a loopback-only `MutationObserver` before the Expedition starts.
- Freeze the Adventure presentation immediately when the HUD's active encounter changes.
- Require each screenshot to show the exact named active beat, then release the hold and continue the same deterministic plan.
- Use the same sequential hold/release mechanism to capture the reduced-motion and high-contrast Duskmaw encounter.
- Extend deep-link auto-start polling from ten to thirty seconds while retaining a hard timeout.
- Expose `waiting`, `started`, or `timed-out` startup state to the QA surface.
- Require the direct-link journey to report `started` and observe Follow the Light.

## Production isolation

The capture hold remains available only on loopback with `v41qa=1`. It is unreachable on the hosted game and native wrappers. Production duration remains exactly 180 seconds. The corrections do not modify collider truth, standard rewards, Pearls, progress counters, Daily Tide, ghosts, leaderboards, tutorial state or competitive verification.

## Definitive release requirement

No failed check is waived. CI, production-readiness, Android/iOS wrappers, structural art, full render, exact-beat fast mobile journey and deterministic renderer soak must all pass on this owner-authored head before PR #25 is merged and Version 41 is deployed.
