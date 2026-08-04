# ADR-0038: Verified competition, Moonflash sharing and provider-safe rewards

**Status:** Version 34 release candidate
**Date:** 2026-08-04

## Context

Version 33 supplies durable deterministic replays, Daily Tide runs and the
retention economy, but it does not establish a public score authority or a
privacy-safe sharing path. Client-claimed scores cannot be trusted, motor
assists cannot silently compete against the standard mapping, and automatic
uploading would violate the project's consent boundary.

Rewarded video also needs a real integration seam without placing an ad SDK,
receipt, or competitive mutation inside the deterministic game loop.

## Decision

- Snapshot accessibility classification at run start. Reduced-motion is
  presentation-only and remains standard; reduced-travel steering is placed on
  an assisted board. Both divisions remain playable and visible.
- Submit a compact replay only after the player presses `Submit verified score`.
  The hosted authority validates shape, checksum, timestep, tuning, run mode,
  Daily seed and classification, then re-simulates every command through the
  production course, collision and scoring code. It rejects any claimed
  summary or end step that does not match.
- Store one best validated entry per signed-in player, board and division.
  Expose a derived Moonfin alias, never an email, raw user key, device
  fingerprint or pointer path.
- Record at most 32 semantic near-miss moments in memory. Select one bounded
  3.5-second lead/2.5-second tail Moonflash descriptor tied to the checksummed
  replay. Publish it only after an explicit share action, with an expiry.
- Adapt rewarded video only through an owner-injected global bridge. Keep run
  recovery disabled because it changes competitive truth. A completed video
  may grant one idempotent run-bound Lumen bonus; it cannot change Tide XP,
  unlock level, replay, score, collision state or board division.

## Consequences

Ranked truth is server-derived from deterministic evidence rather than trusted
from the browser. Accessibility is visible without excluding assisted players.
Sharing is deliberate, bounded and pseudonymous. The repository contains no ad
vendor SDK; therefore the live checkpoint exposes the integration but keeps the
reward button hidden until an approved host provider is injected.

Physical iOS/Android competitive, native-share and provider-SDK certification
remain conditional release evidence and are not replaced by emulated CI.
