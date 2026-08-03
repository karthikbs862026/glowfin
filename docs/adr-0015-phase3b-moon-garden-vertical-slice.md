# ADR-0015: Phase 3B Moon-Garden vertical slice

## Status

Superseded for visual-quality decisions by ADR-0016. The collision, LOD,
instancing and evidence architecture remains useful, but the first rendered
art treatment was rejected in owner review and must not be merged unchanged.

## Context

Phase 3A made collision truth and art evidence enforceable, but the playable
build still used a twelve-mesh sphere creature, box gates, box skyline and cone
coral. The Concept-First Art Bible requires a coherent Moon-Garden language,
production LODs, simulation-driven creature states, local bioluminescence and a
sparse readable lane.

Importing a broad external asset pack would have increased payload, materials
and iteration cost before the direction was proven in the real portrait chase
camera. It would also risk visible geometry drifting away from deterministic
colliders.

## Decision

Build one bounded code-native production vertical slice:

- Merge Glowfin's body, fins, tail and grouped gills into one ten-bone skinned
  mesh; merge both eyes into a second emissive mesh.
- Generate LOD-locked wall fragments whose inner edge is exactly the
  authoritative runtime plane. Render the cyan seam as a separate strip that
  retreats into the wall and never protrudes into the gap.
- Replace box scenery with instanced broken-tower and fork-crowned-spire
  archetypes.
- Replace cone coral with instanced medium clusters and broad ribbon kelp.
- Share one outside-lane material across ruins, coral and kelp. A world-space
  radial response centred on Glowfin awakens only nearby glow-weighted surfaces.
- Keep procedural caustics and the existing mesh-ribbon trail.
- Use vertex colour and broad shader washes instead of shipping texture assets
  during this slice. The compressed binary art payload therefore remains zero;
  visual complexity is in generated geometry and shaders.

## Budgeted generated geometry

| Family | LOD0 | LOD1 | LOD2 |
| --- | ---: | ---: | ---: |
| Glowfin | 7,240 | 3,104 | — |
| Wall fragment | 1,464 | 624 | 174 |
| Broken tower | 4,384 | 1,592 | 508 |
| Spire | 1,960 | 868 | 240 |
| Medium coral | 920 | 432 | 96 |
| Ribbon kelp | 416 | 120 | — |
| God ray | 12 | — | — |

All values are regression-tested against the production manifest.

## Consequences

- The first slice is immediately editable and deterministic in the repository;
  no Blender or binary-asset toolchain is required to review the direction.
- Repeated scenery remains instanced. Glowfin drops from twelve character draws
  to two.
- LOD1 stays fairness-critical because the decision point is 31.5 world units.
- The slice proves form, silhouette, palette, response and performance, but is
  not final content breadth. It deliberately omits the collapsed arch, hero
  coral, small-prop atlas and authored texture/KTX2 pipeline.
- CI Chromium evidence is regression evidence only. Android and iOS Safari
  remain mandatory before release sign-off.
