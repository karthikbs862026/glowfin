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

A mask-parity audit aligned the flat context replacements with the beauty
material's double-sided depth behavior. The next evidence run was unchanged,
which ruled sidedness out as the blocker and left one state-dependent depth
conflict: the contour front sat only about 0.02 world units ahead of the
recessed wall after variant scaling. The cyan core now has 0.16 world units of
camera-depth separation while remaining behind the raised masonry. Its x plane,
projected width, gap and collider authority are unchanged. No contrast
threshold or percentile changed.

That correction cleared the browser matrix, but the resulting beauty frame was
still rejected as a grey procedural blockout. Passing contrast did not make the
square gate slabs, stretched polygon arches or capsule-like coral production
art. The current art-led refinement therefore:

- lowers and breaks each wall's outer crown so the obstacle reads as a carved
  inner pier with a weathered buttress rather than a rectangular slab;
- replaces pebble-like facade decoration with interrupted concentric stone ribs
  and uneven projecting courses;
- assembles collapsed arches from separate pier courses and wedge-like
  voussoirs, preserving irregular negative space without oversized polyhedra;
- rebuilds coral branches along curved tube paths with living terminal bulbs,
  wider rock skirts and overlapping side-bank placement;
- preserves authored blue, teal and violet vertex colour under the shared
  weathering map instead of blending every material toward pale grey; and
- adds a restrained view-dependent moon rim to describe thickness on both
  ruins and reef without introducing another material or draw call.

All revised LODs remain inside their existing family budgets, and reef placement
continues to derive from measured bounds outside the unchanged lane.

The next beauty frame showed that the material still made real volume look
uniformly grey and that large near-complete arches competed with the obstacle.
The follow-up keeps the same meshes/material count but darkens the moonstone
palette, increases masonry-joint separation, preserves living colour under
instance tint, removes bulbous coral caps in favour of small tips plus curved
forks, breaks a second arch-crown course, and scales the collapsed-arch family
to 62% of the shared architecture height. This is a visual correction only:
lane bounds, gate placement, collision planes and contour dimensions do not
change.

The final near-reef audit identified the remaining long cyan/magenta shapes as
the legacy shell family, not the new tube coral. Flattened spheres are removed.
Shell gardens now use beveled, extruded scalloped fans with nested inner lobes
and four neutral rubble feet. The family remains instanced in the existing draw
and its measured outer bound is still the input to lane-safe placement.

## Production-transition recognizability pass

Owner review rejected the technically volumetric scene because object identity
was still unreadable at gameplay scale. Polygon count was not the root cause:
the gate remained one decorated slab, four reef families shared similar blob
silhouettes, the skyline and ambient life were still camera-facing cards, and
the rear-view Glowfin plate concealed banking and thickness.

The next pass changes the art grammar rather than adding more decoration:

- gate halves are assembled from visible masonry courses, a stacked inner pier,
  broken arch voussoirs, buttress and grounded rubble;
- the outside-lane ecology is split into staghorn, sea-fan, anemone and ribbon
  kelp silhouettes;
- skyline landmarks, minnows, jellies, rays and garden spirits are volumetric
  instanced geometry;
- the ten-bone Glowfin mesh is visible and the review card is removed;
- face lighting, joints, cavities, contact darkening and wet highlights have
  wider value separation;
- the renderer uses sRGB output and ACES filmic tone mapping;
- the two retired runtime impostor textures are removed from the production
  payload.

This is the measurable silhouette and integration contract for the authored GLB
set defined in `docs/art/moon-garden-production-glb-brief.md`. It does not turn
the code-authored transition mesh into the final sculpt source. Collision
planes, openings, course generation and simulation remain unchanged.

## Cinematic portal and chase-camera correction

The next portrait audit rejected the technically connected character tail and
collider-safe gate silhouette because they still communicated the wrong
objects: the tail looked like a dorsal antenna and the gate like two unrelated
pointed pylons. The composition also devoted too much of the portrait to empty
water, reducing every authored cue at the decision point.

The production-transition contract now:

- places a broken, non-colliding masonry canopy behind the two authoritative
  wall seams so both halves read as one ruined portal at gameplay scale;
- keeps the canopy above Glowfin's fixed flight plane and out of collider
  evidence, while preserving the same lateral opening and straight seams;
- exports that overhead masonry in every Moon-Gate GLB LOD/variant;
- replaces the raised oval tail with a rear swim-axis peduncle and two caudal
  lobes driven by the existing tail bone;
- increases eye scale without adding a material or draw call;
- tightens and lowers the chase camera so Glowfin, the gate and the reef banks
  occupy more of the portrait without shortening the reaction window; and
- quiets the reef pigment range so species read as living forms rather than
  alternating neon rods.

This pass changes only the visual camera and non-gameplay art. Course
generation, movement, collision, gate positions and the 3:1 fairness rule are
unchanged.
