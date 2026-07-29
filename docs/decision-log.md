# Glowfin — Architecture Decision Log

Per Part 5.3. Every significant choice gets a short entry: context, options
considered, decision, consequences. Append new entries at the bottom, don't
edit history — if a decision changes, add a new ADR that supersedes it.

---

## ADR-0001: TypeScript over plain JS

**Context:** Part 4.1 states a strong preference for TypeScript for a
codebase that will grow and be regression-tested.

**Options considered:**
- Plain JS — faster to start, no build-step type checking
- TypeScript — compile-time safety, better refactor confidence, self-documents
  the tunable config schemas from Part 2

**Decision:** TypeScript, strict mode, `noUncheckedIndexedAccess` on.

**Consequences:** Slightly higher setup cost now; expected payoff is fewer
runtime bugs in movement/collision code where the Core Design Principle
(Part 1.3) makes correctness non-negotiable, and safer large-scale refactors
as the mechanics/render/config systems grow.

---

## ADR-0002: Movement & collision model — DEFERRED

**Context:** Part 4.2 requires an explicit decision between a full
rigid-body physics engine (e.g. Rapier) and a deterministic spline/lane-based
path system with proximity-based collision.

**Status:** Not yet decided. This is a Phase 0 exit requirement per Part 9
("ADR for the movement/collision model decision") and must be resolved
before Phase 1 mechanics work starts — it is flagged here rather than
decided silently, per Part 10 ("state assumptions explicitly... never guess
silently").

**Leaning (not yet a decision):** the spline/lane-based deterministic model
reads as the stronger fit against Part 1.3 — a physics-simulated creature
that behaves unpredictably under identical inputs is a direct Core Design
Principle violation, and determinism is required for the replay system
(Part 6.4, Part 8.2) regardless of which model is chosen. This needs to be
argued properly, not just asserted, before Phase 0 closes.

---

## ADR-0003: Bundle size budget — PLACEHOLDER, NOT YET SET

**Context:** Part 4.6 requires performance budgets defined *before* content
production begins. `scripts/check-bundle-size.mjs` currently enforces an
arbitrary 2MB placeholder so the CI gate exists and is exercised from Phase 0,
per Part 6.8 ("budgets that are advisory get ignored").

**Status:** Placeholder only. Real budget (initial load size, draw calls,
triangles, texture memory, particle pool caps, input-latency budget) must be
set with reference-device numbers before Phase 2 content production, and
this ADR should be superseded once that happens.
