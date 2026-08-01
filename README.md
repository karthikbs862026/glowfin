# Glowfin

One-swipe endless bioluminescent surf game. Three.js + TypeScript.

See `glowfin-master-build-prompt-v2.md` (project doc) for the full spec —
this README covers local setup only.

## Status

**Phase 3B — Moon-Garden vertical slice under visual revision.**

The deterministic endless-runner core, momentum/light systems, procedural
course, collisions, scoring, mobile input, adaptive quality, caustics, bloom,
trail, contrast probe and hardened art gate are in place. Draft PR #7 is an
explicit visual reset after the first evidence frame failed owner Art-Bible
review. It must not be merged in its current state. The integrated draft now
includes:

- a ten-bone volumetric Glowfin with an explicit negative-Z forward axis; the
  chase camera sees its cute round back, manta fins and central tail while its
  face remains aimed into the obstacle corridor
- five truthful LOD gate districts with distinct round, pointed, scalloped,
  domed and archless silhouettes plus independent cyan collider contours
- an authored Moon-Garden seabed surface in place of generated road paving
- grounded palace/observatory districts, maze-ridged brain coral, scalloped
  table coral and four supporting reef species
- moving moonfolk guardians, larger fish schools, mantas, jellies, merfolk
  monuments, tide-spears and conch fountains outside the collision lane
- limestone, nacre, bronze, lapis, crystal and living-coral responses in one
  instanced material system
- fork-crowned spires and shader-sway ribbon kelp retained as interim depth
- three hard-capped god-ray meshes
- an in-camera Art-Bible acceptance target at
  `docs/art/phase3b-moon-garden-acceptance-target.webp`

The slice is not approved for merge until its revised frame visibly follows the
**Moon-Garden Ruins** Concept-First Art Bible. Technical contrast/performance
checks cannot override visual rejection. The code-native integration meshes are
not final premium DCC art and cannot satisfy Phase 3B completion; optimized
production GLBs/PBR assets remain required. ADR-0021 makes the world-family
inventory and mobile budgets hard regression gates during that replacement.
Real-device Android and iOS sign-off remains separate from CI emulation.

## Local setup

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
- [ ] Replace code-native district, reef, prop and moonfolk integration sources
      with optimized authored GLB/PBR assets
- [ ] Replace the rejected code-native Glowfin and gate treatment with approved
      authored models while preserving collider truth
- [x] Full 36-state emulated art matrix required on pull requests
- [x] Deterministic 30-minute simulated-time Chromium renderer soak
- [ ] Android and iOS Safari performance, contrast and real-time 30-minute soak sign-off
- [ ] Final sound/music, production deployment and store-wrapper pipeline
