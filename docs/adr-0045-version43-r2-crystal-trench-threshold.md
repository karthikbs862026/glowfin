# ADR-0045: Version 43-R2 Crystal Trench ruin threshold

**Date:** 2026-08-10

**Status:** accepted for Version 43-R2 implementation

**Base:** accepted Version 43-R1 Kelp Cathedral build
`56c5808371ac6a34479044e3e08861ec86f6ff12`

## Context

The owner accepted the rebuilt Kelp Cathedral visual direction and asked to
continue with the next build. The next milestone must prove that a second lost
realm can be mechanically and visually distinct without destabilising the
accepted realm, the promoted Version 42 modes, or the shared progression
contract.

Building the entire Crystal Trench at once would combine route-reading,
moving-plate traversal, the Neri mirror-current race, relic progression and a
large environment change in one review surface. That would obscure whether the
realm's first mechanic and visual identity work.

## Decision

Version 43-R2 is the **Ruin Threshold** slice of Crystal Trench. It adds a
separate Moon Well destination with indigo caverns, reflective crystal forests,
submerged ruin fragments, refracted moonbeams and a monumental block-voussoir
Trench Gate. Moon Garden scenery, gates, route inlays, floor and seabed remain
hidden in the lost realms.

R2 introduces one primary mechanic, **Prism Pulse**. A deterministic pulse
brightens the authoritative cyan opening while two violet false reflections
fade. Collision, solvability and rendering consume the same gate plan. The
first threshold gate repeats at a fixed interval until crossed cleanly, then the
slice ends after a short arrival beat.

The renderer is fixed-capacity: eleven additional draws, five materials, three
generated 512 px WebP albedo maps and 36,450 reserved triangles. The complete
resident texture estimate is 16.45 MB, below the existing 48 MB ceiling.
Release validation permits this immutable V43-R1 source base only because its
revision tag differs from R2; future-version and self-referential bases remain
rejected.

## Compatibility boundary

- Version 43-R1 Kelp Cathedral mechanics, progress and presentation remain
  unchanged.
- Classic Dive, Daily Tide, guided tutorial, Chapter One Expedition and Tide
  Sprint keep their Version 42 entry paths and course behaviour.
- Crystal R2 does not change the schema-4 shared-save contract or mutate the
  separate Kelp progress save. The existing idempotent run ledger may award
  shared Pearls/XP, but it writes no Classic best score, ghost, leaderboard
  result or Moonflash challenge clip.
- Sliding Crystal Plates, the Neri mirror-current race, a Crystal relic and the
  complete cavern are intentionally reserved for Version 43-R3.

## Acceptance

R2 must pass deterministic course equality, Prism Pulse cadence, threshold
repeat/completion, a 5,400-frame deterministic soak, mobile realm budgets, the
full Version 42 and Kelp regression suite, production policy gates and sealed
artifact verification. It is published on a separate `/game-v43-r2/` route;
the stable V42 root and `/game-v43-r1/` remain unchanged during review.
