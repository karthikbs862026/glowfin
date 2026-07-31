# Glowfin Phase 3A art gate

This gate was established before production art and now validates the Phase 3B
Moon-Garden vertical slice. It enforces the Concept-First Art Bible without
allowing an asset manifest to redefine gameplay truth.

## Evidence boundaries

- `src/sim/gateGeometry.ts` is the authoritative collision/visual geometry
  seam. Collision, production wall rendering and gate evidence all call it.
- Asset manifests contain visual edge samples but **never collider planes**.
- Runtime collider evidence contains planes, envelopes and source revision.
- A family configured as collidable remains collidable even if a manifest says
  `false`.
- Desktop Chromium captures are accepted for PR/full regression only.
- Release sign-off requires separately ingested real Android and iOS Safari
  evidence, a 30-minute soak and performance measurements. Ubuntu CI is not
  represented as iOS hardware.

## Commands

```bash
npm run art-gate:test
npm run art-gate:structural

# With Vite running at http://127.0.0.1:4173 and Playwright Chromium installed:
npm run art-gate:capture:fast
npm run art-gate:run:fast

# With the same host running; advances 30 simulated minutes through real WebGL.
npm run art-gate:soak
```

`structural` validates the generated production meshes, manifests, collider
samples and budgets. `fast` renders the reduced four-state matrix.
`full` renders all 36 state combinations in emulated Chromium. Pull requests
must pass both `full` and the deterministic 30-minute simulated-time renderer
soak. Separate jobs keep capture overhead out of the soak budget. The soak
advances the 120 Hz fixed simulation continuously and samples the real WebGL
renderer at 3 FPS (5,400 rendered frames). This cadence remains just below the
roughly 3.3-FPS throughput that GitHub's SwiftShader runner sustained when a
requested 10-FPS/18,000-frame run was cancelled after reaching only 10 of 30
simulated minutes. The soak
checks JavaScript heap growth, Three.js GPU-resource stability,
pool caps, scene budgets and WebGL context loss while the endless course is
spawned and pruned. It is regression evidence, not elapsed physical-device
time. `signoff`
rejects any remaining `baselineProcedural` manifest and additionally requires
two real-device matrices and performance evidence.

## What is enforced

- independent collider truth, straight playable edges and exact LOD sampling
- configured collidable roles and collision-contour semantics
- complete manifest, runtime and capture evidence
- per-family triangles/materials and required production LODs
- Glowfin bones, textures, screen size, eye size, clips, states and deterministic
  animation driver
- scene calls, triangles, texture memory, active materials, god-ray cap and
  compressed payload
- frame and per-obstacle p10 contrast
- reduced PR, full emulated and real-device sign-off tier separation
- mesh-ribbon trail implementation and width
- release FPS, cold start, input latency, heap, soak growth and pool caps

## Deliberate remaining boundary

The gate validates the source metadata attached to real-device evidence but
cannot cryptographically prove that a JSON file originated on physical
hardware. Device-farm attestation or supervised ingestion remains a human
release responsibility. This limitation is never converted into CI emulation.
