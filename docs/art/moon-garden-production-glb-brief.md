# Moon-Garden production GLB brief

**Status:** Version 29 first-five-gates production-cohesion candidate;
final owner and DCC/PBR production approval remain active
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
  scalloped manta fins, one central teardrop tail, three rounded external gill
  leaves per side and two high lateral eyes visible around the body crown;
- a phone-readable mermaid guardian whose Tidekeeper, Coral Warden and Astral
  Oracle regalia match their districts, plus reef citizens, horizontal current
  swimmers and paired conch heralds;
- distant drowned towers, minnows, jellies and rays with real volume.

## Runtime asset set

| GLB | Required contents | Runtime rule |
| --- | --- | --- |
| `glowfin-v1.glb` | One skinned body primitive, one combined high-lateral eye primitive, 10–18 bones, calm/propulsion/collision/recovery clips | Forward axis is negative Z; side-set eyes remain crown-visible; simulation selects and blends clips; two materials maximum |
| `hero-merfolk-v1.glb`, `hero-merfolk-coral-warden-v1.glb`, `hero-merfolk-astral-oracle-v1.glb` | Shared guardian hierarchy with face, eyes, hair, hands, shell cuirass, pendant, three-joint tail, caudal/side fins and district regalia; hover/swim/turn/patrol/greeting clips | Exactly one gate-side hero visible; never collidable; one material and no more than 17 draws; at the tested phone view require ≥72 px overall, ≥22 px face and ≥4.5 px eyes |
| `moon-gate-v1.glb` | Five asymmetric wall-fragment/canopy identities, mirrored-safe inner pier, broken voussoirs, dark channel and rubble base across LOD0–2 | Inner cyan edge remains a separate collider-derived runtime mesh |
| `ruin-kit-v1.glb` | Broken tower, collapsed arch and forked spire across LOD0–2 | Outside-lane instancing only |
| `reef-kit-v1.glb` | Brain coral, table coral, staghorn, sea fan, anemone and kelp families across approved LODs | Bounds drive lane-safe placement |
| `merfolk-current-swimmer-v2.glb` | Three named meshes sharing one PBR material: horizontal body/hair/tail/ear fins, sculpted face, and level almond-eye stack with turquoise iris, pupil and catchlight | Non-collidable; source-authored horizontally; mirrors only as a complete travel-facing figure; dedicated phone-face crop must remain readable |
| `moon-life-v1.glb` | Minnow, lantern jelly, ribbon ray, garden spirit, reef citizen, current swimmer and conch herald | Deterministic, non-collidable animation; heralds stage in pairs at gate shoulders |
| `drowned-skyline-v1.glb` | Centre-open far-field cluster with seven varied silhouettes | Far-field instancing; never a camera-facing plate |

## Deterministic handoff export

Run `npm run art:build-runtime-glbs` to write the current validated mesh, LOD
and naming baseline to `build/production-glbs/`, then weld, prune and
Meshopt-compress the gate/reef runtime subset into `build/runtime-glbs/`. Run
`npm run art:verify-runtime-glbs` to compare those files byte-for-byte with the
build-staged payloads under `public/art/moon-garden/models/`. The generated
transition package is not committed. PR art-gate runs perform both operations
and upload the raw and runtime packages with SHA-256 manifests.

The gate and reef subset is decoded and installed by the Version 29 runtime,
with the pre-GLB geometry retained only as a delivery-failure fallback. Art
evidence rejects that fallback. These files remain the production handoff
baseline, not final sculpt approval.
The dedicated swimmer-v2 export is the first character-specific face checkpoint:
it preserves separate body, face and eye meshes under one PBR material so a DCC
author can refine topology and UVs without losing semantic-mask evidence.
They preserve the tested hierarchy, budgets, node names and collider metadata
so a DCC author can replace the source forms without reconstructing gameplay
constraints. Final LFS-tracked GLBs still require authored sculpting, UVs,
normal/roughness/emissive maps, optimization and the full device render matrix.

Final authored DCC GLBs remain Git LFS assets. The Version 29 gate/reef
cohesion GLBs are reproducibly generated from checked-in geometry during
development and production builds. Production source files must include scale,
orientation, pivot and export presets so a later revision is reproducible.

## Material set

- Moonstone: 512–1024px base colour, normal, ORM and restrained emissive mask.
- Living reef: one shared atlas with species-separated hues and a local-response
  emissive mask.
- Glowfin: sea-glass body plus eye/gill emissive mask; no white plastic.
- Merfolk cast: one shared shell/skin/hair/tail atlas with bronze, lapis, coral
  and crystal masks; facial features cannot depend on bloom and each guardian
  role must remain identifiable from its regalia silhouette.
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
8. Glowfin's neutral chase-camera silhouette must show its back, two scalloped
   manta fins, centered teardrop tail, six separated rounded gill leaves and two
   high side-set eyes. Missing eyes or an inward camera-facing facial mask both
   block acceptance.
9. The hero Tidekeeper must remain at least 72 portrait pixels tall across the
   complete render matrix, with a face at least 22 px tall and either eye at
   least 4.5 px. She must retain all required character parts and five named
   animation clips. CI blocks a faceless, static or undersized replacement.
10. All three guardian identities and all three population roles are required
    in the production manifest. Removing a current swimmer or conch herald is a
    blocker even when generic ambient-life counts still pass.

## Production order

1. Gate pair and reef kit: these occupy the most screen area and currently set
   the perceived quality ceiling.
2. Glowfin: final sculpt, rig, rear-eye read and five simulation-driven states.
3. Ruin kit and distant skyline: depth hierarchy without repeated silhouettes.
4. Tidekeeper: final sculpt, facial rig, cloth/hair dynamics and five authored
   animation clips, preserving the approved gate-side silhouette and budgets.
5. Ambient creatures: volumetric motion replacing the final atlas dependency.
6. PBR/light polish, texture compression, full render matrix and device soak.

Version 29 keeps the published gate/reef GLBs behind the established semantic,
bounds and collider contract. It adds family-specific massing and material
roles, one dominant ceremonial canopy, six stronger reef signatures and
phone-scale population restraint. Its current topology is not the final DCC
sculpt source.
