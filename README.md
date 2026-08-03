# Glowfin

One-swipe endless bioluminescent surf game. Three.js + TypeScript.

See `glowfin-master-build-prompt-v2.md` (project doc) for the full spec —
this README covers local setup only.

## Status

**Phase 3C — Version 30 Glowfin production-character candidate.
Version 29 is merged on `main`; the version-22 score, version-25 swimmer faces,
version-27 living-district composition and version-29 cohesion pass remain
owner-approved.**

The deterministic endless-runner core, momentum/light systems, procedural
course, collisions, scoring, mobile input, adaptive quality, caustics, bloom,
trail, contrast probe and hardened art gate are in place. Version 30 extends
the merged runtime-GLB foundation to Glowfin without adding districts, gate
encounters, residents or gameplay systems. The candidate includes:

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
the version-27 living districts, the version-29 first-five-gates cohesion pass
and the version-22 Moon-Current score. This does not yet approve Version 30
production character art. Version 30 extends the optimized GLB delivery path
to Glowfin itself and remains the phone-review character candidate. Final
external DCC/PBR source art remains open.
ADR-0028 keeps a top-level native media stream as the phone-output
authority; ADR-0029 records the approved 64-second replacement score; ADR-0031
records the accepted living-district composition; ADR-0032 establishes the
runtime GLB gate/reef contract; ADR-0033 records the cohesion scope; and
ADR-0034 records the runtime Glowfin character contract. The score still needs
Android/iOS speaker,
headphone, interruption, performance and thermal review. Technical CI evidence
cannot replace those visual and real-device approvals.

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
- [ ] Android and iOS Safari performance, contrast and real-time 30-minute soak sign-off
- [ ] Final Android/iOS sound mix and interruption sign-off, production deployment and store-wrapper pipeline
