# Glowfin Version 41 enhancement-plan audit

Status: corrected in Version 41.2 (`v41.2-plan-compliance-rebuild`).

## Release-blocking gaps found in Version 41/41.1

| Plan requirement | Previous behavior | Version 41.2 correction |
| --- | --- | --- |
| Objective-led Encounter Director | Chapters changed at fixed elapsed timestamps. | Every chapter now has a minimum readable window and an objective predicate. Time alone cannot advance any chapter. |
| Meaningful Lumen collection | One sparse sinusoidal ribbon with little feedback. | 72-mote, closely spaced formations with visible chain progress and 6/12-chain milestones. |
| Relic fork | A small isolated relic with no legible safe/risk choice. | Cyan safe lane and gold outer-right risk lane are framed together; the Fragment remains the separate hidden-relic mark. |
| Miri rescue | Miri was positioned 235 units ahead and could be outside the readable range; rings faced the wrong plane. | Miri remains 16 units ahead at large scale. Sequential LEFT, RIGHT and CENTER Rescue Lights face the camera and respawn when missed. |
| Neri race | Race outcome was mostly timer text; passing gate depth counted without steering through it. | Neri stays visible, three gates require actual contact, missed gates return, and the chapter cannot complete while Neri is ahead. |
| Duskmaw chase | Small chaser, often behind the camera; no recoverable pattern logic. | Duskmaw is placed between player and camera at readable scale. Three named patterns drive LEFT, RIGHT, RIGHT Current Breaks; the first miss triggers one Moon Shield recovery. |
| Moon Well restoration | Completion fired at 180 seconds even if the portal was missed. | The player must enter the front-facing CENTER portal after rescue, race and chase objectives. Restoration persists in the hub. |
| Completion marks | Only generic result statistics were shown. | Primary, hidden-relic and clean-current marks are calculated and persisted from actual outcomes. |
| Determinism/replay compatibility | Expedition start generated a random seed even though configuration declared a fixed seed. | Expedition runs use seed `1196577101`; plan identity is emitted as a deterministic hash. |
| Player communication | Story entry and encounter instructions were secondary to Classic Current. | Story entry is primary, a one-control briefing precedes play, named character portraits remain visible, and the current action/direction stays on screen. |

## Guardrails

- No combat, new currency, gacha, stats system, environment, or real-time dependency was added.
- The additive layer remains within 10 draw calls, 8,000 triangles and two materials; total release budgets remain 90 draw calls, 150,000 triangles, 48 MB textures and 12 materials.
- Reaction guidance is required within 700 ms and the performance floor remains 30 fps.
- Automated tests explicitly fail if elapsed time alone can complete a chapter or if the 180-second restoration fallback returns.

The hosted Version 41.2 checkpoint passed the complete build and release gate before deployment.
