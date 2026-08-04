# ADR-0041 — First 10 Minutes and Economy Clarity

**Status:** Accepted for Version 37  
**Baseline:** Version 36 `7a82e1f4e1bb296ea1f2b49ad84be9aba984ca74`

## Context

The accepted expert verdict found that Glowfin’s technical foundation was ahead
of its player experience. The build launched directly into play, separated
sound activation, exposed an overloaded post-run stack, used phone text below
the desired reading size and gave Lumen Pearls no spending purpose.

## Decision

- Hold simulation at a lightweight Moon Well hub until an explicit Tap to Dive
  gesture starts both the run and audio activation path.
- Teach steering, Light, near-miss scoring and collision recovery through a
  bounded action-reactive first-run sequence with safe time fallbacks.
- Keep post-run to one primary action (Dive Again) and two secondary actions
  (saved ghost and Moon Well). Move competition, sharing, access, privacy and
  wardrobe controls into dedicated hub destinations.
- Keep Tide XP as the availability gate. Lumen Pearls purchase cosmetics;
  ownership, preview and equip are separate states. Cosmetics remain outside
  gameplay and competitive truth.
- Migrate schema-v2 progress to schema v3 once. Previously available cosmetics
  are grandfathered as owned, and spent Pearls cannot reappear through a
  pre-purchase cloud conflict.
- Move the release identity into Settings while keeping it machine-verifiable.
- Expand the consent-gated funnel through Tap to Dive, tutorial completion,
  first reward, purchase, equip and Daily Tide entry.

## Consequences

The first session has a deliberate beginning, Daily Tide is reachable without
ending a normal run, and the two progression currencies now have distinct
jobs. Version 37 adds no meshes, materials, draw calls, triangles, textures,
colliders, score authority or control changes. Signature course variety remains
Version 38 scope.

