# Moon-Garden authored review sources

These assets were generated from the approved Concept-First Art Bible during
the owner-requested PR #7 visual reset. The near/mid gate, architecture and
reef cards have now been retired in favour of volumetric meshes. The remaining
runtime images are budgeted review sources, not final substitutes for the
rigged Glowfin and optimized production texture pipeline.

| Asset | Runtime role | Production replacement |
| --- | --- | --- |
| `moonstone-seabed.webp` | Organic gravel/silt Moon-Garden floor albedo | Retain as atlas candidate after seam/material review |
| `moonstone-surface.webp` | Triplanar hand-painted weathering on real ruin and reef volumes | Retain after final authored GLB/material bake |
| `world-variation-atlas.png` | Distant centre-open skyline and four tiny ambient-life families | Production skyline/ambient-life atlas |
| `glowfin-rear.webp` | Rear-camera character review silhouette | Final skinned Glowfin GLB and approved animation set |

All runtime images have a maximum dimension of 1024px, contain no text or
third-party marks, and together add about 0.25 MB compressed / 9.4 MB decoded
with mip overhead. Source plates live in `docs/art/`; only runtime images are
copied into the production bundle.

The source prompts required Moon-Garden blue-grey stone, restrained shell-gold,
living cyan/violet/rose reef accents, rounded manta/nautilus forms, and the
approved rear-view axolotl-puffer Glowfin. They explicitly prohibited generic
Atlantis architecture, paved roads, repeated mandalas, cone coral, detached
neon bars, white plastic character materials, text, logos and watermarks.

Obstacle proportions cycle through three stable variants stored on generated
gates. Volumetric reef and ambient-life families use world-band indices so
adjacent segments do not repeat and recycling cannot make an asset pop to
another variant.
