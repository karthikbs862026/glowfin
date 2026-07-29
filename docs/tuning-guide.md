# Glowfin Tuning Guide

All values live in `config/tuning.json` and are range-validated at load
(`src/core/config.ts`). A bad edit throws at startup with the offending key
and its allowed range — it will not silently ship unfair gameplay.

**Before changing anything:** the Part 6.4 sensitivity regression suite reports
how a tuning change shifted clear/fail outcomes across the authored scenario
set. Run it. "It feels better" is not evidence that the game is still fair.

---

## momentum

| Key | Meaning |
|---|---|
| `gainRate` | Asymptotic approach rate toward the ceiling, per second. Higher = reaches top speed sooner. At 0.12 the creature hits 0.9 momentum around 19s and 0.99 around 38s — sized to a 45–90s run. |
| `ceiling` | Maximum momentum. Speeds are lerped from 0 to this. **Momentum plateaus here rather than climbing forever** — see note below. |
| `collisionRetainFraction` | Fraction of momentum kept on collision (0.4 = lose 60%). |
| `collisionFloor` | Momentum never drops below this. Part 2.4 requires collision not zero the player out. |
| `stunDurationSec` | Seconds after collision during which momentum does not regain — the "deflate" beat. |
| `invulnerabilityDurationSec` | i-frames preventing an instant second collision cascade. |

**Why momentum plateaus rather than scaling forever:** if forward speed kept
climbing, obstacle lead time would eventually fall below
`readability.minReactionWindowMs`, which is a direct Core Design Principle
violation (Part 1.3). Difficulty past the ceiling comes from obstacle
*density and gap width* instead (Part 2.5), which raises challenge without
making the game unreadable.

## speed

Forward and lateral speeds are lerped between the zero-momentum and
max-momentum values. Lateral scales up alongside forward deliberately — if it
didn't, late-game gaps would become geometrically unreachable even for perfect
play.

## lane

`halfWidth` defines the playable lateral range (±halfWidth). `creatureRadius`
is the collision radius; it must be smaller than the lane.

## readability — *these are fairness constraints, not preferences*

| Key | Meaning |
|---|---|
| `visibleAheadUnits` | How far ahead obstacles are visible/rendered. |
| `minReactionWindowMs` | Minimum time the player has to see and react to an obstacle, at *maximum* momentum (Part 4.5). |
| `minSolvabilityMarginFraction` | Required slack in the solvability check. 0.25 = a segment must be passable with 25% time to spare, not barely. |
| `maxLaneTraversalFraction` | The largest fraction of the lane a gate-to-gate transition may demand. Caps worst-case difficulty at authoring time. |

Changing any of these without re-running the headless solvability sweep
(Part 6.6) risks shipping impossible segments. Don't.

## scoring

| Key | Meaning |
|---|---|
| `nearMissClearanceUnits` | Lateral clearance below which a clean pass counts as a near-miss. |
| `nearMissCooldownSec` | Prevents one obstacle cluster farming multiplier stacks. |
| `multiplierGainPerNearMiss` | Flat gain per near-miss. |
| `multiplierCap` | Ceiling on the multiplier. |
| `multiplierDecayPerSec` | Decay rate once the grace period elapses. |
| `multiplierDecayGraceSec` | Seconds without a near-miss before decay begins. |

**Current economy** (simulated over a 60s run): near-miss every 3–4s reaches
the cap; every 6s ends around 4.1; every 8s around 2.6; every 10s+ barely
moves. Part 2.3 targets a near-miss every 4–8s, so that band should span
"very good" to "okay" — which it does. Validate against real telemetry before
trusting it (Part 6.9).

## light — the run-end resource

Run ends when light reaches zero. Collisions cost light; it regenerates while
the player stays clean. At the current values (max 100, cost 34, regen 6/s
after a 2s delay) roughly three collisions in quick succession end a run,
while a single collision fully recovers after about 8 seconds of clean play.

This is Part 2.4's "N collisions within a time window" expressed continuously,
which reads better than a hard strike counter and fits the cute framing.

## input

`smoothingHalfLifeSec` is the dangerous one. Smoothing improves perceived feel
but adds latency, and Part 2.1 explicitly defaults toward precision over
"floaty." Above roughly 60ms it becomes perceptible on a precision game — the
config validator rejects values that high, and the Part 6.4 latency test
asserts the real measured figure against budget.
