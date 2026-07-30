# Moon-Garden authored review sources

These assets were generated from the approved Concept-First Art Bible during
the owner-requested PR #7 visual reset. They are visible in the playable build
and are budgeted by the art gate, but they are **review impostors**, not final
3D production assets.

| Asset | Runtime role | Production replacement |
| --- | --- | --- |
| `moonstone-seabed.webp` | Organic gravel/silt Moon-Garden floor albedo | Retain as atlas candidate after seam/material review |
| `gate-variation-atlas.png` | Three collider-aligned obstacle facades plus outside-lane ruin variants | Optimized gate/wall GLBs with the same locked inner edges |
| `world-variation-atlas.png` | Layered skyline, four reef families and four ambient-life families | Production atlas plus optimized environment/creature meshes |
| `glowfin-rear.webp` | Rear-camera character review silhouette | Final skinned Glowfin GLB and approved animation set |

All runtime images have a maximum dimension of 1024px, contain no text or
third-party marks, and together add about 0.4 MB compressed / 14 MB decoded
with mip overhead. Source plates live in `docs/art/`; only packed runtime
atlases are copied into the production bundle.

The source prompts required Moon-Garden blue-grey stone, restrained shell-gold,
living cyan/violet/rose reef accents, rounded manta/nautilus forms, and the
approved rear-view axolotl-puffer Glowfin. They explicitly prohibited generic
Atlantis architecture, paved roads, repeated mandalas, cone coral, detached
neon bars, white plastic character materials, text, logos and watermarks.

Obstacle art cycles through three stable variants stored on generated gates.
Reef and ambient-life families use world-band indices so adjacent segments do
not repeat and recycling cannot make an asset pop to another variant.
