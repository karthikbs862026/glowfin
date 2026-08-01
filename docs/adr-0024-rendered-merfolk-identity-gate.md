# ADR-0024: Rendered merfolk identity and staging gate

**Status:** Accepted for the corrective Phase 3B checkpoint on 2026-08-01.
This replaces cast-count acceptance from ADR-0023; it does not approve the
code-native characters as final production assets.

## Context

Owner Android screenshots showed that the Tidekeeper, Coral Warden, Astral
Oracle, reef citizens, current swimmers and heralds could all exist in the
scene graph while remaining absent to a player. The active guardian was staged
behind the gate, citizens and swimmers occupied distant world bands, heralds
were hidden by gate shoulders, and lower-detail heads had no facial geometry.
The old gate only checked role names, prototype triangles and one projected
hero bound. Those checks were true while the promised result was visibly false.

## Decision

1. Stage the active guardian in front of the gate and keep her fully inside the
   portrait frame. Stage citizens, horizontal swimmers and a herald pair as one
   composed gate encounter rather than unrelated distant instances.
2. Give every population mesh high-contrast eye whites, pupils, highlights and
   a mouth inside the existing one-material instanced draw.
3. Capture Tidekeeper, Coral Warden and Astral Oracle separately at 390×844.
   Store a labelled three-panel beauty atlas as a CI artifact.
4. Render semantic masks through the real chase camera and city depth buffer,
   then render an isolated baseline. Measure the largest connected visible
   component for guardian body, face, eyes, identity regalia, citizen, swimmer
   and herald roles.
5. Fail render tiers for a missing guardian identity, undersized face/eyes or
   regalia, phone-scale population specks, portrait clipping, or excessive
   architecture occlusion. A role array or object name cannot satisfy these
   checks.
6. Treat owner phone review as authoritative. A green emulated mask proves
   staging and visibility, not semantic beauty or premium character finish.

## Consequences

The cast is presented as an encounter that can be seen and evaluated during
normal play. The additional facial geometry remains within the existing scene
triangle and material caps. PR #7 remains draft until the owner accepts all
three identities on a real phone and authored DCC/PBR characters replace the
code-native handoff meshes.
