# ADR-0022: Hero Tidekeeper and phone-readable merfolk contract

**Status:** Accepted for the Phase 3B draft checkpoint on 2026-08-01 and
superseded for cast-scaling decisions by ADR-0023. This does
not approve Phase 3B for merge or release; authored DCC replacement and real
Android/iOS sign-off remain open.

## Context

The premium-world integration made the Moon-Garden richer, but its moonfolk
were still small, single-mesh silhouettes with whole-body bobbing. They could
suggest population in the midground but could not carry character appeal or be
identified reliably as mermaids at normal portrait gameplay speed.

Adding more background figures would repeat the same weakness. The next build
therefore needs one prominent character whose silhouette, staging, motion and
mobile readability are measurable before a larger merfolk cast is produced.

## Decision

1. Introduce the Moon-Garden Tidekeeper as the hero merfolk guardian. Her
   runtime hierarchy must expose a readable face and eyes, flowing hair,
   articulated arms and hands, shell/bronze/lapis regalia, a scaled three-joint
   tail, broad caudal and side fins, a lapis pendant and tide-spear.
2. Drive hover, swim, turn, patrol and greeting motion independently. Tail,
   elbows, greeting hand, hair and fins may not move only through root bobbing.
3. Stage the guardian in a reef-cleared alcove beside the next truthful gate.
   She remains decorative, outside collider authority and beyond the lane plus
   a 0.45-world-unit safety margin.
4. Keep the existing smaller moonfolk as background citizens/LOD population.
   They must not substitute for the hero character signature.
5. Require the hero to measure at least 72 px tall, her face at least 22 px and
   either eye at least 4.5 px in every approved 390×844 phone capture. A
   missing, faceless, static or undersized guardian blocks the art gate even if
   the overall performance matrix passes.
6. Preserve the mobile envelope: 6.5K–8K hero triangles, one shared material
   and no more than 16 hero draws. Export the hierarchy and five named clips as
   `hero-merfolk-v1.glb` for the authored production handoff.

## Verified checkpoint

The refined code-native Tidekeeper contains 7,647 triangles and 16 articulated
mesh parts using one existing world material. The deterministic capture-camera
projection measures her at 85.03–93.43 px overall, with a 22.95–25.17 px face
and 6.16–6.76 px eyes across low-to-max momentum FOV. The complete browser
matrix remains the visual evidence gate before publication.

Owner phone review also identified the large structure behind the character as
an out-of-place building. It was the Nacre Palace gatehouse: one oversized dome
and a square stacked pier. Variant 3 now uses a low layered shell court, three
small lantern domes, a curved outer shoulder and rounded nacre pier drums. The
authoritative inner wall plane and opening are unchanged.

## Consequences

The playable checkpoint now has a recognizable hero mermaid and a scalable
guardian/citizen hierarchy without changing gameplay or collision truth. The
code-native mesh is still an integration contract, not premium final art. A DCC
artist must replace it with an authored sculpt, UV/PBR set, facial rig, hair and
cloth solution, and final clips while retaining names, silhouette, staging and
budgets. PR #7 stays draft until owner visual approval plus Android and iOS
portrait performance/soak evidence.
