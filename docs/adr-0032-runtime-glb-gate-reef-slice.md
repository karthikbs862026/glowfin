# ADR-0032: Runtime GLB gate and reef production slice

**Status:** Implemented for version 28 review on 2026-08-03. Version 27's
owner-approved composition, gameplay, characters and audio remain frozen.

## Context

The Phase 3B renderer used code-native geometry even though the deterministic
handoff exporter already wrote GLBs. The existing handoff also exported only
three gate variants and omitted the accepted brain-coral and table-coral
families. Loading that handoff would therefore have made the build less
distinctive while claiming to advance production art.

Final sculpt/UV/PBR work remains in Phase 3C, but the runtime path must be real
before production assets can replace transition topology one family at a time.

## Decision

1. Export all five gate variants across LOD0-2, including their true family
   canopies, plus all six reef families. Brain coral retains maze ridges and
   table coral retains a scalloped profile.
2. Weld, remove unused UV accessors and apply high-level Meshopt compression
   without joining semantic nodes. Preserve node names, custom shader
   attributes, metadata and the exact collider-adjacent wall planes.
3. Generate `moon-gate-v1.glb` and `reef-kit-v1.glb` during development and
   production builds. They are deterministic derivatives of checked-in
   transition geometry; final hand-authored DCC replacements remain LFS assets.
   Their combined packed budget is 1.25 MB; the accepted version-28 export is
   750,408 bytes and the complete production package is 1.68 MB.
4. Load both files atomically. Clone deduplicated mesh buffers before baking
   Meshopt decode transforms and renaming glTF custom attributes for the
   existing Moon-Garden shader.
5. Install the decoded geometry into the existing fixed InstancedMesh pools.
   Retain the same transforms, materials, LOD selection, lane placement,
   collider-derived cyan contour and deterministic update loops.
6. Keep code-native geometry as a runtime recovery fallback if delivery fails.
   Art-gate and soak entry points reject that fallback, so CI evidence can pass
   only when both production GLBs were actually decoded and installed.
7. Regenerate, compress, stage and compare runtime assets byte-for-byte in CI.
   Missing gate identities, reef families, attributes, collider alignment or
   production-build payloads block the structural job.

## Evidence

- 261 unit/integration tests and 47 adversarial art-gate checks
- 45 gate meshes and 17 reef meshes validated after compression
- complete 36-state 390x844 matrix with zero blockers
- exact version-27 peak retained: 128,857 triangles
- mobile touch/audio activation regression passed
- 5,400-frame soak: 0.5 MB heap growth, unchanged 103 geometries and 18
  textures, 84 peak draws, 141,395 peak triangles and zero context losses

## Consequences

Version 28 proves the production-asset delivery and replacement architecture
without changing the approved image. It does not claim final DCC sculpt
approval. Gate/reef topology and textures may now be refined behind stable
semantic names and automated collider, visual, bundle and lifecycle gates.
