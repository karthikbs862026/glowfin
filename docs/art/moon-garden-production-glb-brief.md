# Moon-Garden production GLB brief

**Status:** active production transition on Draft PR #7  
**Visual authority:** Glowfin Phase 3 Concept-First Art Bible v1  
**Gameplay authority:** `src/sim/gateGeometry.ts`

## Non-negotiable result

The playable portrait frame must read as one authored animated-film world, not
as primitives or cards arranged on a floor. At reaction distance, an unbriefed
viewer must identify the following by silhouette and value grouping alone:

- a broken ancient moon-gate;
- masonry, recesses and rubble belonging to the same ruin;
- branching staghorn coral;
- a broad sea fan;
- a soft anemone garden;
- ribbon kelp;
- a cute round axolotl-puffer Glowfin, facing the obstacle corridor, with broad
  manta fins, one central tail and no camera-facing eyes;
- distant drowned towers, minnows, jellies and rays with real volume.

## Runtime asset set

| GLB | Required contents | Runtime rule |
| --- | --- | --- |
| `glowfin-v1.glb` | One skinned body primitive, one forward-facing eye primitive, 10–18 bones, calm/propulsion/collision/recovery clips | Forward axis is negative Z; simulation selects and blends clips; two materials maximum |
| `moon-gate-v1.glb` | Three asymmetric wall-fragment variants, mirrored-safe inner pier, broken voussoirs, dark channel and rubble base across LOD0–2 | Inner cyan edge remains a separate collider-derived runtime mesh |
| `ruin-kit-v1.glb` | Broken tower, collapsed arch and forked spire across LOD0–2 | Outside-lane instancing only |
| `reef-kit-v1.glb` | Staghorn, sea fan, anemone and kelp families across approved LODs | Bounds drive lane-safe placement |
| `moon-life-v1.glb` | Minnow, lantern jelly, ribbon ray and garden spirit | Deterministic, non-collidable animation |
| `drowned-skyline-v1.glb` | Centre-open far-field cluster with seven varied silhouettes | Far-field instancing; never a camera-facing plate |

## Deterministic handoff export

Run `npm run art:export-glbs` to write the current validated mesh, skeleton,
animation, LOD and naming baseline to `build/production-glbs/`. PR art-gate
runs upload that directory as the `moon-garden-production-glb-handoff`
artifact, including a SHA-256 manifest.

These files are the production handoff baseline, not final sculpt approval.
They preserve the tested hierarchy, budgets, node names and collider metadata
so a DCC author can replace the source forms without reconstructing gameplay
constraints. Final LFS-tracked GLBs still require authored sculpting, UVs,
normal/roughness/emissive maps, optimization and the full device render matrix.

Binary GLBs remain Git LFS assets. Production source files must include scale,
orientation, pivot and export presets so a later revision is reproducible.

## Material set

- Moonstone: 512–1024px base colour, normal, ORM and restrained emissive mask.
- Living reef: one shared atlas with species-separated hues and a local-response
  emissive mask.
- Glowfin: sea-glass body plus eye/gill emissive mask; no white plastic.
- All maps use baked AO and roughness breakup. World lighting supplies form;
  emissive colour may support silhouette but cannot replace light and shadow.

## Lighting target

- ACES filmic output in sRGB.
- Cool moon key with visible face-to-face separation.
- Dark cyan hemispheric fill, weaker than the key.
- Restrained moving caustics that never erase masonry joints.
- Local Glowfin/reef response confined to a short radius.
- Contact darkening at every ruin/reef foundation.
- Bloom applied only above a controlled emissive threshold.

## Acceptance gates

1. Collider alignment remains within 0.05 world units at every LOD.
2. Obstacle p10 contrast remains at least 3:1 in all four browser states.
3. Typical/hard draw-call limits remain 78/90 with 12 calls headroom.
4. Hard limits remain 150k triangles and 48 MB decoded textures.
5. No runtime `PlaneGeometry` or atlas card may represent Glowfin, a ruin,
   coral, skyline landmark or ambient creature.
6. The evidence frame is rejected if any named family cannot be identified at
   gameplay scale, even when numerical checks pass.
7. Merge remains blocked until Chromium plus Android and iOS portrait evidence
   pass visual review and the 30-minute soak.
8. Glowfin's neutral chase-camera silhouette must show its back, manta fins and
   central tail; visible eyes or a face-like rear arrangement block acceptance.

## Production order

1. Gate pair and reef kit: these occupy the most screen area and currently set
   the perceived quality ceiling.
2. Glowfin: final sculpt, rig, rear-eye read and five simulation-driven states.
3. Ruin kit and distant skyline: depth hierarchy without repeated silhouettes.
4. Ambient creatures: volumetric motion replacing the final atlas dependency.
5. PBR/light polish, texture compression, full render matrix and device soak.

The code-native production-transition meshes on PR #7 are the measurable
silhouette/layout contract for these GLBs. They are not the final sculpt source.
