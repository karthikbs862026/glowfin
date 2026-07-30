# Glowfin

One-swipe endless bioluminescent surf game. Three.js + TypeScript.

See `glowfin-master-build-prompt-v2.md` (project doc) for the full spec —
this README covers local setup only.

## Status

**Phase 3B — Moon-Garden vertical slice.**

The deterministic endless-runner core, momentum/light systems, procedural
course, collisions, scoring, mobile input, adaptive quality, caustics, bloom,
trail, contrast probe and hardened art gate are in place. The first production
art slice now replaces the placeholder creature and environment with:

- a two-draw, ten-bone simulation-driven Glowfin
- truthful LOD wall fragments with independent cyan collider contours
- instanced broken towers and fork-crowned spires
- locally responsive coral and shader-sway ribbon kelp
- three hard-capped god-ray meshes

The slice follows the approved **Moon-Garden Ruins** Concept-First Art Bible.
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
- [ ] Full 36-state emulated art matrix
- [ ] Android and iOS Safari performance, contrast and 30-minute soak sign-off
- [ ] Final sound/music, production deployment and store-wrapper pipeline
