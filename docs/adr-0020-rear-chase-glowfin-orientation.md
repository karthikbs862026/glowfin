# ADR-0020: Rear-chase Glowfin orientation and cute silhouette

## Status

Accepted for Draft PR #7. Supersedes the camera-side eye decision in ADR-0016
and the forked-tail decision recorded on 2026-07-31.

## Context

The production-transition character still moved toward decreasing world Z, but
its eyes and several tail revisions were arranged for the positive-Z chase
camera. In the portrait render this made Glowfin appear to face the player and
swim backwards through the obstacle course. A later correction moved the gill
crown onto the hidden front surface and rotated the fins and tail edge-on to the
camera. That fixed heading but reduced the approved cute rear silhouette to a
pale ball with thin sticks.

## Decision

- Glowfin's authored forward axis is negative Z, matching runtime travel.
- The face and both eyes stay on the negative-Z, obstacle-facing side.
- The positive-Z chase camera sees one smooth round sea-glass body, two curved
  manta fins, one tapered central caudal paddle and six small lavender gills.
- No eye, pupil, socket, forehead ornament, detached tail lobe or dorsal crown
  may appear in the neutral rear silhouette.
- Momentum and danger remain readable through body/fin colour, rim response,
  trail, bank and the minimal HUD; they do not justify turning the face around.
- Steering may add a small yaw toward lateral intent, but the forward vector
  must continue to have a negative-Z component.

## Verification

The geometry regression suite asserts that the eye mesh is entirely on negative
Z, while the caudal pivot and non-facial gill crown remain on positive Z for a
readable rear silhouette. Phone-size browser review must also reject a frame
that reads as a front view—or as an anonymous ball—even when these structural
checks pass.
