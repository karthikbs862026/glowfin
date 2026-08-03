# ADR-0020: Rear-chase Glowfin orientation and cute silhouette

## Status

Accepted for Draft PR #7 and corrected after owner reference review on
2026-07-31. Amended on 2026-08-03 after the Version 30 owner phone review
proved that the obstacle-facing placement hid both eyes completely.

## Context

Glowfin moves toward decreasing world Z. Earlier revisions incorrectly treated
every camera-visible eye as proof that the whole creature faced backwards, so
they hid both eyes on the far side. A later correction overcompensated by
placing the eyes on the positive-Z camera side, which made Glowfin look back at
the player. The Version 30 phone review established the final boundary:
preserve the negative-Z travel axis and rear-chase body read, but expose the
shallow crown-side shells high on the forward face edge before each gill fan.
A full rear-facing facial mask remains rejected; completely invisible eyes are
also rejected.

## Decision

- Glowfin's authored forward axis is negative Z, matching runtime travel.
- The positive-Z chase camera sees one smooth round sea-glass body, two
  scalloped manta fins, one centered teardrop tail, three clean lavender gill
  leaves per side and the back of the high crown—not a camera-facing face.
- Both eye centres sit high on the forward face edge at `±0.62R`, `0.76R`
  height and `-0.48R` depth. Each `0.22R` shell uses a `1.0 × 0.88 × 0.40`
  profile: its outer edge meets the first gill root at `±0.84R`, while its
  complete rear bound ends at `-0.392R`, well ahead of every positive-Z gill
  root. This places the visible crown-side shell inboard and above the fan
  instead of directly underneath it in chase-camera projection.
- Both irises and pupils use Glowfin's local `(0, 0, -1)` look axis. The eye
  shader must never derive gaze from the camera/view vector. From rear chase,
  the player sees the luminous lateral shell at the face edge—not a pupil
  painted onto the back of the eye.
- Each eye uses a broad, shallow `0.22`-radius shell. It must remain readable at
  8–16 pixels during calm, maximum momentum, collision and recovery. Collision
  dimming may change colour but may never remove either eye.
- Eye/gill ordering is both a world-space and screen-space contract: every
  eye's rear bound must stay forward of every gill root, each centre must be
  above and inboard of the first root, and both shells must remain independently
  visible through maximum-momentum left/right banking. No full face may be
  painted on the back of the body.
- Gill leaves remain simple, rounded and individually spaced. Separate static
  root collars, branched fronds, micro-leaflets, folded wedges, horns and spikes
  are rejected.
- Each side uses one fin membrane and the centre uses one tail paddle. Their
  roots begin inside the body silhouette; separate shoulder collars,
  peduncles, under-fins, detached lobes and dorsal ornaments are forbidden
  because they read as fixed duplicate appendages during animation.
- Glowfin's calm pigment remains deep ocean-blue through the body core, cyan
  through the fin membranes and lavender at the gills, with restrained pale
  cyan/lilac internal-luminous edges. The silhouette must still read without
  bloom.
- Eye colour is simulation-driven: 60% momentum and 40% normalized forward
  speed feed one clamped energy signal. A 0.12-second frame-rate-independent
  half-life smooths the response through dark ocean-blue, luminous cyan,
  violet and rose-violet states without flicker.
- Steering may add a small yaw toward lateral intent, but the forward vector
  must continue to have a negative-Z component.

## Verification

The geometry regression suite locks the negative-Z swim and eye-look axes,
forward eye-to-gill depth ordering, high inboard crown placement, near-zero
outer-edge-to-gill spacing, phone-pixel visibility through left/right banking,
three gill leaves per side, enlarged lens span,
independent momentum/speed contributions, frame-rate-independent colour
smoothing, buried fin/tail pivots and exactly one visible fin component per side
plus one tail component.
Phone-size browser review must include calm, maximum momentum, collision and
recovery rear-chase frames. Reject hidden eyes, merged gills, overlapping
under-fins, a second tail layer, an off-centre tail, camera-facing pupils or a
full camera-facing facial mask.
