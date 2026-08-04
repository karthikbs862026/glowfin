# Glowfin Core Game Memory

This file records owner-approved product truths that future releases must treat
as durable direction. Detailed technical decisions remain in the ADRs.

## 2026-08-04 — Versions 39 and 40 confirmed

Version 38 is the merged and deployed gameplay baseline at `8f529b9`. The next
two builds are owner-approved and must remain in this order.

### Version 39 — Guided Onboarding & Store-Ready Mobile Experience

The tutorial is a required Version 39 release feature. The Version 37 overlay
was not discoverable for returning saves and did not teach each action clearly
enough, so it does not satisfy this requirement.

The replacement tutorial must:

- appear as a clear first-hub invitation for every player who has not completed
  the Version 39 tutorial, including players migrated from older saves;
- remain available for replay from the Moon Well and Settings;
- explain automatic forward swimming, then teach left and right steering as
  separate actions, the safe cyan route, close-pass/Moonflash risk and reward,
  and recoverable collisions;
- use short phone-readable language, visible progress, action cues and a
  roughly 30-second learn-by-doing flow;
- offer `Skip for now` without trapping or punishing the player, and allow
  replay after completion;
- use bounded time fallbacks so young, first-time, assisted-steering or motor-
  accessibility players cannot become stuck;
- persist a versioned completion stamp without corrupting or duplicating the
  existing save, and instrument start, step, skip, replay and completion only
  when telemetry consent is granted.

The rest of Version 39 remains the store-ready mobile scope:

- Capacitor Android and iOS wrappers;
- physical testing on Samsung S22 Ultra, Oppo Reno3 Pro and at least two
  iPhones;
- safe-area, notch, navigation-bar and orientation handling;
- haptics for near-misses, collisions, purchases and milestone rewards;
- audio interruption, Bluetooth/headphone, background and resume handling;
- faster startup, explicit loading progress and offline recovery;
- rendered 6–8-second Moonflash share clips and `Beat My Current` ghost links;
- front-facing Glowfin celebration, recovery and unlock animation polish;
- targeted hero-asset polish without another broad environment-density pass;
- final privacy, consent, age-gating, accessibility and store-metadata review;
- consent-safe crash and segmented device/performance diagnostics.

Version 39 is accepted only when there is no major issue across the physical-
device matrix, startup/resume/audio/save recovery are reliable, frame rate stays
inside existing budgets, the install-to-tutorial-to-first-purchase/equip journey
works, and Android/iOS store-submission candidates exist. Do not add obstacle
systems, currencies or broad scenery during Version 39.

### Version 40 — Controlled Soft Launch & Retention Validation

Version 40 begins only after Version 39's device and store gates close. Its
scope is a small invitation or limited-market launch, a seven-day newcomer
journey, tiered Daily Tide targets and weekly rewards, remote feature/economy
configuration, bounded onboarding/post-run/Pearl-price experiments, live funnel
and device-health dashboards, economy balancing from real behaviour and a
formal go/no-go review.

Rewarded video stays disabled unless Pearl demand is demonstrated and provider,
privacy and consent certification are complete. Never add competitive revive
advertising.

Initial Version 40 decision targets are: tutorial completion at least 85%,
first-run completion at least 75%, three runs in the first session at least 50%,
first cosmetic purchase and equip at least 35%, Daily Tide participation at
least 25%, D1 retention at least 30%, D7 retention at least 10–12%, and
crash-free sessions at least 99.5%. Version 41 content or monetization expansion
must wait for Version 40 evidence.

## 2026-08-04 — Version 36 expert verdict accepted

The full authoritative review is preserved in
[`expert-verdict-v36.md`](expert-verdict-v36.md).

### Product verdict

- Overall: **7.0/10**
- Vertical-slice quality: **8.3/10**
- Technical foundation: **8.5/10**
- Player-facing completeness: **6.4/10**
- Commercial soft-launch readiness: **6.2/10**
- The production foundation is ahead of the player experience. The priority is
  effortless, rewarding and memorable first-ten-minute play—not more
  infrastructure.

### Frozen strengths

Preserve one-swipe steering, automatic forward movement, momentum/light/trail
response, near-miss multiplier, recoverable collisions, the approved camera
and lane geometry, cyan collider truth, deterministic replay/ghost/Daily Tide,
grace-day streak, separate standard/assisted divisions, cosmetic-only power,
privacy/save/performance guardrails and the Moon-Current soundtrack.

### Approved release sequence

1. **Version 37 — First 10 Minutes & Economy Clarity:** Tap to Dive, audio
   activation, learn-by-playing tutorial, Moon Well hub, simplified post-run,
   readable typography, separate XP/Pearl purposes, and Wardrobe
   preview/purchase/equip.
2. **Version 38 — Signature Obstacle Variety & Living-World Set Pieces:** grow
   from stationary-gap variants to three readable obstacle verbs and add rare,
   purposeful living-world events.
3. **Version 39 — Guided Onboarding & Store-Ready Mobile Experience:** the
   discoverable Version 39 tutorial plus the wrapper, device, sharing, store,
   privacy and diagnostic scope recorded above.
4. **Version 40 — Controlled Soft Launch & Retention Validation:** prove the
   first-session, economy, Daily Tide, D1/D7 and device-health targets before
   expanding content or monetization.

### Current implementation state

- Version 37 is merged at `fccb95c` as the first-ten-minutes and economy
  foundation.
- Version 38 is merged and deployed at `8f529b9`. It ships
  21 templates across three replay-safe verbs, shared collision/render truth,
  closed-form current solvability reserves, exact 1.35x Moonflash route rewards
  and rare non-colliding living-world set pieces.
- Version 39 has started from that exact Version 38 baseline with the guided-
  tutorial acceptance contract above. It is not a complete store-ready release
  until all remaining wrapper and physical-device gates pass.

### Guardrails from the verdict

- Do not reintroduce tap-outside-to-restart.
- Do not put Settings, Wardrobe, telemetry and accessibility controls back in
  the post-run action stack.
- Do not expose the build badge on the always-visible public HUD.
- Do not enable rewarded video until Pearls have real utility and provider and
  privacy certification are complete.
- Never add competitive revive advertising.
- Do not fill space with more static coral, merfolk or architecture; prefer
  purposeful motion, reactions and authored set-piece events.
