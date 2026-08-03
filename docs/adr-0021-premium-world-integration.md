# ADR-0021: Premium-world integration and structural richness gate

## Status

Accepted for the Phase 3B draft branch on 2026-08-01. This does not approve
Phase 3B for merge or release; authored DCC replacement, Android and iOS Safari
sign-off, and owner visual approval remain mandatory.

## Context

The latest Android portraits were clearer than the first reset, but still read
as separately patched primitives: purple reef forms resembled faceted rocks,
gate relief disappeared under bloom, repeated rods and arches erased district
identity, and no readable moonfolk or ceremonial props inhabited the route.

Reference-game research showed a common production rule rather than an asset
to copy: premium runners protect a simple readable corridor, then establish
authored districts through landmark silhouettes, recurring material grammar,
recognizable props, characters and ambient motion. Relevant primary sources:

- [Subway Surfers City](https://subwaysurferscity.com/) presents distinct
  districts, new environments and handcrafted challenges.
- [Blades of Brim](https://sybogames.com/blades-of-brim/) uses creatures and
  realm changes to make traversal feel inhabited.
- [Talking Tom Gold Run](https://talkingtomandfriends.com/apps/talking-tom-gold-run)
  foregrounds characters and visibly different worlds.
- [SEGA HARDlight](https://www.hardlightstudio.com/games) describes Sonic Dash
  through its surroundings and environment variety.
- [Temple Run 2: Lost Jungle](https://templerun2.zendesk.com/hc/en-us/articles/1500009642961-Lost-Jungle)
  names fauna, manuscripts and totems as authored world content.
- [Khronos glTF Asset Creation Guidelines 2.0](https://www.khronos.org/blog/introducing-asset-creation-guidelines-2.0-siggraph-2025)
  define the future DCC hand-off around scale, pivots, instancing, PBR, UV and
  validator discipline.

## Decision

1. Replace the three repeated gate treatments with five original districts:
   Tide Court, Lapis Archive, Living Coral Sanctuary, Nacre Palace and an
   archless twin-pylon Astral Observatory. The collision opening and straight
   cyan clearance seam remain unchanged.
2. Establish six physical material roles inside one draw-efficient shader:
   limestone, nacre, bronze, lapis, crystal and living coral. Each receives a
   different response to rim light, roughness cues, colour travel or restrained
   emission instead of one broad painted-stone treatment.
3. Add recognizable world nouns, not object noise: grounded palace terraces,
   stairs, colonnades and domes; a twin-pylon observatory; maze-ridged brain
   coral; thick scalloped table coral; merfolk monuments; tide-spears; conch
   fountains; swimming moonfolk; larger fish schools, mantas and jellies.
4. Keep all richness outside the authoritative lane. Bounds-derived placement
   includes the object's rendered half-width plus a safety margin. No relief,
   reef, prop, bloom or background contour may suggest false clearance.
5. Use a traveling low-amplitude bioluminescent wave and vertex sway for life.
   Liveliness comes from coordinated motion and hierarchy, not particles or
   unbounded object counts.
6. Reduce exposure, bloom spread and god-ray energy. White-gold is an accent;
   the art gate now blocks when clipped highlights exceed 1.2% of the portrait.

## Hard guardrails

- Five named gate families; at least three distinct visible families.
- Five architecture, six reef, four ambient-life and three prop signatures.
- Six required material roles. Removing any required signature is a blocker.
- Collider/visual alignment within 0.05 world units; no gap protrusion.
- Contrast p10 at least 3:1 in every approved effect state.
- Fewer than 90 draws, fewer than 150K triangles, fewer than 12 active art
  materials, under 48 MB decoded texture memory and under 6 MB compressed art.
- Bloom/clipping, family-diversity, collider truth and performance checks fail
  independently; one passing category cannot waive another.

## Measured draft result

The complete 36-state 390×844 Chromium matrix records 31–47 draws,
55,206–104,814 triangles, ten active materials, 10.3 MB decoded textures,
0% clipped highlights and contrast p10 from 3.27:1 to 9.49:1. This is
regression evidence, not real-device release approval.

## Consequences and remaining work

The draft now has an integrated district/ecology/inhabitant grammar and a hard
regression floor. Code-native meshes are still integration sources, not a
claim of final premium DCC finish. A modeler must replace hero gates, palace,
reef and moonfolk with optimized authored GLBs/PBR assets while preserving the
same signatures, pivots, bounds, material roles, LOD budgets and collider
contract. PR #7 remains draft until owner visual review and both reference
devices pass.
