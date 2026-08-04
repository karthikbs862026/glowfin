# Version 38 Build Notes — Signature Obstacle Variety

## Baseline

Version 38 begins from merged Version 37 commit
`fccb95c86f15903e0d6c6850f66e5c200c9dc8fe`.

## Slice 1 — mechanics contracts (complete)

- `moonflash-choice`: deterministic wide safe and narrow 1.35x reward routes
- `ceremonial-shutter`: deterministic phase/period with a guaranteed passable
  minimum opening at every sampled point
- `current-lane`: deterministic signed lateral force inside one bounded,
  telegraphed longitudinal/lateral zone
- rare seeded `ray-procession`, `guardian-salute` and `moon-bloom-pulse` plans
- explicit 20–24 authored-template target and 30-unit minimum telegraph lead

The slice is covered by pure deterministic tests and does not consume course
RNG state.

## Slice 2 — runtime activation (complete)

- Twenty-one authored templates ship as seven Moonflash choices, seven
  ceremonial shutters and seven current-lane patterns.
- The exact opening list drives collision and every cyan contour. Choice gates
  include a collidable divider; shutters move collider and art on simulation
  time from one plan.
- Fixed-step current drift remains separate from player input. The course proof
  subtracts its closed-form maximum displacement from lateral authority.
- The safe route preserves the authored solvable opening. The Moonflash route
  is narrower and pays exactly 1.35x the route reward at the held multiplier.
- Cyan/rose route marks, shutter cadence bars and directional current arrows
  provide at least 30 world units of advance telegraphing.
- Ray processions, guardian salutes and Moon-Bloom pulses animate existing
  bounded systems and remain non-colliding.
- Replay validation advances to `v38-signature-v2`; sparse consented telemetry
  records semantic obstacle and living-world events without touch paths.

## Certification state

The complete local release certificate is green at 371 tests, 47 art-gate
checks, a sealed 1.95 MB mounted build, hosted-authority validation, production
fault/privacy checks, rollback rehearsal and structural budgets. Phone render,
gesture/audio, context-recovery and deterministic soak evidence remain GitHub
merge gates; Version 37 stays the live rollback artifact until those gates pass
on the frozen candidate.
