# Glowfin Core Game Memory

This file records owner-approved product truths that future releases must treat
as durable direction. Detailed technical decisions remain in the ADRs.

## 2026-08-05 — Master Engagement Enhancement Plan accepted

The owner-supplied authoritative plan is preserved verbatim in
[`glowfin-master-engagement-enhancement-plan.txt`](glowfin-master-engagement-enhancement-plan.txt).
The supplied source begins at section 3; that numbering is preserved rather
than inventing missing source content.

### Durable product direction

Glowfin must evolve from a beautiful one-swipe endless runner into a
character-led living adventure runner. The target fantasy is to lead Glowfin
and a small crew of luminous swimmers through a living underwater kingdom,
collect lost light, race rivals, rescue creatures, escape the Abyss, encounter
leviathans, discover realms and visibly restore the Moon Well.

The engagement model has four connected loops:

- moment to moment: read the current, choose a safe or risky route, collect a
  satisfying object line, encounter a character or threat, perform a skillful
  escape and receive an immediate audiovisual payoff;
- run: choose a mission, enter a realm, complete encounters, face a race,
  rescue, chase or leviathan climax, reach a finish or transition and earn a
  visible restoration reward;
- long term: discover relics, unlock characters and relationships, restore Moon
  Well districts, complete realm collections and pursue harder Expeditions and
  seasonal goals;
- social: race verified ghosts, challenge friends, participate in realm or
  character events and compare progress without pay-to-win power.

The experience must continually change the player's immediate purpose. No
purposeful encounter or collectible choice should be absent from the opening
20 seconds, and a run should not contain a purposeless stretch longer than
approximately 25 seconds.

### Approved engagement systems

- A deterministic, replay-safe `EncounterDirector` is the foundation. It must
  schedule satisfaction, choice, character, competition, pressure, recovery
  and resolution beats rather than merely spawning more obstacles. It must not
  repeat the same encounter type back-to-back, must place a calm beat after
  high pressure and must preserve the authoritative cyan collision truth.
- Lumen Motes are the primary common in-run collectible and build a sensory
  Lumen Chain. They may contribute to score and a small capped portion of the
  existing Lumen Pearl reward, but they are not a new currency.
- Lost Relic Shards are deterministic, discoverable, non-duplicating persistent
  finds tied to realms. Mission objects such as Rescue Lights, Moon Seals,
  cargo, constellation stars and Current Beacons provide encounter-specific
  purpose without creating another economy.
- Duskmaw is a working name for an occasional magical shadow-eel or abyssal
  guardian. Its 18–25-second pursuits must be exciting rather than violent,
  keep the safe path visible, use telegraphed steering-compatible attacks and
  preserve Glowfin's recoverable-mistake identity. It must not become a
  constant pursuer.
- Endless Dive remains the score-mastery mode, but three-to-five-minute finite
  Expeditions add explicit objectives, climaxes, finishes and permanent
  completion marks.
- Tide Sprint begins as asynchronous, non-colliding, deterministic ghost
  racing. Practice, ranked, daily, friend and Realm Cup variants may follow.
  Real-time multiplayer remains deferred until asynchronous demand is proven.
- Playable characters must provide personality, silhouette, expression,
  animation, sound, story and Bond Paths—not statistics. All competitive
  characters have identical collider, speed, steering, momentum, Light,
  collision and score behaviour. Glowfin, Neri, Coralyn, Solara and Kelpip are
  working cast concepts; Miri, Pip and Tiko are working companion concepts.
- New realms must change gameplay as well as colour. Every approved realm needs
  a distinct visual and musical identity, two realm-specific gameplay verbs,
  one hero encounter, one relic page, unique ambient reactions and a readable
  transition. Moon-Garden Ruins is the foundation; Kelp Cathedral and Crystal
  Trench are the first proposed additions. Sunken Market, Leviathan Graveyard
  and Storm-Crown Reef remain evidence-gated roadmap concepts.
- Relic Atlas completion, Moon Well restoration and cosmetic/narrative
  Character Bonds create the persistent emotional loop. Living-world actors
  must react to player actions instead of being added as purposeless static
  density.

All working names and character/environment concepts remain subject to later
art, narrative and player-test approval; their gameplay roles and fairness
contracts are the durable part of this plan.

### Approved post-Version 40 release sequence

Version 40 remains the bounded Controlled Soft Launch & Retention Validation
build. It must not absorb several new environments or character systems.

1. **Version 41 — Living Current Vertical Slice:** deterministic Encounter
   Director, Lumen Motes and chains, a six-item first Relic Atlas page, the
   three-minute `The Missing Moonseed` Expedition, Neri rival cameo, Miri
   rescue, one production-quality Duskmaw chase, first visible Moon Well
   restoration, full telemetry and replay compatibility. Do not add a new
   environment, currency, real-time multiplayer or combat control.
2. **Version 42 — Tide Sprint & Glowkin Crew:** finite four-swimmer Tide Sprint,
   practice/ranked/friend variants, Glowfin/Neri/Coralyn selection, one shared
   competitive contract, Bond Paths, podium and rivalry presentation, weekly
   Realm Cup and race/character telemetry.
3. **Version 43 — Realms of the Lost Kingdom:** Kelp Cathedral, Crystal Trench,
   a data-driven biome definition, two verbs and one relic page per realm,
   Endless Dive transitions and realm-selectable Expeditions. No further realm
   is approved until blind tests can mechanically distinguish both.
4. **Version 44 — Duskmaw & Leviathan Encounters:** expanded Duskmaw story,
   three chase variants, one multi-phase leviathan encounter, rescue/escort
   Expeditions, unranked adaptive difficulty, reduced-motion presentation and
   encounter-specific audio/haptics. Interaction remains steering-led; no
   attack button is required.
5. **Version 45 — Moon Well Restoration & Relic Atlas:** multiple restorable
   districts, complete relic collections, character residency and reactions,
   realm completion, story memories, rewards and clear next-discovery guidance.
6. **Version 46 — Living Tide Season One:** a four-to-six-week season, weekly
   race cup, featured Expedition, seasonal collection, one character questline,
   remote scheduling and content-cost validation.
7. **Version 47 — Social Currents:** friend race leagues, small asynchronous
   crews, community restoration and realm participation events with
   privacy-safe identity, no mandatory chat and no open communication system
   for young players.
8. **Version 48 — Commercial Content Scale:** scale only the systems supported
   by evidence, formalise content production, consider sealed/on-demand realm
   packs, test cosmetic-only monetisation and expand rollout conditionally.

### Version 41 decision targets

- no purposeless interval longer than 25 seconds;
- at least 80% of test players understand each encounter objective without a
  long written explanation;
- Duskmaw chase success between 65% and 85%;
- at least 30% immediate Expedition rematch;
- a meaningful improvement in first-session three-run rate versus the Version
  40 holdout;
- no regression in tutorial completion, first-run completion, crash-free
  sessions or device performance.

After Versions 41–42, stretch targets are: first-session three-run rate
58–60%, D1 retention at least 35%, D7 retention 13–15%, full Lumen Chain at
least 60%, Expedition completion at least 70%, Expedition rematch at least 30%,
Tide Sprint completion at least 80%, Tide Sprint rematch at least 30%,
non-default character selection by day 3 at least 35%, chase success 65–85%,
crash-free sessions at least 99.5% and zero performance-budget regressions.

### 2026-08-07 — Version 41-R1 clean rebuild certified

The failed Version 41 sidecar implementation is retained only in Git history.
It must not be restored, merged or used as a runtime base. Version 41 is rebuilt
from the physically certified Version 39 commit
`266b7900294f81e174134337a9d14b5951efcf30` through one HTML application, one
renderer, one animation loop and one steering controller.

Version 41-R1 adds only the `The Missing Moonseed` mission card, same-page
briefing and fixed-seed playable current through an explicit
`startExpedition()` seam. It contains no prototype monkey-patching, synthetic
click, startup polling, release-metadata dynamic import or save request that can
block play. Service-worker caching remains disabled during the staged rebuild.

The owner physically certified all eight R1 acceptance points on both the
Samsung S22 Ultra and Oppo Reno3 Pro: three fresh launches, mission-card
visibility, same-page briefing, prompt Chapter 1 entry, deterministic advancing
gameplay and score, correct left/right steering, background/resume, and Classic
Current/tutorial regression safety. Matching production requests completed
without Worker errors, including successful cloud-save reads and writes.

R1 is the mandatory base for the remaining clean rebuild sequence:

1. R2: Lumen Motes and the first objective.
2. R3: relic, Miri and Neri.
3. R4: Duskmaw and Moon Well restoration.
4. R5: persistence, telemetry and production certification.

iPhone/Safari validation of the rebuilt Expedition remains a later explicit
cross-platform gate; Android certification must not be presented as iOS
evidence.

The complete R1 evidence is preserved in
[`version41-r1-certification.md`](version41-r1-certification.md).

### 2026-08-09 — Version 41-R5 clean rebuild completed

The R2–R5 sequence is now implemented directly on the certified R1 tree. The
same fixed-seed Expedition adds bounded Lumen Motes, the optional Fragment
fork, Miri rescue, the non-colliding Neri race, three returning Duskmaw Current
Breaks, a ceremonial Moonseed finish and Moon Well restoration. Waiting never
completes an encounter; missed required targets return ahead.

Expedition progress is isolated from ranked Classic/Daily rewards in a
checksummed primary/backup save domain. Claims are idempotent, completion is
unranked, telemetry remains consent-gated and restoration appears in the Moon
Well Relic Atlas. Classic Dive, Daily Tide, guided tutorial, replay ghosts and
their existing rewards retain their original paths.

Automated certification passes 398 repository tests across 53 files, the
production and structural gates, native Android/iOS wrapper contracts, exact
fixed-step completion and the deterministic 5,400-frame soak. R1's two-phone
Android evidence remains valid for the preserved renderer/input/lifecycle
baseline; R5 does not claim new iPhone hardware evidence. The complete record is
preserved in [`version41-r5-certification.md`](version41-r5-certification.md).

### 2026-08-09 — Tide Sprint feel frozen and Version 42 integration authorised

The owner accepted the current Tide Sprint playtest feel. Its steering,
one-finger speed control, near-current cues, Current Ring boosts, four-racer
readability and photo-finish balance are now the frozen gameplay reference.
Version 42 must not broadly redesign that experience. Changes are limited to
main-game integration, deterministic fairness, regression fixes, accessibility,
performance and certification work.

The authorised delivery order is binding:

1. Freeze the accepted Tide Sprint gameplay feel.
2. Finish the clean Version 41 rebuild from the certified R1 tree.
3. Create Version 42 only from the resulting latest `main`.
4. Port Tide Sprint as a proper Moon Well mode wired to progression, rewards,
   objectives, saves, consent-gated telemetry and deterministic ghosts.
5. Preserve Classic Dive, Daily Tide, the guided tutorial and Expedition.
6. Certify deterministic race authority, earned close-win fairness, Android and
   iPhone behavior, lifecycle recovery, performance budgets and the full
   5,400-frame renderer soak.
7. Merge Version 42 and expose Tide Sprint from the main Glowfin playable link.

Tide Sprint must not remain an isolated prototype after Version 41 completes.
The isolated playtest is an implementation reference, not a runtime base to be
merged wholesale. Version 42 must retain the shared competitive contract: all
characters use identical collider, speed, lateral authority, momentum, Light,
collision and score behavior; rivals remain non-colliding; no purchasable
speed, character statistics, equipment advantage, competitive revive or
real-time multiplayer is allowed.

### 2026-08-09 — Version 42-R1 integration branch created

Version 41-R5 is merged on `main` at
`c67c4a6350f3f432c72e5d01fe92df69c557f2f0`. Version 42-R1 was created from
that exact commit and implements Tide Sprint as a lazy Moon Well mode rather
than restoring the discarded sidecar architecture.

The R10 race plan remains frozen. Version 42 adds only the integration seams:
shared Version 4 progress and recovery, existing Lumen Pearl/Tide XP rewards,
cosmetic Bonds, three idempotent race objectives, a checksummed personal Best
Echo, consent-gated semantic telemetry, lifecycle recovery and native/mounted
route packaging. Classic Dive, Daily Tide, tutorial and Expedition entry paths
remain intact. ADR-0043 owns the architecture and
`version42-r1-certification.md` owns the evolving evidence ledger.

The branch is not the final release merely because local deterministic tests
pass. Candidate CI must certify both renderers and native wrappers, and real
Version 42 Android/iPhone evidence remains required before unconditional
promotion.

### Technical, fairness and safety guardrails

- Ranked, Daily Tide and verified races use fixed deterministic encounter plans,
  no hidden difficulty changes, no companion advantages, no random consumable
  power and server re-simulation. Character choice is presentation-only.
- Bounded adaptation is permitted only in unranked Adventure and Expedition
  modes. It may tune telegraph time, event density, rival pace and chase
  pressure, but must preserve solvability, cyan collider truth and a replayed
  difficulty division.
- Future save and replay schemas must preserve character ownership/selection,
  Bonds, relic discoveries, Expedition marks, restored districts, season state
  and idempotent claims. Cloud merge must not restore spent Pearls or duplicate
  relic rewards. Competitive replays must carry encounter/content hashes and
  invalidate mismatched authority plans.
- Existing hard budgets remain binding: 90 draw calls, 150,000 triangles, 48 MB
  texture memory, fewer than 12 active art materials, at least 700 ms reaction
  time and a 30 fps floor. Use instancing, shared materials and rigs, simpler
  rival LODs, one large chaser at a time and only current/next realms resident.
- QA must add engagement-cadence, collectible-fairness, race, chase,
  content-repeat and Version 31–40 migration gates, including reduced-motion,
  high-contrast, audio-off and haptics-off readability.
- Telemetry remains consent-gated and semantic: encounter outcomes, chain
  length, relic/rescue/chase/race/realm/character/restoration and voluntary
  abandonment. Never collect touch paths, raw steering, personal identity or
  pre-consent data.
- Do not turn Glowfin into a clone of another runner. Do not add shallow
  character volume, stat power, extra currencies, random card packs, gear
  upgrades, combat tapping, constant pursuit, premature real-time multiplayer,
  visual-only realm reskins, gacha, competitive revive advertising or another
  broad static-scenery density pass.

Glowfin's enduring distinction remains beautiful one-swipe underwater movement,
readable fair currents, recoverable mistakes, expressive bioluminescence and
emotionally warm adventure.

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
- Version 39 is physically certified by the owner and completed from that exact
  Version 38 baseline. Its atomic release contains the guided tutorial,
  Capacitor 8 Android/iOS shells, presentation-only haptics, branded native
  assets, startup/offline recovery, rendered Moonflash challenge media and deep
  links, hero reaction polish, privacy/store metadata and consent-safe device
  health. Unsigned store candidates are produced in CI; signing credentials
  remain outside the repository and are applied only during store submission.

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

## 2026-08-09 — Version 42 promoted; Version 43-R1 begun

PR #33 was squash-merged to `main` as
`6228c7755f55c63b27ccf8e58fac56291c9beae3`. Its tree is identical to the
green candidate head `9ccce3d38a524be6c12ba3bb63a42bbd2066a332`. The exact merged tree was sealed
as the Version 42-R1 production artifact with digest
`419f2292cc409ba12b5448534b97d25af1cda52181471f39e81d04db1e48dce6` and
promoted to the stable Glowfin playable route.

The owner confirmed that this exact Version 42 candidate passed real Android
and real iPhone race/close-win fairness, safe-area and touch, interruption and
background, and thermal-behaviour testing. Device models and OS versions were
not supplied and must not be inferred or borrowed from earlier matrices.

Version 43-R1 starts from that exact merge and implements the first *Realms of
the Lost Kingdom* vertical slice: a data-driven realm framework and Kelp
Cathedral. Its defining verbs are rhythmic Swaying Frond Windows and Reversing
Current Tunnels; its repeat-until-success hero encounter rescues a baby manta;
and its optional current awards one durable Relic Page. The implementation must
stay within existing mobile budgets, keep one collision/render truth, and
preserve Classic Dive, Daily Tide, tutorial, Expedition and Tide Sprint.

Kelp Cathedral may share idempotent Pearls, Tide XP, objectives and aggregate
progress, but it must never replace the Classic best score, save a Classic
ghost, submit a Classic leaderboard result or create a Moonflash challenge
clip. Its realm record remains a separate checksummed primary/backup save until
a versioned cloud migration is designed and certified. V43 promotion remains
blocked on Android/iPhone feel, safe-area, lifecycle, performance, thermal and
5,400-frame certification.

## 2026-08-10 — Kelp Cathedral requires a realm-owned silhouette

The owner rejected the first V43-R1 visual candidate because it still read as
the main Glowfin Moon Garden with a Kelp Cathedral badge. Realm acceptance now
requires a label-free frame to communicate the destination. Kelp Cathedral
must remove Moon Garden masonry, route crescents, large explanatory cue cards
and Moonstone presentation, then establish dense living columns, braided
canopy, organic collision-aligned fronds, emerald/gold light, spores, fauna and
the manta rescue beacon. Palette and HUD changes alone never constitute a new
realm.

## 2026-08-10 — Named realm landmarks must be readable in ordinary play

The owner found the first living Kelp Cathedral pass improved but still too
abstract and dark: arches read as pipes, frond barriers as repeated spikes,
and bells, spores, sea dragons and the manta were not clearly identifiable.
For realm acceptance, a named feature must be recognisable at normal chase
speed through silhouette, scale, material and contrast. A label or dark
procedural stand-in does not count. Kelp Cathedral therefore uses textured
curved stipes, three visibly braided strands, broad organic frond gates, a
natural seabed, layered emerald/aqua/gold light, dense luminous spores, large
scalloped bells, leafy sea dragons and a persistent manta target.

## 2026-08-10 — Freeze accepted Kelp direction; build Crystal Trench in slices

The owner accepted the corrected Kelp Cathedral realism direction and asked to
continue. Version 43-R1 is therefore frozen as the visual and mechanical
regression base. Version 43-R2 is the first Crystal Trench slice: an indigo ruin
threshold, deterministic Prism Pulse route-reading and a repeat-until-clean
Trench Gate crossing. It must be reviewable separately at `/game-v43-r2/`
without replacing the stable Version 42 root or the accepted R1 route.

R2 does not broaden the shared save. Sliding Crystal Plates, the Neri
mirror-current race, Crystal relic progression and the full cavern journey are
reserved for Version 43-R3. This sequencing keeps one new mechanic and one new
realm silhouette under review at a time while preserving all V42 and Kelp
behaviour.

## 2026-08-11 — Integrate the accepted realms as Version 43-R4

The owner accepted Crystal Trench R3 and authorized the combined mainline
sequence. R4 must branch from promoted Version 42 main, import accepted Kelp
Cathedral R1 and final Crystal Trench R3 (never R2), connect them through the
Moon Well as Realm 1→Realm 2, and unify saves, rewards, objectives, progression
and telemetry. Tide Sprint, Classic Dive, Daily Tide, tutorial and Expedition
remain unchanged.

The baby-manta rescue is the only Realm 2 unlock authority. Shared progress
advances from schema 4 to 5 and imports valid standalone realm history without
retroactive rewards. Realm claims are idempotent and cannot alter Classic
competitive records, Daily claims, Tide Sprint ghosts, tutorial or Expedition.
The combined candidate requires deterministic fairness, lifecycle,
performance, 5,400-frame, Android and iPhone gates before merge and main-link
promotion. Automated wrapper/simulator evidence and physical-device evidence
must remain separately labelled.

## 2026-08-13 — Integrate the accepted Heartlight War as Realm 3

Version 45-R1 is rooted at protected GitHub Version 43-R4 main and imports the
accepted hosted Heartlight War plus its Realm 3 progression contract. Crystal
Trench victory is the sole unlock authority for Leviathan Graveyard. Defeating
Duskmaw and freeing Auralis persists runs, victories, best time, clean marks,
mastered verbs and a permanent Mooncrest Covenant through the existing shared
save envelope.

The encounter remains deterministic and authority-aligned: minion waves,
recovery, current breaks, the stationary Moonbone Vault rescue and the final
four coordinated Auralis strikes must resolve from simulation state rather
than renderer or wall-clock state. Classic Dive, Daily Tide, tutorial,
Expedition, Tide Sprint, Kelp Cathedral and Crystal Trench must retain their
competitive records and progression boundaries.

The fixed 3 MiB sealed payload, 2 MiB JavaScript, 128 KiB hosted verifier and
realm draw/triangle/texture budgets remain binding. Version 45 wrapper and CI
artifact identities advance together; automated evidence never substitutes
for an exact-candidate Android/iPhone playtest.

## 2026-08-15 — Promote the owner-approved V48-R2 Eclipse Court campaign

The accepted Eclipse Court build is Version 48-R2. Its three chapters are no
longer trial-length showcases: Halo Procession, Constellation Weave and Crown
Verdict contain 64, 56 and 16 authoritative objectives respectively, for 136
objectives across twelve escalating acts. The act boundaries are deterministic
at 0%, 25%, 50% and 75%; recovery gates and longer finale coasts make each
chapter playable as a full campaign rather than a brief visual review.

The architecture contract is content-owned, not palette-owned. Halo is an open
lunar-rib procession with no overhead path occlusion, Weave is a field of
floating constellation atolls with six independent manta witnesses, and
Verdict is a rising Crown amphitheatre. Every obstacle-facing surface remains
aligned to simulation truth, and scenery, mantas and wakes stay inside their
authored chambers instead of crossing walls. The realm remains bounded to 50
draw calls, 11 active materials and 112,400 triangles.

Direct testing is an explicit V48 review capability only. It uses prefixed
session storage and cannot read, migrate, overwrite or delete normal Glowfin
progress. V48-R1, V47-R1 and earlier versioned routes are immutable comparison
and rollback artifacts. The accepted V48-R2 source was recovered from its exact
deployed source maps after workspace pruning; visible renderer code and shared
progression/persistence code must always be promoted together.

Eclipse Court extends the shared deterministic `Run` authority used to verify
leaderboard replays and Moonflash clips. Its unminified hosted verifier is
therefore allowed a narrowly revised 144 KiB ceiling (136.1 KiB measured on
the accepted candidate), replacing the pre-Eclipse 128 KiB ceiling. This does
not change the 3 MiB sealed payload, 2 MiB JavaScript or mobile render budgets.

## 2026-08-15 — Unify the complete journey as Version 48-R3

Version 48-R3 supersedes the older partial unlock descriptions. Chapter 1 is
complete only when the Moonseed reaches the ceremonial finish and the Moon Well
is restored. That fact grants a permanent Kelp Cathedral story entitlement in
the cloud-merged realm ledger. Historical saves with the original primary
completion mark are repaired into the same Moonseed, Moon Well and entitlement
truth instead of being reset or stranded between save envelopes.

Every surface uses one monotonic story contract. Crystal Trench requires both
Miri's rescue and the Kelp Cathedral Hymn Page. Leviathan Graveyard requires a
Crystal Trench victory and its clean crest. Existing downstream run history is
permanent proof that the corresponding realm was already open; a stale local or
cloud envelope must never relock it. Living Atlas state, Moon Well buttons,
result-screen handoffs, persistence validation and cloud merge all derive from
that same contract.

Tide Sprint must publish and wire its lobby before requesting the Three.js race
renderer. The static lobby owns detailed self-contained Glowkin portraits, so a
slow network or GPU cannot leave blank character cards or dead navigation. The
renderer may warm while the browser is idle, but a release gate caps the eager
lobby JavaScript and starts a real race on both target phone viewports. Visible
player copy must never expose version, test, trial, practice, temporary, stable
or separate-build language; exact release identity remains in sealed metadata
and a hidden diagnostics node.
