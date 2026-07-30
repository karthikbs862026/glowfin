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

## ADR-0002: Movement & collision model — DECIDED

**Context:** Part 4.2 requires an explicit decision between a full
rigid-body physics engine (e.g. Rapier) and a deterministic spline/lane-based
path system with proximity-based collision.

**Options considered:**
- **Rigid-body physics engine (Rapier).** Creature as a physics body;
  collision/response from the solver.
- **Deterministic spline/lane system.** Creature's lateral position computed
  directly from accumulated steering input (pure math). Collision is an
  interval-overlap test between the creature and authored obstacle gaps at a
  given forward distance. No solver.

**Decision: deterministic spline/lane system. No physics engine.**

**Reasoning, argued against the Core Design Principle (Part 1.3):**

1. **Determinism is a guarantee, not a probability.** Physics solvers use
   iterative contact resolution and float accumulation that can diverge
   subtly across CPU architectures / WASM vs. native, even with a fixed
   timestep. That threatens three separate hard requirements elsewhere in
   this doc: frame-rate-independence testing (6.4), seeded-replay bug repro
   (5.2), and ghost replays (8.2) — all three assume identical input produces
   identical output. Pure math functions give us that as a guarantee; a
   physics engine gives it to us as a likelihood.

2. **Solvability must be provable, not empirical.** Part 2.5 requires every
   generated segment be *provably* passable at spawn momentum. With direct
   math, passability is a closed-form inequality: max lateral distance
   coverable in the time available (steering sensitivity × input × dt,
   accumulated) vs. the actual gap width at the creature's forward speed.
   With a physics engine, "provable" degrades to "tested N times, held up" —
   contact response can vary with approach angle and prior velocity state.

3. **It solves a problem this game doesn't have.** A physics engine earns
   its cost through emergent multi-body behavior (stacking, tumbling,
   momentum transfer). Glowfin has one creature on a single lateral axis
   (Part 2.1) against authored gaps — structurally a 1D interval problem,
   not a rigid-body simulation problem.

4. **Performance budget matters more here than realism.** Full broad/narrow
   phase collision every frame costs iOS Safari heap/frame budget (Part 4.6,
   the binding constraint) for simulation richness the game doesn't use —
   budget better spent on the caustics/trail shaders that are the actual
   visual differentiator (Part 3.2).

**Concrete architecture (so this is implementable, not just a conclusion):**

- Forward progress is a scalar distance `d`, advanced each fixed timestep by
  momentum-derived speed. The creature's lateral offset `x` is bounded to a
  lane half-width and updated by integrating the normalized steering value
  (Part 2.1) through the configured sensitivity/smoothing curve — pure
  function, no solver.
- Obstacles are authored as `(forward_distance, left_boundary, right_boundary)`
  gap definitions in the same coordinate frame.
- Collision check per fixed timestep: is `x ± creature_radius` outside the
  gap's `[left_boundary, right_boundary]` at the obstacle's forward
  distance? A swept version (comparing the frame's start/end forward
  distance against the obstacle's span) prevents tunneling through thin
  obstacles at high momentum — cheap interval math, no CCD configuration.
- This same interval math is what the Part 2.5 solvability checker runs
  directly against every generated segment: closed-form, not simulated.
- Collision recovery (dim/deflate/rebuild, Part 2.4) is hand-authored tweened
  animation, not emergent physics response — more controllable, standard
  practice for mobile game feel, and doesn't reintroduce the determinism
  risk this decision is trying to avoid.

**Consequences:**
- We give up "for free" physics behaviors (glancing bounces, natural tumble)
  in exchange for provable fairness and guaranteed determinism. This is the
  right trade for this game — those emergent behaviors were never the
  point, and hand-authoring collision feedback gives *more* control over it
  anyway.
- No physics engine dependency — smaller bundle, no solver tuning surface
  (restitution, friction, solver iterations) that could silently drift game
  feel over time.
- Movement/collision code is straightforward enough to be fully covered by
  the Part 6.4 test suite (deterministic replay, frame-rate independence,
  collision fairness harness) without needing to account for solver
  non-determinism as a test variable.
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

---

## ADR-0015: Phase 3B Moon-Garden vertical slice

**Context:** The hardened art gate was green, but the playable build still used
primitive creature, gate, skyline and coral geometry.

**Decision:** Implement the first approved Concept-First Art Bible slice as
generated, budgeted and regression-tested Three.js geometry: two-draw skinned
Glowfin; independently truthful LOD wall fragments; instanced broken towers,
forked spires, coral and kelp; sparse god rays; shared local bioluminescence.

**Consequences:** The direction can be judged in the real game before scaling
content breadth. The slice has no binary texture payload and stays deterministic,
but Android and iOS Safari evidence are still required. Full rationale and exact
budgets are in `adr-0015-phase3b-moon-garden-vertical-slice.md`.

## ADR-0016: Phase 3B Art-Bible visual reset

**Decision:** Owner visual review rejected the first PR #7 artifact despite
green technical gates. Keep the collider/LOD/instancing foundation, but rebuild
the visual treatment, separate beauty evidence from stress evidence, and add
composition-level luminance/colour/clipping checks. PR #7 remains draft and
must not be merged on performance/contrast evidence alone.

## ADR-0017: Authored visual sources before production GLBs

**Decision:** Stop treating code-generated towers, coral and paving as final
art. Use the owner-rejected frame and the approved Art Bible to define one
in-camera acceptance target, then place authored seabed, broken-tower and reef
sources into the real renderer as clearly labelled review impostors. They may
guide and validate composition, but Phase 3B still requires optimized GLB
replacements. PR #7 stays draft and unmergeable until owner visual approval.

## ADR-0018: Moon-Garden density, variation and ambient life

**Decision:** Preserve the original deterministic gate positions and openings,
but cycle three collider-safe facade families without adjacent repeats. Pack
four reef families, a layered centre-open skyline and four moving ambient-life
families into bounded atlases; enrich only outside-lane dressing; scale
non-gameplay density by quality tier. PR #7 remains draft until the actual
portrait render passes owner visual review.
