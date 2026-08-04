# ADR-0036: Durable progress, consented telemetry, replay and ghost foundation

**Status:** Owner-approved as Version 32
**Date:** 2026-08-04

## Context

Version 31 certifies the approved gameplay and art baseline but every run was
ephemeral. Phase 4 needs durable progression and learning signals without
weakening deterministic fairness, collecting personal data by default, or
allowing a ghost to influence the authoritative run.

Mobile browser storage and network access can fail or be interrupted. A single
unchecked JSON value would make progress fragile, while free-form telemetry or
view-derived replay would undermine privacy and reproducibility.

## Decision

- Store progress in a versioned, checksummed envelope with primary and backup
  slots. Validate every field, cap serialized size, migrate the legacy best
  score and fall back to in-memory play when storage is denied.
- Persist only the validated best replay. Record the fixed-step steering target
  after input normalization, compact adjacent commands, and bind each replay to
  its seed, tuning version, timestep, bounded summary and checksum.
- Keep local play authoritative. The optional private same-origin cloud adapter
  uses optimistic revisions; a conflict returns the current record and is
  merged through deterministic, idempotent rules before retry.
- Default telemetry consent to `unset`. Track and transmit nothing until the
  player explicitly grants consent. Accept only named events and bounded scalar
  payloads; do not collect names, email, device fingerprints or raw touch paths.
  Revocation clears queued events immediately.
- Expose ghost playback only through the explicit `Race saved ghost` action.
  Replay the same seed and fixed-step commands in a separate `Run`, then pass
  only its presentation state to a translucent second `Creature`.
- The ghost is excluded from input, collision, scoring, audio, save selection,
  telemetry authority and course generation for the player. It adds no gameplay
  advantage and cannot change the approved two-second reaction window.

## Consequences

Version 32 can recover progress corruption, synchronize authenticated player
state, record deterministic evidence and offer a readable self-competition
loop without changing the certified game feel. The same schema and validation
rules are shared by local, cloud and replay boundaries.

This is a foundation, not the complete Phase 4 retention stack. Cosmetics,
streaks, leaderboards, sharing, deletion/export controls and final privacy/COPPA
review remain separate milestones. Real-device thermal/audio and iPhone Safari
certification from Version 31 also remain open.
