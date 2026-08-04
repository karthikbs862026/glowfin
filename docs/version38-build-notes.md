# Version 38 Build Notes — Signature Obstacle Variety

## Baseline

Version 38 begins from merged Version 37 commit
`fccb95c86f15903e0d6c6850f66e5c200c9dc8fe`.

## Slice 1 — mechanics contracts (implemented)

- `moonflash-choice`: deterministic wide safe and narrow 1.35x reward routes
- `ceremonial-shutter`: deterministic phase/period with a guaranteed passable
  minimum opening at every sampled point
- `current-lane`: deterministic signed lateral force inside one bounded,
  telegraphed longitudinal/lateral zone
- rare seeded `ray-procession`, `guardian-salute` and `moon-bloom-pulse` plans
- explicit 20–24 authored-template target and 30-unit minimum telegraph lead

The slice is covered by pure deterministic tests and does not consume course
RNG state.

## Next slice — runtime activation (not yet complete)

1. Add authored Version 38 templates and stable verb assignments.
2. Extend authoritative collider geometry for multiple openings and dynamic
   shutter state.
3. Apply current-lane force inside the fixed-step simulation.
4. Render every collider edge and telegraph from the same plan.
5. Extend solvability, replay, anti-cheat, telemetry and Moonflash scoring.
6. Add phone capture, contrast and soak evidence before enabling the verbs in
   normal or Daily Tide generation.

Version 37 remains the live known-good release until those rows are green.
