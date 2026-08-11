# ADR-0044: Version 43 realm framework and Kelp Cathedral vertical slice

**Date:** 2026-08-09  
**Status:** accepted for Version 43-R1 implementation  
**Base:** promoted Version 42-R1 merge
`6228c7755f55c63b27ccf8e58fac56291c9beae3`

## Context

Version 43 begins *Realms of the Lost Kingdom*. Adding several visual biomes at
once would make mechanical distinction, memory residency and mobile budgets
impossible to judge. The first release therefore needs one complete realm slice
and a reusable data contract before a second realm is authored.

## Decision

Version 43-R1 adds a data-driven realm registry and one selectable Moon Well
destination: **Kelp Cathedral**.

Kelp Cathedral is mechanically identified by two primary verbs:

1. **Swaying Frond Windows** change aperture and lateral centre on a readable,
   deterministic rhythm while retaining a proved minimum opening.
2. **Reversing Current Tunnels** temporarily narrow the lateral corridor and
   reverse deterministic drift halfway through the tunnel.

The hero encounter repeats until the player cleanly rescues a baby manta from
a collapsing kelp chamber. A separate optional current contains one durable
Relic Page. Both outcomes are idempotent in a bounded realm save.

The realm renderer uses 15 fixed pooled draws, eight realm-owned materials and
three generated 512 px WebP albedo maps. Only the current realm presentation is
visible; Classic Moon Garden gates, route inlays, scenery, floor and seabed are
hidden while Kelp Cathedral is active. Collision-aligned broad frond curtains
replace masonry, while curved living stipes and holdfasts, three-strand canopy
braids, layered light, pulsing spores, scalloped shell bells, leafy sea dragons
and a persistent manta beacon establish the cathedral silhouette. The course,
collision and renderer consume one authoritative realm plan.

## Compatibility boundary

- Classic Dive, Daily Tide, guided tutorial and Chapter One construct the
  default `moon-garden` course exactly as Version 42 did.
- Tide Sprint keeps its separately loaded renderer and Version 42 race plan.
- Kelp runs do not write Classic replays, verified leaderboards or Moonflash
  challenge clips, and their scores cannot replace the Classic best score.
  Shared Lumen Pearl/Tide XP rewards may still be awarded by the existing
  idempotent run ledger.
- Realm progress is a separate checksummed primary/backup document in R1 so the
  promoted schema-4 cloud contract is not mutated before its backend migration
  is versioned and certified.

## Budgets and acceptance

The existing ceilings remain binding: 90 draws, 150,000 triangles, 48 MB
texture memory, at most 12 active materials, at least 700 ms reaction time and
30 fps. The redesigned R1 field adds 15 pooled draws, eight materials, three
generated albedo maps and 99,486 reserved triangles. Its active Kelp texture
estimate is 13.45 MB; the inherited Moon Garden floor and seabed are inactive
in this realm so the full presentation remains within the material ceiling.

No second realm may enter production until blind playtesting distinguishes Kelp
Cathedral from a label-free frame as well as by its mechanics. A realm that
retains Moon Garden architecture and merely changes HUD copy or palette fails
this boundary. V43-R1 must
pass deterministic generation, solvability, lifecycle, Android/iPhone,
performance and 5,400-frame soak certification before promotion.

## 2026-08-10 visual-review amendment

The first playable candidate failed the boundary above: its HUD said “Kelp
Cathedral,” but the frame remained recognisably Moon Garden. This amendment
makes realm-owned silhouette and removal of inherited architecture explicit,
and records the fixed-capacity living-cathedral replacement as the accepted R1
presentation direction.

## 2026-08-10 realism and landmark-readability amendment

The first living-cathedral replacement improved the palette but still failed
ordinary-play recognition: dark straight trunks, pipe-like arches, repeated
spike curtains, tiny bells and sparse spores obscured the requested fantasy.
The accepted correction defines landmarks by silhouette, scale, surface and
light—not labels. Braids must visibly contain three organic strands, collision
walls must read as broad kelp tissue, bells and sea dragons must be recognisable
without stopping, and the rescue manta must remain visibly ahead until the
encounter. Authored organic albedo, natural seabed texture and layered emerald,
aqua and warm canopy light are now part of the R1 presentation contract.
