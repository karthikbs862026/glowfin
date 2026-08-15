# Glowfin

One-swipe endless bioluminescent surf game. Three.js + TypeScript.

See `glowfin-master-build-prompt-v2.md` (project doc) for the full spec —
this README covers local setup only.

## Status

**Version 48-R2 — Full Eclipse Court Campaign is the owner-approved release
candidate. It turns the three Eclipse Court showcases into 12 escalating acts
and 136 objectives, gives Halo Procession, Constellation Weave and Crown
Verdict distinct architecture and choreography, keeps route visibility clear
with side-mounted lunar ribs, and isolates direct-review saves from normal
progress. Earlier versioned routes remain immutable for comparison and
rollback.**

The deterministic endless-runner core, momentum/light systems, procedural
course, collisions, scoring, mobile input, adaptive quality, caustics, bloom,
trail, contrast probe and hardened art gate are in place. Version 32 adds the
first durable player-state layer around the approved Version 31 baseline:

- versioned two-copy local progress with checksum validation, legacy migration
  and corruption recovery
- private same-origin cloud synchronization with optimistic revisions and
  deterministic conflict merging
- zero-collection telemetry until explicit player consent, with a bounded
  event allowlist and privacy-safe payloads
- fixed-step, checksummed best-run recording and explicit same-seed playback
- a translucent, non-colliding ghost rendered by a second presentation-only
  creature while the authoritative player simulation remains unchanged

Version 33 completes the Phase 4A candidate on top of that foundation:

- persistent Lumen Pearls, quadratic Tide Levels and exactly twelve
  cosmetic-only unlocks implemented through existing shader uniforms
- one hosted-UTC, deterministic Daily Tide Trial whose shared seed is checked
  by the production solvability proof
- two rotating daily objectives, one rotating weekly objective and a one-day
  streak grace rule with bounded, idempotent reward claims
- a reward/unlock-focused post-run screen, explicit same-seed Daily Tide ghost
  rematch and next-day return observation
- schema-v2 progress with corruption recovery, Version 31/32 migration and
  conflict-safe cloud merging without reward duplication
- consent-gated retention-funnel telemetry and disabled rewarded-video
  provider/placement interfaces, with no advertising SDK or purchases

Version 34 completes the code-owned Phase 4B surface:

- explicit standard and assisted leaderboard divisions, with reduced-motion
  presentation remaining eligible for the standard division
- server-authority replay validation that re-runs the fixed-step course,
  collision and scoring simulation before a score is accepted
- opt-in global and Daily Tide score submission with privacy-safe aliases
- bounded deterministic Moonflash descriptors that select the strongest
  near-miss and publish only after an explicit share action
- a host-injected rewarded-video bridge limited to idempotent Lumen bonuses;
  competitive recovery remains disabled and no provider SDK ships in the repo

Version 35 completes the bounded Phase 5A resilience surface:

- capability-gated WebGL2 startup with a readable fallback instead of a broken
  canvas on unsupported or blocked devices
- blocker-aware background, page-cache and interruption handling that resets
  input and fixed-step timing before safe resume
- full WebGL context reconstruction that replaces the canvas and rebuilds all
  renderer, scene, post-processing, texture and geometry resources before play
  resumes
- persistent reduced-motion and high-contrast presentation controls, including
  migration of Version 34 reduced-travel steering preferences
- consent-gated runtime-health events and a Chromium gate that forces context
  loss/restoration plus a page-cache pause/resume cycle

Version 36 completes the code-owned Phase 5B production-readiness surface:

- bounded retry/timeout policy that retries transient reads once and never
  replays a potentially accepted save, score, share, telemetry or reward write
- consent-safe production health and first-run-to-next-day funnel contracts,
  backed by identity-free hosted operational counters and explicit thresholds
- authenticated fixed-window abuse limits plus enforced telemetry,
  leaderboard, Moonflash, rewarded-claim and rate-bucket expiry policies
- receipt-gated, idempotent and bounded rewarded-video claims; competitive
  recovery remains disabled and cosmetic rewards remain outside run truth
- deterministic SHA-256 sealing of every release artifact, source-pinned
  staging manifests, post-gate release tags and an ancestor-verified rollback
  rehearsal to the Version 35 known-good baseline

Version 37 closes the expert-review first-session and economy gaps:

- a lightweight Moon Well hub with Tap to Dive, direct Daily Tide, Wardrobe,
  Objectives, Leaderboard and Settings access before the first run
- a gesture-bound launch that activates the existing phone-safe audio path and
  a bounded learn-by-playing tutorial for steering, Light, near-miss scoring and
  recoverable collisions
- one primary post-run action (Dive Again), two secondary actions (saved ghost
  and Moon Well), labelled Light/Flow meters and 12–14px phone-readable copy
- a real cosmetic economy in which Tide XP unlocks availability, Lumen Pearls
  purchase items, previews do not mutate progress and owned items equip
  separately
- schema-v3 save migration that grandfathers Version 36 availability and keeps
  spent Pearls from reappearing during cloud conflict resolution
- consent-gated first-ten-minute events covering hub entry, Tap to Dive,
  tutorial completion, first reward, preview, first purchase, first equip and
  Daily Tide entry

Version 38 completes the expert-review mechanical-variety scope:

- 21 authored templates across exactly three obstacle verbs: safe-versus-risk
  Moonflash choices, predictable ceremonial shutters and lateral current lanes
- deterministic per-gate plans derived from the run seed and authored gate
  identity without consuming or perturbing the course RNG stream
- one authoritative geometry contract for collision, cyan/rose contours,
  moving shutter faces, route resolution and replay validation
- minimum opening widths, at least 30 world units of telegraphing, and
  closed-form current-displacement reserves in the independent solvability proof
- a real safe-versus-spectacle decision: the authored wide route stays safe and
  the narrow Moonflash route earns exactly 1.35x its discrete route reward
- rare seeded ray processions, guardian salutes and Moon-Bloom pulses instead
  of additional static scenery; all remain non-colliding and pool-bounded
- phone-readable route, cadence and direction cues, plus consent-gated semantic
  instrumentation that does not capture steering or touch paths

Version 39 starts the store-ready mobile scope with a corrected tutorial:

- a first-hub tutorial invitation that appears even for returning Version 38
  saves, plus permanent replay entry points in the Moon Well and Settings
- six short learn-by-doing lessons for automatic swimming, separate left/right
  steering, cyan safe routes, close-pass/Moonflash reward and collision recovery
- phone-readable action cues, visible progress, `Skip for now`, replay and
  bounded per-step fallbacks that cannot trap a player
- a privacy-safe device-local Version 39 completion stamp and consent-gated
  tutorial start, step, skip/replay and completion instrumentation

Version 39 also contains pinned Capacitor 8 Android/iOS projects, portrait and
safe-area policy, native lifecycle composition, optional Settings-controlled
haptics, branded Moon-Garden icons/splash, explicit loading/offline recovery,
six-second rendered Moonflash media, `Beat My Current` challenge handoff,
front-facing reward/recovery poses, privacy/store declarations and coarse
consent-gated device-health diagnostics. CI produces unsigned Android and iOS
release candidates; signing credentials remain external by policy.

The frozen visual/gameplay baseline includes:

- a ten-bone volumetric Glowfin loaded from a deterministic Meshopt-compressed
  runtime GLB with an explicit negative-Z forward axis; the chase camera sees
  its organic round back, one continuous manta fin per side, one longer central
  kelp tail, integrated gill crowns and larger lateral eyes visible immediately
  inside the gills
- explicit simulation-selected calm, mid, max, collision and recovery motion
  languages with no wall-clock animation or gameplay-state changes
- five truthful LOD gate districts with distinct round, pointed, scalloped,
  domed and archless silhouettes plus independent cyan collider contours
- an authored Moon-Garden seabed surface in place of generated road paving
- grounded palace/observatory districts, maze-ridged brain coral, scalloped
  table coral and four supporting reef species
- one articulated, phone-readable hero mermaid whose Tidekeeper, Coral Warden
  or Astral Oracle regalia follows the active district, plus warm-faced upright
  reef citizens, anchored conch heralds and genuinely horizontal current
  swimmers on independently seeded lane-safe paths; larger fish schools,
  mantas, jellies and ceremonial props remain outside the collision lane
- limestone, nacre, bronze, lapis, crystal and living-coral responses in one
  instanced material system
- fork-crowned spires and shader-sway ribbon kelp retained as interim depth
- three hard-capped god-ray meshes
- a gesture-gated underwater soundtrack with the original 64-second,
  four-movement Moon-Current theme in one native-media stream plus Web Audio
  confirmation, beat-pulsed current/harmonic layers,
  near-miss, multiplier, collision, recovery and run-end cues; the first
  explicit sound-button tap confirms output instead of muting a canvas-started
  graph, generated samples are distinguished from native playback, and mute
  preference remains device-local with background suspension
- a deterministic living-district court behind the next gate: two prominent
  architecture layers per side, guaranteed monuments/tide-spears/conch
  fountains, larger bounded fish/jelly/ray activity, wider swaying reef banks
  and travelling bioluminescent coral waves
- a real runtime GLB delivery path for Glowfin, all five gate identities and all
  six reef families: semantic nodes and skinning attributes are deterministically
  Meshopt-compressed at build, validated against the rig/collider contracts and
  installed atomically into the approved runtime objects
- a production-cohesion pass with family-specific limestone, nacre, bronze,
  lapis, crystal and living-coral value groups; chipped stepped wall massing;
  one dominant ceremonial canopy; larger family-readable reef signatures; and
  supporting merfolk staged below the guardian rather than stacked at camera
  depth
- an in-camera Art-Bible acceptance target at
  `docs/art/phase3b-moon-garden-acceptance-target.webp`

The owner has accepted the corrected upright-resident/conch-herald composition,
the asynchronous current-swimmer choreography, the version-25 swimmer faces,
the version-27 living districts, the version-29 first-five-gates cohesion pass,
the version-30 Glowfin character and the version-22 Moon-Current score. Final
external DCC/PBR source replacement remains optional post-alpha polish behind
the now-frozen runtime contracts; it is not allowed to hold the approved alpha
baseline open indefinitely.
ADR-0028 keeps a top-level native media stream as the phone-output
authority; ADR-0029 records the approved 64-second replacement score; ADR-0031
records the accepted living-district composition; ADR-0032 establishes the
runtime GLB gate/reef contract; ADR-0033 records the cohesion scope; ADR-0034
records the approved runtime Glowfin character; and ADR-0035 records the
Version 31 release-certificate boundary. ADR-0036 records the Version 32 save,
telemetry, replay and ghost contracts; ADR-0037 records the Version 33 Moonwake
progression and Daily Tide contracts; ADR-0038 records the Version 34 ranked,
sharing and rewarded-provider boundaries; and ADR-0039 records the Version 35
runtime recovery boundary. ADR-0040 records the Version 36 production policy,
privacy, abuse, retention, artifact-seal and rollback boundary. ADR-0041 records
the accepted expert verdict, Version 37 first-session shell, learn-by-playing
tutorial and purchase-based cosmetic economy. ADR-0042 records the Version 38
signature-obstacle and living-event foundation. Android real-time thermal/audio/recovery review,
the physical first-run-to-next-day return journey and all iOS Safari evidence
remain outstanding. The automated certificate is therefore conditional and
cannot replace those real-device approvals.

Certification evidence and release operations are maintained in
`docs/phase3-exit-report.md`, `docs/phase4a-release-report.md`,
`docs/phase4b-release-report.md`, `docs/phase5a-release-report.md`,
`docs/phase5b-release-report.md`, `docs/version37-release-report.md`,
`docs/version38-build-notes.md`, `docs/version38-release-report.md`,
`docs/core-game-memory.md`,
`docs/qa-runbook.md`, and
`docs/release-runbook.md`.

## Local setup

Node.js 22 or newer is required for the deterministic TypeScript art exporter.

```bash
npm install
npm run dev        # local dev server
npm run build       # type-check + production build
npm run lint
npm run typecheck
npm run test
```

## Repo setup checklist (apply once, requires `gh auth login` with admin rights)

```bash
./scripts/setup-branch-protection.sh karthikbs862026/glowfin
./scripts/enable-lfs-and-secret-scanning.sh karthikbs862026/glowfin
git lfs install   # once, locally, before committing any binary asset
```

## Structure

```
src/            game source (grows into mechanics/, render/, input/ etc. — Part 5.1)
tests/          test suites (Part 6)
config/         versioned gameplay, visual and performance tuning data
docs/           decision log (ADRs), will grow to include tuning guide, QA runbook (Part 5.4)
tools/art-gate/ production art manifests, captures and release checks
scripts/        repo/CI and production bundle checks
.github/        CI workflows, PR template, CODEOWNERS
```

## Open release items

- [ ] `CODEOWNERS` currently points everything at one owner — update if/when the team grows
- [ ] Replace code-native district, reef, prop and merfolk-cast integration sources
      with optimized authored GLB/PBR assets
- [x] Load the Version 30 Glowfin sculpt/rig checkpoint from a validated,
      Meshopt-compressed runtime GLB with an explicit recovery fallback
- [ ] Replace the Version 30 reproducible Glowfin topology with final external
      DCC sculpt/UV/PBR source without changing its approved runtime contract
- [x] Load all five gate families and six reef families from validated,
      Meshopt-compressed runtime GLBs with an explicit recovery fallback
- [x] Full 36-state emulated art matrix required on pull requests
- [x] Deterministic 30-minute simulated-time Chromium renderer soak
- [x] Momentum-layered Moon-Current score, gameplay cues, top-level native-media fallback, gesture-safe source startup, mute persistence and dual-path playback gate
- [x] Phone-readable horizontal-swimmer face/expression checkpoint approved
- [ ] Replace the approved swimmer prototype with final UV/PBR DCC topology without changing its face or choreography
- [x] Owner visual approval for the gate-linked living-district and reef-current pass
- [x] Owner visual approval for the Version 30 Glowfin production-character baseline
- [x] Version 31 source/environment fingerprint and deterministic release manifest
- [x] Immutable main-branch staging artifact and post-deploy smoke contract
- [x] Versioned local progress with backup recovery and legacy migration
- [x] Private conflict-safe cloud synchronization and consent-gated telemetry
- [x] Deterministic best-run replay and explicit non-colliding ghost race
- [x] Lumen Pearls, Tide Levels and twelve shared-material cosmetic unlocks
- [x] Deterministic solvable Daily Tide Trial, three rotating objectives and grace-day streak
- [x] Version 31/32-to-33 migration, duplicate-reward protection and consented retention telemetry
- [x] Deterministic global/Daily leaderboards with standard and assisted divisions
- [x] Server re-simulation authority and explicit privacy-safe score submission
- [x] Bounded near-miss Moonflash clips and controlled share publishing
- [x] Host-injected rewarded-video bridge with idempotent cosmetic-only rewards
- [x] Physical first-run-to-simulated-next-day-return and retention-funnel sign-off
- [x] Android real-time 30-minute performance, thermal, sound-mix and interruption sign-off
- [x] iOS Safari performance, contrast, audio and real-time 30-minute soak sign-off
- [x] Code-owned monitoring, consent-safe funnel, abuse limits, retention expiry, sealed artifacts and rollback rehearsal
- [ ] Public production promotion and store-wrapper pipeline
