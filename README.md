# Glowfin

One-swipe endless bioluminescent surf game. Three.js + TypeScript.

See `glowfin-master-build-prompt-v2.md` (project doc) for the full spec —
this README covers local setup only.

## Status

**Phase 0 — Foundation** (see Part 9 of the master build prompt).
This is scaffolding, not gameplay: a render loop, a cube, single-finger
touch steering, and the repo/CI plumbing. No momentum system, no collision,
no procedural generation yet — that's Phase 1.

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
config/         tunable data — not created yet, added with the momentum/scoring systems (Part 2)
docs/           decision log (ADRs), will grow to include tuning guide, QA runbook (Part 5.4)
scripts/        repo/CI tooling, asset pipeline scripts (Part 4.4)
.github/        CI workflows, PR template, CODEOWNERS
```

## Open items from Phase 0 (tracked honestly, not swept under the rug)


- [ ] Bundle size budget in CI is a placeholder — see ADR-0003
- [ ] `CODEOWNERS` currently points everything at one owner — update if/when the team grows
- [ ] Branch protection script has not been run against the live repo yet
- [ ] No environments (local/staging/prod) or deploy pipeline yet — that's Part 7, later phase
