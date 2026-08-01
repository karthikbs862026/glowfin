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
- The final curved-membrane inventory remains inside the unchanged limits:
  Glowfin 7,524/3,574 triangles, shell garden 954/448/81 and gate foundation
  336/156/132; two character draw calls, ten bones, two materials, and
  unchanged gate colliders.
- Browser review of the first supported-arch pass still found horn-like gill
  tips, plate-flat membranes, a protruding chimney keystone and repeated
  shader-projected brick grids. Expose each three-petal gill fan by tilting it
  toward the chase view while keeping every pivot inside the body; replace flat
  extrusions with closed, subdivided curved membranes; remove the keystone;
  lower the canopy into its springers; quiet projected joints; and strengthen
  upper-side schools, jellies and rays without filling the upper-centre lane.
- The next browser frame exposed two remaining review problems: three gill
  petals were present per side but still overlapped like a striped horn, and
  the wall's surviving course grid remained the dominant architectural read.
  Move the buried gill roots laterally apart, add one broad carved manta
  buttress and nautilus inset to each collider-safe wall half, and capture the
  fixed canvas directly so full-page viewport resizing cannot falsify the
  character crop. Wall inventory remains inside its unchanged ceilings at
  1,362/780/168 triangles.

## 2026-07-31 — Reject folded gills, slab banks and stick-lattice reef

- The fixed-canvas Chromium portrait proved the camera crop and seated canopy,
  but still failed production review: each three-leaf gill fan collapsed into
  one folded pink wedge, the tail appeared pinned under the body, the gate
  halves remained broad triangular slabs, and foreground sea fans read as
  disconnected tubes.
- Decision: give every external-gill stalk three large feather lobes and fan
  the three roots vertically with visible negative space; preserve the
  obstacle-facing face while blending each root from body cyan into lavender.
- Replace the tail shoulder with a tapered caudal peduncle buried diagonally
  inside the rear mantle. Blend fin and tail pigmentation from body cyan to
  membrane cyan so their attachment reads as continuous tissue.
- Reshape each wall half into a tall inner pier plus low collapsed outer bank,
  embed the shell relief in a deep curved buttress, and layer irregular
  voussoirs onto one uninterrupted structural arch core.
- Replace the sea-fan stick lattice with a closed, bowed and bevelled tissue
  membrane containing large real openings.
- The first browser portrait confirmed six separate gill stalks and a seated
  deep arch, but the sharp leaflet silhouette read like tiny fir trees and a
  surviving diagonal wall shoulder still made the gate feel like a pointed
  stage set. Round each stalk into two soft paired lobes, replace the wall
  crown with explicit stepped pier/bank levels and remove the diagonal
  shoulder entirely.
- The final corrected inventories stay inside the existing budgets: Glowfin
  7,984/3,718, wall 1,134/718/168 and shell garden 892/396/81 triangles.
  Collider planes, opening positions, two character draws and ten-bone rig
  remain unchanged.

## 2026-07-31 — Restore the supplied Glowfin reference exactly

- Owner review identified the current no-eye Glowfin as another unacceptable
  regression and supplied the earlier correct crop as the sole character
  authority.
- The correct neutral read is one round cyan body, two broad scalloped manta
  fins, one centered teardrop tail, three simple rounded lavender gill leaves
  per side and two high dark lateral eyes peeking around the crown.
- Revert the experimental feathered gills, closed membrane fins and tapered
  peduncle. Restore the proven reference geometry and the earlier eye
  coordinates instead of approximating the screenshot again.
- Keep the negative-Z swim axis, obstacle-facing travel, chase camera, rig
  names, two-draw material contract and gameplay/collision values unchanged.
- Regression tests now reject hidden eyes, inward camera-facing eye placement,
  non-reference gill spacing and appendage layout drift.
- The restored reference mesh measures 7,508/3,564 triangles across its two
  LODs, with the same ten bones, two materials and two draw calls.

## 2026-07-31 — Make forward-facing eyes readable during gameplay

- Owner review accepted Glowfin's body, gills, fins, tail, glow and obstacle-
  facing eye direction, but rejected the `0.10`-radius eyes because they were
  nearly invisible without zooming.
- Enlarge only the existing eye lenses to `0.18` radius and flatten their Z
  depth so the complete geometry remains ahead of the gill roots on the
  negative-Z front crown. The chase camera may see a crown-side cap, never a
  rear-facing facial mask.
- Replace direct raw-momentum hue updates with one smoothed eye-energy signal:
  60% momentum, 40% normalized forward speed and a 0.12-second half-life.
- Use distinct ocean-blue, cyan, violet and rose-violet colour stops so low,
  cruise, fast and maximum states remain visibly different at portrait scale.
- Raise the art-gate eye-readability evidence from five pixels to a required
  8–12 pixels. Body, gills, fins, tail, rig, camera, collision and world values
  remain unchanged.

## 2026-07-31 — Require the full render matrix and deterministic renderer soak

- Require the complete 36-state low/mid/max × bloom × caustics × quality
  Chromium matrix on every pull request; reject both missing and unapproved
  extra states.
- Add a 30-minute simulated-time soak that advances the 120 Hz fixed-step
  simulation continuously and samples the real Three.js/WebGL renderer at 3
  rendered frames per simulated second (5,400 WebGL frames). Rejected designs
  rendered 54,000 frames at 30 FPS locally, then requested 18,000 frames at 10
  FPS in CI; the latter reached only 10 of 30 simulated minutes before the
  combined job's 40-minute ceiling because GitHub SwiftShader sustained about
  3.3 FPS. Run the full matrix and soak as separate jobs, and keep the cadence
  within the measured renderer throughput instead of relaxing the 30-minute
  duration. The course continuously spawns and prunes while the trail resets
  at deterministic five-minute boundaries.
- Garbage-collect after warm-up and at completion so heap growth compares two
  steady-state measurements. Also block on context loss, GPU resource growth,
  pool-cap overruns, draw-call overruns and triangle overruns.
- Keep the evidence boundary explicit: desktop simulated-time soak is a CI
  regression gate. It does not replace the required real-time Android and iOS
  Safari 30-minute soak or device performance sign-off.

## 2026-08-01 — Integrate five premium districts, ecology and inhabitants

- Owner Android evidence rejected the repeated arches, rod-like relief,
  faceted purple coral, disconnected scenery and absent merfolk/props.
- Adopt ADR-0021's five district silhouettes, six physical material roles,
  six reef species, grounded palace/observatory sets, moonfolk guardians and
  three ceremonial prop families without changing gameplay or collider truth.
- Make every named world family a structural art-gate requirement. A build
  missing a gate district, brain/table coral, moonfolk, prop or material role
  fails even when its frame budgets and contrast pass.
- Lower bloom, exposure and god-ray energy; cap portrait clipped highlights at
  1.2%. Keep PR #7 draft pending authored GLB/PBR replacement, owner visual
  approval and Android/iOS Safari sign-off.

## 2026-08-01 — Make one hero mermaid readable before scaling the cast

- Adopt ADR-0022 and replace the old guardian role with one articulated
  Tidekeeper staged in a reef-cleared alcove beside the next gate.
- Require face, eyes, hair, hands, shell/lapis regalia, a three-joint tail,
  broad fins, spear and independent hover/swim/turn/patrol/greeting motion.
- Retain the smaller moonfolk silhouettes only as background citizens; they
  cannot satisfy the hero-merfolk asset signature.
- Fail the full portrait matrix if the Tidekeeper drops below 72 px. The
  accepted draft checkpoint measures 74.17–97.10 px while preserving all
  existing frame, texture, contrast, clipping and collider limits.
- Export `hero-merfolk-v1.glb` as a hierarchy/animation handoff baseline, not
  final DCC approval. Keep PR #7 draft pending owner and real-device review.

## 2026-08-01 — Separate the Tidekeeper face from the Nacre Palace gatehouse

- Owner phone evidence showed that whole-character height was an insufficient
  proxy: hair, crown and eyes merged into one small dark patch even though the
  Tidekeeper cleared the 72 px body-height gate.
- Raise and simplify the hairline, enlarge the warm sclera/lapis iris/crystal
  pupils, add broad brows, use intentionally mobile-game head proportions and
  stage the guardian in a deeper outer alcove so she remains fully framed as
  the player approaches the gate.
- Add independent 390×844 minimums of 22 px for the face and 4.5 px for either
  eye. Structural and rendered evidence must both carry these measurements.
- Identify the object behind her correctly as the Nacre Palace gatehouse, not
  a separate city building. Replace its oversized hemisphere, diamond cap and
  square block pier with a low shell court, three lantern domes, curved wall
  shoulders and rounded nacre column drums.
- Preserve the exact collider-facing wall plane, gate opening, non-collidable
  guardian role and one-material/16-draw character envelope.

## 2026-08-01 — Scale the approved Tidekeeper into an inhabited merfolk city

- Adopt ADR-0023 after owner approval of the revised Tidekeeper face and Nacre
  Palace gatehouse.
- Map the five districts to Tidekeeper, Coral Warden and Astral Oracle regalia
  while keeping exactly one articulated hero visible.
- Add reef citizens, horizontal current swimmers and paired conch heralds as
  deterministic instanced roles outside the gameplay corridor.
- Raise the guardian envelope to 17 draws only for one swappable district-
  regalia mesh, and require every cast role in the structural art gate.
- Keep PR #7 draft pending owner review of this population pass, authored
  DCC/PBR replacement and real Android/iOS sign-off.

## 2026-08-01 — Replace merfolk presence checks with rendered identity proof

- Owner Android screenshots invalidated the previous green result: most roles
  were distant faceless silhouettes, and declared identities were not visibly
  distinguishable.
- Adopt ADR-0024. Move the guardian in front of the gate, compose citizens,
  current swimmers and heralds around that encounter, and add high-contrast
  facial geometry to every population mesh.
- Capture a labelled Tidekeeper / Coral Warden / Astral Oracle portrait atlas.
  Measure semantic pixel masks through the real scene depth buffer against an
  isolated baseline, including role size, face, eyes, identity regalia,
  clipping and occlusion.
- Make the owner's phone review authoritative over automated evidence. CI may
  prove that a role is visible; it may not call code-native art premium or
  semantically approved.

## 2026-08-01 — Replace rotated mannequins with lane-safe merfolk choreography

- Owner Android screenshots rejected the static horizontal swimmer stack and
  the grey, mask-like population faces even after rendered role visibility
  passed.
- Adopt ADR-0025. Keep citizens and conch heralds upright and anchored; author
  a genuine horizontal swimmer whose face/eyes remain level instead of
  rotating the upright mesh by 90 degrees.
- Place the two swimmers on opposite galleries with different height, depth,
  speed, phase and amplitude. Seed every variation from the active gate and
  simulation time so replay remains deterministic.
- Split instanced population body, face and eyes into independently measurable
  draws. Require warm faces, separated eyes, correct vertical/horizontal pose,
  two visible instances per role and a 3.25-second motion sample.
- Reject swimmer stacking, overlap, frozen/synchronized motion, upright-role
  drift or any choreography sample entering the gameplay route. Owner phone
  review remains the final visual authority.

## 2026-08-01 — Make merfolk evidence diagnosable and depth-stable

- The first clean-room capture correctly blocked the checkpoint. Beauty frames
  contained the new faces, but colour-managed semantic shades were classified
  as their nearest body primaries, producing zero measurable face/eye pixels.
- Render semantic IDs with flat double-sided materials, cover all 13 classes
  with a round-trip regression test, and upload a labelled semantic-mask atlas
  beside each clean-room beauty atlas.
- Keep both swimmers in separate foreground galleries for the entire motion
  interval. The previous upper path crossed behind masonry at the second
  sample, leaving fin fragments that could be mistaken for a stacked pair.
- Reduce repeated residents to one upright citizen per side; preserve paired
  heralds as the deliberate ceremonial anchors.
