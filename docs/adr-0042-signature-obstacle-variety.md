# ADR-0042 — Signature obstacle variety and living-world events

**Status:** Accepted for the Version 38 release
**Date:** 2026-08-04

## Context

The Version 36 expert verdict identified mechanical variety as Glowfin's
largest gameplay-content gap: eight authored templates all reduce to passing a
stationary opening. Version 37 deliberately fixed the first session and economy
first. Version 38 now needs genuinely different decisions without weakening
deterministic replay, cyan collider truth or the independent solvability proof.

## Decision

1. Version 38 adds exactly three obstacle verbs: a wide safe route beside a
   narrow high-reward Moonflash route, predictable ceremonial shutters and
   telegraphed current lanes that alter lateral movement.
2. Each obstacle plan is a pure function of run seed plus stable authored gate
   identity. It does not consume the generator's RNG stream and never reads
   wall-clock time.
3. A choice opening must fit Glowfin on both routes. The narrow route is harder
   but never a disguised collision trap. Shutters retain a passable minimum
   width throughout their authored cycle. Current forces are bounded, signed
   and zero outside their visibly telegraphed zone.
4. Runtime activation is atomic: collision, rendering, course generation,
   solvability proof, replay validation, capture evidence and telemetry must
   all read the same plan before a verb may ship.
5. The content target is 20–24 authored templates across the three verbs, not
   20 visual variations of one opening.
6. Living-world set pieces are rare deterministic events—ray processions,
   guardian salutes and Moon-Bloom pulses. They remain non-colliding and may not
   increase static prop density or obscure the cyan gameplay edge.

## Release resolution

- Twenty-one authored templates ship in three equal seven-template families.
- Collision, renderer geometry, telegraphs, course generation, solvability,
  replay validation, scoring and telemetry consume the authoritative plans.
- The safe route preserves the already-proved authored gap; the narrow
  Moonflash route pays exactly 1.35x the discrete choice reward.
- Current displacement is reserved from the next transition's lateral budget,
  and the shutter's guaranteed minimum aperture is used by the proof.
- The living-world events animate existing bounded ray, guardian and shared
  Moon-Garden material systems without increasing collision or static density.
