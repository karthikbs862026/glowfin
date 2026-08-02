# ADR-0031: Gate-linked living district and reef-current pass

**Status:** Implemented for owner review on 2026-08-03. This follows the
owner's approval of version 25 and does not change gameplay, collider truth,
the accepted merfolk faces/choreography or the approved Moon-Current score.

## Context

Version 25 made the two current swimmers readable and friendly at phone scale.
The surrounding city still depended on independently scattered architecture,
props and ambient-life bands. A valid run could therefore show all required
families across the evidence matrix while the actual next gate still looked
like an isolated obstacle instead of the entrance to a living palace district.

The art direction calls for taller, brighter districts; visible monuments,
tide-spears and conch fountains; larger fish, jellies and mantas; coral sway;
and travelling bioluminescent waves. Those additions must remain decorative,
bounded and outside the authoritative lane.

## Decision

1. Add a pure `livingDistrict` staging contract keyed by the next gate family.
   It guarantees two architecture layers on each side: a 7.8-unit primary
   palace/district silhouette and a 5.9-unit support silhouette. The Astral
   family selects the existing archless observatory asset and the Nacre family
   selects the palace asset.
2. Position every staged building from its measured geometry bounds plus an
   explicit outer margin. Give the hero side another 1.15 units of clearance.
   The district may frame the gate but may never imply false playable space.
3. Guarantee one merfolk monument, two tide-spears and one conch fountain at
   every upcoming encounter. Reuse the existing three prop instance families;
   no new draw call or material is added.
4. Increase phone-readable ambient activity within fixed pools: nine fish per
   school, at most five schools, ten jellies and six rays. Move their lateral
   bands outside the lane, enlarge their silhouettes and give rays a bounded
   wing beat.
5. Widen the reef banks through instance scale rather than more meshes. Raise
   the lane-side safety margin to 0.46 world units before applying at most 0.24
   units of shader sway.
6. Add two differently phased travelling reef-light crests and strengthen the
   limestone, nacre, bronze, lapis, crystal and living-coral responses. The
   pulses use simulation time and cannot feed back into movement or scoring.
7. Keep Glowfin, merfolk geometry, choreography, route data, collisions,
   controls, camera, scoring, replay determinism and all audio files unchanged.

## Consequences

The next gate is now visually attached to a deterministic living district and
ceremonial court, while fish, jellies, rays and reef movement remain bounded by
the existing instance pools. The pass adds no draw family or active material.
The complete 36-state phone matrix, contrast floor, lane/collider overlays,
bundle cap and 5,400-frame resource soak remain mandatory before acceptance.
Phone-scale visual truth stays in the independent 390x844 matrix. The
lifecycle soak uses a 128x277 raster while retaining the identical scene graph,
high-quality bloom, caustics, shaders, pools and resource ceilings so software
fill-rate cannot hide heap or GPU growth behind the bounded runner timeout.
