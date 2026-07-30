# ADR-0013: Procedural creature, and the asset dependency behind it

## Context

Part 3.1 specifies a small, round, pudgy bioluminescent axolotl/pufferfish with
a matte glow, oversized fins for silhouette readability, and big single-colour
eyes whose hue tracks momentum.

**A modelled, rigged, animated creature is asset work I cannot author.** That is
a real project dependency and it does not go away: at some point someone has to
sculpt it, or one has to be bought or commissioned.

## Decision

Build the creature procedurally from scaled primitives for now — body, oversized
pectoral fins, tail, axolotl gill fronds, oversized eyes — with animation
derived entirely from simulation state.

This is not the final art. It is chosen because it makes the two things Part 3.1
explicitly says to **test rather than assume** actually testable:

1. **Is the silhouette readable at speed?** That is what the oversized fins are
   for, and Part 3.1 frames it as readability rather than style.
2. **Can eye hue replace a momentum meter?** Part 3.1 warns directly against
   assuming it can. There is deliberately still no momentum HUD, so eye hue is
   the only momentum readout and can be judged honestly on device. If it turns
   out to be illegible, the brief's instruction is to add a minimal HUD element
   rather than defend the aesthetic — and that judgement now has something real
   to look at.

## Notable choices

**Animation is derived from simulation state, never from its own clock.** Fin
beat, tail sway, breathing and bank all come from momentum, light and smoothed
steering. Nothing runs on `Date.now()`, so the creature stays deterministic and
replays identically — which matters for ghost replays (Part 8.2).

**Bank easing is deliberately short (90ms half-life).** Banking into a turn reads
as intent and helps the player see their own steering. But if the creature
visibly lags the input just given, it *feels* like latency even though the
simulation responded on the very next step. That is a Core Design Principle
problem arriving through animation rather than through code, and there is a test
pinning the half-life below 120ms.

**Eyes stay bright as the body dims.** ADR-0006 splits the channels: light drives
body glow, momentum drives eye hue. Letting the eyes dim with the body would
remove the momentum readout at exactly the moment — near death — when the player
most needs it.

**Matte, not glossy.** A specular highlight immediately reads as a shiny toy
rather than something lit from inside, which is why the body shader has an
internal falloff plus fresnel rim and no specular term at all.

## Cost

12 meshes (body, 2 eyes, 2 fins, tail, 6 gills) against 1 previously. Scene was
measured at 48 draws; this takes it to about 59 against a 90 budget. Acceptable,
and worth re-measuring on the Reno before Phase 3 closes.

## Consequences

- Silhouette and eye-hue legibility become answerable questions instead of
  assumptions.
- The asset dependency is deferred, not resolved. If a sculpted model arrives
  later, this class is replaced wholesale; the animation mapping (state ->
  motion) is the part worth keeping.
