# ADR-0037: Moonwake progression and deterministic Daily Tide Trial

**Status:** Version 33 release candidate
**Date:** 2026-08-04

## Context

Version 32 made progress, telemetry, replay and saved-ghost racing durable, but
it did not provide the collection, daily-return or post-run progression loop
required for Phase 4A. Adding that loop must not change Glowfin's certified
controls, camera, collision, scoring, reaction window, art composition or
mobile rendering budgets.

Calendar rewards also create duplication and clock-manipulation risks. A daily
challenge is not acceptable unless every client derives the same seed, the
existing solver proves the course, and saved same-seed evidence remains
deterministic.

## Decision

- Upgrade progress to schema version 2. Preserve Version 31/32 data through a
  validated migration that initializes meta fields once and never invents
  currency or claims.
- Award Lumen Pearls and equal Tide XP through bounded deterministic run,
  objective and first-daily-completion rewards. Bind run rewards to a bounded
  claim identifier and merge currency, XP and claims idempotently.
- Derive Tide Levels from the quadratic boundary `(level - 1)^2 * 90`. Ship
  exactly twelve unlockable colours, fin accents, trails and auras plus four
  defaults. Apply them only through uniforms on the existing Glowfin body and
  trail materials; cosmetics receive no simulation or authority path.
- Derive the daily seed from
  `glowfin-moonwake-daily-v1:<UTC YYYY-MM-DD>`. Prefer the hosted UTC day, retain
  a monotonic trusted day offline, and withhold calendar progress when a local
  clock moves backward.
- Rotate exactly two daily objectives and one weekly objective. Award each
  objective once, cap retained history, and allow one single-day gap in an
  active Daily Tide streak.
- Save only the best valid replay for the active daily day and expose Daily
  ghost racing as an explicit same-seed action. The ghost remains
  presentation-only and non-colliding.
- Rebuild the post-run DOM panel around Lumen rewards, Tide progress, unlocks,
  objectives, streak and an immediate saved-ghost rematch. The DOM layer adds
  no WebGL draw calls.
- Expand the existing consent gate across the run-to-reward-to-unlock-to-equip,
  daily, objective, streak, ghost-rematch and next-day-return funnel. Continue
  to collect nothing before consent.
- Add provider-neutral rewarded-video interfaces for run recovery and doubled
  Lumen placement. Ship every feature flag disabled and include no advertising
  SDK, real-money purchase or gameplay mutation.

## Consequences

Version 33 provides a deterministic first-run-to-return candidate while
preserving the Version 31 gameplay/art baseline and Version 32 durability
contracts. Currency, objectives, daily rewards and cloud conflicts are bounded
and duplication-safe. Cosmetics reuse existing GPU resources.

Automated tests and emulated gates can establish schema, reward, determinism,
solvability and budget invariants. They do not replace the required physical
first-run-to-next-day-return journey, Android thermal/audio pass or iOS Safari
sign-off. Global leaderboards, shareable clips, anti-cheat authority and live
rewarded-video integration remain Phase 4B.
