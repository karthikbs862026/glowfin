# Version 48-R2 Full Eclipse Court Campaign Certification

**Date:** 2026-08-15

**Status:** owner-approved release candidate; protected-main checks and merge
recorded in the promotion section below

**GitHub source base:** Version 45 main
`6c352f7ef40abc7569533ba7e8902d9d56d9936a`

**Gameplay source base:** Version 47-R1
`35be13bf16fcf48fbb29d59c16c95bbe447aa6b7`

**Accepted deployed snapshot:** Sites version 136, source commit
`7f75be6a5fba0b35e2450e3d9a7aeb574055085a`

**Candidate branch:** `release/v48-r2-eclipse-court`

## Source provenance

The local working copy was pruned after the visual approval. The candidate was
therefore reconstructed from the exact production source maps of the approved
V48-R2 player bundle and its V48 shared progression bundle. This preserves the
accepted TypeScript sources instead of attempting to reproduce the scene from
screenshots or copying only the visible renderer.

## Integrated scope

- Halo Procession, Constellation Weave and Crown Verdict form one full realm
  campaign with 64, 56 and 16 authoritative objectives: 136 in total.
- Each chapter has four deterministic acts at 0%, 25%, 50% and 75% completion,
  authored recovery gates and a longer finale coast.
- Halo uses an open lunar-rib procession, Weave uses floating constellation
  atolls and six independent manta witnesses, and Verdict rises through a
  Crown amphitheatre. Colour is not their only differentiator.
- World geometry is collision-aligned and kept outside the route opening.
  Halo ribs are mounted at the sides rather than above the camera path.
- The scene is bounded to 50 draw calls, 11 materials and 112,400 triangles,
  inside the fixed mobile realm budget.
- Direct chapter review is available only on explicit V48 review routes and
  uses prefixed session storage so it cannot read or mutate the main save.
- V48-R1, V47-R1 and all prior versioned routes remain available and unchanged.
- Android/iOS wrapper and CI artifact identities advance to 48 / 0.48.2 while
  retaining the existing portrait, safe-area, lifecycle and security policy.

## Evidence ledger

| Gate | Evidence | Status |
|---|---|---|
| Approved production snapshot | owner accepted the full-campaign visual result | Passed |
| Repository regression suite | prior approved build reported 143 automated tests | Passed on approved snapshot |
| V48-R2 release assertions | 136 objectives, four acts, chapter silhouettes, budgets and save isolation | Required on PR |
| Lint + strict TypeScript | GitHub CI | Required on PR |
| Production build and release seal | GitHub CI | Required on PR |
| Structural, fast and full renderer gates | GitHub Actions art gate | Required on PR |
| Deterministic renderer soak | 30-minute simulated-time and 5,400-frame gates | Required on PR |
| Android/iOS wrapper builds | native-wrapper workflow | Required on PR |
| Exact production publish | redeploy saved Sites version 136 after merge | Required after merge |

## Promotion record

The pull request, candidate SHA, protected checks, merge SHA, deployment ID and
playable URL are recorded here after the corresponding immutable identities
exist.
