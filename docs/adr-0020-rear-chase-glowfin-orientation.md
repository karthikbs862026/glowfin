# ADR-0020: Rear-chase Glowfin orientation and cute silhouette

## Status

Accepted for Draft PR #7 and corrected after owner reference review on
2026-07-31. The eye-placement decision was amended after the live chase frame
showed that camera-side eyes made Glowfin appear to look backwards.

## Context

Glowfin moves toward decreasing world Z. Earlier revisions incorrectly treated
every camera-visible eye as proof that the whole creature faced backwards, so
they hid both eyes on the far side. A later correction overcompensated by
placing the eyes on the positive-Z camera side, which made Glowfin look back at
the player. The final owner correction keeps the approved body, gills, fins,
tail and glow while returning the eyes to the obstacle-facing front crown.

## Decision

- Glowfin's authored forward axis is negative Z, matching runtime travel.
- The positive-Z chase camera sees one smooth round sea-glass body, two
  scalloped manta fins, one centered teardrop tail, three clean lavender gill
  leaves per side and the back of the high crown—not a camera-facing face.
- Both eyes sit high and slightly wide on the negative-Z front hemisphere,
  facing the obstacle corridor. They are inset laterally inside the gill fans
  and positioned farther forward than every gill attachment.
- The eye/gill spacing is judged from the obstacle-facing front-quarter view:
  each eye must remain clear before its three-leaf fan, with no overlap or
  occlusion. Rear-chase visibility is not a reason to move an eye backwards.
- Gill leaves remain simple, rounded and individually spaced. Branched fronds,
  micro-leaflets, folded wedges, horns and spikes are rejected.
- Fin and tail roots stay behind the body silhouette; the membranes bow in
  depth and use soft scalloped/kelp-like trailing contours, with no connector,
  detached lobe or dorsal ornament altering the reference read.
- Glowfin's calm pigment remains deep ocean-blue through the body core, cyan
  through the fin membranes and lavender at the gills, with restrained pale
  cyan/lilac internal-luminous edges. The silhouette must still read without
  bloom.
- Steering may add a small yaw toward lateral intent, but the forward vector
  must continue to have a negative-Z component.

## Verification

The geometry regression suite locks the negative-Z swim axis, negative-Z eye
bounds, high front-crown placement, three gill leaves per side, forward eye-to-
gill ordering, buried fin/tail pivots and positive-Z rear appendage layout.
Phone-size browser review must include both the normal rear chase frame and an
obstacle-facing front-quarter proof. Reject rear-facing eyes, merged gills,
non-scalloped fins, an off-centre tail or any camera-facing facial mask.
