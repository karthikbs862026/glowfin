# Glowfin Core Game Memory — Version 41 Directive

**Owner-approved on 2026-08-05. This directive supersedes the earlier release-order statements in `docs/core-game-memory.md` wherever they conflict.**

## Release-order override

Version 40 — Controlled Soft Launch & Retention Validation is paused and moved to the end of the current enhancement roadmap.

The active order is:

1. Version 41 — Living Current Vertical Slice
2. Version 42 — Tide Sprint & Glowkin Crew
3. Version 43 — Realms of the Lost Kingdom
4. Version 44 — Duskmaw & Leviathan Encounters
5. Version 45 — Moon Well Restoration & Relic Atlas
6. Version 46 — Living Tide Season One
7. Version 47 — Social Currents
8. Version 48 — Commercial Content Scale
9. Version 40 — Controlled Soft Launch & Retention Validation

Moving Version 40 does not remove or weaken any Version 40 protections. Version 41 and every subsequent build must be audited against the retained Version 40 baseline for onboarding, first-run completion, three-run intent, Daily Tide access, cosmetic purchase/equip, privacy, consent, economy integrity, device health, crash safety, and D1/D7 instrumentation readiness.

## Version 41 execution contract

Version 41 must ship `The Missing Moonseed` as a deterministic, unranked, three-minute Expedition with:

- a replay-safe six-beat Encounter Director;
- Lumen Motes and a visible Lumen Chain;
- one deterministic Moonseed Fragment route;
- three Rescue Lights and a Miri rescue outcome;
- one non-colliding Neri rival sequence;
- one short, readable Duskmaw pursuit with three Current Breaks;
- a ceremonial finish and visible Moon Well restoration;
- a six-item Relic Atlas page;
- semantic consent-gated telemetry;
- corruption-safe, duplicate-safe local discovery/restoration progress.

## Quarantine and fairness boundary

Version 41 is an additive Adventure/Expedition layer. It must not change the authoritative Endless Dive, Daily Tide, ghost, leaderboard, score, Light, momentum, cyan-collider, Pearl economy, cosmetic, onboarding, accessibility, recovery, or anti-cheat contracts.

The Expedition must not introduce:

- a new currency;
- purchasable speed or character statistics;
- random power-ups;
- combat controls;
- real-time multiplayer;
- competitive revive advertising;
- live rewarded-video activation;
- collision-capable rivals or companions.

## Mandatory release gates

Version 41 may merge and deploy only after all of the following pass:

- lint, strict TypeScript, complete unit/integration tests and production build;
- deterministic encounter order and content-plan hash validation;
- engagement cadence with no purpose gap over 25 seconds;
- collectible placement and lane-safety checks;
- corruption recovery, idempotent claims and conflict-merge tests;
- explicit Version 40 surface-isolation audit;
- phone-viewport browser journey through all six beats and completion;
- reduced-motion and high-contrast Duskmaw readability;
- audio activation, runtime interruption/context recovery and native-wrapper checks;
- structural art, full render matrix, fast render matrix and deterministic renderer soak;
- existing 90-draw-call, 150,000-triangle, 48 MB texture, fewer-than-12-material, 700 ms reaction and 30 fps floors;
- sealed release identity, immutable staging artifact and post-deploy smoke verification.

Any failure must be fixed and the affected gate rerun. A playable link is not considered released until the hosted `release.json`, visible release identity and deployed source SHA agree with the merged Version 41 commit.
