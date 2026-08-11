# Version 43-R1 — Realms of the Lost Kingdom

**Build:** Realm Framework & Kelp Cathedral  
**Base:** Version 42-R1 merge `6228c7755f55c63b27ccf8e58fac56291c9beae3`  
**Status:** implementation candidate; physical V43 certification pending

## Playable slice

- Kelp Cathedral is selectable from the Moon Well.
- Deterministic Swaying Frond Windows open on readable cycles.
- Current Tunnels narrow the lateral corridor and reverse drift halfway.
- The collapsing chamber repeats until the baby manta is rescued.
- The optional Relic Current reveals *The Song Beneath the Fronds*, the first
  Kelp Cathedral Relic Page.
- The hub reports rescue count, best rescue time, Relic Page and four-verb
  mastery from a checksummed primary/backup realm save.

## Presentation and budget

The initial renderer was rejected in visual review because its pale Moon Garden
gates, lane inlays and flat blue seabed still dominated the frame. A first
silhouette pass was also rejected because nearly black cylinders, pipe-like
arches and repeated spike barriers made the named landmarks difficult to
recognise. The rebuilt realm now owns a living cathedral silhouette: curved
textured stipes and spreading holdfast roots, genuine three-strand braided
vaults, broad translucent collision-aligned frond curtains, glowing opening
vines, large scalloped shell bells with clappers, recognisable leafy sea
dragons, layered shafts and light pools, dense pulsing spores, directional
current ribbons and a persistent baby-manta rescue beacon.

Moon Garden gates, crescent inlays, scenery, floor, seabed and large tutorial
cue cards are hidden while Kelp Cathedral is active. A realm-owned natural
silt seabed, blue-teal water depth, warmer canopy glow and brighter emerald/gold
lighting replace the inherited Moon Garden presentation.

The replacement remains fixed-capacity: 15 pooled draws, eight dedicated
materials, three generated 512 px WebP albedo maps and 99,486 reserved
triangles. The renderer reports 13.45 MB of active Kelp texture memory and
remains below the realm ceilings of 90 draws, 12 active materials, 48 MB
texture memory and 150,000 triangles.

## Preservation

Version 42 Classic Dive, Daily Tide, tutorial, Chapter One Expedition and Tide
Sprint retain their entry points. Kelp Cathedral never submits a Classic
replay, leaderboard result or Moonflash clip, preventing cross-course ghost and
competition mismatches. Its score also cannot replace the Classic best score;
shared idempotent Pearls, XP, objectives and aggregate run totals still advance.

## Current automated evidence

- strict TypeScript production graph compiles;
- 436/436 tests across 58 files pass;
- nine realm-specific tests cover data validation, mechanical distinction,
  dynamic safe apertures, tunnel reversal/narrowing, deterministic rescue,
  5,400 fixed frames, living-cathedral budgets and durable progress;
- an integration seam prevents Moon Garden gate, floor and inlay regressions
  and requires the braided canopy, shell bells, sea dragons, readable spores,
  rescue manta and three authored material maps;
- the explicit default Moon Garden course equals the legacy implicit course.

V43 Android/iPhone feel, safe-area, lifecycle, thermal and rendered performance
certification remain required before promotion.
