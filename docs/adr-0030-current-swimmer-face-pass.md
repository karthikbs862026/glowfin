# ADR-0030: Moon-Current swimmer face and review pass

**Status:** Implemented for owner review on 2026-08-02. This advances issue #9
without changing the accepted choreography, gameplay route or audio system.
Physical-phone visual approval remains authoritative.

## Context

The accepted population checkpoint proved that two horizontal swimmers exist,
move asynchronously and stay outside the lane. Its generic round population
head still read as a pale ball with protruding eyes at phone scale. The full
cast atlas contained the swimmers, but did not give their expressions a
dedicated review surface.

## Decision

1. Replace the swimmer's generic head with one continuous hand-shaped face
   shell: fuller cheeks, a tapered jaw, softer forehead and shallow muzzle
   plane. Upright citizens and heralds remain unchanged.
2. Use shallow almond eye whites, turquoise irises, dark pupils and restrained
   catchlights on one level eye line. Offset both irises toward the direction
   of travel so mirroring the complete swimmer preserves forward gaze.
3. Keep the face open with a high side-swept hair cap, separated trailing hair
   ribbons and small nacre ear fins. Use lifted brows, a small nose, curved
   smile, soft cheeks and a crystal forehead mark for a friendly expression.
4. Retain one three-draw instanced family—body, face and eyes—for semantic-mask
   measurement. The revised prototype is 2,190 triangles and one material.
5. Apply only a subtle active-district tint to the shared swimmer instance so
   Tidekeeper, Coral Warden and Astral Oracle captures remain related without
   creating three duplicate meshes.
6. Raise the rendered swimmer floor to an 11 px facial plane and a 3 px eye
   stack at 390×844. Preserve all separation, motion, occlusion and lane-safety
   requirements.
7. Extend the labelled cast atlas with enlarged left/right swimmer face crops.
   A green mask is necessary but cannot replace human judgment of expression.
8. Export `merfolk-current-swimmer-v2.glb` as three named meshes sharing one
   `MeshStandardMaterial`, alongside the existing combined Moon-Life kit.

## Consequences

The current swimmer has a more dimensional, friendly face and travel-aware eye
direction while preserving deterministic animation and collider truth. The
dedicated GLB is a reproducible PBR handoff checkpoint; final external DCC
sculpt polish, UV/texture authoring and real Android/iOS screenshots remain
required before issue #9 or draft PR #7 can be merged.
