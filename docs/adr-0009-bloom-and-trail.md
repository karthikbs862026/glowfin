# ADR-0009: Bloom and the trail ribbon

## Bloom was missing, and that was a misreading

Part 3.2 lists five shader priorities and bloom is not among them, so it was not
built. But Part 3.4 requires validating contrast "with all effects enabled
(bloom, trail, caustics active)" and Part 6.5 refers to "trail/bloom at full
intensity". Bloom is assumed present throughout; it simply is not enumerated.

The consequence on device was that caustics landed correctly and the scene still
looked flat. Emissive surfaces without a glow response are just coloured shapes —
"bioluminescent" is a lighting behaviour, not a palette.

Implemented via `EffectComposer` + `UnrealBloomPass`, never at full resolution.
Full-res bloom costs several milliseconds of a 33ms mid-range budget for an
effect essentially indistinguishable from half-res. It is also the **first thing
dropped** as quality falls — it is the most expensive item in the frame, so a
low tier that kept it would not be a recovery path at all.

## Trail ribbon: horizontal, not billboarded

Billboarding is the usual choice for a trail, and it is wrong here. The camera
sits almost directly behind the creature, so the trail runs nearly parallel to
the view direction and the cross product used to orient a billboard collapses
toward zero — the ribbon would flicker or vanish exactly when it matters most.

A horizontal ribbon reads cleanly from an elevated chase camera and has no
degenerate case. It also reads as a wake through water, which suits the setting.

Mesh-based, explicitly not particles (Part 3.3). One geometry, one draw call,
fixed vertex count, no allocation after construction. Width and brightness both
scale with momentum, which is the mechanism behind Part 1.2's promise that
playing well makes the game visibly more beautiful rather than merely harder.

Additive blending, `depthWrite: false` — the ribbon can only add light, never
darken an obstacle behind it, keeping it clear of the Part 3.4 contrast floor by
construction rather than by tuning.

## Palette range

The scene was a single blue hue; Part 3.4 asks for cyan/teal/purple/magenta.
Obstacle caustics now drift cyan toward magenta with momentum, which supplies
the range and ties world colour to the same value driving speed, trail and
creature hue (Part 2.2).

## Still outstanding

- **The Part 3.4 contrast assertion is still not automated.** Additive-only
  blending is an argument that contrast cannot regress, not a measurement that
  it has not. Lands with the visual regression harness.
- **God-rays, rim/fresnel lighting, and environmental bioluminescence response**
  (Part 3.2 priorities 3-5) are Phase 3.
- **No background silhouettes.** Part 1.2's "drowned, moonlit city" is currently
  an empty void above the lane. That is environment art, Phase 3.
