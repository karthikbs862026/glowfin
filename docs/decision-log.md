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
non-gameplay density by quality tier. The first Chromium pass exposed a
medium-tier bloom wash and an upper-water void, so the skyline was moved inside
the fog transition, moon shafts/haze were restored, facades were made more
monumental only outside the fixed gap, and the cyan contour was moved below the
bloom threshold. Browser shader/WebGL errors now fail capture. PR #7 remains
draft until the actual portrait render passes owner visual review.

## ADR-0019: Volumetric Moon-Garden integration

**Decision:** Retire the runtime gate, tower and reef billboard treatment.
Render collider-locked gate walls, foundations, near/mid architecture and four
reef families as instanced volumetric meshes with one coherent Moon-Garden
material. Keep billboard art only for distant skyline/ambient life and the
temporary Glowfin review silhouette. Mesh bounds, rather than image-card
centres, now enforce outside-lane placement. PR #7 remains draft until its real
Chromium portrait is visually accepted.

**Rendered correction:** The first volumetric browser frame was rejected for
oversized foreground ruins, bleached stone, hidden contour evidence and
toy-like rod/ring coral. The follow-up replaces reused obstacle scenery with a
dedicated collapsed-block arch, moves architecture into a bounded mid-depth
band, creates three distinct wall crowns, remodels reef as rounded forked
branches/anemones on shared rubble, and places the restrained blue seam just
camera-forward of its inset stone channel. Collider planes and openings remain
unchanged.

**Material/relief correction:** Later browser frames proved that volume with
broad procedural colour still read as slabs. Add one 512px hand-painted
moonstone surface through triplanar mapping, break the perfect crescent into
embedded mineral fragments, raise irregular masonry courses on the wall face,
and reduce floor/caustic competition behind the collider-true cyan core.
## 2026-07-31 — Start the Moon-Garden production-asset transition

- Owner evidence: the latest volumetric frame still made individual objects
  difficult to identify and did not meet the animated-film target.
- Decision: stop treating added procedural detail as final art. Retire every
  runtime character, skyline and ambient-life card; make each reef species and
  ruin family identifiable by silhouette; expose the real skinned Glowfin; and
  use the result as the locked integration contract for authored GLBs.
- Safety: the deterministic 12-unit lane, generated gate positions, collider
  planes, contour width and solvability remain unchanged.
- Release status: Draft PR #7 remains unmergeable until the GLB/PBR replacement,
  browser matrix and Android/iOS sign-off meet the Concept-First Art Bible.

## 2026-07-31 — Separate production materials by physical family

- Browser evidence showed that one moonstone surface and one broad procedural
  shader still made Glowfin, living reef and ruins feel assembled from the
  same pale material.
- Decision: retain moonstone only for masonry; add independent 512px
  hand-painted sea-glass skin and living-reef tissue sources, each sampled on
  real 3D volume. Geometry-authored species pigments and Glowfin state colour
  remain authoritative; textures supply only pores, mottling and restrained
  emissive-vein breakup.
- Composition correction: background ruins begin at least 68 units ahead,
  stay below the hero gate, and ambient swimmers retreat from cropped portrait
  margins. The collider-derived cyan seam renders above contextual depth so
  decorative masonry cannot erase fairness evidence in one bloom state.
- Cost: the two sources add about 0.10 MB compressed and 2 MB decoded while the
  production bundle remains under 0.8 MB.

## 2026-07-31 — Join the gate visually without changing its collider

- The latest Chromium portrait still read the hero obstacle as two pointed
  pylons and the connected tail as a dorsal antenna.
- Decision: add a non-colliding broken masonry canopy behind the authoritative
  wall seams, export it with the Moon-Gate GLB, and remodel Glowfin's tail along
  the swim axis as a peduncle plus two caudal lobes.
- Composition: tighten/lower the chase camera and enlarge the existing eye
  geometry so the character, obstacle and reef occupy the decision frame.
- Safety: no generated gate position, lateral opening, collision plane,
  contour width, movement value or contrast threshold changes.

## 2026-07-31 — Restore Glowfin's rear-chase orientation and cute silhouette

- Owner review rejected the camera-facing character and the accumulated dorsal
  and forked-tail geometry.
- Decision: lock the face and eyes to the negative-Z obstacle-facing side.
  From the positive-Z chase camera Glowfin must read as one round body, two soft
  manta fins, one tapered central tail and six small lavender gills.
- Replace eye-hue visibility as a chase-camera requirement with body/fin colour,
  rim response, trail, bank and the existing minimal HUD.
- Pull the camera back from the over-tight portrait crop and reject any future
  render that visually reads as front-facing even if its transform is correct.
- Full rationale and regression rules are in
  `adr-0020-rear-chase-glowfin-orientation.md`.

## 2026-07-31 — Restore the approved cute silhouette after orientation fix

- The first rear-facing browser frame correctly hid Glowfin's eyes, but exposed
  a second regression: both manta fins and the central tail had been rotated
  edge-on, while the lavender gills were hidden on the obstacle-facing surface.
- Decision: keep the eyes and face on negative Z, but return the non-facial gill
  crown to the rear/lateral surface and present the fins and tail broadside to
  the chase camera.
- Remove detached gate voussoirs from both the wall shoulders and overhead
  canopy. Use continuous seated stone ribbons with a restrained shell-metal
  inset so the gate reads as one ruin at reaction distance.
- Seat the canopy origin at 0.8 wall heights so its outer arc lands on the
  collider-true inner pier crown instead of hanging in the flight opening.
- Bow the near sea-fan surface and cut a real opening through it; this keeps its
  broad species silhouette without presenting one opaque magenta card.
- Triangle ceilings, collision planes, opening positions and contrast
  thresholds remain unchanged.

## 2026-07-31 — Replace visible assembly seams with load-bearing forms

- Owner review rejected the remaining capsule gills, plate-like fins, separate
  paddle/connector tail and visually unsupported hero arch as below the
  production target.
- Decision: keep the approved rear-chase proportions and negative-Z face, but
  replace the appendages with broad bowed membranes, buried transitional
  shoulders, one body-occluded teardrop tail root and six rounded external-gill
  petals. Gill micro-fronds remain forbidden.
- Rebuild the overhead gate as one continuous carved stone body with explicit
  springers, overlapping capitals and a recessed shell band. All support
  geometry remains outside the authoritative lateral opening.
- Replace near/middle sea-fan cards with an open volumetric branch lattice and
  broaden each gate foundation into an eroded plinth so reef and architecture
  visibly grow from the seabed.
- The new inventory remains inside the unchanged limits: Glowfin
  6,940/3,318 triangles, shell garden 954/448/81 and gate foundation
  336/156/132; two character draw calls, ten bones, two materials, and
  unchanged gate colliders.
