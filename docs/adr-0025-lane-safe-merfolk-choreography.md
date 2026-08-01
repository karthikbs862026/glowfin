# ADR-0025: Friendly faces and lane-safe merfolk choreography

**Status:** Accepted for the corrective Phase 3B checkpoint on 2026-08-01.
This supersedes the population pose/motion details in ADR-0023 and extends the
rendered evidence in ADR-0024. It does not approve the code-native cast as final
production character art.

## Context

Owner Android screenshots showed a disturbing result despite the rendered role
gate passing. The population reused one upright mannequin mesh for all roles.
The swimmer transform rotated that entire mesh around screen Z, turning its eye
line vertical, and staged two nearly synchronized copies in one upper gallery.
At gameplay speed the pair appeared frozen one above the other. Grey faces,
ring-like hair and repeated poses made the remaining residents feel faceless or
uncanny. A single-frame silhouette check could prove that bodies existed while
missing all of these defects.

## Decision

1. Author current swimmers as a horizontal geometry from the start: a level
   friendly face, swept arms, streaming hair, tapered tail and split caudal fin.
   Never rotate an upright resident into a swim pose.
2. Build population heads from a warm nacre facial plane, high hairline, two
   separated eye-white/iris/highlight stacks, lifted brows, a small nose, a
   curved smile and soft cheeks.
   Batch body, face and eyes as three synchronized instanced draws so the real
   depth-buffer capture can measure each feature independently.
3. Keep reef citizens and conch heralds vertical and spatially anchored with
   only subtle asynchronous idle drift. Keep one citizen per side rather than
   repeating a stacked row. Place the two swimmers on opposite foreground
   galleries, different height/depth bands and disjoint speed ranges.
4. Derive phases, speeds and path amplitudes from the active gate anchor and
   simulation time. The result looks randomized but remains deterministic for
   replay, CI and debugging.
5. Sample every choreography path across both guardian sides and reject any
   pose whose authored bounds approach the gameplay lane closer than 0.55 world
   units.
6. Emit semantic feature IDs through a raw shader that bypasses beauty-render
   colour management. This prevents face and eye IDs from collapsing into the
   nearest body colour before pixel classification.
7. Extend phone evidence from one frame to a 3.25-second time-lapse. Reject
   unreadable population faces/eyes, horizontal residents, non-horizontal
   swimmers, fewer than two visible role instances, swimmer centre separation
   below 96 px, more than 8% swimmer-box overlap, travel below 6 px, matched
   swimmer travel, or upright-herald drift above 4 px.
8. Keep owner phone review authoritative. These measurements prevent a false
   green result; they do not certify taste, beauty or final DCC quality.

## Consequences

The cast now reads as a composed city population: vertical residents and
ceremonial anchors contrast with true moving swimmers. The population increases
from three merged instanced draws to nine split instanced draws so faces and
eyes remain measurable, while staying within the existing scene and bundle
budgets. Citizen, swimmer and herald prototypes measure 1,836, 1,896 and 2,188
triangles. Gameplay course generation, collider truth and swipe route are
unchanged.
