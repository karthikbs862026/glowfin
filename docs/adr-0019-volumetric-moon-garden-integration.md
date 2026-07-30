# ADR-0019: Volumetric Moon-Garden integration

## Status

Implemented on draft PR #7 for rendered owner review. Not approved for merge.

## Context

The denser review-impostor pass improved composition but exposed its production
ceiling. In the actual portrait frame, the centre gate still read as two
painted cut-outs beside detached cyan bars, and reef cards appeared pasted onto
the seabed. More cards could add density but could not create thickness,
contact, occlusion, material continuity or an animated-film sense of place.

## Decision

- Remove the runtime gate-facade atlas and render the centre obstacle from
  collider-locked volumetric wall-fragment meshes.
- Increase wall height and depth without moving either deterministic inner
  collision plane.
- Put the pale-cyan gameplay edge inside a dark stone channel, with an
  independently rendered continuous contour still exactly on the collider.
- Add a shared volumetric rubble foundation that retreats inside the wall mass
  and visually embeds each obstacle into the seabed.
- Replace near/mid architecture cards with instanced broken-tower, spire and
  collapsed-block arch volumes using one shared Moon-Garden material.
- Replace all four near/mid reef cards with instanced hero coral, medium coral,
  shell-garden and three-blade kelp volumes. Placement is resolved from each
  mesh's measured bounds so no scale or yaw can enter the gameplay lane.
- Retain camera-facing art only for the far skyline, tiny ambient swimmers and
  the temporary Glowfin review silhouette, where depth error is less exposed.
- Apply one coherent material response across volumetric ruins and ecology:
  broad hand-painted colour breakup, directional moon wash, base darkening,
  fog and Glowfin-centred local bioluminescence.
- Triplanar-map one 512px hand-painted moonstone surface across actual wall
  thickness and background volumes. Shared weathering now wraps form without
  returning to camera-facing facade cards or unique UV materials.
- Use the Art Bible acceptance frame plus the owner-provided screenshot and
  generated volumetric paint-over as the in-camera composition target. The
  paint-over is reference evidence, never a runtime background.

## Consequences

- The obstacle, architecture and reef now produce real parallax, thickness,
  contact overlap and depth occlusion.
- The exact original gate positions, gaps and collision planes remain the
  gameplay authority.
- Environment draw calls stay fixed through instancing; represented density
  remains quality-scaled.
- The world atlas is now used only for the far skyline and ambient life.
- The final rigged Glowfin GLB and full device/render matrix remain open before
  Phase 3B can be considered mergeable.

## Browser review correction

The first Chromium frame proved that “volumetric” was necessary but not
sufficient. It exposed pale overlit stone, giant near-camera ruin crops,
perfect ring ornaments, toy-like coral rods and a contour hidden behind the
wall face. That frame remains rejected.

The corrective pass therefore:

- removes architecture from the camera's near/behind band and caps it to a
  mid-depth silhouette range;
- adds a dedicated non-collidable collapsed-block arch rather than reusing the
  bright obstacle wall as scenery;
- replaces cylinders and perfect reef rings with rounded forked branches,
  anemone lobes, broken masonry and shared rock skirts;
- provides three distinct collider-safe wall crowns, selected by the existing
  deterministic art variant;
- darkens stone, caustics and living colours while preserving localized
  bioluminescence; and
- renders a thin blue contour just camera-forward of the recessed channel so
  ordinary depth testing cannot hide the authoritative edge.

The next Chromium review retained the volumetric improvement but showed that a
single broad material sample still flattened the obstacle face. The current
pass therefore maps weathering at a smaller physical scale, adds raised
irregular stone courses in front of the structural wall, quiets the floor
behind the gameplay edge, and moves the narrow cyan core below the adjusted
bloom threshold wherever possible. At that stage the 5.5px projected edge,
gap width and collider planes remained unchanged.

Bounded failure diagnostics then localized every persistent max-state contrast
failure to the bottom of the luminous strip, where it intersected the seabed
and foundation. The cyan core now emerges from the masonry at Glowfin body
height; the recessed dark channel and rubble continue to the floor. This
removes a physically implausible glowing floor intersection without moving the
wall plane or implying additional lateral clearance. The projected core width
is the Art Bible's original 7px.
