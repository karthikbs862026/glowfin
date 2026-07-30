# ADR-0016: Phase 3B Art-Bible visual reset

## Status

Accepted on the draft Phase 3B branch. Not approved for merge.

## Context

The first PR #7 beauty artifact passed contrast and performance checks but
failed its purpose as art. Owner review rejected the frame because it read as
an almost-black procedural/debug scene rather than the approved Moon-Garden
Ruins:

- a god-ray plane appeared as a solid grey slab through the upper corridor
- ruins multiplied two dark colour layers and disappeared into near-black
- gate contours became fluorescent twelve-pixel bars
- speed-reference boxes looked like debug lines
- reef clusters read as thin neon spikes with no grounded seabed
- Glowfin's eyes were placed on the front/far side and vanished from the
  rear-chase camera
- the reset capture contained no mature trail or local reef response

The prior gate proved collider truth and technical budgets. It did not prove
the Art Bible's composition, atmosphere, creature appeal or material language.

## Decision

Retain the deterministic collider, LOD, instancing and performance
architecture, but reset the rendered treatment before any merge:

- place Glowfin's readable eyes on the chase-camera side, broaden its manta
  fins and grouped gill silhouette, and reduce plastic-white clipping
- replace debug bars with one instanced family of submerged crescent inlays
- add a broad grounded seabed and readable low-frequency moonstone paving
- preserve ruin colour with directional form lighting and broad stone joints
- make coral heavier, rounded and grounded with restrained local glow
- place god rays ahead of the camera and render them as low-opacity additive
  atmosphere
- return the collision cue to seven displayed pixels
- warm the deterministic review frame so trail and reef response are visible
- record and enforce beauty-frame luminance, near-black coverage, colour
  coverage and highlight-clipping limits in addition to contrast

## Consequences

- PR #7 remains a draft and is not mergeable on technical checks alone.
- The no-caustics/no-bloom frame remains a stress artifact; it is not presented
  as the beauty target.
- A green contrast badge cannot override a failed owner visual review.
- This corrective pass improves the code-native slice, but the broader Phase 3
  asset library still requires authored GLB and texture production rather than
  treating generated primitives as final art.
