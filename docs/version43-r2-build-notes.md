# Version 43-R2 — Crystal Trench: Ruin Threshold

**Build:** first playable Crystal Trench slice

**Base:** accepted Version 43-R1 build

`56c5808371ac6a34479044e3e08861ec86f6ff12`

**Status:** implementation candidate; physical R2 device certification pending

## Playable slice

- Crystal Trench is selectable from the existing Moon Well.
- Deterministic Prism Pulses distinguish one true cyan route from two fading
  violet reflections.
- The buried Trench Gate repeats until crossed cleanly and then closes the R2
  arrival slice.
- The HUD, post-run result and telemetry use Crystal-specific language and
  never report a Kelp rescue.

## Presentation and budget

Crystal Trench owns an indigo cavern silhouette: layered basalt cliffs,
reflective faceted crystal forests, submerged block ruins, a monumental
voussoir gate, refracted moonbeams, cyan mineral fissures and circular
prismatic dust. Three generated albedo maps provide crystal, ruin-stone and
seabed surfaces. Moon Garden masonry, crescent inlays and floor surfaces are
hidden.

The renderer is hard-capped at eleven additional draws, five materials and
36,450 reserved triangles. All three textures are bounded 512 px WebP assets; the
renderer reports 16.45 MB for the complete resident Moon Garden, Kelp and
Crystal texture set, below the 48 MB realm ceiling.

## Preservation

The accepted Kelp Cathedral build remains intact. Classic Dive, Daily Tide,
guided tutorial, Chapter One Expedition and Tide Sprint retain their promoted
Version 42 paths. Crystal runs cannot save a Classic replay, submit a verified
leaderboard result, create a Moonflash challenge clip or mutate the existing
Kelp progress document. R2 deliberately adds no Crystal save migration.

## Deferred to Version 43-R3

- full Sliding Crystal Plates traversal;
- the Neri mirror-current race;
- Crystal relic/progression rewards;
- the complete cavern journey beyond the Trench Gate.

## Automated evidence

The candidate includes deterministic generation and pulse-cadence tests, a
5,400-frame clean threshold soak, renderer budget assertions, an integration
seam for the separate realm art and Moon Well entry, and the full inherited
Version 42/Kelp regression and production policy suites. The complete run is
441/441 tests across 58 files, plus 47/47 art-gate policy tests and a passing
structural art gate. Physical Android and iPhone feel, safe-area, lifecycle,
performance and thermal confirmation remain required before promotion.
