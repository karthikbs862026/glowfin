# ADR-0023: Merfolk cast and inhabited-city staging

**Status:** Accepted for the Phase 3B draft checkpoint on 2026-08-01. Owner
approval of the refined Tidekeeper face and Nacre Palace unlocked cast scaling;
it does not approve Phase 3B for merge or production release.

## Context

The approved Tidekeeper proved that a mermaid can remain recognizable in the
390×844 chase camera. Repeating that one model throughout the Moon-Garden would
still make the city feel assembled rather than inhabited. The next checkpoint
needs distinct social roles whose silhouettes and staging explain what people
do in each district, without adding gameplay collision or breaking the mobile
scene envelope.

## Decision

1. Map all five districts onto three guardian identities: Nacre Tidekeeper,
   Coral Warden and Astral Oracle. They share the approved face, rig, animation
   and material budget, but use crescent, sea-fan and armillary regalia.
2. Keep exactly one hero guardian visible. Swap district regalia on the existing
   rig instead of multiplying articulated draw calls.
3. Split background merfolk into reef citizens, horizontal current swimmers
   and paired conch heralds. Each remains instanced, deterministic and outside
   collider truth.
4. Attach the conch pair to the next gate shoulders. Citizens occupy upper city
   shelves and swimmers cross between districts, giving each role a spatial
   purpose rather than random placement.
5. Require all seven ambient-life signatures in the structural art gate and
   export all three hero identities plus the population kit for DCC handoff.
6. Preserve the 90-draw, 150K-triangle, 12-material, 48 MB texture, 3:1
   contrast, 1.2% highlight-clipping and phone-face readability limits.

## Consequences

The playable city gains visible guardians, civilians, moving swimmers and a
gate ceremony while keeping one hero rig and three additional instanced draws.
The worst-case guardian variant is 8,143 triangles and 17 draws; citizen,
swimmer and herald prototypes are 1,076, 1,328 and 1,428 triangles.
Code-native meshes remain layout and silhouette contracts only. Authored
sculpts, facial deformation, costumes, PBR atlases and real Android/iOS
performance/thermal evidence remain merge blockers.
