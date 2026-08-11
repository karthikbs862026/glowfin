# ADR-0046: Version 43-R4 mainline realm integration

**Date:** 2026-08-11

**Status:** accepted for implementation and certification

## Context

Version 42 is the promoted mainline at
`6228c7755f55c63b27ccf8e58fac56291c9beae3`. Kelp Cathedral R1 and Crystal
Trench R3 were accepted as isolated realm builds, but their prototype save and
entry paths were not yet suitable for the stable Glowfin route. The earlier
Crystal R2 threshold prototype is explicitly superseded by the final R3
Mirror Current journey.

## Decision

Version 43-R4 branches from the exact Version 42 merge and imports the accepted
Kelp Cathedral R1 and final Crystal Trench R3 runtime. The Moon Well presents
them as a progression chain:

1. Realm 1 starts at Kelp Cathedral.
2. Rescuing the baby manta unlocks Realm 2 exactly once.
3. Realm 2 continues into the final Crystal Trench R3, including Prism Pulse,
   the repeat-until-clean Trench Gate and plates, and the close Neri race.

The shared save advances from schema/envelope 4 to 5. Realm history is stored
inside the same checksummed primary/backup and cloud-merge document as Classic,
Daily, Expedition, tutorial and Tide Sprint state. A one-time importer retains
valid standalone realm-prototype history without retroactively granting
rewards.

Four idempotent realm objectives award existing Lumen Pearls and Tide XP:

- rescue the baby manta: 60 Pearls and 45 XP;
- recover the Kelp Relic Page: 35 Pearls and 30 XP;
- win the Mirror Current race: 75 Pearls and 55 XP;
- earn a clean Crystal completion: 45 Pearls and 35 XP.

Realm claims update shared aggregate run time and collisions, but they cannot
write Classic best score/replay, Daily calendar claims, Tide Sprint ghost or
race authority, tutorial completion, Expedition state, verified leaderboards,
or Moonflash clips. Realm entry, completion, abandonment, objective, reward and
Realm 2 unlock telemetry remain consent-gated and bounded.

## Certification boundary

R4 must keep all Version 42 regression paths green and pass deterministic
course and paired-run equality, close-win fairness, repeat-until-clean recovery,
5,400-frame simulation and renderer soaks, lifecycle/context recovery, fixed
mobile render budgets, sealed-payload checks, and Android/iOS wrapper builds.

Automated iPhone-simulator and Android wrapper compilation are platform
evidence, not physical-device evidence. No R4 hardware touch, Safari/Metal,
thermal, battery or interruption result may be inferred from Version 42 or from
desktop emulation; those rows remain explicitly pending until executed or
confirmed by the owner on the exact R4 candidate.

## Consequences

- R4 is the first combined mainline candidate for the two accepted realms.
- The isolated R1/R2/R3 review routes remain historical comparison routes.
- Crystal R2 is never imported as the production Realm 2 implementation.
- The main playable route is promoted only from the merged R4 tree after its
  required repository, browser-render and native-wrapper checks are green.
