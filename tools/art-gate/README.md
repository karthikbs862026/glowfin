# Glowfin Phase 3A art gate

This gate lands before production art. It enforces the Concept-First Art Bible
without allowing an asset manifest to redefine gameplay truth.

## Evidence boundaries

- `src/sim/gateGeometry.ts` is the authoritative procedural collision/visual
  geometry seam. Collision, primitive rendering and gate evidence all call it.
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
```

`structural` validates the current procedural build and is expected to pass
before production assets exist. `fast` renders the reduced four-state matrix.
`full` renders all 36 state combinations in emulated Chromium. `signoff`
rejects `baselineProcedural` manifests and additionally requires two
real-device matrices and performance evidence.

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
