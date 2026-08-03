# ADR-0034: Runtime Glowfin production character

**Status:** Implemented as the Version 30 owner-review candidate
**Date:** 2026-08-03

## Context

Version 29 established a cohesive first-five-gates world, but Glowfin remained
the one high-attention character rendered directly from construction geometry.
The exporter already emitted a skinned character and five named clips, yet the
live runtime loaded only gate and reef GLBs. That allowed handoff evidence to
pass without proving that the production character payload could decode,
install and animate in the game.

The visible model also retained transition cues: a near-spherical torso,
appendages that met the body abruptly, a short rear tail and eye caps that were
easy to lose at portrait gameplay scale.

## Decision

- Export `glowfin-v2.glb` with one skinned body mesh, one combined eye mesh,
  exactly ten semantic bones and the existing five named clips.
- Weld and Meshopt-compress the character with the gate/reef package, preserve
  UV/colour/skin attributes and validate mesh names, clips and bone count after
  compression.
- Load Glowfin, gates and reefs as one atomic runtime decision. If any payload
  fails, the validated construction geometry remains a safe startup fallback;
  every art, audio/render and soak entry point rejects that fallback as
  production evidence.
- Install only Glowfin's decoded geometry into the existing ten-bone runtime
  skeleton and custom sea-glass/eye shaders. Simulation remains the animation
  authority and course movement, collision, camera and replay are unchanged.
- Refine the same bounded topology with an organic pudgy body profile, one
  manta-fin membrane per side, integrated gill crowns, one longer central
  kelp-like tail and larger rear-readable lateral eyes immediately inside the
  gills. Do not add separate shoulder collars or a tail peduncle beneath the
  animated membranes.
- Resolve five deterministic visual states—calm, mid, max, collision and
  recovery—from momentum and collision/recovery fractions. Collision and
  recovery take precedence over propulsion.

## Consequences

The complete compressed runtime package grows from roughly 756 KB to roughly
881 KB while staying under the unchanged 1.25 MB art-package cap. Glowfin stays
at two draws, ten bones and two materials. After removing the overlapping
shoulder and peduncle layers, its LOD0/LOD1 geometry remains inside the original
6–8k and 3–4k triangle ranges at 7,116 and 3,568 triangles.

Owner phone review and the calibrated browser matrix must still confirm that
the larger eyes remain 8–12 pixels, Glowfin remains within 8–10% of portrait
width, the obstacle route remains clear at maximum momentum, and the five
states read without changing input response. Final external DCC sculpt, UV and
PBR source replacement remains a separate production-art gate.
