# ADR-0020: Rear-chase Glowfin orientation and cute silhouette

## Status

Accepted for Draft PR #7 and corrected after owner reference review on
2026-07-31. Supersedes both the hidden-eye rule and the later frond/membrane
experiments.

## Context

Glowfin moves toward decreasing world Z. Earlier revisions incorrectly treated
every camera-visible eye as proof that the whole creature faced backwards, so
they hid both eyes on the far side. Subsequent gill, fin and tail experiments
then drifted further from the supplied reference. The owner-approved reference
instead uses a strong rear-swimming silhouette plus two high lateral eyes that
peek around the body crown.

## Decision

- Glowfin's authored forward axis is negative Z, matching runtime travel.
- The positive-Z chase camera sees one smooth round sea-glass body, two
  scalloped manta fins, one centered teardrop tail, three clean lavender gill
  leaves per side and two high lateral eyes peeking around the crown.
- The eyes remain separated at the outer crown. They must never move inward to
  form a camera-facing facial mask, and they must never be hidden again.
- The eyes sit inside each gill fan's lateral boundary, with a clear projected
  gap; the three leaves rise along the crown immediately above the manta-fin
  shoulder and may never overlap or occlude the eye.
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

The geometry regression suite locks the negative-Z swim axis, high lateral eye
coordinates, three gill leaves per side, buried fin/tail pivots and positive-Z
rear appendage layout. Phone-size browser review must compare the neutral crop
directly with the supplied reference and reject missing eyes, merged gills,
non-scalloped fins, an off-centre tail or a camera-facing facial mask.
