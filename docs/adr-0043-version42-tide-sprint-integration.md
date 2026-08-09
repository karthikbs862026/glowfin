# ADR-0043: Integrate Tide Sprint as a lazy shared-progress game mode

- Status: Accepted
- Date: 2026-08-09
- Scope: Version 42-R1 Tide Sprint integration
- Base: merged Version 41-R5 commit
  `c67c4a6350f3f432c72e5d01fe92df69c557f2f0`

## Context

The owner accepted the Tide Sprint R10 playtest feel and froze its steering,
spring-loaded one-finger speed control, current cues, Current Ring boosts,
four-racer readability and earned photo-finish balance. The playtest lived as
an isolated route, so it could not participate safely in the main Moon Well,
economy, objectives, saves, telemetry or deterministic ghost contract.

Version 42 must integrate that experience without moving its rendering cost
into Classic Dive startup or reopening the accepted gameplay tuning. Existing
Classic Dive, Daily Tide, guided tutorial and Expedition behavior must remain
unchanged.

Version 41 is the source ancestor, while the operational rollback target stays
the physically certified Version 39 commit. Release metadata therefore records
Version 39 as `baselineVersion` and explicitly declares Versions 40 and 41 as
the intervening versions. Separate `sourceBaseVersion` and `sourceBaseCommit`
fields pin the exact merged Version 41 ancestry without confusing it with the
operational rollback target.

## Decision

Build Tide Sprint as a second Vite HTML entry at `tide-sprint/index.html` and
enter it from the Moon Well. The root application may import shared progress
types and objective metadata, but it must not import the Tide Sprint director,
character rigs or renderer. Relative URLs keep both pages valid at the site
root, under `/game/`, and inside the Capacitor payload.

Preserve the accepted race authority under revision
`v42-r10-photo-finish-current-bursts`: one player, one named rival and two
non-colliding echoes; identical character physics; deterministic fixed-step
plans; no rubber banding, purchasable power, competitive revive or real-time
multiplayer.

Advance the shared save from schema/envelope 3 to 4. Version 4 embeds a bounded
Tide Sprint domain containing selected crew, cosmetic Bonds, totals, three
objective claims, fastest finish and one checksummed Best Echo. The repository
migrates complete Version 1–3 saves, retains primary/backup recovery, imports
the isolated playtest's selected crew and Bonds once, and merges Tide progress
monotonically with the rest of the cloud save.

Record race completion atomically through the shared repository. Awards add
only existing Lumen Pearls, Tide XP and presentation-only Bonds. Run claim IDs
make rewards and objectives idempotent. Tide Sprint cannot modify Classic best
score, Classic replay, Daily calendar claims, tutorial completion or
Expedition progress.

Store Best Echo controls at 120 Hz as bounded two-byte quantized frames with a
plan hash and corruption checksum. A mismatched or invalid echo is rejected and
the deterministic preset echo remains available. Playback has no collision,
reward, input or spawn authority.

Raise the whole-save ceiling from 160 KiB to 256 KiB. Classic replay remains
bounded at 128 KiB; the 180-second Tide ghost is bounded near 58 KiB after
base64 encoding. The new ceiling accommodates both plus envelope and
progression metadata without weakening either replay's own validation limit.

Add consent-gated entry, start, completion, abandonment and ghost-save events,
plus existing semantic reward/objective events. Never collect raw steering,
touch paths or identity.

## Certification contract

- deterministic race and close-win fairness tests for every selectable crew;
- Version 3 migration, corrupt-primary recovery, idempotent award and monotonic
  cloud-merge tests;
- static preservation gates for Classic, Daily, tutorial and Expedition entry
  paths;
- 390×844 iPhone-contract and 412×915 Android-contract browser passes;
- context-loss, page-cache and background/resume recovery;
- fewer than 12 active art materials, at most 90 draws and 150,000 triangles;
- an exact 5,400-frame Tide Sprint WebGL renderer soak in addition to the
  existing main-game renderer soak;
- Android and iOS wrapper compilation, followed by real-device sign-off before
  unconditional promotion.

## Consequences

Tide Sprint becomes a first-class Glowfin mode while Classic startup stays
isolated from its renderer payload. Version 41 saves migrate forward without
loss and a race result participates in the existing cosmetic economy without
becoming competitive power. A Version 42 candidate may be deployed for review
after automated gates pass, but the final main merge and public promotion
remain conditional on the required physical-device evidence.
