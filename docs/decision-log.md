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
- The atlas exposed two evidence bugs rather than missing geometry: an
  eight-element allow-list discarded population classes 8–13, and horizontal
  ordering selected small fin/hair islands before the two full swimmers.
- Size the lookup from the declared maximum class, merge only nearby multipart
  islands, and select the two largest swimmer figures before side ordering.
- The corrected evidence then exposed real residual scene defects at maximum
  FOV: 21–28 px swimmers and two Tidekeeper paths with nearly equal travel.
  Give the swimmers disjoint circular current radii/tempos, separate upper
  water bands, and momentum-aware scale/lateral clearance outside the route.
- Keep both swimmers in separate foreground galleries for the entire motion
  interval. The previous upper path crossed behind masonry at the second
  sample, leaving fin fragments that could be mistaken for a stacked pair.
- Reduce repeated residents to one upright citizen per side; preserve paired
  heralds as the deliberate ceremonial anchors.

## 2026-08-02 — Add momentum-layered audio without touching gameplay

- Owner review accepted the corrected mix of upright residents, anchored
  heralds and asynchronous horizontal swimmers as materially better. Defer
  further horizontal-swimmer facial sculpting to the authored DCC/PBR pass;
  preserve the accepted choreography and lane clearance.
- Adopt ADR-0026. Drive a fixed underwater Web Audio graph from the same
  normalized momentum/light state as the visuals and add distinct near-miss,
  multiplier, collision, recovery and run-end cues.
- Keep all mix values in `config/tuning.json`, cap transient sources, disconnect
  completed cue graphs, and suspend audio while muted/backgrounded.
- Create or resume audio only from a real user gesture. Failure remains an
  audio-only degradation and may not trigger a game startup error.
- Require unit evidence plus a real mobile Chromium gesture/mute/reload gate.
  Android and iOS speaker/headphone/interruption review remains a Phase 3 sign-
  off requirement; CI emulation cannot waive it.

## 2026-08-02 — Replace the ghostly four-second loop with Moon-Current

- Physical-phone review confirmed that version 21 finally plays sound, then
  rejected its sustained sine-tone character as ghostly, unsuitable and too
  short. Treat that creative failure as authoritative even though playback CI
  is green.
- Adopt ADR-0029. Preserve the single native stream and proven touch activation
  path, but replace the content with a 64-second, 32-bar, four-movement original
  D-major underwater-adventure score.
- Use pearl-marimba melody, kalimba arpeggios, hand percussion, bright shakers
  and bubble answers. Remove continuously gliding tonal identity; keep only
  quiet, beat-pulsed D/A momentum support behind the musical track.
- Require structural audio tests to reject a return to the former four-second
  cadence. Real-phone musical quality and balance remain owner acceptance gates;
  automated playback or waveform evidence cannot approve taste.

## 2026-08-02 — Refine horizontal-swimmer faces after soundtrack approval

- Owner approved the version-22 Moon-Current soundtrack and advanced the next
  recorded milestone: issue #9's horizontal-swimmer facial enhancement.
- Adopt ADR-0030. Replace only the current swimmer's generic round head with a
  sculpted oval face, level almond eyes, forward gaze, open hairline, friendly
  smile and nacre ear fins. Preserve residents, heralds and the hero guardian.
- Preserve the accepted two-gallery asynchronous choreography, at least 0.55
  world units of lane clearance, route/collider truth, controls, camera,
  scoring, replay determinism and the approved audio path.
- Require a dedicated labelled face crop, at least an 11 px swimmer facial
  plane, at least a 3 px eye stack, one material, a 2,190-triangle prototype
  and a separate `merfolk-current-swimmer-v2.glb` PBR handoff export.
- Keep owner phone screenshots authoritative; automation may reject regression
  but cannot approve character appeal.

## 2026-08-03 — Attach every gate to a living palace district

- Owner approved version 25's horizontal-swimmer facial structure and asked to
  proceed to the next milestone. Record that human approval in issue #9 while
  retaining its separate real-device screenshot requirement.
- Adopt ADR-0031. Guarantee two prominent architecture layers on both sides of
  the next gate, keyed to its district family, rather than relying on unrelated
  random city bands to compose the gameplay encounter.
- Guarantee one merfolk monument, paired tide-spears and one conch fountain
  around the same encounter. Reuse the existing instanced draw families and
  preserve the hero's outer alcove plus the authoritative gameplay lane.
- Enlarge the bounded fish schools, jellies and rays; add a ray wing beat;
  widen the reef banks while reserving more than the full coral-sway envelope
  outside the lane; and add two travelling bioluminescent reef waves.
- Strengthen the six approved material responses without changing collider
  contours, camera, controls, scoring, replay determinism, approved characters
  or the Moon-Current audio implementation.

## 2026-08-03 — Separate phone-scale visual truth from lifecycle raster cost

- Version 26 passed core CI, touch/audio regression and the complete 390x844
  matrix, but the first renderer soak was cancelled by the job's 45-minute
  ceiling after only 900 of 5,400 frames. Logs and a timed local probe showed
  no resource error: virtually all elapsed time was software fragment shading.
- Optimize the production Moon-Garden shader so stone and fully living
  fragments skip the texture family that contributes zero, and only coral
  evaluates the two travelling-wave functions. Preserve the blended result on
  transition vertices and rerun the complete 390x844 matrix as the visual gate.
- Keep lifecycle truth distinct from phone-scale image truth. Run all 5,400
  high-bloom/caustic WebGL frames, the full deterministic simulation and the
  same heap/GPU/context-loss ceilings at a 128x277 phone-aspect raster. Scene
  graph, shaders, pools, geometry, texture count and simulated duration remain
  unchanged; only fragment fill-rate is reduced to fit the bounded runner.
- Retain cumulative simulation/course/render/metrics timing in soak progress
  logs so a future cancellation can be diagnosed without weakening the gate.
- The corrected local 30-minute gate completed with 0.5 MB heap growth,
  unchanged 103 geometries/18 textures and zero context losses. Require the
  authoritative GitHub rerun to pass before marking issue #10 stable.

## 2026-08-03 — Load the gate and reef production handoff at runtime

- Owner approved version 27's living-district richness and activity, closing
  issue #10 and opening Phase 3C's production-asset transition.
- Adopt ADR-0032. Correct the handoff before integration: export all five gate
  identities and add the missing maze-ridged brain and scalloped table coral.
- Preserve semantic nodes while welding and Meshopt-compressing the two GLBs.
  Require exact post-compression node, attribute and collider-plane validation,
  plus byte-for-byte comparison with the build-staged files. Keep final DCC
  replacements under the repository's LFS policy.
- Load both assets atomically into the existing fixed instance pools. Keep the
  version-27 geometry as a delivery-failure fallback, but make every art/soak
  evidence entry point reject fallback mode.
- Treat this as the runtime production path, not final DCC approval. The next
  art work refines topology, UV/PBR maps and silhouettes behind the now-stable
  asset contract.

## 2026-08-03 — Refine the first five gates as one production world

- Owner screenshots confirmed that Version 28 already contains the planned
  gate, reef, district and population systems, so Version 29 adds no new world
  system or encounter family.
- Adopt ADR-0033. Separate the five districts with family-specific material
  roles and stepped ruin massing, allow one dominant ceremonial canopy, enlarge
  the six reef signatures outside the lane and subordinate the supporting
  merfolk at near-camera depth.
- Preserve the merged runtime GLB contract, exact collider planes, safe route,
  camera, controls, scoring, approved characters and Moon-Current soundtrack.
- Treat the build as an owner-review cohesion candidate. Full DCC sculpt/UV/PBR
  source replacement and Android/iOS release certification remain independent
  gates.
- The first full matrix exposed a `2.9986:1` p10 contrast near-miss in one
  plain/caustic state. Raise only the collider-contour's minimum cyan luminance
  and rerun the exact matrix; do not round the result, widen the collider or
  weaken the `3:1` floor.
- The first reduced capture kept the improved cast staging but measured the
  current-swimmer eyes at `2 px` and two upright facial planes at `7 px`, one
  pixel below their existing floors. Enlarge only those local facial features
  and add source-geometry floor assertions; do not restore oversized bodies,
  move the cast toward the camera or weaken the rendered evidence thresholds.
- The authoritative rerun raised the swimmer eye stack to `4 px`, clearing its
  existing floor, but both most-distant upright faces remained `7 px`. Raise
  only their vertical facial-shell contract to `0.60` world units; keep head
  width/depth, character transforms, choreography and the `8 px` floor fixed.

## 2026-08-03 — Load and refine Glowfin as the production character

- Owner approved and merged Version 29, freezing the first-five-gates world as
  the visual foundation for the character pass.
- Adopt ADR-0034. Export, Meshopt-compress, publish and load `glowfin-v2.glb`
  alongside the existing gate and reef payloads. Require two semantic meshes,
  ten bones, all five named clips and preserved UV/colour/skin attributes after
  compression.
- Keep the existing code geometry only as an atomic delivery-failure fallback;
  make art/render/soak evidence reject fallback mode for Glowfin as it already
  does for gates and reefs.
- Refine the bounded character topology with organic body volume, buried
  appendage transitions, integrated gill crowns, a longer central kelp tail and
  larger forward side-set eyes. Preserve the negative-Z forward axis and the
  approved two-draw shader/material contract.
- Resolve calm, mid, max, collision and recovery motion from deterministic
  simulation values. Preserve course movement, collision radius, controls,
  camera, scoring, replay and soundtrack.

## 2026-08-03 — Correct the Version 30 appendage and eye regression

- Owner Android screenshots showed two separate character failures: the added
  fin shoulder collars and tail peduncle read as fixed colour-changing
  appendages beneath the animated membranes, while both negative-Z eyes were
  completely occluded by the body.
- Remove the separate fin collars and tail peduncle. Keep exactly one skinned
  fin membrane per side and one centered skinned tail paddle, with their roots
  already buried inside the organic body.
- The first corrected remote frame proved that removing the fin/tail layers was
  sufficient for those silhouettes, but the separate purple gill-root collars
  still covered both eyes. Remove those last static collars as well.
- The follow-up owner review rejected the `+0.72R` camera-side depth because it
  physically placed the eyes behind the `+0.56R` gill roots. A later
  `±0.84R / 0.40R / +0.46R` side-shell attempt remained hidden because its
  screen-space footprint sat directly underneath the rear gill leaves. The
  owner reference confirms the approved ordering is the earlier high
  forward-crown placement: centres at `±0.62R / 0.76R / -0.48R`, with each
  `0.22R` shell ending at the first `±0.84R` gill root laterally and remaining
  entirely on the obstacle-facing side of the body. Both shells must clear the
  body and gills in the 390×844 maximum-momentum rear-chase frame.
- The eye shell may remain laterally visible, but iris and pupil shading must be
  locked to Glowfin's local `(0, 0, -1)` obstacle-facing axis. Camera/view-facing
  lens shading is rejected because it makes Glowfin appear to look backward.
- Preserve the negative-Z travel axis, ten-bone rig, two draws, collision
  radius, camera, controls, scoring, route, world and soundtrack. Add source
  and packed-GLB assertions that reject more than one fin component per side or
  more than one tail component.

## 2026-08-03 — Freeze Version 30 and certify Phase 3 as Version 31

- Owner Android review accepted the final eye placement and approved the
  Version 30 merge. Freeze that exact gameplay/art tree as the Phase 3 alpha
  baseline; Version 31 may change release controls and documentation only.
- Adopt ADR-0035. Add a small DOM-only Version/environment/source badge and a
  deterministic `release.json` so a tester can distinguish stale builds without
  adding WebGL cost or changing the approved scene.
- Require the production build, mounted-path check and hosted smoke test to
  agree on Version 31, environment, full source commit, Version 30 baseline and
  art-build identity.
- Clear the ignored `dist` directory before every production build and reject
  duplicate hashed bundles. The Version 31 exact-source rebuild caught a stale
  prior bundle that would otherwise inflate the package and undermine cache
  fingerprinting even though the new HTML referenced only the latest file.
- Repeat the full phone matrix and 5,400-frame soak on `main`, then emit an
  immutable staging artifact. Deploy through the existing owner-only managed
  checkpoint because its credentials may not be copied into GitHub Actions.
- Preserve honest exit language: automated certification can pass, but Phase 3
  remains conditional until both Android real-time thermal/audio/interruption
  rows and one real iPhone Safari row are signed off.

## 2026-08-04 — Add durable progress, consented telemetry and saved-run ghosts

- Owner approved the deployed Version 32 foundation while preserving Version
  31 as the certified gameplay, art, camera, control, collision and audio
  baseline.
- Adopt ADR-0036. Store one checksummed versioned progress envelope in primary
  and backup browser slots, migrate the legacy best score, and recover from a
  corrupt or unavailable primary without blocking play.
- Synchronize the same validated schema through a private same-origin endpoint
  with optimistic revisions. Resolve conflicts by preserving the strongest
  best run and idempotent maximum totals rather than double-counting retries.
- Collect no telemetry until explicit consent. Restrict names and payloads to a
  bounded allowlist that excludes names, email, device fingerprints and touch
  paths, and clear queued events when consent is withdrawn.
- Record fixed-step steering as bounded run-length segments with checksum,
  timestep, tuning-version and summary validation. Start playback only through
  the explicit `Race saved ghost` action on the same seed.
- Run the ghost in an isolated deterministic simulation and render it as a
  translucent presentation-only creature. It has no collision, scoring, audio,
  input or spawning authority.
