# Glowfin Version 36 — Expert Game Verdict

**Accepted into core game direction:** 2026-08-04  
**Audited build:** Version 36 `main` at `7a82e1f`  
**Sensory limitation:** The protected live Site could not be opened by the
review browser, so visual execution, audio and moment-to-moment feel scores
remain conservative rather than claiming a fresh live playtest.

## Verdict

Glowfin is a strong, distinctive and unusually well-engineered alpha, but it
is not yet a complete commercial mobile game.

| Measure | Rating |
|---|---:|
| Overall | 7.0/10 |
| Vertical-slice quality | 8.3/10 |
| Technical foundation | 8.5/10 |
| Player-facing completeness | 6.4/10 |
| Commercial soft-launch readiness | 6.2/10 |

The biggest gap is no longer engineering. The production foundation is ahead
of the player experience. Glowfin needs better onboarding, more mechanical
variety, a purposeful economy and a substantially cleaner menu/post-run
structure.

## What Glowfin does well

- The one-swipe control model is instantly understandable.
- Momentum, near-misses, multiplier growth and collision recovery create a
  good risk-versus-safety loop.
- Recoverable collisions feel more forgiving and distinctive than instant-death
  runners.
- Course solvability, cyan collider truth and contrast enforcement are
  excellent.
- Glowfin and the Moon-Garden Ruins have a recognizable identity.
- Daily Tide, ghosts, objectives and grace-day streaks form a credible
  retention foundation.
- Standard and assisted leaderboard divisions are thoughtful and fair.
- Performance budgets, deterministic replay, anti-cheat, save recovery and
  WebGL resilience are unusually mature.
- Cosmetics remain power-neutral.
- The 64-second Moon-Current soundtrack and momentum-responsive audio are much
  stronger than a generic ambient loop.

## Main weaknesses

- There are only eight mechanical course templates, and all are variations of
  passing through stationary gaps. Five visual gate families do not equal five
  gameplay mechanics.
- The game starts immediately without a proper start screen or interactive
  tutorial. Sound activation is a separate action.
- The post-run screen can expose up to 13 controls, plus objectives and
  leaderboard rows.
- Several important HUD, objective and leaderboard labels use 9–10px text,
  which is too small for a polished phone game.
- “Tap outside the buttons for a fresh current” is undiscoverable and creates
  accidental restarts.
- Lumen Pearls have no meaningful spending purpose. Tide XP unlocks cosmetics
  automatically while Pearls merely accumulate.
- Pearl and XP rewards are effectively awarded in matching amounts, giving the
  game two currencies performing almost the same job.
- Rewarded-video doubling has little value without a Pearl shop or currency
  sink.
- Daily Tide is primarily a deterministic seed rather than a visibly different
  challenge format.
- Moonflash is technically sophisticated, but publishes a replay-based link
  rather than an instantly consumable video/GIF.
- Final DCC sculpting, UVs, PBR materials and higher-grade character animation
  remain below the commercial benchmark.
- Physical iPhone Safari certification and the complete first-run-to-next-day
  journey remain open.

## Detailed ratings

| Parameter | Score | What should improve |
|---|---:|---|
| Core concept and identity | 8.0 | Preserve the underwater one-swipe premise. Make near-miss route selection Glowfin’s unmistakable signature. |
| Controls and responsiveness | 8.0* | Keep the current mapping. Add a short guided steering sequence and optional wrapper-level haptics. |
| Risk/reward and mastery | 8.3 | Add clearly telegraphed safe-versus-risky gate choices instead of relying only on incidental close passes. |
| Fairness and route readability | 9.2 | Keep the cyan collider truth, contrast gate and solvability proof unchanged. |
| Mechanical/content variety | 5.4 | Expand from 8 to approximately 20–24 templates across three distinct obstacle verbs. |
| Art direction | 8.5 | Preserve Moon-Garden Ruins, navy–turquoise lighting, bronze/coral contrast and distinct district families. |
| Visual execution and polish | 6.8* | Replace the most visible code-native hero, gate, coral and merfolk surfaces with final DCC/UV/PBR assets. |
| Glowfin character appeal | 7.6* | Add front-facing personality moments, breathing idles, celebrations and clearer collision/recovery expressions. |
| Audio and game feel | 7.8* | Keep Moon-Current. Add optional haptics and complete real-phone speaker, ducking and interruption tests. |
| First-run onboarding | 4.5 | Add “Tap to Dive,” audio unlock and a 20–30-second learn-by-playing tutorial. |
| HUD and post-run UX | 5.0 | Use one primary CTA, two secondary actions and separate Hub/Wardrobe/Settings screens. Increase body text to at least 12–14px. |
| Meta progression | 6.6 | Add visible goals, cosmetic previews, collection completion and a clearer first-unlock celebration. |
| Economy and monetization | 3.8 | Separate Tide XP from Pearls: XP unlocks availability; Pearls purchase cosmetics. Keep ads disabled until this exists. |
| Retention and Daily Tide | 7.4 | Add tiered Daily targets, a seven-day newcomer journey and occasional authored challenge conditions. |
| Social and competitive | 6.4 | Add “Beat my current” challenge links and a rendered 6–8-second share clip or GIF. |
| Accessibility | 7.8 | Keep high contrast, reduced motion and assisted steering, but expose them before the first run and enlarge small text. |
| Technical stability/performance | 8.5 | Complete physical Android/iOS certification and split competitive/meta code from initial loading where practical. |
| Commercial soft-launch readiness | 6.2 | Close onboarding, economy, content-variety and physical-device gaps before public acquisition spending. |

\* Provisional sensory score pending direct gameplay footage.

## Keep as-is

- One-swipe lateral steering and automatic forward movement
- Momentum-driven speed, glow, trail and music
- Near-miss multiplier and slow-motion celebration beat
- Collision recovery instead of immediate run termination
- Camera, lane dimensions and cyan collision edges
- Deterministic course, replay, ghost and Daily Tide foundations
- Grace-day streak
- Standard and assisted competitive divisions
- Cosmetic-only progression principle
- Privacy consent, save resilience and production guardrails
- Current performance budgets
- Moon-Current soundtrack

## Add

- A lightweight Moon Well home hub with Dive, Daily Tide, Wardrobe, Objectives,
  Leaderboard and Settings
- “Tap to Dive” launch interaction that also unlocks audio
- Interactive first-run teaching for steering, light, collision recovery and
  near-miss scoring
- A clear Dive Again button
- Three new deterministic obstacle verbs:
  - Safe wide gate versus narrow high-reward Moonflash gate
  - Predictable sliding or opening ceremonial shutters
  - Telegraph-first current lanes that alter lateral movement
- Cosmetic shop with preview, price, locked state, purchase and equip
- Front-facing Glowfin presentation and celebratory animations
- Rare high-value living-world events instead of simply adding more static
  props
- Optional haptics in the future app wrapper
- Rendered Moonflash media and ghost-challenge deep links
- Physical iPhone and complete Android thermal/audio validation

## Remove or relocate

- Remove the always-visible Version/build badge from the public player HUD;
  retain it in a diagnostic screen.
- Relocate steering, reduced motion, contrast, telemetry and wardrobe controls
  out of the post-run action stack.
- Replace “tap outside to restart” as the primary restart instruction.
- Label the light and momentum meters, or simplify them into more understandable
  segmented indicators.
- Keep rewarded video unavailable until Pearls have a real use and the
  provider/privacy certification is complete.
- Do not add more coral, merfolk or architecture merely to fill empty space.
  Add purposeful motion, reactions and set-piece events.
- Never add competitive revive advertising; it would undermine the clean
  leaderboard model.

## Approved next-build sequence

### Version 37 — First 10 Minutes & Economy Clarity

This comes before the store wrapper. Its bounded scope is:

- Tap-to-Dive start and audio activation
- Interactive first-run tutorial
- Moon Well hub
- Completely reorganized post-run flow
- Clear Dive Again action
- Larger phone-readable typography
- Separate Tide XP and Lumen Pearl purposes
- Wardrobe preview, purchase and equip flow
- Direct access to Daily Tide without intentionally ending a normal run
- Instrumentation for tutorial completion, first reward, first purchase, first
  equip and Daily Tide entry

After that:

1. **Version 38:** Signature obstacle variety and living-world set pieces
2. **Version 39:** Store wrapper and controlled soft launch

Glowfin is already technically credible. The next major quality gain will come
from making the first ten minutes feel effortless, rewarding and memorable—not
from adding more infrastructure.

