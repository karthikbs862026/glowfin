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
review. It must not be merged in its current state. The reset now includes:

- an authored rear-view Glowfin review source driven by the existing
  deterministic ten-bone animation prototype until its final rigged GLB exists
- truthful LOD wall fragments with independent cyan collider contours
- an authored Moon-Garden seabed surface in place of generated road paving
- authored broken-tower and reef-cluster review sources, instanced in the
  playable renderer from one shared atlas while their final GLB replacements
  are modeled
- fork-crowned spires and shader-sway ribbon kelp retained as interim depth
- three hard-capped god-ray meshes
- an in-camera Art-Bible acceptance target at
  `docs/art/phase3b-moon-garden-acceptance-target.webp`

The slice is not approved for merge until its revised frame visibly follows the
**Moon-Garden Ruins** Concept-First Art Bible. Technical contrast/performance
checks cannot override visual rejection. The review impostors are not final 3D
art and cannot satisfy Phase 3B completion; production GLBs remain required.
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
- [ ] Replace authored review impostors with optimized broken-tower and reef GLBs
- [ ] Replace the rejected code-native Glowfin and gate treatment with approved
      authored models while preserving collider truth
- [ ] Full 36-state emulated art matrix
- [ ] Android and iOS Safari performance, contrast and 30-minute soak sign-off
- [ ] Final sound/music, production deployment and store-wrapper pipeline
