# ADR-0014 — Harden and integrate the Phase 3 art gate before production art

**Status:** accepted
**Date:** 2026-07-30
**Baseline:** `75c661b`

## Context

The first gate package encoded the correct principle—collider truth and
readability are release blockers—but trusted several values supplied by the art
manifest. A wall fragment could declare `collidable: false`; the visual edge and
collider plane could be copied from the same incorrect manifest; incomplete
samples and creature evidence could pass; and an Ubuntu job was shaped like it
could provide iOS evidence.

## Decision

Phase 3A introduces a single pure runtime geometry seam,
`src/sim/gateGeometry.ts`, shared by collision, rendering and evidence
generation. Art manifests no longer contain collider planes. They link to
independent runtime obstacle records carrying the source module, export and
revision.

The gate now has four explicit tiers:

1. `structural` — current procedural geometry, no render claim.
2. `fast` — four deterministic CI Chromium states for pull requests.
3. `full` — all 36 effect combinations in CI Chromium.
4. `signoff` — full real Android and iOS Safari matrices, 30-minute soak and
   performance evidence.

Procedural baseline manifests are valid only for Phase 3A regression. They are
blocked from `full` and `signoff`, so a green primitive build cannot be mistaken
for completed production art.

## Consequences

- A manifest cannot bypass collision checks by changing its own role.
- A wrong runtime collider plane fails even when the art manifest is internally
  consistent.
- Missing evidence is a blocker.
- Fast and full capture coverage are separate configurations rather than one
  knowingly failing workflow.
- CI emulation cannot sign off iOS.
- Production assets remain out of scope until this integration is reviewed.

The current procedural build has one accepted warning: the 31.5-world-unit
decision point falls in LOD1. Production LOD1 playable silhouettes therefore
remain fairness-critical.
