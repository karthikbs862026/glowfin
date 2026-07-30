# ADR-0018: Moon-Garden density, variation and ambient life

## Status

Accepted on draft PR #7 for owner visual review. Not approved for merge.

## Context

The corrected authored slice was readable but still looked like a sparse
prototype. One tall tower and one reef card repeated within the same portrait
frame, the upper water read as a flat navy void, the ground outside the lane
had large empty gaps, and nothing except Glowfin moved.

## Decision

- Store a stable `artVariant` on every generated gate and cycle three facade
  families without adjacent repeats. This field never participates in
  collision or solvability.
- Keep the exact original `gapLeft`, `gapRight` and wall geometry as gameplay
  truth. All authored decoration retreats into the collidable wall mass.
- Pack three obstacle/ruin families into one 1024px gate atlas.
- Pack a centre-open city skyline, four reef families and four ambient-life
  families into one 1024px world atlas.
- Increase outside-lane reef cadence and scale into continuous side banks.
  Placement is resolved from each atlas silhouette's inner edge, not its
  centre, so even large foreground clusters stay beyond the playable
  half-width.
- Animate moon-minnow schools, lantern jellies, ribbon rays and garden spirits
  on deterministic world-band paths. They are non-collidable and use different
  depths, speeds and vertical ranges.
- Add one moon source and a capped pool of drifting bioluminescent motes.
- Keep the first skyline layer inside the fog transition, distribute ambient
  swimmers through the upper water, and use feathered shafts plus a quiet
  radial haze so "moonlit" remains visible in portrait framing.
- Keep the collider-truth contour below the global bloom threshold. It remains
  pale cyan and at least 3:1 against the world, but cannot wash into a detached
  fluorescent post at the medium-quality bloom resolution.
- Give the caustic floor its own isotropic texture transform. Reusing the
  seabed mesh's 72×4000 UV repeat in a world-space shader stretched authored
  gravel into horizontal racetrack bands.
- Darken only beyond the authoritative lane half-width and add a faint,
  irregular moon-track at the centre. This creates route hierarchy without a
  raised road, rails or false collision boundary.
- Scale all non-gameplay density to 1.0 / 0.68 / 0.38 on high / medium / low
  quality tiers.
- Treat browser page errors and shader/WebGL console errors as capture
  failures; a missing atmosphere layer cannot silently pass on numeric scene
  budgets.
- Keep the PR draft until the actual Chromium portrait artifact passes owner
  visual review; technical gates remain necessary but not sufficient.

## Consequences

- Adjacent obstacle compositions no longer repeat.
- The playable corridor remains sparse and truthful while the side ecology and
  distant city carry visual richness.
- Ambient life makes the city feel inhabited without creating false hazards.
- Fourteen fixed environment draws represent more than one hundred pooled
  objects and remain independent of run length.
- Final optimized GLBs are still required before Phase 3B is game-ready.
