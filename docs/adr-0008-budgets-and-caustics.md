# ADR-0008: Performance budgets, quality scaling, and caustics

## Budgets are provisional and labelled as such

Part 4.6 requires budgets before content production. `config/budgets.json` now
defines all eight. They are derived from spec plus measured headroom on the
hardware available, with a safety factor — **not** from validation on the device
the floor is actually written against.

Superseding ADR-0003, which flagged the placeholder bundle number. The bundle
budget is now real; the runtime ones are provisional until measured on a mid-range
device under load.

## Phase 2 cannot be signed off, and this is why

Its exit criterion is "budgets green on mid-range Android **and iOS Safari**".
No iOS device is available. Part 4.7 is explicit that desktop emulation does not
substitute and must not be used to sign off a phase, so this is recorded as
unmet rather than quietly reinterpreted. See `docs/device-matrix.md`.

Android mid-range (OPPO Reno3 Pro) can be validated and should be.

## Dynamic quality scaling

Part 4.6 requires "defined behavior when the floor is missed". Three tiers
(high / medium / low) adjusting pixel ratio and caustic octave count.

Three decisions worth recording:

- **Median frame time, not mean.** A single GC pause or scheduler hiccup should
  not cost the player their visuals. What matters is whether the *typical* frame
  misses budget.
- **Upgrading demands a longer clean streak than downgrading demands a bad one**
  (6 windows vs 2), plus a 4s cooldown. Recovering as eagerly as it degrades
  just walks straight back into the overrun that caused the downgrade. There is
  a test that holds frame time right at the budget edge and asserts at most two
  tier changes over 60 windows — visible flapping mid-run is worse than simply
  running at the lower tier.
- **Frame time is measured in wall clock, not simulated time.** Slow-mo makes
  the simulation advance more slowly but costs the GPU exactly the same. Using
  simulated time would have hidden GPU cost during every single near-miss —
  precisely the moments with the most on screen.

## Caustics

Procedural rather than a scrolling texture: no texture memory, no atlasing, no
seams, and the pattern never visibly repeats across a run.

- **Octave count is a `#define`, not a uniform loop bound.** WebGL1 GLSL requires
  constant loop bounds, and a dynamic bound costs more than it saves even on
  WebGL2. Quality changes recompile the material, which is affordable because
  the cooldown throttles them to seconds apart.
- **Computed in world XZ**, so the pattern stays anchored to the world as the
  player moves through it rather than swimming along with the geometry.
- **Fog applied manually**, driven directly from the readability config, so it
  can never creep in front of an obstacle the player is meant to be reading.

### Contrast safety (Part 3.4)

The caustic term is **additive over a base colour chosen to sit well clear of the
background**. Additive can only brighten an obstacle, never darken it, so no
lighting state can push a silhouette below the contrast floor. A multiplicative
or shadowing term could, which is why it is not one.

This is an argument, not a measurement. The automated contrast assertion from
Part 3.4/6.5 is still outstanding and lands with the visual regression harness.

## Debug overlay ships disabled

Gated on `import.meta.env.DEV`, which Vite replaces with a literal so the class
is tree-shaken out of production. Part 6.10 calls a shipped debug menu "a real
incident" and requires an automated check, so `scripts/check-no-debug.mjs` scans
the built bundle for overlay markers and fails the build if any survive.
