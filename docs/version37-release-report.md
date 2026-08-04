# Version 37 Release Report — First 10 Minutes & Economy Clarity

## Candidate identity

| Field | Value |
|---|---|
| Release | Version 37 · First 10 Minutes & Economy Clarity |
| Baseline | Version 36 merge `7a82e1f4e1bb296ea1f2b49ad84be9aba984ca74` |
| Certification | `player-experience-candidate` |
| Frozen truth | Steering, camera, lane, collision, course solvability, score, replay, art, audio composition and performance budgets |

## Acceptance contract

| Area | Evidence |
|---|---|
| Launch | Moon Well is the initial state; Tap to Dive starts gameplay and triggers the existing gesture-safe audio path |
| Tutorial | Action-reactive steering, Light, near-miss and recovery teaching completes within a bounded 20–24-second fallback |
| Post-run | Dive Again is the sole primary CTA; saved ghost and Moon Well are the only secondary actions |
| Navigation | Daily Tide, Wardrobe, Objectives, Leaderboard and Settings are reachable without ending a normal run |
| Typography | Player-facing body, objective and leaderboard copy is at least 12px, with primary interaction copy at 14px or larger |
| Economy | Tide XP gates availability; Pearls purchase; owned cosmetics equip; previews do not mutate saves |
| Migration | Schema-v2 saves migrate once, grandfather prior availability and preserve currency, loadout, replay and retention state |
| Conflict safety | Purchase unions are monotonic and spent Pearl balances cannot be restored by an older cloud snapshot |
| Instrumentation | Consent-gated events cover hub, Tap to Dive, tutorial, first reward, preview, purchase, first equip and Daily entry |
| Guardrails | No new materials, draw calls, triangles, textures, colliders, score authority or ad placements |

## Conditional evidence

The automated certificate does not replace physical Android and iPhone review.
Before public acquisition, record one clean first-run tutorial and one returning
player migration on a real Android phone, plus the equivalent iPhone Safari
journey including audio activation and background recovery.

