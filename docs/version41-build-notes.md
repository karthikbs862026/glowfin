# Version 41 — Living Current Vertical Slice Build Notes

## Scope delivered

Version 41 adds one bounded Adventure Expedition, `The Missing Moonseed`, without replacing Endless Dive or changing competitive truth.

The Expedition is generated from a fixed content version, seed and deterministic six-beat plan:

1. Follow the Light
2. Relic Fork
3. Rescue Miri
4. Race Neri
5. Duskmaw Appears
6. Return to the Moon Well

Player-facing additions include a Moon Well Expedition card, flowing Lumen Motes, Lumen Chain feedback, a Moonseed Fragment route, three Rescue Lights, Miri, a non-colliding Neri sequence, three Current Breaks, a presentation-only Duskmaw pursuit, a ceremonial finish, visible Moon Well restoration, rematch, and a six-item Relic Atlas.

## Architecture

- `config/version41.json` owns versioned encounter, collectible, race, chase, presentation and budget tuning.
- `src/engagement/version41Plan.ts` validates configuration, creates and hashes the immutable plan, owns additive progress, and exposes deterministic QA helpers.
- `src/engagement/version41.ts` installs the unranked Expedition UI and presentation layer.
- The layer is inactive unless `data-glowfin-mode="expedition-v41"` is set by the explicit Expedition entry point.
- The existing `Run` simulation, gates, collision, score, Daily Tide, ghost, leaderboard, Pearl economy, tutorial and accessibility classification remain authoritative and unchanged.
- Common objects are instanced. Version 41 adds at most ten draw calls, eight thousand triangles and two shared materials.

## Persistence

Version 41 discovery state is isolated in a checksummed, two-copy, bounded local record. It stores only relic discoveries, Expedition completions, best chain/race/chase outcomes, Miri rescue, Moon Well restoration and idempotent claims. It contains no currency or purchasable power.

Merge semantics use set union for discoveries and maxima/boolean union for progress. Relic and restoration claims do not duplicate.

## Telemetry

Version 41 reuses the existing consent-gated semantic event allowlist. Payloads identify only the Expedition, encounter kind, outcome bands, chain counts and restoration state. The layer does not collect identity, raw steering, touch paths or pre-consent data.

## QA additions

- deterministic plan/order/hash unit tests;
- maximum 25-second purpose-gap test;
- lane-safe mote path and circular collectible truth tests;
- additive draw/triangle/material budget tests;
- no-currency/no-power/no-live-ad audit;
- corruption recovery, duplicate-claim and conflict-merge tests;
- mobile Chromium journey through all six encounters and completion;
- explicit normal-mode isolation audit against Version 40 surfaces;
- reduced-motion/high-contrast Duskmaw checkpoint;
- screenshots and JSON evidence uploaded by the art-gate workflow.

## Release status

This file describes the implementation candidate. Final certification is recorded in `version41-release-report.md` after pull-request and main-branch gates, deployment and hosted source-fingerprint verification complete.
