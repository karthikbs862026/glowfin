# Version 41 Audit — Cycle 10

## Finding: Expedition failure leaked into the standard post-run economy

The captured mobile journey showed the ordinary `Run over` screen during `The Missing Moonseed`. That meant an unranked finite Expedition could grant standard Lumen Pearls, increment ordinary-run progress, stop the encounter clock, and obscure the character-led journey.

This was treated as a release-blocking Version 40 regression rather than a test-only timeout.

## Root cause

The Version 41 entry card reused the ordinary Moon Well Dive action. The core run therefore used the normal fresh-run termination path even though the presentation layer was operating an unranked Expedition.

## Corrective architecture

- Version 41 now owns an independent active-play clock. Production remains exactly three minutes; loopback QA alone uses the configured acceleration factor.
- When the underlying current exhausts Light, the standard reward/post-run path is intercepted before progress, Pearls, objectives, ghosts, leaderboards, sharing or cloud sync can mutate.
- A guardian recovery immediately creates a fresh underlying current without emitting another ordinary `run_start` or presenting the standard post-run stack.
- Encounter, collection, rescue, race and chase state survive the recovery.
- The Moon Well Dive handler suppresses ordinary tap/run telemetry for the Expedition; the Version 41 layer emits one semantic Expedition start instead.
- On the ceremonial finish, the core simulation pauses and the Version 41 restoration result remains authoritative.

## Strengthened release gate

The mobile browser gate now fails unless all of the following are true:

- all six encounter kinds appear in exact deterministic order;
- at least one unattended guardian recovery is exercised;
- the ordinary post-run surface is never visible;
- the Version 39/40 primary and backup progress records are byte-identical before and after the Expedition;
- the Version 41 two-copy record is persisted;
- Moon Well restoration is visible;
- direct-link, manual-entry, reduced-motion and high-contrast paths all pass.

The existing 2.00 MB download cap, performance budgets, privacy boundary, disabled rewarded-video state and competitive integrity rules were not relaxed.
